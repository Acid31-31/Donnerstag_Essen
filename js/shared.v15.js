const DEFAULT_GREETING =
  "Hallo 👋\n\nwir würden gerne bei Ihnen bestellen.\nWäre es möglich, die Lieferung bitte so vorzubereiten?";
const DEFAULT_CLOSING = "Vielen Dank und schöne Grüße!";

export function euro(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value) || 0);
}

export function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function newId(size = 8) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function emptyRound(title = "Mittag am Donnerstag") {
  return {
    id: newId(8),
    title: String(title || "Mittag am Donnerstag").trim().slice(0, 80) || "Mittag am Donnerstag",
    address: "",
    deliveryTime: "",
    whatsapp: "",
    supplierName: "",
    greeting: DEFAULT_GREETING,
    closing: DEFAULT_CLOSING,
    createdAt: new Date().toISOString()
  };
}

export function itemTotal(item) {
  return money((Number(item.qty) || 0) * (Number(item.price) || 0));
}

export function orderSubtotal(order) {
  return money((order.items || []).reduce((sum, item) => sum + itemTotal(item), 0));
}

export function roundTotal(round) {
  return money((round.orders || []).reduce((sum, order) => sum + orderSubtotal(order), 0));
}

export function withTotals(round) {
  const orders = (round.orders || []).map((order) => ({
    ...order,
    subtotal: orderSubtotal(order)
  }));
  return { ...round, orders, total: money(orders.reduce((sum, order) => sum + order.subtotal, 0)) };
}

export function hostKeyStorage(id) {
  return `bestellrunde-host-${id}`;
}

export function roundStorage(id) {
  return `bestellrunde-round-${id}`;
}

export function saveHostKey(id, key) {
  localStorage.setItem(hostKeyStorage(id), key);
}

export function loadHostKey(id) {
  return localStorage.getItem(hostKeyStorage(id)) || "";
}

export function saveRound(round) {
  localStorage.setItem(roundStorage(round.id), JSON.stringify(round));
}

export function loadRound(id) {
  try {
    const raw = localStorage.getItem(roundStorage(id));
    return raw ? withTotals(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function buildWhatsAppText(round) {
  const view = withTotals(round);
  const lines = [];
  lines.push((view.greeting || "").trim());
  lines.push("");
  if (view.address) {
    lines.push("Lieferadresse:");
    lines.push(view.address.trim());
    lines.push("");
  }
  if (view.deliveryTime) {
    lines.push(`Gewünschte Lieferzeit: ${view.deliveryTime.trim()}`);
    lines.push("");
  }
  lines.push("Bitte jede Position mit dem jeweiligen Namen/Slogan beschriften,");
  lines.push("damit wir bei der Übergabe alles richtig zuordnen können.");
  lines.push("Vielen Dank schon im Voraus!");
  lines.push("");

  for (const order of view.orders || []) {
    lines.push(`— ${order.slogan} —`);
    for (const item of order.items || []) {
      const qty = item.qty || 1;
      const price = euro(money((item.price || 0) * qty));
      lines.push(`${qty}× ${item.name}`.padEnd(28, " ") + price);
      if (item.note) lines.push(item.note);
    }
    lines.push(`Zwischensumme ${order.slogan}:`.padEnd(28, " ") + euro(order.subtotal));
    lines.push("");
  }

  lines.push("────────────────");
  lines.push(`Gesamtsumme:`.padEnd(28, " ") + euro(view.total || 0));
  lines.push("");
  lines.push((view.closing || DEFAULT_CLOSING).trim());
  return lines.join("\n");
}

export function whatsappLink(phone, text) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  const normalized = digits.startsWith("+")
    ? digits.slice(1)
    : digits.replace(/^0/, "49");
  const encoded = encodeURIComponent(text);
  if (!normalized) return `https://wa.me/?text=${encoded}`;
  return `https://wa.me/${normalized}?text=${encoded}`;
}

export const GROUP_LINK_NAME = "Donnerstag_Essen";

export function siteBase() {
  return `${location.origin}${location.pathname.replace(/[^/]*$/, "")}`;
}

export function groupShareUrl() {
  return siteBase();
}

export function joinUrl(id) {
  return `${siteBase()}bestellen.html?r=${encodeURIComponent(id)}`;
}

export function hostUrl(id) {
  return `${siteBase()}host.html?r=${encodeURIComponent(id)}`;
}

export function settingsUrl(id) {
  return `${siteBase()}settings.html?r=${encodeURIComponent(id)}`;
}

export function startUrl() {
  return `${siteBase()}start.html`;
}

export function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error", Boolean(isError));
}

export function loadPeerScript() {
  return new Promise((resolve, reject) => {
    if (window.Peer) return resolve(window.Peer);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
    script.onload = () => resolve(window.Peer);
    script.onerror = () => reject(new Error("Netzwerkmodul konnte nicht geladen werden"));
    document.head.appendChild(script);
  });
}

export function createPeer(id) {
  return loadPeerScript().then((Peer) => {
    const peer = id
      ? new Peer(id, { debug: 0 })
      : new Peer({ debug: 0 });
    return new Promise((resolve, reject) => {
      peer.on("open", () => resolve(peer));
      peer.on("error", (error) => reject(error));
    });
  });
}

export function connectToHost(hostId) {
  return createPeer().then(
    (peer) =>
      new Promise((resolve, reject) => {
        const conn = peer.connect(hostId, { reliable: true });
        const timer = setTimeout(() => {
          reject(new Error("Gastgeber nicht erreichbar. Die Gastgeber-Seite muss offen sein."));
        }, 12000);
        conn.on("open", () => {
          clearTimeout(timer);
          resolve({ peer, conn });
        });
        conn.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        peer.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      })
  );
}

export function sendAndWait(conn, message, expectType, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Keine Antwort vom Gastgeber")), timeoutMs);
    const onData = (data) => {
      if (!data || data.type !== expectType) return;
      clearTimeout(timer);
      conn.off("data", onData);
      resolve(data);
    };
    conn.on("data", onData);
    conn.send(message);
  });
}

/** HUD-Hintergrund (Canvas) – Hex, Matrix, Alien-Scans wie App. */
export async function installKnxChrome() {
  const { mountHudBackground } = await import(`./hud-bg.js?v=matrix10`);
  mountHudBackground();
}
