// server.ts: small API for the viewer's Solo mode (PLAN section 12).
//   GET  /api/health
//   GET  /api/rival?player=<id>   newest rival playbook for that player (or null)
//   POST /api/solo                save a finished solo battle (split "human")
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { validatePlaybook } from "./executor.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true });

const PORT = Number(process.env.API_PORT ?? 8787);
const DB_NAME = process.env.MONGODB_DB ?? "training_grounds";
const PLAYER_RE = /^[\w-]{1,32}$/;
const HEX24 = /^[0-9a-f]{24}$/i;

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 2_000_000) { reject(new Error("body too large")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI is empty. Put it in training-grounds/.env"); process.exit(1); }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true });

      if (req.method === "GET" && url.pathname === "/api/rival") {
        const player = url.searchParams.get("player") ?? "";
        if (!PLAYER_RE.test(player)) return send(res, 400, { error: "bad player id" });
        const pb = await db.collection("playbooks")
          .find({ run_id: `rival-${player}`, side: "npc" })
          .sort({ generation: -1, created_at: -1 }).limit(1).next();
        if (!pb) return send(res, 200, { rival: null });
        return send(res, 200, { rival: {
          id: String(pb._id), generation: pb.generation ?? 0, persona: pb.persona ?? null,
          rationale: pb.rationale ?? "", playbook: validatePlaybook(pb.playbook).playbook,
        } });
      }

      if (req.method === "POST" && url.pathname === "/api/solo") {
        const body = await readJson(req);
        const player = String(body.player ?? "");
        if (!PLAYER_RE.test(player)) return send(res, 400, { error: "bad player id" });
        const r = body.result ?? {};
        if (r.winner !== "player" && r.winner !== "npc") return send(res, 400, { error: "bad result" });
        const runId = `rival-${player}`;
        const ins = await db.collection("battles").insertOne({
          run_id: runId,
          generation: Number.isInteger(body.rival_generation) ? body.rival_generation : 0,
          condition: "adaptive",
          split: "human",
          player,
          playbook_id: typeof body.rival_playbook_id === "string" && HEX24.test(body.rival_playbook_id)
            ? new ObjectId(body.rival_playbook_id) : null,
          party: Array.isArray(body.party) ? body.party : null,
          map_id: String(body.map_id ?? ""),
          npc_id: String(body.npc_id ?? ""),
          seed: Number(body.seed) || 0,
          winner: r.winner, reason: r.reason, turns: r.turns, score: r.score,
          summary: body.summary ?? null,
          events: Array.isArray(r.log) ? r.log : [],
          created_at: new Date(),
        });
        const n = await db.collection("battles").countDocuments({ run_id: runId, split: "human" });
        console.log(`saved solo battle for ${player}: ${r.winner === "player" ? "human won" : "rival won"} (${n} on record)`);
        return send(res, 200, { ok: true, id: String(ins.insertedId), battles: n });
      }

      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 500, { error: (e as Error).message });
    }
  });

  server.listen(PORT, () => console.log(`API on http://localhost:${PORT} (db ${DB_NAME})`));
}

main();
