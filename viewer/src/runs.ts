// runs.ts: loads exported run data (viewer/public/data/<run>.json), with a built-in sample fallback.
import { DEFAULT_PLAYBOOK, Playbook, validatePlaybook } from "../../game/src/executor.js";
import { DEFAULT_PLAYER } from "../../game/src/parties.js";
import { UnitSpec } from "../../game/src/state.js";

export interface GenExport {
  generation: number;
  condition: string;
  status: string;
  win_rate: number | null;
  avg_score: number | null;
  n_battles?: number | null;
  heldout?: { win_rate: number; avg_score: number } | null;
  best: { persona: string | null; playbook: unknown; rationale: string } | null;
  candidates?: { persona: string | null; win_rate: number; avg_score: number }[];
  party: UnitSpec[] | null;
}

export interface RunExport {
  run_id: string;
  exported_at?: string;
  sample?: boolean;
  generations: GenExport[];
}

const SAMPLE_TUNED: Playbook = {
  formation: "front_armored", advance_turn: 2,
  target_priority: ["mage", "lowest_hp", "triangle_advantage"], focus_fire: true,
  terrain_prefs: { forest: 0.8, fort: 0.8 }, retreat_hp_threshold: 0.4,
  use_fire_on_forest: true, avoid_triangle_disadvantage: true,
};

const SAMPLE: RunExport = {
  run_id: "sample",
  sample: true,
  generations: [
    { generation: 0, condition: "full", status: "done", win_rate: 0.2, avg_score: 0.099, party: null,
      best: { persona: "baseline", playbook: DEFAULT_PLAYBOOK, rationale: "Hand-written generation 0 baseline." } },
    { generation: 1, condition: "full", status: "done", win_rate: 0.47, avg_score: 0.44, party: null,
      best: { persona: "sample", playbook: SAMPLE_TUNED,
              rationale: "Sample: armor in front, hold until turn 2, focus mages and weakened units, retreat to forts below 40% HP." } },
  ],
};

export async function loadRun(runId: string): Promise<RunExport> {
  try {
    const r = await fetch(`/data/${runId}.json`, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const run = (await r.json()) as RunExport;
    return run.generations?.length ? run : SAMPLE;
  } catch {
    return SAMPLE;
  }
}

export const fullGens = (run: RunExport) => run.generations.filter(g => g.condition === "full");
export const frozenGens = (run: RunExport) => run.generations.filter(g => g.condition === "frozen_stats");
export const playbookOf = (g: GenExport): Playbook => validatePlaybook(g.best?.playbook ?? DEFAULT_PLAYBOOK).playbook;
export const partyOf = (g: GenExport): UnitSpec[] => (g.party?.length ? g.party : DEFAULT_PLAYER);
