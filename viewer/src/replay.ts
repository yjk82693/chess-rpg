// replay.ts: battle log -> frames (one board snapshot per event), plus helpers.
import { Attribute, Team, UnitClass, Weapon } from "../../game/src/data.js";
import { Battle, BattleEvent } from "../../game/src/state.js";

export interface UnitView {
  id: string; team: Team; cls: UnitClass; weapon: Weapon; attribute: Attribute;
  x: number; y: number; hp: number; maxHp: number; alive: boolean;
}

export interface Frame {
  units: Record<string, UnitView>;
  event: BattleEvent | null;
  turn: number;
  phase: Team | null;
}

export function initialUnits(b: Battle): UnitView[] {
  return b.units.map(u => ({
    id: u.id, team: u.team, cls: u.cls, weapon: u.weapon, attribute: u.attribute,
    x: u.pos.x, y: u.pos.y, hp: u.hp, maxHp: u.maxHp, alive: u.alive,
  }));
}

export function buildFrames(start: UnitView[], log: BattleEvent[]): Frame[] {
  const cur: Record<string, UnitView> = Object.fromEntries(start.map(u => [u.id, { ...u }]));
  const snap = () => Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, { ...v }]));
  let turn = 1;
  let phase: Team | null = null;
  const frames: Frame[] = [{ units: snap(), event: null, turn, phase }];
  for (const e of log) {
    if (e.t === "evade") continue;
    turn = e.turn;
    switch (e.t) {
      case "turn_start": phase = e.team; break;
      case "move": cur[e.unit].x = e.to.x; cur[e.unit].y = e.to.y; break;
      case "attack": if (e.hit) cur[e.defender].hp = Math.max(0, cur[e.defender].hp - e.damage); break;
      case "burn": cur[e.unit].hp = Math.max(0, cur[e.unit].hp - e.damage); break;
      case "heal": cur[e.unit].hp = Math.min(cur[e.unit].maxHp, cur[e.unit].hp + e.amount); break;
      case "death": cur[e.unit].alive = false; cur[e.unit].hp = 0; break;
    }
    frames.push({ units: snap(), event: e, turn, phase });
  }
  return frames;
}

// Rebuild an engine Battle matching a frame, so engine helpers (move ranges) work on it.
export function battleAt(base: Battle, f: Frame): Battle {
  return {
    ...base, log: [], winner: null,
    units: base.units.map(u => {
      const v = f.units[u.id];
      return { ...u, pos: { x: v.x, y: v.y }, hp: v.hp, alive: v.alive };
    }),
  };
}

export function describe(e: BattleEvent): string {
  switch (e.t) {
    case "turn_start": return `Turn ${e.turn} · ${e.team === "player" ? "Player" : "Enemy"} Phase`;
    case "move": return `${e.unit} moves to (${e.to.x},${e.to.y})`;
    case "attack":
      if (!e.hit) return `${e.attacker} misses ${e.defender}`;
      return `${e.attacker} hits ${e.defender} for ${e.damage}` +
        (e.reaction ? ` · ${e.reaction.replace("_", " ")}` : "") +
        (e.triangle > 1 ? " · ▲" : e.triangle < 1 ? " · ▼" : "");
    case "evade": return `${e.unit} evades`;
    case "death": return `${e.unit} falls${e.killer ? ` to ${e.killer}` : ""}`;
    case "heal": return `${e.unit} heals ${e.amount} (${e.source})`;
    case "burn": return `${e.unit} burns for ${e.damage}`;
    case "end": return `${e.winner === "player" ? "Victory" : "Defeat"} by ${e.reason}`;
  }
}
