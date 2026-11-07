/** Canvas-Hintergrund 1:1 App: Hex + Matrix-Daten + Alien-Scans */
export function mountHudBackground(target = document.body) {
  if (document.getElementById("hud-canvas")) return;

  // Alte DOM-Overlays (verdecken sonst die Matrix)
  target.querySelectorAll(
    ".hud-aurora,.hud-hex,.hud-crt,.hud-scan-h,.hud-scan-h2,.hud-scan-v,.knx-stream"
  ).forEach((el) => el.remove());

  const canvas = document.createElement("canvas");
  canvas.id = "hud-canvas";
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "0",
    pointerEvents: "none"
  });
  target.prepend(canvas);

  const ctx = canvas.getContext("2d");
  const tags = ["SENS", "TEMP", "KNX", "BUS", "GRP", "ACT", "PWM", "DEV", "LINK", "SYNC", "DATA", "NODE", "ROOM", "HVAC", "STAT", "ORD", "PAY"];
  let w = 0;
  let h = 0;
  let t = 0;
  const cols = [];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols.length = 0;
    const colW = 78;
    const count = Math.ceil(w / colW) + 2;
    for (let i = 0; i < count; i++) {
      cols.push({
        x: i * colW + 8,
        y: Math.random() * h,
        speed: 28 + Math.random() * 55,
        lines: Array.from({ length: 18 }, () => line())
      });
    }
  }

  function line() {
    const tag = tags[(Math.random() * tags.length) | 0];
    const hex = ((Math.random() * 0xffffff) | 0).toString(16).toUpperCase().padStart(6, "0");
    return `${tag} ${hex}`;
  }

  function drawHexGrid() {
    const size = Math.min(w, h) / 11;
    const hStep = size * 1.75;
    const vStep = size * 1.55;
    ctx.strokeStyle = "rgba(57,215,232,0.22)";
    ctx.lineWidth = 1;
    let row = 0;
    for (let y = -size; y < h + size; y += vStep, row++) {
      const xOff = row % 2 === 0 ? 0 : hStep * 0.5;
      for (let x = -size + xOff; x < w + size; x += hStep) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = ((60 * i - 30) * Math.PI) / 180;
          const px = x + size * Math.cos(a);
          const py = y + size * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  function frame(now) {
    t = now * 0.001;
    ctx.fillStyle = "#071018";
    ctx.fillRect(0, 0, w, h);

    // Aurora blobs
    const blobs = [
      [0.2, 0.18, 0.45, "rgba(57,215,232,0.28)"],
      [0.85, 0.12, 0.4, "rgba(123,97,255,0.22)"],
      [0.5, 0.55, 0.5, "rgba(57,255,154,0.12)"],
      [0.15, 0.82, 0.38, "rgba(57,215,232,0.18)"]
    ];
    for (const [cx, cy, r, color] of blobs) {
      const x = (cx + Math.sin(t * 0.35 + cx) * 0.06) * w;
      const y = (cy + Math.cos(t * 0.3 + cy) * 0.05) * h;
      const rad = r * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    drawHexGrid();

    // Matrix / Daten-Spalten
    ctx.font = "12px 'Share Tech Mono', Consolas, monospace";
    for (const col of cols) {
      col.y += col.speed * 0.016;
      if (col.y > h + 220) {
        col.y = -220;
        col.lines = Array.from({ length: 18 }, () => line());
      }
      col.lines.forEach((txt, i) => {
        const yy = col.y - i * 18;
        if (yy < -20 || yy > h + 20) return;
        const edge = col.x < 120 || col.x > w - 140;
        ctx.fillStyle = edge ? "rgba(57,215,232,0.55)" : "rgba(57,215,232,0.16)";
        ctx.fillText(txt, col.x, yy);
      });
    }

    // CRT lines
    ctx.fillStyle = "rgba(0,255,154,0.035)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);

    // Alien scans
    const scanY = ((t * 0.32) % 1) * (h + 120) - 60;
    const sg = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
    sg.addColorStop(0, "transparent");
    sg.addColorStop(0.5, "rgba(57,255,200,0.35)");
    sg.addColorStop(1, "transparent");
    ctx.fillStyle = sg;
    ctx.fillRect(0, scanY - 40, w, 80);

    const scanY2 = ((t * 0.32 + 0.45) % 1) * (h + 80) - 40;
    const sg2 = ctx.createLinearGradient(0, scanY2 - 16, 0, scanY2 + 16);
    sg2.addColorStop(0, "transparent");
    sg2.addColorStop(0.5, "rgba(57,215,232,0.28)");
    sg2.addColorStop(1, "transparent");
    ctx.fillStyle = sg2;
    ctx.fillRect(0, scanY2 - 16, w, 32);

    const scanX = ((t * 0.22 + 0.2) % 1) * (w + 60) - 30;
    const sgx = ctx.createLinearGradient(scanX - 22, 0, scanX + 22, 0);
    sgx.addColorStop(0, "transparent");
    sgx.addColorStop(0.5, "rgba(57,255,200,0.2)");
    sgx.addColorStop(1, "transparent");
    ctx.fillStyle = sgx;
    ctx.fillRect(scanX - 22, 0, 44, h);

    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(frame);
}
