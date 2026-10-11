// npc.ts: scripted NPC personalities. Each scores every legal action with its own weights.
import { Attribute, TERRAIN, Team, UnitClass, WEAPON_RANGE } from "./data.js";
import { Action, enemiesOf, legalActions, reachableTiles } from "./actions.js";
import { Policy, randomPolicy, runBattle } from "./engine.js";
import { TRAIN_MAPS } from "./maps.js";
import { DEFAULT_PLAYER, NPC_ARMIES } from "./parties.js";
import { canCounter, hitChance, previewDamage, strikesFor } from "./rules.js";
import { Battle, Unit, dist, getUnit, terrainAt } from "./state.js";

export type Focus = "mage" | "lowest_hp";

export interface Personality {
  name: string;
  split: "train" | "heldout";
  damage: number;        // weight on expected damage dealt
  kill: number;          // bonus for a likely kill
  risk: number;          // weight on expected counter damage taken
  danger: number;        // penalty per enemy that can reach the destination tile
  approach: number;      // penalty per tile of distance to the nearest enemy
  holdUntilTurn: number; // approach weight is 0 before this turn
  forest: number;        // bonus for ending on forest
  fort: number;          // bonus for ending on a fort
  reaction: number;      // bonus for setting off an attribute response
  fireForest: number;    // bonus for hitting a target on forest with fire
  itemHp: number;        // use an item below this HP ratio
  focus: Focus[];
  focusBonus: number;
}

export const PERSONALITIES: Record<string, Personality> = {
  rusher: {
    name: "rusher", split: "train",
    damage: 1, kill: 15, risk: 0.2, danger: 0, approach: 1.0, holdUntilTurn: 0,
    forest: 0, fort: 0, reaction: 2, fireForest: 1, itemHp: 0.25, focus: [], focusBonus: 0,
  },
  turtle: {
    name: "turtle", split: "train",
    damage: 1, kill: 12, risk: 1.0, danger: 2, approach: 0.3, holdUntilTurn: 3,
    forest: 3, fort: 5, reaction: 2, fireForest: 1, itemHp: 0.5, focus: [], focusBonus: 0,
  },
  elementalist: {
    name: "elementalist", split: "train",
    damage: 1, kill: 12, risk: 0.6, danger: 0.5, approach: 0.6, holdUntilTurn: 0,
    forest: 1, fort: 1, reaction: 12, fireForest: 6, itemHp: 0.35, focus: [], focusBonus: 0,
  },
  hunter: {
    name: "hunter", split: "heldout",
    damage: 0.8, kill: 20, risk: 0.8, danger: 1, approach: 0.7, holdUntilTurn: 0,
    forest: 1, fort: 1, reaction: 3, fireForest: 2, itemHp: 0.4, focus: ["mage", "lowest_hp"], focusBonus: 8,
  },
};

export const TRAIN_NPCS = Object.values(PERSONALITIES).filter(p => p.split === "train").map(p => p.name);
export const HELDOUT_NPCS = Object.values(PERSONALITIES).filter(p => p.split === "heldout").map(p => p.name);

const key = (x: number, y: number) => `${x},${y}`;

// How many enemies could attack each tile next phase.
export function threatMap(b: Battle, u: Unit): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of enemiesOf(b, u)) {
    const [min, max] = WEAPON_RANGE[e.weapon];
    const tiles = new Set<string>();
    for (const p of reachableTiles(b, e)) {
      for (let dx = -max; dx <= max; dx++) {
        for (let dy = -max; dy <= max; dy++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d >= min && d <= max) tiles.add(key(p.x + dx, p.y + dy));
        }
      }
    }
    for (const k of tiles) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function focusBonus(P: Personality, def: Unit, enemies: Unit[]): number {
  let bonus = 0;
  if (P.focus.includes("mage") && def.cls === UnitClass.Mage) bonus += P.focusBonus;
  if (P.focus.includes("lowest_hp") && def.hp === Math.min(...enemies.map(e => e.hp))) bonus += P.focusBonus;
  return bonus;
}

