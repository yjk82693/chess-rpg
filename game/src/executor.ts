// executor.ts: turns a Coach playbook (PLAN section 5.1) into a battle policy, and evaluates it.
import { Team, UnitClass, triangleMod } from "./data.js";
import { Action, enemiesOf, legalActions } from "./actions.js";
import { Policy, runBattle } from "./engine.js";
import { GameMap, HELDOUT_MAPS, TRAIN_MAPS } from "./maps.js";
import { HELDOUT_NPCS, NPC_POLICIES, Personality, TRAIN_NPCS, scoreAction, threatMap } from "./npc.js";
import { DEFAULT_PLAYER, NPC_ARMIES } from "./parties.js";
import { Battle, Unit, UnitSpec, dist, getUnit } from "./state.js";

// ---------- Playbook schema (must match shared/PLAN.md 5.1) ----------
export const FORMATIONS = ["front_armored", "spread", "wedge", "turtle"] as const;
export const PRIORITIES = ["mage", "lowest_hp", "triangle_advantage", "nearest", "highest_atk"] as const;
export type Formation = (typeof FORMATIONS)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface Playbook {
  formation: Formation;
  advance_turn: number;                 // 0-5
  target_priority: Priority[];          // 1-4, ordered
  focus_fire: boolean;
  terrain_prefs: { forest: number; fort: number }; // 0-1 each
  retreat_hp_threshold: number;         // 0-0.9
  use_fire_on_forest: boolean;
  avoid_triangle_disadvantage: boolean;
}

// Generation 0 baseline: deliberately plain, so improvement is visible.
export const DEFAULT_PLAYBOOK: Playbook = {
  formation: "spread",
  advance_turn: 0,
  target_priority: ["nearest"],
  focus_fire: false,
  terrain_prefs: { forest: 0.2, fort: 0.2 },
  retreat_hp_threshold: 0.2,
  use_fire_on_forest: false,
  avoid_triangle_disadvantage: false,
};

// Field-by-field validation. Bad fields fall back to `fallback` (the parent playbook) and are reported.
export function validatePlaybook(raw: unknown, fallback: Playbook = DEFAULT_PLAYBOOK): { playbook: Playbook; errors: string[] } {
  const errors: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const num = (k: string, v: unknown, lo: number, hi: number, fb: number) => {
    if (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi) return v;
    errors.push(`${k}: expected number ${lo}-${hi}, got ${JSON.stringify(v)}`);
    return fb;
  };
  const bool = (k: string, v: unknown, fb: boolean) => {
    if (typeof v === "boolean") return v;
    errors.push(`${k}: expected boolean, got ${JSON.stringify(v)}`);
    return fb;
  };

  let formation = fallback.formation;
  if (FORMATIONS.includes(r.formation)) formation = r.formation;
  else errors.push(`formation: expected one of ${FORMATIONS.join("|")}, got ${JSON.stringify(r.formation)}`);

  let target_priority = fallback.target_priority;
  if (Array.isArray(r.target_priority) && r.target_priority.length >= 1 && r.target_priority.length <= 4 &&
      r.target_priority.every((p: unknown) => PRIORITIES.includes(p as Priority))) {
    target_priority = [...new Set(r.target_priority as Priority[])];
  } else errors.push(`target_priority: expected 1-4 of ${PRIORITIES.join("|")}, got ${JSON.stringify(r.target_priority)}`);

  const tp = r.terrain_prefs && typeof r.terrain_prefs === "object" ? r.terrain_prefs : {};
  return {
    playbook: {
      formation,
      advance_turn: Math.round(num("advance_turn", r.advance_turn, 0, 5, fallback.advance_turn)),
      target_priority,
      focus_fire: bool("focus_fire", r.focus_fire, fallback.focus_fire),
      terrain_prefs: {
        forest: num("terrain_prefs.forest", tp.forest, 0, 1, fallback.terrain_prefs.forest),
        fort: num("terrain_prefs.fort", tp.fort, 0, 1, fallback.terrain_prefs.fort),
      },
      retreat_hp_threshold: num("retreat_hp_threshold", r.retreat_hp_threshold, 0, 0.9, fallback.retreat_hp_threshold),
      use_fire_on_forest: bool("use_fire_on_forest", r.use_fire_on_forest, fallback.use_fire_on_forest),
      avoid_triangle_disadvantage: bool("avoid_triangle_disadvantage", r.avoid_triangle_disadvantage, fallback.avoid_triangle_disadvantage),
    },
    errors,
  };
}

// ---------- Formation effects ----------
type ClassMults = Partial<Record<UnitClass, number>> & { default: number };
interface FormationInfo { approach: ClassMults; danger: ClassMults; risk: number; }

const FORMATION_INFO: Record<Formation, FormationInfo> = {
  front_armored: {
    approach: { default: 0.7, [UnitClass.Armored]: 1.5, [UnitClass.Mage]: 0.5 },
    danger: { default: 1.0, [UnitClass.Armored]: 0.3, [UnitClass.Mage]: 1.6, [UnitClass.Winged]: 1.4 },
    risk: 0.8,
  },
  spread: {
    approach: { default: 1.0 },
    danger: { default: 0.5 },
    risk: 1.0,
  },
  wedge: {
    approach: { default: 1.0, [UnitClass.Cavalier]: 1.6, [UnitClass.Winged]: 1.6 },
    danger: { default: 0.3 },
    risk: 0.5,
  },
  turtle: {
    approach: { default: 0.4 },
    danger: { default: 2.0 },
    risk: 1.2,
  },
};

const mult = (m: ClassMults, cls: UnitClass) => m[cls] ?? m.default;
const RANK_BONUS = [10, 7, 4, 2];

