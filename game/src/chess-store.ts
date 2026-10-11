import type { Db } from "mongodb";
import { newCollection, normalizeCollection, recordResult, unlockWithGems, upgrade, setDeckCard, deckWithLevels, type Collection, type ChestDraw } from "./cards.js";
import { LADDER, ladderReward, recommendDecks } from "./ladder.js";
import type { ChessPersonality, Deck } from "./chess.js";

export interface ChessProfile { player: string; collection: Collection; ladderCleared: number; trophies: number; updatedAt: Date; }

const players = (db: Db) => db.collection<ChessProfile>("chess_players");
const matches = (db: Db) => db.collection("chess_matches");

export async function getProfile(db: Db, player: string): Promise<ChessProfile> {
  const found = await players(db).findOne({ player }, { projection: { _id: 0 } });
  if (found) { const f = found as ChessProfile; normalizeCollection(f.collection); return f; }
  const p: ChessProfile = { player, collection: newCollection(), ladderCleared: 0, trophies: 0, updatedAt: new Date() };
  await players(db).insertOne({ ...p });
  return p;
}

async function saveProfile(db: Db, p: ChessProfile) {
  p.updatedAt = new Date();
  await players(db).updateOne({ player: p.player }, { $set: { collection: p.collection, ladderCleared: p.ladderCleared, trophies: p.trophies, updatedAt: p.updatedAt } }, { upsert: true });
}

export interface ResultInput { player: string; mode: "ladder" | "ghost" | "free"; level?: number; opponent?: string; won: boolean; plies: number; }
export interface ResultOutput { profile: ChessProfile; gems: number; chest: ChestDraw[]; firstClear: boolean; trophies: number; }

export async function recordChessResult(db: Db, r: ResultInput): Promise<ResultOutput> {
  const p = await getProfile(db, r.player);
  const firstClear = r.mode === "ladder" && r.won && (r.level ?? 0) > p.ladderCleared;
  const gems = r.mode === "ladder" ? ladderReward(r.level ?? 1, r.won, firstClear) : r.won ? 15 : 0;
  const chest = recordResult(p.collection, r.won);
  p.collection.gems += gems;
  if (firstClear) p.ladderCleared = r.level!;
  const trophies = r.mode === "ghost" ? (r.won ? 30 : -15) : 0;
  p.trophies = Math.max(0, p.trophies + trophies);
  await saveProfile(db, p);
  await matches(db).insertOne({ ...r, deck: p.collection.deck, gems, chest, firstClear, trophies, createdAt: new Date() });
  return { profile: p, gems, chest, firstClear, trophies };
}

export type CardOp = { op: "upgrade" | "unlock" | "equip"; card: string };
export async function cardOp(db: Db, player: string, o: CardOp): Promise<{ ok: boolean; profile: ChessProfile }> {
  const p = await getProfile(db, player);
  const ok = o.op === "upgrade" ? upgrade(p.collection, o.card) : o.op === "unlock" ? unlockWithGems(p.collection, o.card) : setDeckCard(p.collection, o.card);
  if (ok) await saveProfile(db, p);
  return { ok, profile: p };
}

export async function grantGems(db: Db, player: string, gems: number): Promise<ChessProfile> {
  const p = await getProfile(db, player);
  p.collection.gems += gems;
  await saveProfile(db, p);
  return p;
}

export async function recommendFor(db: Db, player: string, level: number) {
  const p = await getProfile(db, player);
  const l = LADDER[Math.max(0, Math.min(LADDER.length - 1, level - 1))]!;
  return { level: l.level, name: l.name, personality: l.personality, picks: recommendDecks(p.collection, l) };
}

export async function ghostOpponent(db: Db, player: string): Promise<{ opponent: string; deck: Deck; personality: ChessPersonality; trophies: number } | null> {
  const others = await players(db).aggregate([{ $match: { player: { $ne: player } } }, { $sample: { size: 1 } }]).toArray();
  const o = others[0] as unknown as ChessProfile | undefined;
  if (!o) return null;
  return { opponent: o.player, deck: deckWithLevels(o.collection), personality: "tactician", trophies: o.trophies };
}

export async function leaderboard(db: Db, limit = 10) {
  return players(db).find({}, { projection: { _id: 0, player: 1, trophies: 1, ladderCleared: 1, "collection.wins": 1 } })
    .sort({ trophies: -1, ladderCleared: -1 }).limit(limit).toArray();
}

export const ladderInfo = () => LADDER.map(l => ({ level: l.level, name: l.name, personality: l.personality, gems: l.gems, deck: l.deck }));