export function scoreAction(b: Battle, u: Unit, a: Action, P: Personality, threat: Map<string, number>): number {
  const orig = u.pos;
  u.pos = a.to; // evaluate as if the unit already moved
  try {
    let s = 0;
    const tile = TERRAIN[terrainAt(b, a.to)];
    if (tile.evadeFromSpd) s += P.forest;
    if (tile.healPct > 0) s += P.fort;

    const enemies = enemiesOf(b, u);
    if (enemies.length) {
      const nearest = Math.min(...enemies.map(e => dist(a.to, e.pos)));
      s -= (b.turn < P.holdUntilTurn ? 0 : P.approach) * nearest;
    }
    s -= P.danger * (threat.get(key(a.to.x, a.to.y)) ?? 0);

    if (a.target) {
      const def = getUnit(b, a.target);
      const pv = previewDamage(u, def);
      const hit = hitChance(b, u, def) / 100;
      const total = pv.damage * strikesFor(u, def);
      const lethal = total >= def.hp;
      s += P.damage * Math.min(def.hp, total) * hit;
      if (lethal) s += P.kill * hit;
      if (pv.reaction) s += P.reaction;
      if (u.attribute === Attribute.Fire && TERRAIN[terrainAt(b, def.pos)].burnable) s += P.fireForest;
      s += focusBonus(P, def, enemies);
      if (canCounter(def, u) && !(lethal && hit > 0.9)) {
        const counter = previewDamage(def, u).damage * (hitChance(b, def, u) / 100);
        s -= P.risk * Math.min(u.hp, counter);
      }
    } else if (a.useItem) {
      const ratio = u.hp / u.maxHp;
      s += ratio < P.itemHp ? 10 + (1 - ratio) * 10 : -10;
    }
    return s;
  } finally {
    u.pos = orig;
  }
}

export function personalityPolicy(P: Personality): Policy {
  return {
    name: P.name,
    act(b, u) {
      const acts = legalActions(b, u);
      if (!acts.length) return null;
      const threat = P.danger > 0 ? threatMap(b, u) : new Map<string, number>();
      let best = acts[0];
      let bestScore = -Infinity;
      for (const a of acts) {
        const s = scoreAction(b, u, a, P, threat);
        if (s > bestScore) { bestScore = s; best = a; }
      }
      return best;
    },
  };
}

export const NPC_POLICIES: Record<string, Policy> = Object.fromEntries(
  Object.values(PERSONALITIES).map(P => [P.name, personalityPolicy(P)]),
);

// Run directly: npx tsx src/npc.ts
// Prints player win rate for each player-side policy against each NPC across train maps.
if ((globalThis as any).process?.argv?.[1]?.endsWith("/npc.ts")) {
  const seeds = [1, 2, 3, 4];
  const playerSides: Policy[] = [randomPolicy, ...Object.values(NPC_POLICIES)];
  const npcNames = Object.keys(PERSONALITIES);
  console.log(`player win % (rows: player policy, cols: npc) over ${TRAIN_MAPS.length} maps x ${seeds.length} seeds`);
  console.log("".padEnd(14) + npcNames.map(n => n.padStart(14)).join(""));
  for (const pp of playerSides) {
    let row = pp.name.padEnd(14);
    for (const n of npcNames) {
      let wins = 0, total = 0, errors = 0;
      for (const m of TRAIN_MAPS) {
        for (const seed of seeds) {
          const r = runBattle({ mapId: m.id, seed, player: DEFAULT_PLAYER, npc: NPC_ARMIES[n],
                                playerPolicy: pp, npcPolicy: NPC_POLICIES[n] });
          total++;
          if (r.winner === Team.Player) wins++;
          errors += r.errors.length;
        }
      }
      row += `${Math.round((100 * wins) / total)}%${errors ? `(E${errors})` : ""}`.padStart(14);
    }
    console.log(row);
  }
}
