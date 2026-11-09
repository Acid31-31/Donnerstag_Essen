/** Canvas-Hintergrund: Hex + Programmcode-Matrix (mit Alienzeichen) + langsame Scans */
import { MATRIX_CODE } from "./matrix-code.js";

export function mountHudBackground(target = document.body) {
  if (document.getElementById("hud-canvas")) return;

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
  const code = MATRIX_CODE.length ? MATRIX_CODE : ["DONNERSTAG_ESSEN"];
  let w = 0;
  let h = 0;
  let t = 0;
  let cursor = 0;
  const cols = [];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const LINE_H = 15;
  const COL_W = 92;
  const VISIBLE = 28;

  function nextChunk() {
    const chunk = [];
    for (let i = 0; i < VISIBLE; i++) {
      chunk.push(code[cursor % code.length]);
      cursor = (cursor + 1) % code.length;
    }
    return chunk;
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols.length = 0;
    const count = Math.ceil(w / COL_W) + 2;
    for (let i = 0; i < count; i++) {
      cols.push({
        x: i * COL_W + 6,
        y: Math.random() * h,
        // deutlich langsamer als zuvor
        speed: 6 + Math.random() * 10,
        lines: nextChunk()
      });
    }
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

    ctx.font = "11px 'Share Tech Mono', Consolas, monospace";
    for (const col of cols) {
      col.y += col.speed * 0.016;
      if (col.y > h + col.lines.length * LINE_H) {
        col.y = -col.lines.length * LINE_H;
        col.lines = nextChunk();
      }
      col.lines.forEach((txt, i) => {
        const yy = col.y - i * LINE_H;
        if (yy < -20 || yy > h + 20) return;
        const edge = col.x < 130 || col.x > w - 150;
        const head = i === 0;
        ctx.fillStyle = head
          ? "rgba(180,255,240,0.85)"
          : edge
            ? "rgba(57,215,232,0.5)"
            : "rgba(57,215,232,0.18)";
        ctx.fillText(txt, col.x, yy);
      });
    }

    ctx.fillStyle = "rgba(0,255,154,0.035)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);

    const scanY = ((t * 0.045) % 1) * (h + 120) - 60;
    const sg = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
    sg.addColorStop(0, "transparent");
    sg.addColorStop(0.5, "rgba(57,255,200,0.35)");
    sg.addColorStop(1, "transparent");
    ctx.fillStyle = sg;
    ctx.fillRect(0, scanY - 40, w, 80);

    const scanY2 = ((t * 0.036 + 0.45) % 1) * (h + 80) - 40;
    const sg2 = ctx.createLinearGradient(0, scanY2 - 16, 0, scanY2 + 16);
    sg2.addColorStop(0, "transparent");
    sg2.addColorStop(0.5, "rgba(57,215,232,0.28)");
    sg2.addColorStop(1, "transparent");
    ctx.fillStyle = sg2;
    ctx.fillRect(0, scanY2 - 16, w, 32);

    const scanX = ((t * 0.031 + 0.2) % 1) * (w + 60) - 30;
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
