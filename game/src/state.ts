// state.ts: runtime types, seeded RNG, unit creation, small board helpers.
import {
  Attribute, CLASSES, GRID_SIZE, Item, Reaction, Stats, Subskill, SUBSKILL_BONUS,
  Team, Terrain, UnitClass, Weapon,
} from "./data.js";

// ---------- Seeded RNG (mulberry32) ----------
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  chance(pct: number): boolean { return this.next() * 100 < pct; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}

// ---------- Positions ----------
export interface Pos { x: number; y: number; }
export const inBounds = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < GRID_SIZE && p.y < GRID_SIZE;
export const dist = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

// ---------- Units ----------
// UnitSpec mirrors the party JSON in shared/PLAN.md section 5.2
export interface UnitSpec {
  id: string;
  class: UnitClass;
  weapon: Weapon;
  attribute: Attribute;
  level: number;
  exp: number;
  star: number;
  promotion: number;          // 0 = base, 1-3 = tiers reached
  subskill: Subskill | null;
}

export interface Unit {
  id: string;
  team: Team;
  cls: UnitClass;
  weapon: Weapon;
  attribute: Attribute;
  level: number;
  subskill: Subskill | null;
  stats: Stats;               // effective stats (base + growth + subskill)
  maxHp: number;
  hp: number;
  pos: Pos;
  alive: boolean;
  burnTurns: number;
  mark: Attribute | null;     // attribute left by the last hit; a different one sets off a response
  items: Item[];
  expGained: number;          // earned this battle, read by Quartermaster
}

export function computeStats(cls: UnitClass, level: number, subskill: Subskill | null): Stats {
  const { base, growth } = CLASSES[cls];
  const lv = Math.max(0, level - 1);
  const s: Stats = {
    hp: base.hp + growth.hp * lv,
    atk: base.atk + growth.atk * lv,
    mag: base.mag + growth.mag * lv,
    def: base.def + growth.def * lv,
    spd: base.spd + growth.spd * lv,
  };
  if (subskill) {
    const b = SUBSKILL_BONUS[subskill];
    for (const k of Object.keys(b) as (keyof Stats)[]) s[k] += b[k] ?? 0;
  }
  return s;
}

export function makeUnit(spec: UnitSpec, team: Team, pos: Pos): Unit {
  const stats = computeStats(spec.class, spec.level, spec.subskill);
  return {
    id: spec.id, team, cls: spec.class, weapon: spec.weapon, attribute: spec.attribute,
    level: spec.level, subskill: spec.subskill, stats, maxHp: stats.hp, hp: stats.hp,
    pos: { ...pos }, alive: true, burnTurns: 0, mark: null, items: [Item.Vulnerary], expGained: 0,
  };
}

// ---------- Battle log events ----------
export type BattleEvent =
  | { t: "turn_start"; turn: number; team: Team }
  | { t: "move"; turn: number; unit: string; from: Pos; to: Pos }
  | { t: "attack"; turn: number; attacker: string; defender: string; hit: boolean;
      damage: number; triangle: number; reaction: Reaction | null; terrain: Terrain }
  | { t: "death"; turn: number; unit: string; killer: string | null; terrain: Terrain;
      triangleDisadvantage: boolean }
  | { t: "heal"; turn: number; unit: string; amount: number; source: "fort" | "item" }
  | { t: "burn"; turn: number; unit: string; damage: number }
  | { t: "evade"; turn: number; unit: string; attacker: string; terrain: Terrain }
  | { t: "end"; turn: number; winner: Team; reason: "rout" | "time" };

// ---------- Battle ----------
export interface Battle {
  seed: number;
  rng: Rng;
  mapId: string;
  grid: Terrain[][];          // grid[y][x]
  units: Unit[];
  turn: number;
  log: BattleEvent[];
  winner: Team | null;
}

export function terrainAt(b: Battle, p: Pos): Terrain { return b.grid[p.y][p.x]; }

export function unitAt(b: Battle, p: Pos): Unit | undefined {
  return b.units.find(u => u.alive && samePos(u.pos, p));
}

export function aliveOf(b: Battle, team: Team): Unit[] {
  return b.units.filter(u => u.alive && u.team === team);
}

export function hpRatio(b: Battle, team: Team): number {
  const all = b.units.filter(u => u.team === team);
  const max = all.reduce((s, u) => s + u.maxHp, 0);
  const cur = all.reduce((s, u) => s + (u.alive ? u.hp : 0), 0);
  return max === 0 ? 0 : cur / max;
}

export function getUnit(b: Battle, id: string): Unit {
  const u = b.units.find(u => u.id === id);
  if (!u) throw new Error(`unknown unit ${id}`);
  return u;
}
