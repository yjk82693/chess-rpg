// summary.ts: compact battle summary for the Coach (PLAN section 5.5). Pure function of a BattleResult.
import { Team, Terrain } from "./data.js";
import { BattleResult } from "./engine.js";

type Side = "player" | "npc";

export interface BattleSummary {
  outcome: "win" | "loss";
  reason: "rout" | "time";
  map: string;
  npc: string | null;
  turns: number;
  hp_left: { player: number; npc: number };
  units_lost: { own: number; enemy: number };
  deaths: { unit: string; side: Side; killer: string | null; terrain: Terrain; turn: number; triangle_disadvantage: boolean }[];
  reactions: { type: string; by: Side; count: number; damage: number }[];
  fort_heals: { player: number; npc: number };
  forest_evades: { player: number; npc: number };
  burn_damage: { player: number; npc: number };
  hp_lead_by_turn: number[];        // player HP ratio minus npc HP ratio, end of each turn
  turning_point_turn: number | null;
  exp: { id: string; exp: number; survived: boolean }[];
  notes: string[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function summarize(r: BattleResult & { npc?: string }): BattleSummary {
  const sideOf = new Map<string, Side>(r.units.map(u => [u.id, u.team === Team.Player ? "player" : "npc"]));
  const hp = new Map<string, number>(r.units.map(u => [u.id, u.maxHp]));
  const maxTotal = { player: 0, npc: 0 };
  for (const u of r.units) maxTotal[sideOf.get(u.id)!] += u.maxHp;

  const deaths: BattleSummary["deaths"] = [];
  const reactionMap = new Map<string, { type: string; by: Side; count: number; damage: number }>();
  const fort = { player: 0, npc: 0 };
  const evades = { player: 0, npc: 0 };
  const burn = { player: 0, npc: 0 };
  const lead: number[] = [];

  const ratio = (side: Side) => {
    let cur = 0;
    for (const [id, v] of hp) if (sideOf.get(id) === side) cur += v;
    return maxTotal[side] ? cur / maxTotal[side] : 0;
  };
  let currentTurn = 1;
  const snapshot = () => { lead[currentTurn - 1] = round2(ratio("player") - ratio("npc")); };

  for (const e of r.log) {
    if ("turn" in e && e.turn > currentTurn) { snapshot(); currentTurn = e.turn; }
    switch (e.t) {
      case "attack":
        if (e.hit) {
          hp.set(e.defender, Math.max(0, (hp.get(e.defender) ?? 0) - e.damage));
          if (e.reaction) {
            const by = sideOf.get(e.attacker)!;
            const k = `${e.reaction}|${by}`;
            const cur = reactionMap.get(k) ?? { type: e.reaction, by, count: 0, damage: 0 };
            cur.count += 1; cur.damage += e.damage;
            reactionMap.set(k, cur);
          }
        }
        break;
      case "burn":
        hp.set(e.unit, Math.max(0, (hp.get(e.unit) ?? 0) - e.damage));
        burn[sideOf.get(e.unit)!] += e.damage;
        break;
      case "heal":
        hp.set(e.unit, (hp.get(e.unit) ?? 0) + e.amount);
        if (e.source === "fort") fort[sideOf.get(e.unit)!] += 1;
        break;
      case "evade":
        if (e.terrain === Terrain.Forest) evades[sideOf.get(e.unit)!] += 1;
        break;
      case "death":
        hp.set(e.unit, 0);
        deaths.push({ unit: e.unit, side: sideOf.get(e.unit)!, killer: e.killer, terrain: e.terrain,
                      turn: e.turn, triangle_disadvantage: e.triangleDisadvantage });
        break;
    }
  }
  snapshot();

  let turning: number | null = null;
  for (let t = 1; t < lead.length; t++) {
    if (lead[t] !== undefined && lead[t - 1] !== undefined && lead[t] !== 0 && lead[t - 1] !== 0 &&
        Math.sign(lead[t]) !== Math.sign(lead[t - 1])) turning = t + 1;
  }

  const own = deaths.filter(d => d.side === "player");
  const enemy = deaths.filter(d => d.side === "npc");
  const reactions = [...reactionMap.values()];
  const notes: string[] = [];
  if (own.length) notes.push(`first loss: ${own[0].unit} on turn ${own[0].turn} (${own[0].terrain}, killed by ${own[0].killer ?? "burn"})`);
  const triLosses = own.filter(d => d.triangle_disadvantage).length;
  if (triLosses) notes.push(`${triLosses} of our units died fighting at a weapon-triangle disadvantage`);
  const earlyMage = own.find(d => d.unit.includes("queen") && d.turn <= 3);
  if (earlyMage) notes.push(`our mage ${earlyMage.unit} died early (turn ${earlyMage.turn})`);
  const ourReactions = reactions.filter(x => x.by === "player").reduce((s, x) => s + x.count, 0);
  const theirReactions = reactions.filter(x => x.by === "npc").reduce((s, x) => s + x.count, 0);
  if (theirReactions > ourReactions) notes.push(`enemy triggered more attribute responses (${theirReactions} vs ${ourReactions})`);
  if (burn.player > 0) notes.push(`we took ${burn.player} burn damage (fire on forest)`);
  if (r.reason === "time") notes.push(`went to time with ${r.units.filter(u => u.team === Team.Npc && u.alive).length} enemies alive`);
  if (turning) notes.push(`HP lead flipped on turn ${turning}`);

  return {
    outcome: r.winner === Team.Player ? "win" : "loss",
    reason: r.reason,
    map: r.mapId,
    npc: r.npc ?? null,
    turns: r.turns,
    hp_left: { player: round2(r.playerHp), npc: round2(r.npcHp) },
    units_lost: { own: own.length, enemy: enemy.length },
    deaths,
    reactions,
    fort_heals: fort,
    forest_evades: evades,
    burn_damage: burn,
    hp_lead_by_turn: lead.map(x => x ?? 0),
    turning_point_turn: turning,
    exp: r.units.filter(u => u.team === Team.Player).map(u => ({ id: u.id, exp: u.expGained, survived: u.alive })),
    notes,
  };
}
