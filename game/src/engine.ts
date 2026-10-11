// engine.ts: battle setup, action application, phases, full battle loop.
import { MAX_TURNS, Team } from "./data.js";
import { Action, legalActions, validateAction } from "./actions.js";
import { getMap } from "./maps.js";
import { resolveCombat, startOfPhase, useItem } from "./rules.js";
import { Battle, BattleEvent, Rng, Unit, UnitSpec, aliveOf, getUnit, hpRatio, makeUnit, samePos } from "./state.js";

// A policy decides one unit's action at a time, seeing the full current board.
export interface Policy {
  name: string;
  act(b: Battle, u: Unit): Action | null;
}

export function createBattle(mapId: string, player: UnitSpec[], npc: UnitSpec[], seed: number): Battle {
  const map = getMap(mapId);
  if (player.length > map.playerSpawns.length) throw new Error(`${mapId}: too many player units`);
  if (npc.length > map.npcSpawns.length) throw new Error(`${mapId}: too many npc units`);
  const ids = [...player, ...npc].map(s => s.id);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate unit ids: ${ids.join(",")}`);
  return {
    seed,
    rng: new Rng(seed),
    mapId,
    grid: map.grid.map(row => [...row]),
    units: [
      ...player.map((s, i) => makeUnit(s, Team.Player, map.playerSpawns[i])),
      ...npc.map((s, i) => makeUnit(s, Team.Npc, map.npcSpawns[i])),
    ],
    turn: 0,
    log: [],
    winner: null,
  };
}

// Returns an error string if the action was illegal (and skipped), else null.
export function applyAction(b: Battle, a: Action): string | null {
  const err = validateAction(b, a);
  if (err) return err;
  const u = getUnit(b, a.unit);
  if (!samePos(u.pos, a.to)) {
    b.log.push({ t: "move", turn: b.turn, unit: u.id, from: { ...u.pos }, to: { ...a.to } });
    u.pos = { ...a.to };
  }
  if (a.target) resolveCombat(b, u, getUnit(b, a.target));
  else if (a.useItem) useItem(b, u);
  return null;
}

function checkRout(b: Battle): boolean {
  if (b.winner) return true;
  const p = aliveOf(b, Team.Player).length;
  const n = aliveOf(b, Team.Npc).length;
  if (p > 0 && n > 0) return false;
  b.winner = n === 0 ? Team.Player : Team.Npc;
  b.log.push({ t: "end", turn: b.turn, winner: b.winner, reason: "rout" });
  return true;
}

function runPhase(b: Battle, team: Team, policy: Policy, errors: string[]): void {
  b.log.push({ t: "turn_start", turn: b.turn, team });
  startOfPhase(b, team);
  if (checkRout(b)) return;
  for (const id of aliveOf(b, team).map(u => u.id)) {
    const u = getUnit(b, id);
    if (!u.alive) continue;
    const a = policy.act(b, u);
    if (a) {
      const err = applyAction(b, a);
      if (err) errors.push(`T${b.turn} ${policy.name}: ${err}`);
    }
    if (checkRout(b)) return;
  }
}

export interface BattleOptions {
  mapId: string;
  player: UnitSpec[];
  npc: UnitSpec[];
  seed: number;
  playerPolicy: Policy;
  npcPolicy: Policy;
}

export interface UnitResult {
  id: string;
  team: Team;
  alive: boolean;
  hp: number;
  maxHp: number;
  expGained: number;
}

export interface BattleResult {
  mapId: string;
  seed: number;
  winner: Team;
  reason: "rout" | "time";
  turns: number;
  playerHp: number;   // remaining HP ratio, 0-1
  npcHp: number;
  score: number;      // PLAN 5.4: win + 0.5 x (own - enemy HP ratio)
  units: UnitResult[];
  errors: string[];
  log: BattleEvent[];
}

export function runBattle(o: BattleOptions): BattleResult {
  const b = createBattle(o.mapId, o.player, o.npc, o.seed);
  const errors: string[] = [];
  for (let t = 1; t <= MAX_TURNS && !b.winner; t++) {
    b.turn = t;
    runPhase(b, Team.Player, o.playerPolicy, errors);
    if (b.winner) break;
    runPhase(b, Team.Npc, o.npcPolicy, errors);
  }
  const playerHp = hpRatio(b, Team.Player);
  const npcHp = hpRatio(b, Team.Npc);
  let reason: "rout" | "time" = "rout";
  if (!b.winner) {
    reason = "time";
    b.winner = playerHp > npcHp ? Team.Player : Team.Npc; // ties go to the NPC
    b.log.push({ t: "end", turn: b.turn, winner: b.winner, reason });
  }
  const win = b.winner === Team.Player ? 1 : 0;
  return {
    mapId: o.mapId, seed: o.seed, winner: b.winner, reason, turns: b.turn,
    playerHp, npcHp,
    score: win + 0.5 * (playerHp - npcHp),
    units: b.units.map(u => ({ id: u.id, team: u.team, alive: u.alive, hp: u.hp, maxHp: u.maxHp, expGained: u.expGained })),
    errors,
    log: b.log,
  };
}

// Baseline policy: attack when possible (70%), otherwise a random legal action.
export const randomPolicy: Policy = {
  name: "random",
  act(b, u) {
    const acts = legalActions(b, u);
    if (!acts.length) return null;
    const attacks = acts.filter(a => a.target);
    if (attacks.length && b.rng.chance(70)) return b.rng.pick(attacks);
    return b.rng.pick(acts);
  },
};