function unitPersonality(pb: Playbook, u: Unit): Personality {
  const f = FORMATION_INFO[pb.formation];
  const retreating = u.hp / u.maxHp < pb.retreat_hp_threshold;
  return {
    name: "playbook", split: "train",
    damage: 1, kill: 14,
    risk: 0.8 * f.risk,
    danger: mult(f.danger, u.cls) * (retreating ? 2 : 1),
    approach: retreating ? -0.8 : 0.6 * mult(f.approach, u.cls),
    holdUntilTurn: retreating ? 0 : pb.advance_turn,
    forest: 5 * pb.terrain_prefs.forest,
    fort: 6 * pb.terrain_prefs.fort * (retreating ? 1.5 : 1),
    reaction: 4,
    fireForest: pb.use_fire_on_forest ? 6 : 0,
    itemHp: Math.max(0.3, pb.retreat_hp_threshold),
    focus: [], focusBonus: 0,
  };
}

function matchesPriority(p: Priority, u: Unit, def: Unit, enemies: Unit[]): boolean {
  switch (p) {
    case "mage": return def.cls === UnitClass.Mage;
    case "lowest_hp": return def.hp === Math.min(...enemies.map(e => e.hp));
    case "triangle_advantage": return triangleMod(u.weapon, def.weapon) > 1;
    case "nearest": return dist(u.pos, def.pos) === Math.min(...enemies.map(e => dist(u.pos, e.pos)));
    case "highest_atk": return def.stats.atk === Math.max(...enemies.map(e => e.stats.atk));
  }
}

function playbookExtras(b: Battle, u: Unit, a: Action, pb: Playbook): number {
  if (!a.target) return 0;
  const def = getUnit(b, a.target);
  const enemies = enemiesOf(b, u);
  let s = 0;
  pb.target_priority.forEach((p, i) => { if (matchesPriority(p, u, def, enemies)) s += RANK_BONUS[i] ?? 0; });
  if (pb.focus_fire) s += 8 * (1 - def.hp / def.maxHp);
  if (pb.avoid_triangle_disadvantage && triangleMod(u.weapon, def.weapon) < 1) s -= 8;
  return s;
}

export function playbookPolicy(pb: Playbook, name = "playbook"): Policy {
  return {
    name,
    act(b, u) {
      const acts = legalActions(b, u);
      if (!acts.length) return null;
      const P = unitPersonality(pb, u);
      const threat = threatMap(b, u);
      let best = acts[0];
      let bestScore = -Infinity;
      for (const a of acts) {
        const s = scoreAction(b, u, a, P, threat) + playbookExtras(b, u, a, pb);
        if (s > bestScore) { bestScore = s; best = a; }
      }
      return best;
    },
  };
}

// ---------- Evaluation (used by the runner) ----------
export interface EvalOptions {
  playbook: Playbook;
  party?: UnitSpec[];
  maps?: GameMap[];
  npcs?: string[];
  seeds?: number[];
}

export function evaluatePlaybook(o: EvalOptions) {
  const party = o.party ?? DEFAULT_PLAYER;
  const maps = o.maps ?? TRAIN_MAPS;
  const npcs = o.npcs ?? TRAIN_NPCS;
  const seeds = o.seeds ?? [1, 2, 3, 4];
  const policy = playbookPolicy(o.playbook);
  const results = [];
  for (const m of maps) for (const n of npcs) for (const seed of seeds) {
    results.push({ npc: n, ...runBattle({ mapId: m.id, seed, player: party, npc: NPC_ARMIES[n],
                                          playerPolicy: policy, npcPolicy: NPC_POLICIES[n] }) });
  }
  const wins = results.filter(r => r.winner === Team.Player).length;
  return {
    winRate: wins / results.length,
    avgScore: results.reduce((s, r) => s + r.score, 0) / results.length,
    n: results.length,
    errors: results.reduce((s, r) => s + r.errors.length, 0),
    results,
  };
}

// Run directly: npx tsx src/executor.ts
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const tuned: Playbook = {
    formation: "front_armored",
    advance_turn: 2,
    target_priority: ["mage", "lowest_hp", "triangle_advantage"],
    focus_fire: true,
    terrain_prefs: { forest: 0.8, fort: 0.8 },
    retreat_hp_threshold: 0.4,
    use_fire_on_forest: true,
    avoid_triangle_disadvantage: true,
  };
  const bad = validatePlaybook({ formation: "blob", advance_turn: 9, target_priority: ["mage"], focus_fire: "yes" });
  console.log(`validation test: ${bad.errors.length} errors caught (expect several)`);
  for (const e of bad.errors.slice(0, 3)) console.log(`  ${e}`);

  const fmt = (label: string, r: ReturnType<typeof evaluatePlaybook>) =>
    console.log(`${label.padEnd(26)} win ${(100 * r.winRate).toFixed(0).padStart(3)}%  score ${r.avgScore.toFixed(3).padStart(6)}  n=${r.n}${r.errors ? `  ERRORS ${r.errors}` : ""}`);

  console.log("\nTraining set (train maps x train NPCs):");
  fmt("baseline (gen 0)", evaluatePlaybook({ playbook: DEFAULT_PLAYBOOK }));
  fmt("hand-tuned", evaluatePlaybook({ playbook: tuned }));

  console.log("\nHeld-out set (held-out maps x all NPCs incl. hunter):");
  const heldNpcs = [...TRAIN_NPCS, ...HELDOUT_NPCS];
  fmt("baseline (gen 0)", evaluatePlaybook({ playbook: DEFAULT_PLAYBOOK, maps: HELDOUT_MAPS, npcs: heldNpcs, seeds: [101, 102, 103, 104] }));
  fmt("hand-tuned", evaluatePlaybook({ playbook: tuned, maps: HELDOUT_MAPS, npcs: heldNpcs, seeds: [101, 102, 103, 104] }));
}
