// export.ts: pulls a run's generations from MongoDB into viewer/public/data/<run>.json
//   npm run export -- --run tg1                 export once
//   npm run export -- --run tg1 --watch         re-export whenever generations change (every 15 s)
//   npm run export -- --run tg1 --watch 30      custom interval in seconds
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Db, MongoClient } from "mongodb";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true });

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

async function build(db: Db, runId: string) {
  const gens = await db.collection("generations").find({ run_id: runId }).sort({ condition: 1, generation: 1 }).toArray();
  const out = { run_id: runId, exported_at: new Date().toISOString(), generations: [] as any[] };
  for (const g of gens) {
    const best = g.best_playbook_id ? await db.collection("playbooks").findOne({ _id: g.best_playbook_id }) : null;
    const bestRes = (g.results ?? []).find((r: any) => String(r.playbook_id) === String(g.best_playbook_id));
    const party = await db.collection("parties")
      .find({ run_id: runId, condition: g.condition, generation: { $lte: g.generation } })
      .sort({ generation: -1 }).limit(1).next();
    out.generations.push({
      generation: g.generation, condition: g.condition, status: g.status,
      win_rate: g.win_rate ?? null, avg_score: g.avg_score ?? null, n_battles: g.n_battles ?? null,
      heldout: g.heldout ? { win_rate: g.heldout.win_rate, avg_score: g.heldout.avg_score } : null,
      best: best ? { persona: best.persona ?? null, playbook: bestRes?.executed_playbook ?? best.playbook, rationale: best.rationale ?? "" } : null,
      candidates: (g.results ?? []).map((r: any) => ({ persona: r.persona ?? null, win_rate: r.win_rate, avg_score: r.avg_score })),
      party: party?.units ?? null,
    });
  }
  const signature = JSON.stringify(gens.map(g => [g.condition, g.generation, g.status, g.win_rate ?? null, g.heldout?.win_rate ?? null]));
  return { out, signature };
}

function describeLatest(out: { generations: any[] }) {
  const full = out.generations.filter(g => g.condition === "full" && g.win_rate != null);
  const last = full[full.length - 1];
  return last ? `latest full gen ${last.generation}: win ${Math.round(last.win_rate * 100)}%` : "no finished full generations yet";
}

async function main() {
  const runId = arg("run", "demo1")!;
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI is empty. Put it in training-grounds/.env"); process.exit(1); }
  const dir = path.resolve(here, "../../viewer/public/data");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${runId}.json`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "training_grounds");

  if (!flag("watch")) {
    try {
      const { out } = await build(db, runId);
      fs.writeFileSync(file, JSON.stringify(out, null, 2));
      console.log(`exported ${out.generations.length} generations to ${file} (${describeLatest(out)})`);
    } finally {
      await client.close();
    }
    return;
  }

  const seconds = Math.max(5, Number(arg("watch", "15")) || 15);
  let last = "";
  const tick = async () => {
    try {
      const { out, signature } = await build(db, runId);
      if (signature !== last) {
        fs.writeFileSync(file, JSON.stringify(out, null, 2));
        last = signature;
        console.log(`[${new Date().toLocaleTimeString()}] exported ${out.generations.length} generations (${describeLatest(out)})`);
      }
    } catch (e) {
      console.error(`[${new Date().toLocaleTimeString()}] export failed: ${(e as Error).message}`);
    }
  };
  console.log(`watching run ${runId} every ${seconds}s -> ${file} (Ctrl+C to stop)`);
  await tick();
  const timer = setInterval(tick, seconds * 1000);
  process.on("SIGINT", async () => { clearInterval(timer); await client.close(); process.exit(0); });
}

main();
