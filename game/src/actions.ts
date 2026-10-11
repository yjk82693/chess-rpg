// actions.ts: movement ranges, attack targets, legal action list, action validation.
import { CLASSES, TERRAIN, Team, WEAPON_RANGE } from "./data.js";
import { Battle, Pos, Unit, aliveOf, dist, getUnit, inBounds, samePos, terrainAt, unitAt } from "./state.js";

// One unit's full action for a turn: move to `to` (may equal current pos),
// then optionally attack `target` or use an item. Attack and item are exclusive.
export interface Action {
  unit: string;
  to: Pos;
  target: string | null;
  useItem: boolean;
}

const DIRS: Pos[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const key = (p: Pos) => `${p.x},${p.y}`;

export function canEnter(b: Battle, u: Unit, p: Pos): boolean {
  const info = TERRAIN[terrainAt(b, p)];
  return CLASSES[u.cls].flying ? info.flyerPassable : info.passable;
}

// Tiles the unit can END its move on (includes its current tile).
export function reachableTiles(b: Battle, u: Unit): Pos[] {
  const move = CLASSES[u.cls].move;
  const best = new Map<string, number>([[key(u.pos), 0]]);
  const queue: { p: Pos; cost: number }[] = [{ p: u.pos, cost: 0 }];
  while (queue.length) {
    const { p, cost } = queue.shift()!;
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (!inBounds(n) || !canEnter(b, u, n)) continue;
      const occ = unitAt(b, n);
      if (occ && occ.team !== u.team) continue;          // enemies block
      const c = cost + 1;
      if (c > move || (best.get(key(n)) ?? Infinity) <= c) continue;
      best.set(key(n), c);
      queue.push({ p: n, cost: c });
    }
  }
  const out: Pos[] = [];
  for (const k of best.keys()) {
    const [x, y] = k.split(",").map(Number);
    const p = { x, y };
    const occ = unitAt(b, p);
    if (!occ || occ.id === u.id) out.push(p);              // can't end on an ally
  }
  return out;
}

export function enemiesOf(b: Battle, u: Unit): Unit[] {
  return aliveOf(b, u.team === Team.Player ? Team.Npc : Team.Player);
}

export function targetsFrom(b: Battle, u: Unit, from: Pos): Unit[] {
  const [min, max] = WEAPON_RANGE[u.weapon];
  return enemiesOf(b, u).filter(e => {
    const d = dist(from, e.pos);
    return d >= min && d <= max;
  });
}

export function legalActions(b: Battle, u: Unit): Action[] {
  if (!u.alive) return [];
  const out: Action[] = [];
  for (const to of reachableTiles(b, u)) {
    out.push({ unit: u.id, to, target: null, useItem: false });
    for (const t of targetsFrom(b, u, to)) out.push({ unit: u.id, to, target: t.id, useItem: false });
    if (u.items.length && u.hp < u.maxHp) out.push({ unit: u.id, to, target: null, useItem: true });
  }
  return out;
}

// Engine calls this before applying; illegal actions are skipped, never crash.
export function validateAction(b: Battle, a: Action): string | null {
  let u: Unit;
  try { u = getUnit(b, a.unit); } catch { return `unknown unit ${a.unit}`; }
  if (!u.alive) return `${u.id} is dead`;
  if (!reachableTiles(b, u).some(p => samePos(p, a.to))) return `${u.id} cannot reach (${a.to.x},${a.to.y})`;
  if (a.target && a.useItem) return `${u.id} cannot attack and use item`;
  if (a.useItem && !u.items.length) return `${u.id} has no items`;
  if (a.target && !targetsFrom(b, u, a.to).some(t => t.id === a.target))
    return `${u.id} cannot hit ${a.target} from (${a.to.x},${a.to.y})`;
  return null;
}
