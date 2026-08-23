import { COLS, SEQUENCE_STEPS, VISIBLE_ROWS, type PieceId, type Snapshot, type VisualClock } from "./types";
import { PIECE_COLOR_VAR, cellsOf } from "./pieces";
import { stepToRow } from "./mix";
import type { Juice } from "./juice";

function token(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function shade(hex: string, amt: number) {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;
  const n = parseInt(h.slice(0, 6), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  cell = 24;
  ox = 0;
  oy = 0;
  wellW = 0;
  wellH = 0;
  colors: Record<PieceId, string> = {
    I: "#20d2d6",
    O: "#f0d44a",
    T: "#c46ae8",
    S: "#3ed67a",
    Z: "#f04646",
    J: "#3a7cff",
    L: "#f08a28",
  };
  bg = "#07080c";
  fg = "#f2f0ea";
  muted = "#8b8880";
  border = "#2a2a2d";
  signal = "#e24b3a";
  private flashes = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    this.ctx = ctx;
    this.refreshTokens();
  }

  refreshTokens() {
    this.bg = token("--color-bg", this.bg);
    this.fg = token("--color-fg", this.fg);
    this.muted = token("--color-muted", this.muted);
    this.border = token("--color-border", this.border);
    this.signal = token("--color-signal", this.signal);
    (Object.keys(this.colors) as PieceId[]).forEach((id) => {
      this.colors[id] = token(PIECE_COLOR_VAR[id], this.colors[id]);
    });
  }

  flashCell(col: number, row: number) {
    this.flashes.set(`${col},${row}`, 1);
  }

  flashStep(step: number) {
    const row = stepToRow(step);
    for (let c = 0; c < COLS; c++) this.flashCell(c, row);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const cssW = parent?.clientWidth ?? 360;
    const cssH = parent?.clientHeight ?? 640;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.w = cssW;
    this.h = cssH;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const padY = 6;
    const rail = 20;
    this.cell = Math.max(
      14,
      Math.floor(Math.min((cssW - rail - 6) / COLS, (cssH - padY * 2) / VISIBLE_ROWS)),
    );
    this.wellW = this.cell * COLS;
    this.wellH = this.cell * VISIBLE_ROWS;
    this.ox = rail;
    this.oy = Math.max(0, Math.floor((cssH - this.wellH) / 2));
  }

  cellCenter(col: number, row: number) {
    return {
      x: this.ox + col * this.cell + this.cell / 2,
      y: this.oy + row * this.cell + this.cell / 2,
    };
  }

  draw(snap: Snapshot, clock: VisualClock, juice: Juice, now: number) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    const punch = clock.kickPulse * 3;
    const off = juice.offset(now);
    ctx.save();
    ctx.translate(this.ox + off.x, this.oy + off.y + punch);
    ctx.rotate(off.r);

    this.drawWell(clock);
    this.drawStack(snap, clock);
    if (snap.active) this.drawGhost(snap);
    if (snap.active) this.drawActive(snap, clock);
    this.drawScan(clock);
    this.drawParticles(juice);
    this.drawFloaters(juice);
    ctx.restore();

    this.decayFlashes();
  }

  private drawWell(clock: VisualClock) {
    const { ctx, cell, wellW, wellH } = this;
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, wellW, wellH);

    const seqTop = (VISIBLE_ROWS - SEQUENCE_STEPS) * cell;
    ctx.fillStyle = "rgba(242,240,234,0.035)";
    ctx.fillRect(0, seqTop, wellW, SEQUENCE_STEPS * cell);

    const playRow = SEQUENCE_STEPS - 1 - Math.min(SEQUENCE_STEPS - 1, clock.step);
    const playY = seqTop + playRow * cell;
    const onOne = clock.step === 0;
    ctx.fillStyle = onOne ? `rgba(226,75,58,${0.14 + clock.kickPulse * 0.12})` : `rgba(242,240,234,${0.07 + clock.kickPulse * 0.08})`;
    ctx.fillRect(0, playY, wellW, cell);

    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.strokeStyle = "rgba(242,240,234,0.06)";
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, wellH);
      ctx.stroke();
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      const inSeq = y >= VISIBLE_ROWS - SEQUENCE_STEPS;
      ctx.strokeStyle = inSeq ? "rgba(242,240,234,0.09)" : "rgba(242,240,234,0.04)";
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(wellW, y * cell + 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = this.fg;
    ctx.globalAlpha = 0.5 + clock.kickPulse * 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, wellW - 2, wellH - 2);
    ctx.globalAlpha = 1;
  }

  private drawStack(snap: Snapshot, clock: VisualClock) {
    const duck = clock.duck;
    for (let y = 0; y < VISIBLE_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = snap.grid[y]![x];
        if (!cell) continue;
        const flash = this.flashes.get(`${x},${y}`) ?? 0;
        const squash = duck * 0.12;
        this.block(x, y, cell.type, 1, squash, flash);
      }
    }
  }

  private drawGhost(snap: Snapshot) {
    const p = snap.active!;
    const cells = cellsOf(p.type, p.rot);
    for (const [cx, cy] of cells) {
      const x = p.x + cx;
      const y = snap.ghostY + cy;
      if (y < 0 || y >= VISIBLE_ROWS) continue;
      this.outline(x, y, p.type);
    }
  }

  private drawActive(snap: Snapshot, clock: VisualClock) {
    const p = snap.active!;
    const pulse = 0.88 + clock.frac * 0.12;
    for (const [cx, cy] of cellsOf(p.type, p.rot)) {
      const x = p.x + cx;
      const y = p.y + cy;
      if (y < 0 || y >= VISIBLE_ROWS) continue;
      this.block(x, y, p.type, pulse, 0, 0.12);
    }
  }

  private drawScan(clock: VisualClock) {
    const { ctx, cell, wellW } = this;
    const seqTop = (VISIBLE_ROWS - SEQUENCE_STEPS) * cell;
    const lineY = seqTop + (SEQUENCE_STEPS - (clock.step + clock.frac)) * cell;
    const onOne = clock.step === 0;
    ctx.save();
    ctx.strokeStyle = onOne ? this.signal : this.fg;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.beginPath();
    ctx.moveTo(-2, lineY);
    ctx.lineTo(wellW + 2, lineY);
    ctx.stroke();
    ctx.globalAlpha = 0.16 + clock.kickPulse * 0.14;
    ctx.fillStyle = onOne ? this.signal : this.fg;
    ctx.fillRect(0, lineY, wellW, cell);
    ctx.fillStyle = onOne ? this.signal : this.fg;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(-6, lineY - 5);
    ctx.lineTo(2, lineY);
    ctx.lineTo(-6, lineY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = `600 ${Math.max(8, Math.floor(cell * 0.32))}px "IBM Plex Mono", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let s = 0; s < SEQUENCE_STEPS; s++) {
      const y = seqTop + (SEQUENCE_STEPS - 1 - s) * cell + cell / 2;
      const on = s === clock.step;
      const beat = s % 4 === 0;
      ctx.fillStyle = s === 0 ? this.signal : this.fg;
      ctx.globalAlpha = on ? 0.9 : beat ? 0.4 : 0.12;
      ctx.fillText(s === 0 ? "1" : beat ? String(s / 4 + 1) : "", -8, y);
    }
    ctx.restore();
  }

  private block(col: number, row: number, type: PieceId, alpha: number, squash: number, flash: number) {
    const { ctx, cell } = this;
    const inset = Math.max(1, Math.floor(cell * 0.06));
    const s = cell - inset * 2;
    const d = Math.max(3, Math.floor(s * 0.22));
    const squ = s * squash;
    const fw = s - d;
    const fh = s - d - squ;
    const x = col * cell + inset;
    const y = row * cell + inset + d + squ / 2;
    const color = this.colors[type];
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + d, y - d);
    ctx.lineTo(x + d + fw, y - d);
    ctx.lineTo(x + fw, y);
    ctx.closePath();
    ctx.fillStyle = shade(color, 72);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + fw, y);
    ctx.lineTo(x + fw + d, y - d);
    ctx.lineTo(x + fw + d, y - d + fh);
    ctx.lineTo(x + fw, y + fh);
    ctx.closePath();
    ctx.fillStyle = shade(color, -62);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillRect(x, y, fw, fh);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x, y, fw, Math.max(2, fh * 0.16));
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y, Math.max(2, fw * 0.12), fh);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x, y + fh - Math.max(2, fh * 0.14), fw, Math.max(2, fh * 0.14));
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.45})`;
      ctx.fillRect(x, y, fw, fh);
    }
    ctx.restore();
  }

  private outline(col: number, row: number, type: PieceId) {
    const { ctx, cell } = this;
    const gap = Math.max(1, Math.floor(cell * 0.06));
    ctx.strokeStyle = this.colors[type];
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(col * cell + gap / 2 + 0.5, row * cell + gap / 2 + 0.5, cell - gap - 1, cell - gap - 1);
    ctx.globalAlpha = 1;
  }

  private drawParticles(juice: Juice) {
    const { ctx } = this;
    for (const p of juice.particles) {
      ctx.save();
      ctx.translate(p.x - this.ox, p.y - this.oy);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(juice: Juice) {
    const { ctx } = this;
    ctx.font = `600 ${Math.max(11, this.cell * 0.55)}px "IBM Plex Sans", sans-serif`;
    ctx.textAlign = "center";
    for (const f of juice.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = this.fg;
      ctx.fillText(f.text, f.x - this.ox, f.y - this.oy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  private decayFlashes() {
    for (const [k, v] of this.flashes) {
      const n = v - 0.08;
      if (n <= 0) this.flashes.delete(k);
      else this.flashes.set(k, n);
    }
  }
}
