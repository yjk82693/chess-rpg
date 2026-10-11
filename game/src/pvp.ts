// pvp.ts — authoritative Chess RPG multiplayer (Mongo chess_rooms).
import type { Db } from "mongodb";
import { randomBytes } from "node:crypto";
import {
  applyChess,
  createChess,
  legalChessActions,
  type ChessAction,
  type ChessState,
  type Side,
} from "./chess.js";
import { deckWithLevels } from "./cards.js";
import { getProfile, recordChessResult } from "./chess-store.js";

const PLAYER_RE = /^[\w-]{1,32}$/;
const WAIT_MS = 60_000;

export interface PvpRoomDoc {
  roomId: string;
  status: "waiting" | "playing" | "over";
  playerP: string | null;
  playerE: string | null;
  seq: number;
  state: ChessState | null;
  winner: Side | "draw" | null;
  createdAt: Date;
}

const rooms = (db: Db) => db.collection<PvpRoomDoc>("chess_rooms");

function newRoomId(): string {
  return randomBytes(8).toString("hex");
}

async function purgeStaleWaiting(db: Db) {
  const cutoff = new Date(Date.now() - WAIT_MS);
  await rooms(db).deleteMany({ status: "waiting", createdAt: { $lt: cutoff } });
}

function sideForPlayer(room: PvpRoomDoc, player: string): Side | null {
  if (room.playerP === player) return "P";
  if (room.playerE === player) return "E";
  return null;
}

function roomPayload(room: PvpRoomDoc, player: string) {
  const side = sideForPlayer(room, player);
  const opponent =
    side === "P" ? room.playerE : side === "E" ? room.playerP : null;
  let status: "waiting" | "playing" | "over" = room.status;
  if (room.status === "playing") status = "playing";
  return {
    status,
    side,
    opponent,
    seq: room.seq,
    state: room.state,
    winner: room.winner,
  };
}

function actionsMatch(legal: ChessAction[], act: ChessAction): boolean {
  return legal.some(
    (l) =>
      l.type === act.type &&
      l.pieceId === act.pieceId &&
      l.x === act.x &&
      l.y === act.y &&
      (l.targetId ?? "") === (act.targetId ?? ""),
  );
}

async function settleResults(db: Db, room: PvpRoomDoc) {
  const w = room.winner;
  if (!w || w === "draw") {
    if (room.playerP) {
      await recordChessResult(db, {
        player: room.playerP,
        mode: "pvp",
        won: false,
        plies: room.state?.ply ?? 0,
        opponent: room.playerE ?? undefined,
      });
    }
    if (room.playerE) {
      await recordChessResult(db, {
        player: room.playerE,
        mode: "pvp",
        won: false,
        plies: room.state?.ply ?? 0,
        opponent: room.playerP ?? undefined,
      });
    }
    return;
  }
  if (room.playerP) {
    await recordChessResult(db, {
      player: room.playerP,
      mode: "pvp",
      won: w === "P",
      plies: room.state?.ply ?? 0,
      opponent: room.playerE ?? undefined,
    });
  }
  if (room.playerE) {
    await recordChessResult(db, {
      player: room.playerE,
      mode: "pvp",
      won: w === "E",
      plies: room.state?.ply ?? 0,
      opponent: room.playerP ?? undefined,
    });
  }
}

async function queuePlayer(db: Db, player: string) {
  await purgeStaleWaiting(db);
  const active = await rooms(db).findOne({
    $or: [
      { playerP: player, status: { $in: ["waiting", "playing"] } },
      { playerE: player, status: { $in: ["playing", "over"] } },
    ],
  });
  if (active) {
    const side = sideForPlayer(active, player)!;
    const status =
      active.status === "waiting"
        ? "waiting"
        : active.status === "over"
          ? "over"
          : "matched";
    return { roomId: active.roomId, status, side };
  }

  const cutoff = new Date(Date.now() - WAIT_MS);
  const open = await rooms(db).findOne({
    status: "waiting",
    playerE: null,
    playerP: { $ne: player },
    createdAt: { $gte: cutoff },
  });
  if (open && open.playerP) {
    const pProf = await getProfile(db, open.playerP);
    const eProf = await getProfile(db, player);
    const state = createChess(
      deckWithLevels(pProf.collection),
      deckWithLevels(eProf.collection),
    );
    await rooms(db).updateOne(
      { roomId: open.roomId },
      {
        $set: {
          playerE: player,
          status: "playing",
          state,
          seq: 0,
          winner: null,
        },
      },
    );
    return { roomId: open.roomId, status: "matched" as const, side: "E" as const };
  }

  const roomId = newRoomId();
  await rooms(db).insertOne({
    roomId,
    status: "waiting",
    playerP: player,
    playerE: null,
    seq: 0,
    state: null,
    winner: null,
    createdAt: new Date(),
  });
  return { roomId, status: "waiting" as const, side: "P" as const };
}

