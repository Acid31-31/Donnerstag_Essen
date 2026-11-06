import { withTotals, newId, emptyRound } from "./shared.js";
import { DATABASE_URL } from "./firebase-config.js";

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

export async function createRound(title) {
  const round = emptyRound(title);
  await dbFetch(`/rounds/${round.id}.json`, {
    method: "PUT",
    body: JSON.stringify(round)
  });
  await setActiveRound(round.id);
  return withTotals(round);
}

function asOrderList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
}

export async function getRound(id) {
  const round = await dbFetch(`/rounds/${encodeURIComponent(id)}.json`);
  if (!round) throw new Error("Runde nicht gefunden");
  round.orders = asOrderList(round.orders);
  return withTotals(round);
}

export async function saveRoundCloud(round) {
  const clean = {
    id: round.id,
    title: round.title,
    address: round.address || "",
    deliveryTime: round.deliveryTime || "",
    whatsapp: round.whatsapp || "",
    greeting: round.greeting || "",
    closing: round.closing || "",
    createdAt: round.createdAt || new Date().toISOString(),
    orders: Array.isArray(round.orders) ? round.orders : []
  };
  await dbFetch(`/rounds/${encodeURIComponent(round.id)}.json`, {
    method: "PUT",
    body: JSON.stringify(clean)
  });
  return withTotals(clean);
}

export async function addOrder(roundId, { slogan, items }) {
  // Optimistic concurrency: read-modify-write with short retry
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const round = await getRound(roundId);
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

      round.orders = round.orders || [];
      round.orders.push({
        id: newId(8),
        slogan: String(slogan).trim().slice(0, 60),
        items: cleanItems,
        createdAt: new Date().toISOString()
      });
      return await saveRoundCloud(round);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastError || new Error("Bestellung konnte nicht gespeichert werden");
}

export async function removeOrder(roundId, orderId) {
  const round = await getRound(roundId);
  round.orders = (round.orders || []).filter((order) => order.id !== orderId);
  return saveRoundCloud(round);
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
