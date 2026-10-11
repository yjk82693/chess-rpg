// api.ts: talks to game/src/server.ts through the Vite proxy. Everything degrades gracefully if it's down.
import { Playbook, validatePlaybook } from "../../game/src/executor.js";

export interface Rival {
  id: string;
  generation: number;
  persona: string | null;
  rationale: string;
  playbook: Playbook;
}

const KEY = "tg.player";

export function playerId(): string {
  try { return localStorage.getItem(KEY) || "player1"; } catch { return "player1"; }
}

export function setPlayerId(name: string): boolean {
  if (!/^[\w-]{1,32}$/.test(name)) return false;
  try { localStorage.setItem(KEY, name); } catch { /* storage blocked: keep default */ }
  return true;
}

export async function fetchRival(player: string): Promise<Rival | null> {
  try {
    const r = await fetch(`/api/rival?player=${encodeURIComponent(player)}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.rival) return null;
    return { ...j.rival, playbook: validatePlaybook(j.rival.playbook).playbook };
  } catch {
    return null;
  }
}

export async function postSolo(payload: unknown): Promise<string> {
  try {
    const r = await fetch("/api/solo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return `Not saved: ${j.error ?? r.status}`;
    const saved = `Saved · ${j.battles} battle${j.battles === 1 ? "" : "s"} on record.`;
    return j.rival ? `${saved} Rival Gen ${j.rival.generation} is ready: ${j.rival.rationale}` : `${saved} Your rival will study it.`;
  } catch {
    return "Not saved: API server isn't running (npm run server in game/).";
  }
}
