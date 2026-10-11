// rival.ts: rule-based adaptive rival (PLAN section 12 fallback until the LLM rival is live).
// Reads the human's recent Solo battles and writes the next counter-playbook for the NPC side.
import { Db } from "mongodb";
import { Playbook, Priority, validatePlaybook } from "./executor.js";
import { BattleSummary } from "./summary.js";

interface PartyUnit { id: string; class: string }
interface HumanBattle { summary: BattleSummary; party: PartyUnit[] | null; winner: string }

const RIVAL_BASE: Playbook = {
  formation: "spread",
  advance_turn: 0,
  target_priority: ["lowest_hp", "nearest"],
  focus_fire: true,
  terrain_prefs: { forest: 0.4, fort: 0.4 },
  retreat_hp_threshold: 0.25,
  use_fire_on_forest: false,
  avoid_triangle_disadvantage: true,
};

export function counterPlaybook(history: HumanBattle[], prev: Playbook | null): { playbook: Playbook; reasons: string[] } {
  const pb: Playbook = JSON.parse(JSON.stringify(prev ?? RIVAL_BASE));
  const reasons: string[] = [];
  const n = history.length;
  if (!n) return { playbook: pb, reasons: ["no battles yet, so I play my default plan"] };

  let fortHeals = 0, forestEvades = 0, quickWins = 0, humanWins = 0;
  const killsByClass: Record<string, number> = {};
  for (const h of history) {
    const s = h.summary;
    const cls = new Map((h.party ?? []).map(u => [u.id, u.class]));
    fortHeals += s.fort_heals?.player ?? 0;
    forestEvades += s.forest_evades?.player ?? 0;
    if (h.winner === "player") {
      humanWins++;
      if (s.turns <= 6) quickWins++;
    }
    for (const d of s.deaths ?? []) {
      if (d.side === "npc" && d.killer && cls.has(d.killer)) {
        const c = cls.get(d.killer)!;
        killsByClass[c] = (killsByClass[c] ?? 0) + 1;
      }
    }
  }

  const top = Object.entries(killsByClass).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    const target: Priority = top[0] === "mage" ? "mage" : "highest_atk";
    pb.target_priority = [target, ...pb.target_priority.filter(t => t !== target)].slice(0, 4);
    reasons.push(`your ${top[0]} scored ${top[1]} kills, so I take it down first`);
  }
  if (fortHeals / n >= 2) {
    pb.focus_fire = true;
    pb.advance_turn = 0;
    pb.formation = "wedge";
    reasons.push("you heal on forts, so I strike early and focus one unit at a time");
  }
  if (forestEvades / n >= 2) {
    pb.use_fire_on_forest = true;
    pb.terrain_prefs.forest = 0.2;
    reasons.push("you dodge in forests, so I bring fire to burn you out");
  }
  if (quickWins >= 1) {
    pb.formation = "turtle";
    pb.advance_turn = Math.max(pb.advance_turn, 2);
    pb.retreat_hp_threshold = 0.4;
    pb.terrain_prefs.fort = 0.8;
    reasons.push("you rush and win fast, so I hold defensive ground and make you come to me");
  }
  if (humanWins === 0 && n >= 2) reasons.push("my plan is working, so I keep pressing");
  if (!reasons.length) {
    pb.advance_turn = Math.max(0, pb.advance_turn - 1);
    pb.focus_fire = true;
    reasons.push("no clear habit yet, so I play more aggressively to test you");
  }
  return { playbook: validatePlaybook(pb, prev ?? RIVAL_BASE).playbook, reasons };
}

export async function updateRival(db: Db, player: string): Promise<{ generation: number; rationale: string }> {
  const runId = `rival-${player}`;
  const battles = await db.collection("battles")
    .find({ run_id: runId, split: "human" })
    .sort({ created_at: -1 }).limit(3)
    .project({ summary: 1, party: 1, winner: 1 })
    .toArray();
  const prevDoc = await db.collection("playbooks")
    .find({ run_id: runId, side: "npc" })
    .sort({ generation: -1, created_at: -1 }).limit(1).next();
  const prev = prevDoc ? validatePlaybook(prevDoc.playbook).playbook : null;
  const history = battles.filter(b => b.summary).map(b => ({ summary: b.summary, party: b.party, winner: b.winner }));
  const { playbook, reasons } = counterPlaybook(history, prev);
  const rationale = `${reasons.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(". ")}.`;
  const generation = (prevDoc?.generation ?? 0) + 1;
  await db.collection("playbooks").insertOne({
    run_id: runId, generation, condition: "adaptive", side: "npc", persona: "rival-rules",
    parent_id: prevDoc?._id ?? null, playbook, rationale, created_at: new Date(),
  });
  return { generation, rationale };
}