async function forfeit(db: Db, room: PvpRoomDoc, leaver: string) {
  const side = sideForPlayer(room, leaver);
  if (!side || room.status !== "playing") return;
  const winner: Side = side === "P" ? "E" : "P";
  room.winner = winner;
  room.status = "over";
  await rooms(db).updateOne(
    { roomId: room.roomId },
    { $set: { status: "over", winner } },
  );
  await settleResults(db, room);
}

export async function pvpRoute(
  method: string,
  url: URL,
  readJson: () => Promise<unknown>,
  db: Db,
): Promise<{ code: number; body: unknown } | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/pvp/")) return null;

  if (method === "POST" && path === "/api/pvp/queue") {
    const body = (await readJson()) as { player?: string };
    const player = String(body.player ?? "");
    if (!PLAYER_RE.test(player)) return { code: 400, body: { error: "bad player" } };
    const out = await queuePlayer(db, player);
    return { code: 200, body: out };
  }

  if (method === "GET" && path === "/api/pvp/room") {
    const roomId = url.searchParams.get("id") ?? "";
    const player = url.searchParams.get("player") ?? "";
    if (!roomId || !PLAYER_RE.test(player)) return { code: 400, body: { error: "bad params" } };
    const room = await rooms(db).findOne({ roomId });
    if (!room) return { code: 404, body: { error: "room not found" } };
    if (!sideForPlayer(room, player)) return { code: 403, body: { error: "not in room" } };
    return { code: 200, body: roomPayload(room, player) };
  }

  if (method === "POST" && path === "/api/pvp/move") {
    const body = (await readJson()) as {
      roomId?: string;
      player?: string;
      seq?: number;
      action?: ChessAction;
    };
    const roomId = String(body.roomId ?? "");
    const player = String(body.player ?? "");
    const seq = Number(body.seq);
    const action = body.action;
    if (!roomId || !PLAYER_RE.test(player) || !action) {
      return { code: 400, body: { error: "bad request" } };
    }
    const room = await rooms(db).findOne({ roomId });
    if (!room || room.status !== "playing" || !room.state) {
      return { code: 400, body: { error: "not playing" } };
    }
    const side = sideForPlayer(room, player);
    if (!side) return { code: 403, body: { error: "not in room" } };
    if (seq !== room.seq) return { code: 409, body: { error: "stale seq", seq: room.seq } };
    if (room.state.turn !== side) return { code: 400, body: { error: "not your turn" } };
    const legal = legalChessActions(room.state, side);
    if (!actionsMatch(legal, action)) {
      return { code: 400, body: { error: "illegal action" } };
    }
    applyChess(room.state, action);
    room.seq += 1;
    const winner = room.state.winner;
    const update: Partial<PvpRoomDoc> = { state: room.state, seq: room.seq };
    if (winner) {
      update.status = "over";
      update.winner = winner;
      room.winner = winner;
      room.status = "over";
    }
    await rooms(db).updateOne({ roomId }, { $set: update });
    if (winner) await settleResults(db, room);
    return { code: 200, body: { ok: true, seq: room.seq, state: room.state } };
  }

  if (method === "POST" && path === "/api/pvp/leave") {
    const body = (await readJson()) as { roomId?: string; player?: string };
    const roomId = String(body.roomId ?? "");
    const player = String(body.player ?? "");
    if (!roomId || !PLAYER_RE.test(player)) return { code: 400, body: { error: "bad request" } };
    const room = await rooms(db).findOne({ roomId });
    if (!room) return { code: 404, body: { error: "room not found" } };
    if (room.status === "waiting" && room.playerP === player) {
      await rooms(db).deleteOne({ roomId });
      return { code: 200, body: { ok: true } };
    }
    if (room.status === "playing") {
      await forfeit(db, room, player);
      return { code: 200, body: { ok: true, forfeit: true } };
    }
    return { code: 200, body: { ok: true } };
  }

  return { code: 404, body: { error: "not found" } };
}
