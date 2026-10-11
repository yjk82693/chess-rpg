// runner.ts: MongoDB bridge (PLAN section 5.6). Evaluates a generation's candidate playbooks and writes battles.
//   npm run runner -- --dry
//   npm run runner -- --init --run RUN_ID [--condition full|frozen_stats]
//   npm run runner -- --run RUN_ID --gen N --condition full [--split train|heldout]
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Db, MongoClient, ObjectId } from "mongodb";
import {
  Attribute, CLASSES, COST_PER_STAR, ITEM_PRICE, Item, MAX_ITEMS_PER_UNIT, PARTY_COST_CAP,
  SHOP_BUDGET, Subskill, UnitClass,
} from "./data.js";
import { DEFAULT_PLAYBOOK, Playbook, evaluatePlaybook, validatePlaybook } from "./executor.js";
import { HELDOUT_MAPS, TRAIN_MAPS } from "./maps.js";
import { HELDOUT_NPCS, TRAIN_NPCS } from "./npc.js";
import { DEFAULT_PLAYER } from "./parties.js";
import { UnitSpec } from "./state.js";
import { summarize } from "./summary.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true });

export const TRAIN_SEEDS = [1, 2, 3, 4];
export const HELDOUT_SEEDS = Array.from({ length: 16 }, (_, i) => 101 + i);
const DB_NAME = process.env.MONGODB_DB ?? "training_grounds";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const toId = (x: unknown) => (typeof x === "string" && /^[0-9a-f]{24}$/i.test(x) ? new ObjectId(x) : x);

function evalSet(split: string) {
  return split === "heldout"
    ? { maps: HELDOUT_MAPS, npcs: [...TRAIN_NPCS, ...HELDOUT_NPCS], seeds: HELDOUT_SEEDS }
    : { maps: TRAIN_MAPS, npcs: TRAIN_NPCS, seeds: TRAIN_SEEDS };
}

// ---------- Party validation (PLAN 5.2 + section 11) ----------
export function validateParty(raw: any): { party: UnitSpec[]; errors: string[] } {
  const errors: string[] = [];
  const units = raw && Array.isArray(raw.units) ? raw.units : null;
  if (!units || units.length < 1 || units.length > 4) {
    return { party: DEFAULT_PLAYER, errors: ["units: expected 1-4 units, using default party"] };
  }
  const classes = Object.values(UnitClass) as string[];
  const attrs = Object.values(Attribute) as string[];
  const subskills = Object.values(Subskill) as string[];
  const items = Object.values(Item) as string[];
  const ids = new Set<string>();
  const party: UnitSpec[] = [];
  let cost = 0;
  let gold = 0;
  units.forEach((u: any, i: number) => {
    const where = `units[${i}]`;
    if (typeof u?.id !== "string" || ids.has(u.id)) errors.push(`${where}.id missing or duplicate`);
    if (!classes.includes(u?.class)) { errors.push(`${where}.class invalid: ${u?.class}`); return; }
    const cls = u.class as UnitClass;
    if (!CLASSES[cls].allowedWeapons.includes(u.weapon)) errors.push(`${where}.weapon ${u.weapon} not allowed for ${cls}`);
    if (!attrs.includes(u.attribute)) errors.push(`${where}.attribute invalid: ${u.attribute}`);
    const level = Number.isInteger(u.level) && u.level >= 1 && u.level <= 30 ? u.level : (errors.push(`${where}.level invalid`), 5);
    const star = Number.isInteger(u.star) && u.star >= 1 && u.star <= 5 ? u.star : (errors.push(`${where}.star invalid`), 1);
    const subskill = u.subskill == null ? null : subskills.includes(u.subskill) ? u.subskill : (errors.push(`${where}.subskill invalid`), null);
    const inv: Item[] = Array.isArray(u.items) ? u.items.filter((x: string) => items.includes(x)).slice(0, MAX_ITEMS_PER_UNIT) : [];
    if (Array.isArray(u.items) && inv.length !== u.items.length) errors.push(`${where}.items had invalid or extra entries`);
    cost += star * COST_PER_STAR;
    gold += inv.reduce((s, it) => s + ITEM_PRICE[it], 0);
    ids.add(u.id);
    party.push({ id: u.id, class: cls, weapon: u.weapon, attribute: u.attribute, level, exp: u.exp ?? 0,
                 star, promotion: u.promotion ?? 0, subskill, items: inv });
  });
  if (cost > PARTY_COST_CAP) errors.push(`party cost ${cost} exceeds cap ${PARTY_COST_CAP}`);
  if (gold > SHOP_BUDGET) errors.push(`items cost ${gold} exceeds budget ${SHOP_BUDGET}`);
  const fatal = errors.some(e => e.includes("class invalid") || e.includes("not allowed") || e.includes("exceeds") || e.includes("id missing"));
  return fatal ? { party: DEFAULT_PLAYER, errors: [...errors, "using default party"] } : { party, errors };
}

