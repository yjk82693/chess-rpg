import type { Db } from "mongodb";
import { getProfile, recordChessResult, cardOp, grantGems, recommendFor, ghostOpponent, leaderboard, ladderInfo, type CardOp } from "./chess-store.js";
import { GEM_PACKS } from "./cards.js";
import { hintFor } from "./chess-hint.js";
import type { ChessState } from "./chess.js";

const PLAYER_RE = /^[\w-]{1,32}$/;
export interface RouteOut { code: number; body: unknown; }

export async function chessRoute(method: string, url: URL, body: () => Promise<any>, db: Db): Promise<RouteOut | null> {
  const p = url.pathname.replace("/api/chess/", "");
  const q = (k: string) => url.searchParams.get(k) ?? "";
  const bad = (msg: string): RouteOut => ({ code: 400, body: { error: msg } });

  if (method === "GET" && p === "ladder") return { code: 200, body: { ladder: ladderInfo(), packs: GEM_PACKS } };
  if (method === "GET" && p === "leaderboard") return { code: 200, body: { top: await leaderboard(db) } };

  if (method === "GET" && (p === "profile" || p === "recommend" || p === "ghost")) {
    const player = q("player");
    if (!PLAYER_RE.test(player)) return bad("bad player id");
    if (p === "profile") return { code: 200, body: { profile: await getProfile(db, player) } };
    if (p === "recommend") return { code: 200, body: await recommendFor(db, player, Number(q("level")) || 1) };
    return { code: 200, body: { ghost: await ghostOpponent(db, player) } };
  }

  if (method === "POST") {
    const b = await body();
    if (p === "hint") return { code: 200, body: await hintFor(b.state as ChessState) };
    const player = String(b.player ?? "");
    if (!PLAYER_RE.test(player)) return bad("bad player id");
    if (p === "result") {
      const mode = b.mode === "ladder" || b.mode === "ghost" ? b.mode : "free";
      const out = await recordChessResult(db, { player, mode, level: Number(b.level) || undefined, opponent: typeof b.opponent === "string" ? b.opponent : undefined, won: !!b.won, plies: Number(b.plies) || 0 });
      console.log(`chess ${mode} ${player}: ${b.won ? "win" : "loss"} +${out.gems} gems${out.firstClear ? " (first clear)" : ""}`);
      return { code: 200, body: out };
    }
    if (p === "card") {
      const op = b.op as CardOp["op"];
      if (!["upgrade", "unlock", "equip"].includes(op)) return bad("bad op");
      return { code: 200, body: await cardOp(db, player, { op, card: String(b.card ?? "") }) };
    }
    if (p === "gems") {
      const pack = GEM_PACKS.find(k => k.id === b.pack);
      if (!pack) return bad("bad pack");
      await db.collection("chess_purchases").insertOne({ player, pack: pack.id, gems: pack.gems, price: pack.price, demo: true, createdAt: new Date() });
      return { code: 200, body: { profile: await grantGems(db, player, pack.gems), pack } };
    }
  }
  return null;
}
