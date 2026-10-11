import { CARDS, SPELLS, byIdC, legalChessActions, previewAction, scoreChessAction, type ChessAction, type ChessState } from "./chess.js";

export interface Hint { action: ChessAction | null; text: string; source: "llm" | "engine"; }

const sq = (x: number, y: number) => `${"abcdefgh"[x]}${8 - y}`;

export function describeAction(s: ChessState, a: ChessAction): string {
  const p = byIdC(s, a.pieceId)!;
  const t = a.targetId ? byIdC(s, a.targetId) : undefined;
  const me = `${CARDS[p.card]!.name} ${sq(p.x, p.y)}`;
  const them = t ? `${t.side === p.side ? "ally" : "enemy"} ${CARDS[t.card]!.name} ${sq(t.x, t.y)}` : "";
  switch (a.type) {
    case "move": return `${me} moves to ${sq(a.x, a.y)}`;
    case "spell": {
      const sp = SPELLS[a.spell ?? ""];
      return `King casts ${sp?.name ?? "a spell"}${sp?.target === "square" ? ` centered on ${sq(a.x, a.y)}` : ""} (${sp?.blurb ?? ""})`;
    }
    case "heal": return `${me} heals ${them}`;
    case "cast": return `Queen strikes ${them} (instant kill)`;
    case "attack": {
      const pv = previewAction(s, a);
      return `${me} attacks ${them}: deals ${pv.dealt}${pv.kills ? " and kills it" : ""}, takes ${pv.taken}${pv.dies ? " and dies" : ""}`;
    }
  }
}

export function candidates(s: ChessState, n = 5): ChessAction[] {
  return legalChessActions(s)
    .map(a => ({ a, sc: scoreChessAction(s, a, "tactician") }))
    .sort((x, y) => y.sc - x.sc).slice(0, n).map(x => x.a);
}

async function askLLM(prompt: string): Promise<string | null> {
  const env: Record<string, string | undefined> = (globalThis as any).process?.env ?? {};
  const base = env.LUMINAL_BASE_URL, key = env.LUMINAL_API_KEY, model = env.LUMINAL_MODEL ?? env.LUMINAL_COACH_MODEL;
  if (!base || !key || !model) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 160, messages: [
        { role: "system", content: "You are a concise chess RPG coach. Reply exactly as: <option number>|<one short sentence of advice>." },
        { role: "user", content: prompt },
      ] }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    return String(j.choices?.[0]?.message?.content ?? "").trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function hintFor(s: ChessState): Promise<Hint> {
  if (!s || !Array.isArray(s.pieces)) return { action: null, text: "No board state.", source: "engine" };
  const opts = candidates(s);
  if (!opts.length) return { action: null, text: "No legal moves.", source: "engine" };
  const lines = opts.map((a, i) => `${i + 1}. ${describeAction(s, a)}`);
  const alive = (side: string) => s.pieces.filter(p => p.alive && p.side === side).map(p => `${CARDS[p.card]!.name}@${sq(p.x, p.y)} ${p.hp}/${p.maxHp}`).join(", ");
  const prompt = `Board: river on ranks 4-5, bridges on b and g files; fliers cross anywhere. Queen strikes left: ${s.pieces.filter(p => p.alive && p.side === s.turn && p.kind === "queen").reduce((t, p) => t + p.charges, 0)}. King spells left: ${s.spells[s.turn].filter(id => !s.used[s.turn].includes(id)).join(", ") || "none"} (cooldown ${s.kingCd[s.turn]}). Pawns reaching the far rank promote to a new Queen.\nYour pieces: ${alive(s.turn)}\nEnemy pieces: ${alive(s.turn === "P" ? "E" : "P")}\nCandidate moves:\n${lines.join("\n")}\nPick the best option for the side to move and say why in one sentence.`;
  const out = await askLLM(prompt);
  const m = out?.match(/^\s*(\d)\s*\|\s*(.+)$/s);
  if (m) {
    const i = Math.min(opts.length, Math.max(1, Number(m[1]))) - 1;
    return { action: opts[i]!, text: `${describeAction(s, opts[i]!)}. ${m[2]!.trim()}`, source: "llm" };
  }
  return { action: opts[0]!, text: `${describeAction(s, opts[0]!)}.`, source: "engine" };
}
