// export.ts: pulls a run's generations from MongoDB into viewer/public/data/<run>.json
//   npm run export -- --run demo1
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true });

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
};

async function main() {
  const runId = arg("run", "demo1")!;
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI is empty. Put it in training-grounds/.env"); process.exit(1); }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "training_grounds");
  try {
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
    const dir = path.resolve(here, "../../viewer/public/data");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${runId}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`exported ${out.generations.length} generations to ${file}`);
  } finally {
    await client.close();
  }
}

main();
