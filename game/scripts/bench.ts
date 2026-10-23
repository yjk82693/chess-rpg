// bench.ts: reproducible benchmark for the Training Grounds battle engine.
// Run from game/:  npm run bench            (default 50 passes)
//                  npm run bench -- 100     (custom pass count)
// Times runBattle over the 60-battle training set (5 maps x 3 NPCs x 4 seeds),
// checks determinism, and times a full candidate evaluation. Single thread, no MongoDB.
import { createHash } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { runBattle } from "../src/engine.js";
import { DEFAULT_PLAYBOOK, evaluatePlaybook, playbookPolicy } from "../src/executor.js";
import { TRAIN_MAPS } from "../src/maps.js";
import { NPC_POLICIES, TRAIN_NPCS } from "../src/npc.js";
import { DEFAULT_PLAYER, NPC_ARMIES } from "../src/parties.js";

const PASSES = Number(process.argv[2] ?? 50);
const SEEDS = [1, 2, 3, 4];

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  return { n: s.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length, median: q(0.5), p95: q(0.95), p99: q(0.99) };
}
const ms = (x: number) => x.toFixed(2);
const hash = (r: unknown) => createHash("sha256").update(JSON.stringify(r)).digest("hex");

const policy = playbookPolicy(DEFAULT_PLAYBOOK);
const configs = TRAIN_MAPS.flatMap(m => TRAIN_NPCS.flatMap(n => SEEDS.map(seed => ({
  mapId: m.id, seed, player: DEFAULT_PLAYER, npc: NPC_ARMIES[n]!, playerPolicy: policy, npcPolicy: NPC_POLICIES[n]!,
}))));

console.log(`env: node ${process.version}, ${os.cpus()[0]?.model ?? "cpu"}, ${os.cpus().length} cores (benchmark is single-threaded)`);
console.log(`training set: ${TRAIN_MAPS.length} maps x ${TRAIN_NPCS.length} NPCs x ${SEEDS.length} seeds = ${configs.length} battles`);

let same = 0;
for (const c of configs) if (hash(runBattle(c)) === hash(runBattle(c))) same++;
console.log(`determinism: ${same}/${configs.length} battles identical across two runs (full event log hashed)`);

for (let i = 0; i < 3; i++) for (const c of configs) runBattle(c); // warmup

const times: number[] = [];
const t0 = performance.now();
for (let p = 0; p < PASSES; p++) for (const c of configs) {
  const s = performance.now();
  runBattle(c);
  times.push(performance.now() - s);
}
const wall = performance.now() - t0;
const b = stats(times);
console.log(`runBattle: n=${b.n} mean=${ms(b.mean)} ms median=${ms(b.median)} ms p95=${ms(b.p95)} ms p99=${ms(b.p99)} ms`);
console.log(`throughput: ${(b.n / (wall / 1000)).toFixed(0)} battles/s`);

const ev: number[] = [];
for (let i = 0; i < 30; i++) {
  const s = performance.now();
  evaluatePlaybook({ playbook: DEFAULT_PLAYBOOK });
  ev.push(performance.now() - s);
}
const e = stats(ev);
console.log(`evaluatePlaybook (one candidate, ${configs.length} battles): n=${e.n} mean=${ms(e.mean)} ms p95=${ms(e.p95)} ms`);
