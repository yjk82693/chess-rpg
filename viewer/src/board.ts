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

  constructor(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = this.size * dpr;
    canvas.height = this.size * dpr;
    canvas.style.width = `${this.size}px`;
    canvas.style.height = `${this.size}px`;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.scale(dpr, dpr);
  }

  draw(o: DrawOptions) {
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
        c.fillStyle = COLORS.terrain[t];
        c.fillRect(px, py, TILE, TILE);
        if (t === Terrain.Forest) {
          c.fillStyle = COLORS.forestDetail;
          for (const [ox, oy] of [[0.28, 0.42], [0.64, 0.32], [0.5, 0.72]]) {
            const cx = px + ox * TILE, cy = py + oy * TILE;
            c.beginPath(); c.moveTo(cx, cy - 11); c.lineTo(cx - 8, cy + 6); c.lineTo(cx + 8, cy + 6); c.closePath(); c.fill();
          }
        } else if (t === Terrain.Fort) {
          c.strokeStyle = COLORS.fortDetail; c.lineWidth = 3;
          c.strokeRect(px + 11, py + 15, TILE - 22, TILE - 25);
          c.fillStyle = COLORS.fortDetail;
          for (let i = 0; i < 4; i++) c.fillRect(px + 11 + i * ((TILE - 28) / 3), py + 8, 6, 7);
        } else if (t === Terrain.Water) {
          c.strokeStyle = COLORS.waterDetail; c.lineWidth = 2;
          for (const oy of [0.38, 0.66]) {
            const yy = py + oy * TILE;
            c.beginPath(); c.moveTo(px + 9, yy);
            c.quadraticCurveTo(px + TILE * 0.3, yy - 5, px + TILE * 0.5, yy);
            c.quadraticCurveTo(px + TILE * 0.7, yy + 5, px + TILE - 9, yy);
            c.stroke();
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
  }

  private cursor(p: Pos) {
    const c = this.ctx;
    const x = p.x * TILE + 3, y = p.y * TILE + 3, s = TILE - 6, k = 14;
    c.strokeStyle = COLORS.cursor; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x, y + k); c.lineTo(x, y); c.lineTo(x + k, y);
    c.moveTo(x + s - k, y); c.lineTo(x + s, y); c.lineTo(x + s, y + k);
    c.moveTo(x, y + s - k); c.lineTo(x, y + s); c.lineTo(x + k, y + s);
    c.moveTo(x + s - k, y + s); c.lineTo(x + s, y + s); c.lineTo(x + s, y + s - k);
    c.stroke();
  }

  private float(u: UnitView, text: string, color: string, offset = 0) {
    const c = this.ctx;
    const x = u.x * TILE + TILE / 2, y = u.y * TILE + 11 - offset;
    c.font = "bold 15px Inter, system-ui, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,0.85)"; c.strokeText(text, x, y);
    c.fillStyle = color; c.fillText(text, x, y);
  }
}
