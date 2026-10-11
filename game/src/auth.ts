import type { Db } from "mongodb";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { getProfile } from "./chess-store.js";

const NAME_RE = /^[\w-]{3,32}$/;
const SESSION_DAYS = 7;
let indexed = false;

function scrypt(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) => scryptCb(pw, salt, 64, (e, k) => (e ? rej(e) : res(k as Buffer))));
}

async function ensureIndexes(db: Db) {
  if (indexed) return;
  await db.collection("auth_users").createIndex({ player: 1 }, { unique: true });
  await db.collection("auth_sessions").createIndex({ token: 1 }, { unique: true });
  await db.collection("auth_sessions").createIndex({ createdAt: 1 }, { expireAfterSeconds: SESSION_DAYS * 86400 });
  indexed = true;
}

async function newSession(db: Db, player: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await db.collection("auth_sessions").insertOne({ token, player, createdAt: new Date() });
  return token;
}

export async function playerFromAuth(db: Db, header: string | undefined): Promise<string | null> {
  const m = /^Bearer\s+([0-9a-f]{48})$/i.exec(header ?? "");
  if (!m) return null;
  const s = await db.collection("auth_sessions").findOne({ token: m[1] });
  return s ? String(s.player) : null;
}

export interface AuthOut { code: number; body: unknown; }

export async function authRoute(method: string, url: URL, body: () => Promise<any>, db: Db, authHeader: string | undefined): Promise<AuthOut | null> {
  await ensureIndexes(db);
  const p = url.pathname.replace("/api/auth/", "");
  if (method === "GET" && p === "me") {
    const player = await playerFromAuth(db, authHeader);
    return player ? { code: 200, body: { player } } : { code: 401, body: { error: "not signed in" } };
  }
  if (method !== "POST") return null;
  if (p === "logout") {
    const m = /^Bearer\s+([0-9a-f]{48})$/i.exec(authHeader ?? "");
    if (m) await db.collection("auth_sessions").deleteOne({ token: m[1] });
    return { code: 200, body: { ok: true } };
  }
  const b = await body();
  const player = String(b.player ?? "").trim();
  const password = String(b.password ?? "");
  if (!NAME_RE.test(player)) return { code: 400, body: { error: "Name must be 3-32 letters, numbers, _ or -" } };
  if (password.length < 4 || password.length > 128) return { code: 400, body: { error: "Password must be at least 4 characters" } };
  const users = db.collection("auth_users");
  if (p === "register") {
    if (await users.findOne({ player })) return { code: 409, body: { error: "That name is taken" } };
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt);
    await users.insertOne({ player, salt: salt.toString("hex"), hash: hash.toString("hex"), createdAt: new Date() });
    await getProfile(db, player);
    console.log(`auth: registered ${player}`);
    return { code: 200, body: { player, token: await newSession(db, player) } };
  }
  if (p === "login") {
    const u = await users.findOne({ player });
    if (!u) return { code: 401, body: { error: "Wrong name or password" } };
    const hash = await scrypt(password, Buffer.from(String(u.salt), "hex"));
    const ok = timingSafeEqual(hash, Buffer.from(String(u.hash), "hex"));
    if (!ok) return { code: 401, body: { error: "Wrong name or password" } };
    return { code: 200, body: { player, token: await newSession(db, player) } };
  }
  return null;
}