// ---------- Generation run ----------
async function runGeneration(db: Db, runId: string, gen: number, condition: string, split: string) {
  const gens = db.collection("generations");
  const playbooks = db.collection("playbooks");
  const g = await gens.findOne({ run_id: runId, generation: gen, condition });
  if (!g) throw new Error(`no generation doc for run=${runId} gen=${gen} condition=${condition}`);
  const candIds = (g.candidates ?? []).map(toId);
  if (!candIds.length) throw new Error("generation has no candidates");
  await gens.updateOne({ _id: g._id }, { $set: { status: "running", started_at: new Date() } });

  const partyDoc = await db.collection("parties")
    .find({ run_id: runId, condition, generation: { $lte: gen } }).sort({ generation: -1 }).limit(1).next();
  const { party, errors: partyErrors } = partyDoc
    ? validateParty(partyDoc)
    : { party: DEFAULT_PLAYER, errors: ["no party doc found, using default party"] };

  const set = evalSet(split);
  const pbDocs = await playbooks.find({ _id: { $in: candIds } }).toArray();
  const results = [];
  for (const doc of pbDocs) {
    let parent: Playbook = DEFAULT_PLAYBOOK;
    if (doc.parent_id) {
      const p = await playbooks.findOne({ _id: toId(doc.parent_id) as any });
      if (p?.playbook) parent = validatePlaybook(p.playbook).playbook;
    }
    const { playbook, errors } = validatePlaybook(doc.playbook, parent);
    const ev = evaluatePlaybook({ playbook, party, ...set });
    await db.collection("battles").insertMany(ev.results.map(r => ({
      run_id: runId, generation: gen, condition, split,
      playbook_id: doc._id, party_id: partyDoc?._id ?? null,
      map_id: r.mapId, npc_id: r.npc, seed: r.seed,
      winner: r.winner, turns: r.turns, score: r.score,
      summary: summarize(r), events: r.log, created_at: new Date(),
    })));
    results.push({ playbook_id: doc._id, persona: doc.persona ?? null, win_rate: ev.winRate,
                   avg_score: ev.avgScore, n: ev.n, validation_errors: errors, executed_playbook: playbook });
    console.log(`  ${String(doc.persona ?? doc._id).padEnd(20)} win ${(100 * ev.winRate).toFixed(0).padStart(3)}%  ` +
                `score ${ev.avgScore.toFixed(3)}  n=${ev.n}${errors.length ? `  (${errors.length} field fallbacks)` : ""}`);
  }
  results.sort((a, b) => b.avg_score - a.avg_score);
  const best = results[0];
  const summary = {
    results, best_playbook_id: best.playbook_id, win_rate: best.win_rate, avg_score: best.avg_score,
    n_battles: results.reduce((s, r) => s + r.n, 0), party_errors: partyErrors, finished_at: new Date(),
  };
  await gens.updateOne({ _id: g._id }, { $set: split === "heldout" ? { status: "done", heldout: summary } : { status: "done", ...summary } });
  console.log(`gen ${gen} [${condition}/${split}] best ${best.persona ?? best.playbook_id}: win ${(100 * best.win_rate).toFixed(0)}% score ${best.avg_score.toFixed(3)}`);
}

async function initRun(db: Db, runId: string, condition: string) {
  const now = new Date();
  const pb = await db.collection("playbooks").insertOne({
    run_id: runId, generation: 0, condition, persona: "baseline", parent_id: null,
    playbook: DEFAULT_PLAYBOOK, rationale: "Hand-written generation 0 baseline.", created_at: now,
  });
  await db.collection("parties").insertOne({
    run_id: runId, generation: 0, condition, units: DEFAULT_PLAYER,
    cost: DEFAULT_PLAYER.reduce((s, u) => s + u.star * COST_PER_STAR, 0), gold_spent: 0, created_at: now,
  });
  await db.collection("generations").insertOne({
    run_id: runId, generation: 0, condition, status: "pending", candidates: [pb.insertedId], created_at: now,
  });
  console.log(`initialized run ${runId} (${condition}) with generation 0`);
}

async function main() {
  const split = arg("split", "train")!;
  if (flag("dry")) {
    const ev = evaluatePlaybook({ playbook: DEFAULT_PLAYBOOK, ...evalSet(split) });
    console.log(`dry run, baseline on ${split}: win ${(100 * ev.winRate).toFixed(0)}%  score ${ev.avgScore.toFixed(3)}  n=${ev.n}`);
    const loss = ev.results.find(r => r.winner !== "player") ?? ev.results[0];
    console.log("\nsample summary (first loss):");
    console.log(JSON.stringify(summarize(loss), null, 2));
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI is empty. Put it in training-grounds/.env"); process.exit(1); }
  const runId = arg("run");
  if (!runId) { console.error("--run RUN_ID is required"); process.exit(1); }
  const condition = arg("condition", "full")!;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);
  await db.collection("battles").createIndex({ run_id: 1, generation: 1, condition: 1, split: 1 });
  try {
    if (flag("init")) {
      await initRun(db, runId, condition);
      await runGeneration(db, runId, 0, condition, split);
    } else {
      const gen = Number(arg("gen"));
      if (!Number.isInteger(gen)) throw new Error("--gen N is required");
      await runGeneration(db, runId, gen, condition, split);
    }
  } catch (e) {
    console.error(`runner failed: ${(e as Error).message}`);
    const gen = flag("init") ? 0 : Number(arg("gen"));
    await db.collection("generations").updateOne(
      { run_id: runId, generation: gen, condition },
      { $set: { status: "failed", error: (e as Error).message } },
    );
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
