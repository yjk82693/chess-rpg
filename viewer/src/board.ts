// board.ts: canvas renderer for the battle map.
import { CLASSES, GRID_SIZE, Terrain } from "../../game/src/data.js";
import { Pos } from "../../game/src/state.js";
import { Frame, UnitView } from "./replay.js";
import { COLORS, TILE } from "./theme.js";

export interface DrawOptions {
  grid: Terrain[][];
  frame: Frame;
  cursor: Pos | null;
  blue: Pos[];
  red: Pos[];
}

export class BoardRenderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly size = GRID_SIZE * TILE;
  private animation: number | null = null;
  private latest: DrawOptions | null = null;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = this.size * dpr;
    canvas.height = this.size * dpr;
    canvas.style.width = `${this.size}px`;
    canvas.style.height = `${this.size}px`;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.scale(dpr, dpr);
  }

  draw(o: DrawOptions) {
    this.latest = o;
    if (this.animation === null && this.canvas.isConnected && !this.reducedMotion.matches) {
      this.animation = window.requestAnimationFrame(() => {
        this.animation = null;
        if (this.canvas.isConnected && this.latest) this.draw(this.latest);
      });
    }
    const c = this.ctx;
    c.clearRect(0, 0, this.size, this.size);
    this.terrain(o.grid);
    for (const p of o.blue) this.fillTile(p, COLORS.blueTile);
    for (const p of o.red) this.fillTile(p, COLORS.redTile);
    const e = o.frame.event;
    const us = o.frame.units;
    if (e?.t === "move") this.line(e.from, e.to, COLORS.team[us[e.unit].team], true);
    if (e?.t === "attack") this.line(us[e.attacker], us[e.defender], COLORS.cursor, false);
    for (const u of Object.values(us)) {
      const dying = e?.t === "death" && e.unit === u.id;
      if (u.alive || dying) this.unit(u, dying);
    }
    if (o.cursor) this.cursor(o.cursor);
    if (e?.t === "attack") {
      const d = us[e.defender];
      if (e.hit) {
        this.float(d, `-${e.damage}`, COLORS.damage);
        if (e.reaction) this.float(d, e.reaction.replace("_", " ").toUpperCase(), COLORS.reaction, 18);
      } else this.float(d, "MISS", COLORS.miss);
    }
    if (e?.t === "heal") this.float(us[e.unit], `+${e.amount}`, COLORS.heal);
    if (e?.t === "burn") this.float(us[e.unit], `-${e.damage} BURN`, COLORS.burn);
    if (e?.t === "death") this.float(us[e.unit], "DEFEATED", COLORS.damage);
  }

  private fillTile(p: Pos, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(p.x * TILE + 1, p.y * TILE + 1, TILE - 2, TILE - 2);
  }

  private terrain(grid: Terrain[][]) {
    const c = this.ctx;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = grid[y][x];
        const px = x * TILE, py = y * TILE;
        const ground = c.createLinearGradient(px, py, px + TILE, py + TILE);
        ground.addColorStop(0, COLORS.terrain[t]);
        ground.addColorStop(1, t === Terrain.Water ? "#28527e" : t === Terrain.Forest ? "#285536" : t === Terrain.Fort ? "#67665f" : "#7e9b59");
        c.fillStyle = ground;
        c.fillRect(px, py, TILE, TILE);
        if (t === Terrain.Forest) {
          for (const [ox, oy] of [[0.24, 0.38], [0.7, 0.28], [0.52, 0.72]]) {
            const cx = px + ox * TILE, cy = py + oy * TILE;
            c.fillStyle = "rgba(10,25,17,0.28)";
            c.beginPath(); c.ellipse(cx + 3, cy + 10, 13, 6, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = "#614c32"; c.fillRect(cx - 2, cy, 4, 13);
            for (let layer = 0; layer < 3; layer++) {
              const top = cy - 18 + layer * 7, width = 8 + layer * 3;
              c.fillStyle = layer === 1 ? "#438653" : COLORS.forestDetail;
              c.beginPath(); c.moveTo(cx, top); c.lineTo(cx - width, top + 15); c.lineTo(cx + width, top + 15); c.closePath(); c.fill();
              c.strokeStyle = "rgba(166,206,119,0.32)"; c.lineWidth = 1;
              c.beginPath(); c.moveTo(cx, top + 2); c.lineTo(cx - width + 2, top + 13); c.stroke();
            }
          }
        } else if (t === Terrain.Fort) {
          c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(px + 10, py + 15, TILE - 18, TILE - 23);
          c.fillStyle = "#b4afa0"; c.fillRect(px + 9, py + 15, TILE - 18, TILE - 26);
          c.strokeStyle = COLORS.fortDetail; c.lineWidth = 2;
          for (let row = 0; row < 4; row++) {
            const yy = py + 15 + row * 9;
            c.beginPath(); c.moveTo(px + 9, yy); c.lineTo(px + TILE - 9, yy); c.stroke();
            for (let col = 0; col < 3; col++) {
              const xx = px + 16 + col * 15 + (row % 2) * 7;
              c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx, yy + 9); c.stroke();
            }
          }
          for (let i = 0; i < 4; i++) {
            const xx = px + 9 + i * ((TILE - 26) / 3);
            c.fillStyle = "#c8c0aa"; c.fillRect(xx, py + 8, 8, 10);
            c.fillStyle = COLORS.fortDetail; c.fillRect(xx + 6, py + 10, 2, 8);
          }
          c.fillStyle = "#41443f";
          c.beginPath(); c.arc(px + TILE / 2, py + 37, 7, Math.PI, 0); c.lineTo(px + TILE / 2 + 7, py + 53); c.lineTo(px + TILE / 2 - 7, py + 53); c.closePath(); c.fill();
        } else if (t === Terrain.Water) {
          for (let i = 0; i < 3; i++) {
            const yy = py + 14 + i * 17 + (this.reducedMotion.matches ? 0 : Math.sin(performance.now() / 1100 + x + y + i) * 1.2), shift = ((x + y + i) % 3) * 3;
            c.strokeStyle = i === 1 ? COLORS.waterDetail : "rgba(176,218,240,0.45)"; c.lineWidth = 2;
            c.beginPath(); c.moveTo(px + 6 + shift, yy);
            c.bezierCurveTo(px + 20, yy - 6, px + 36, yy + 6, px + TILE - 6 - shift, yy); c.stroke();
            c.strokeStyle = "rgba(210,239,255,0.55)"; c.lineWidth = 1;
            c.beginPath(); c.moveTo(px + 13 + shift, yy + 3); c.lineTo(px + 23 + shift, yy + 3); c.stroke();
          }
        } else {
          c.strokeStyle = "rgba(53,79,38,0.2)"; c.lineWidth = 1;
          for (const [ox, oy] of [[10, 15], [46, 44], [19, 53]]) {
            c.beginPath(); c.moveTo(px + ox - 2, py + oy); c.lineTo(px + ox, py + oy - 4); c.lineTo(px + ox + 2, py + oy); c.stroke();
          }
        }
      }
    }
    c.strokeStyle = COLORS.grid; c.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      c.beginPath(); c.moveTo(i * TILE + 0.5, 0); c.lineTo(i * TILE + 0.5, this.size); c.stroke();
      c.beginPath(); c.moveTo(0, i * TILE + 0.5); c.lineTo(this.size, i * TILE + 0.5); c.stroke();
    }
  }

  private line(a: Pos, b: Pos, color: string, dashed: boolean) {
    const c = this.ctx;
    c.strokeStyle = color; c.lineWidth = 3;
    c.setLineDash(dashed ? [6, 5] : []);
    c.beginPath();
    c.moveTo(a.x * TILE + TILE / 2, a.y * TILE + TILE / 2);
    c.lineTo(b.x * TILE + TILE / 2, b.y * TILE + TILE / 2);
    c.stroke();
    c.setLineDash([]);
  }

  private unit(u: UnitView, faded: boolean) {
    const c = this.ctx;
    const cx = u.x * TILE + TILE / 2, cy = u.y * TILE + TILE / 2 - 4, r = TILE * 0.34;
    c.globalAlpha = faded ? 0.35 : 1;
    c.fillStyle = COLORS.team[u.team];
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = u.team === "player" ? COLORS.gold : "#fff"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "#fff";
    c.font = `${Math.round(TILE * 0.42)}px "Apple Symbols", "Segoe UI Symbol", serif`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(CLASSES[u.cls].glyph + "\uFE0E", cx, cy + 1);
    c.fillStyle = COLORS.attr[u.attribute];
    c.beginPath(); c.arc(cx + r * 0.78, cy - r * 0.78, 5.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#111"; c.lineWidth = 1.5; c.stroke();
    const w = TILE * 0.72, h = 5, bx = cx - w / 2, by = u.y * TILE + TILE - 10;
    const ratio = u.hp / u.maxHp;
    c.fillStyle = COLORS.hpBack; c.fillRect(bx, by, w, h);
    c.fillStyle = ratio > 0.6 ? COLORS.hpGood : ratio > 0.3 ? COLORS.hpMid : COLORS.hpLow;
    c.fillRect(bx, by, w * ratio, h);
    c.globalAlpha = 1;
    if (faded) {
      c.save();
      c.strokeStyle = "#180e15"; c.lineWidth = 7;
      c.beginPath(); c.moveTo(cx - 12, cy - 12); c.lineTo(cx + 12, cy + 12);
      c.moveTo(cx + 12, cy - 12); c.lineTo(cx - 12, cy + 12); c.stroke();
      c.strokeStyle = COLORS.damage; c.lineWidth = 3; c.stroke();
      c.restore();
    }
  }

  private cursor(p: Pos) {
    const c = this.ctx;
    const x = p.x * TILE + 3, y = p.y * TILE + 3, s = TILE - 6, k = 14;
    c.save();
    const pulse = this.reducedMotion.matches ? 0.5 : (Math.sin(performance.now() / 350) + 1) / 2;
    c.shadowColor = COLORS.cursor; c.shadowBlur = 3 + pulse * 5;
    c.strokeStyle = "#220d14"; c.lineWidth = 6;
    c.beginPath();
    c.moveTo(x, y + k); c.lineTo(x, y); c.lineTo(x + k, y);
    c.moveTo(x + s - k, y); c.lineTo(x + s, y); c.lineTo(x + s, y + k);
    c.moveTo(x, y + s - k); c.lineTo(x, y + s); c.lineTo(x + k, y + s);
    c.moveTo(x + s - k, y + s); c.lineTo(x + s, y + s); c.lineTo(x + s, y + s - k);
    c.stroke();
    c.strokeStyle = COLORS.cursor; c.lineWidth = 3 + pulse; c.stroke();
    c.restore();
  }

  private float(u: UnitView, text: string, color: string, offset = 0) {
    const c = this.ctx;
    const size = /^[+-]\d+$/.test(text) ? 25 : 17;
    c.save();
    c.font = `bold ${size}px Inter, system-ui, sans-serif`;
    const half = c.measureText(text).width / 2 + 5;
    const x = Math.max(half, Math.min(this.size - half, u.x * TILE + TILE / 2));
    // Keep reactions above damage while retaining labels on the top row.
    const y = Math.max(size / 2 + 4, u.y * TILE + (offset ? 12 : 32));
    c.textAlign = "center"; c.textBaseline = "middle";
    c.lineJoin = "round";
    c.lineWidth = 5; c.strokeStyle = "rgba(0,0,0,0.95)"; c.strokeText(text, x, y);
    c.fillStyle = color; c.fillText(text, x, y);
    c.restore();
  }
}
