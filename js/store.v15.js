import { withTotals, newId, emptyRound } from "./shared.v15.js";
import { DATABASE_URL } from "./firebase-config.v15.js";

function baseUrl() {
  const url = String(DATABASE_URL || "").trim().replace(/\/$/, "");
  if (!url.startsWith("https://")) {
    throw new Error("Cloud-Speicher ist noch nicht eingerichtet.");
  }
  return url;
}

async function dbFetch(path, options = {}) {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Speicherfehler (${response.status})`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text || text === "null") return null;
  return JSON.parse(text);
}

export async function setActiveRound(id) {
  await dbFetch(`/rounds/_active.json`, {
    method: "PUT",
    body: JSON.stringify({ id: String(id), updatedAt: new Date().toISOString() })
  });
}

export async function getActiveRoundId() {
  const data = await dbFetch(`/rounds/_active.json`);
  return data && data.id ? String(data.id) : "";
}

export async function archiveActiveRound() {
  const activeId = await getActiveRoundId();
  if (!activeId) return null;
  const round = await getRound(activeId);
  const closedAt = new Date().toISOString();
  const dateLabel = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin"
  }).format(new Date(round.createdAt || closedAt));
  const orders = {};
  for (const order of round.orders || []) {
    const key = order.id || newId(8);
    orders[key] = { ...order, id: key };
  }
  const payload = {
    ...round,
    orders,
    closedAt,
    dateLabel,
    orderCount: (round.orders || []).length,
    total: round.total || 0
  };
  await dbFetch(`/rounds/_closed/${encodeURIComponent(round.id)}.json`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return payload;
}

export async function createRound(title) {
  // Alte Woche mit Datum + Bestellungen sichern, dann leere neue Woche
  await archiveActiveRound().catch(() => null);
  const round = emptyRound(title);
  await dbFetch(`/rounds/${round.id}.json`, {
    method: "PATCH",
    body: JSON.stringify(round)
  });
  await setActiveRound(round.id);
  return withTotals({ ...round, orders: [] });
}

function asOrderList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((order, index) => ({
      ...order,
      id: order?.id || String(index)
    }));
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, order]) => order)
      .map(([key, order]) => ({
        ...order,
        id: order.id || key
      }));
  }
  return [];
}

export async function getRound(id) {
  const round = await dbFetch(`/rounds/${encodeURIComponent(id)}.json`);
  if (!round) throw new Error("Runde nicht gefunden");
  round.orders = asOrderList(round.orders);
  return withTotals(round);
}

export async function saveRoundCloud(round) {
  // Nur Metadaten patchen – orders/replies niemals überschreiben
  const clean = {
    id: round.id,
    title: round.title,
    address: round.address || "",
    deliveryTime: round.deliveryTime || "",
    whatsapp: round.whatsapp || "",
    supplierName: round.supplierName || "",
    greeting: round.greeting || "",
    closing: round.closing || "",
    createdAt: round.createdAt || new Date().toISOString()
  };
  await dbFetch(`/rounds/${encodeURIComponent(round.id)}.json`, {
    method: "PATCH",
    body: JSON.stringify(clean)
  });
  return getRound(round.id);
}

export async function addOrder(roundId, { slogan, items }) {
  // Immer in die aktuell offene Runde schreiben – alte ?r=-Links bleiben gültig
  const active = await getActiveRoundId();
  const targetId = active || String(roundId || "");
  if (!targetId) throw new Error("Keine offene Bestellrunde");

  const cleanItems = (items || [])
    .map((item) => ({
      name: String(item.name || "").trim().slice(0, 80),
      qty: Math.max(1, Math.min(99, Number(item.qty) || 1)),
      price: Math.max(0, Number(item.price) || 0),
      note: String(item.note || "").trim().slice(0, 160)
    }))
    .filter((item) => item.name);

  if (!String(slogan || "").trim()) throw new Error("Slogan fehlt");
  if (!cleanItems.length) throw new Error("Mindestens ein Gericht nötig");

  const order = {
    slogan: String(slogan).trim().slice(0, 60),
    items: cleanItems,
    createdAt: new Date().toISOString()
  };
  // Atomarer Anhang – parallele Bestellungen überschreiben sich nicht mehr
  const created = await dbFetch(`/rounds/${encodeURIComponent(targetId)}/orders.json`, {
    method: "POST",
    body: JSON.stringify(order)
  });
  const key = created && created.name ? String(created.name) : "";
  if (key) {
    await dbFetch(`/rounds/${encodeURIComponent(targetId)}/orders/${encodeURIComponent(key)}.json`, {
      method: "PATCH",
      body: JSON.stringify({ id: key })
    });
  }
  return getRound(targetId);
}

export async function removeOrder(roundId, orderId) {
  const id = String(orderId || "");
  if (!id) throw new Error("Bestellung fehlt");
  await dbFetch(`/rounds/${encodeURIComponent(roundId)}/orders/${encodeURIComponent(id)}.json`, {
    method: "DELETE"
  });
  // Altbestand als Array: falls noch vorhanden, Rest als Map neu schreiben
  const round = await getRound(roundId);
  if ((round.orders || []).some((order) => order.id === id)) {
    const remaining = {};
    for (const order of round.orders) {
      if (order.id === id) continue;
      remaining[order.id] = order;
    }
    await dbFetch(`/rounds/${encodeURIComponent(roundId)}/orders.json`, {
      method: "PUT",
      body: JSON.stringify(remaining)
    });
    return getRound(roundId);
  }
  return round;
}

export function watchRound(id, onData, onError) {
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    try {
      onData(await getRound(id));
    } catch (error) {
      onError?.(error);
    } finally {
      if (!stopped) timer = setTimeout(tick, 4000);
    }
  }

  tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
