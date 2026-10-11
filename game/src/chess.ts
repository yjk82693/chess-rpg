export type Side = "P" | "E";
export type Kind = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
export type Weapon = "sword" | "axe" | "lance" | "tome" | "staff";
export type Body = "infantry" | "armored" | "flier";

export interface CardDef {
  id: string; name: string; kind: Kind; weapon: Weapon; body: Body;
  hp: number; atk: number; mag: number; def: number; res: number; spd: number;
  heal?: number; blurb: string;
}

export const CARDS: Record<string, CardDef> = {
  inf_sword: { id: "inf_sword", name: "Swordsman", kind: "pawn", weapon: "sword", body: "infantry", hp: 12, atk: 5, mag: 0, def: 2, res: 1, spd: 6, blurb: "Quick blades. Beats axes." },
  inf_axe: { id: "inf_axe", name: "Axeman", kind: "pawn", weapon: "axe", body: "infantry", hp: 14, atk: 7, mag: 0, def: 1, res: 0, spd: 4, blurb: "Hits hard. Beats lances." },
  inf_lance: { id: "inf_lance", name: "Spearman", kind: "pawn", weapon: "lance", body: "infantry", hp: 13, atk: 6, mag: 0, def: 3, res: 1, spd: 5, blurb: "Steady line. Beats swords." },
  armored: { id: "armored", name: "Armored Knight", kind: "knight", weapon: "lance", body: "armored", hp: 30, atk: 7, mag: 0, def: 9, res: 2, spd: 2, blurb: "A wall that jumps. Weak to magic." },
  cavalier: { id: "cavalier", name: "Cavalier", kind: "knight", weapon: "sword", body: "infantry", hp: 24, atk: 8, mag: 0, def: 5, res: 3, spd: 8, blurb: "Fast striker, often hits twice." },
  aero: { id: "aero", name: "Aero Knight", kind: "knight", weapon: "lance", body: "flier", hp: 20, atk: 7, mag: 0, def: 4, res: 5, spd: 9, blurb: "Flies. Lands anywhere, even the river." },
  mage: { id: "mage", name: "Mage", kind: "bishop", weapon: "tome", body: "infantry", hp: 18, atk: 1, mag: 9, def: 2, res: 7, spd: 6, blurb: "Magic down the diagonals. Melts armor." },
  cleric: { id: "cleric", name: "Cleric", kind: "bishop", weapon: "staff", body: "infantry", hp: 18, atk: 0, mag: 6, def: 2, res: 8, spd: 6, heal: 10, blurb: "Heals allies along the diagonals." },
  dragon: { id: "dragon", name: "Dragon", kind: "rook", weapon: "axe", body: "flier", hp: 30, atk: 10, mag: 0, def: 7, res: 2, spd: 4, blurb: "Flying fortress. Huge axe hits." },
  griffon: { id: "griffon", name: "Griffon", kind: "rook", weapon: "sword", body: "flier", hp: 24, atk: 8, mag: 0, def: 5, res: 4, spd: 8, blurb: "Swift flier. Crosses the river at will." },
  queen: { id: "queen", name: "Queen of Storms", kind: "queen", weapon: "tome", body: "infantry", hp: 1, atk: 0, mag: 0, def: 0, res: 0, spd: 0, blurb: "Natural disaster. 3 instant kills, then gone." },
  king: { id: "king", name: "King", kind: "king", weapon: "sword", body: "armored", hp: 28, atk: 6, mag: 0, def: 6, res: 4, spd: 5, blurb: "Rally allies or curse foes. Lose him, lose all." },
};

export const ROLE_CARDS: Record<"pawn" | "knight" | "bishop" | "rook", string[]> = {
  pawn: ["inf_sword", "inf_axe", "inf_lance"],
  knight: ["armored", "cavalier", "aero"],
  bishop: ["mage", "cleric"],
  rook: ["dragon", "griffon"],
};

export interface Deck { pawn: string; knight: string; bishop: string; rook: string; levels?: Record<string, number>; }
export const DEFAULT_DECK: Deck = { pawn: "inf_lance", knight: "cavalier", bishop: "mage", rook: "griffon" };

export const W = 8, H = 8;
export const WATER_ROWS = [3, 4];
export const BRIDGE_COLS = [1, 6];
export const QUEEN_CASTS = 3;
export const AURA_COOLDOWN = 3;
export const AURA_AMOUNT = 3;
export const TURN_LIMIT = 60;
const WEAPON_POWER: Record<Weapon, number> = { sword: 5, axe: 7, lance: 6, tome: 5, staff: 0 };
export const VALUE: Record<Kind, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };

export function isWater(x: number, y: number): boolean {
  return WATER_ROWS.includes(y) && !BRIDGE_COLS.includes(x);
}
export function inBounds(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < W && y < H; }

export interface Piece {
  id: string; side: Side; kind: Kind; card: string; level: number;
  x: number; y: number; hp: number; maxHp: number;
  atk: number; mag: number; def: number; res: number; spd: number;
  weapon: Weapon; body: Body; alive: boolean; startY: number;
}

export interface Aura { kind: "rally" | "curse"; by: Side; until: number; }
export interface ChessState {
  pieces: Piece[]; turn: Side; ply: number;
  casts: Record<Side, number>; kingCd: Record<Side, number>; auras: Aura[];
  winner: Side | "draw" | null; log: string[];
}

export type ActionType = "move" | "attack" | "cast" | "heal" | "rally" | "curse";
export interface ChessAction { type: ActionType; pieceId: string; x: number; y: number; targetId?: string; }

export interface ChessEvent {
  type: ActionType | "capture" | "kill" | "counter" | "vanish" | "win";
  pieceId: string; targetId?: string; x?: number; y?: number; amount?: number; text: string;
}

function mkPiece(side: Side, kind: Kind, cardId: string, x: number, y: number, level: number, n: number): Piece {
  const c = CARDS[cardId]!;
  const lv = Math.max(1, Math.min(5, level)) - 1;
  const maxHp = c.hp + lv * 2;
  return {
    id: `${side}_${kind}_${n}`, side, kind, card: cardId, level: lv + 1, x, y, hp: maxHp, maxHp,
    atk: c.atk + (c.atk > 0 ? lv : 0), mag: c.mag + (c.mag > 0 ? lv : 0), def: c.def + lv, res: c.res + lv, spd: c.spd,
    weapon: c.weapon, body: c.body, alive: true, startY: y,
  };
}

export function createChess(player: Deck, enemy: Deck): ChessState {
  const pieces: Piece[] = [];
  const back: Kind[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  const place = (side: Side, deck: Deck, backY: number, pawnY: number) => {
    const lvl = (id: string) => deck.levels?.[id] ?? 1;
    back.forEach((k, x) => {
      const card = k === "queen" ? "queen" : k === "king" ? "king" : deck[k as "knight" | "bishop" | "rook"];
      pieces.push(mkPiece(side, k, card, x, backY, lvl(card), x));
    });
    for (let x = 0; x < W; x++) pieces.push(mkPiece(side, "pawn", deck.pawn, x, pawnY, lvl(deck.pawn), x));
  };
  place("E", enemy, 0, 1);
  place("P", player, 7, 6);
  return { pieces, turn: "P", ply: 0, casts: { P: 0, E: 0 }, kingCd: { P: 0, E: 0 }, auras: [], winner: null, log: [] };
}

export function cloneChess(s: ChessState): ChessState {
  return { ...s, pieces: s.pieces.map(p => ({ ...p })), casts: { ...s.casts }, kingCd: { ...s.kingCd }, auras: s.auras.map(a => ({ ...a })), log: [] };
}

export function pieceAt(s: ChessState, x: number, y: number): Piece | undefined {
  return s.pieces.find(p => p.alive && p.x === x && p.y === y);
}
export const byIdC = (s: ChessState, id: string) => s.pieces.find(p => p.id === id);
const other = (side: Side): Side => (side === "P" ? "E" : "P");
const canStand = (p: Piece, x: number, y: number) => inBounds(x, y) && (p.body === "flier" || !isWater(x, y));
const canPass = (p: Piece, x: number, y: number) => inBounds(x, y) && (p.body === "flier" || !isWater(x, y));

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const ALL8 = [...ORTHO, ...DIAG];

function slide(s: ChessState, p: Piece, dirs: number[][], ignoreWater: boolean, out: ChessAction[], mode: "attack" | "heal" | "cast") {
  for (const [dx, dy] of dirs) {
    let x = p.x + dx!, y = p.y + dy!;
    while (inBounds(x, y)) {
      const q = pieceAt(s, x, y);
      if (q) {
        if (mode === "attack" && q.side !== p.side) out.push({ type: "attack", pieceId: p.id, x, y, targetId: q.id });
        if (mode === "heal" && q.side === p.side && q.hp < q.maxHp && q.kind !== "queen") out.push({ type: "heal", pieceId: p.id, x, y, targetId: q.id });
        if (mode === "cast" && q.kind !== "king") out.push({ type: "cast", pieceId: p.id, x, y, targetId: q.id });
        break;
      }
      if (!ignoreWater && !canPass(p, x, y)) break;
      if (mode === "attack" || mode === "heal") out.push({ type: "move", pieceId: p.id, x, y });
      x += dx!; y += dy!;
    }
  }
}

export function pieceActions(s: ChessState, p: Piece): ChessAction[] {
  const out: ChessAction[] = [];
  if (!p.alive || s.winner) return out;
  const fwd = p.side === "P" ? -1 : 1;
  switch (p.kind) {
    case "pawn": {
      const y1 = p.y + fwd;
      if (canStand(p, p.x, y1) && !pieceAt(s, p.x, y1)) {
        out.push({ type: "move", pieceId: p.id, x: p.x, y: y1 });
        const y2 = p.y + 2 * fwd;
        if (p.y === p.startY && canStand(p, p.x, y2) && !pieceAt(s, p.x, y2)) out.push({ type: "move", pieceId: p.id, x: p.x, y: y2 });
      }
      for (const dx of [-1, 1]) {
        const x = p.x + dx;
        if (canStand(p, x, p.y) && !pieceAt(s, x, p.y)) out.push({ type: "move", pieceId: p.id, x, y: p.y });
        const q = inBounds(x, y1) ? pieceAt(s, x, y1) : undefined;
        if (q && q.side !== p.side) out.push({ type: "attack", pieceId: p.id, x, y: y1, targetId: q.id });
      }
      break;
    }
    case "knight":
      for (const [dx, dy] of KNIGHT) {
        const x = p.x + dx!, y = p.y + dy!;
        if (!inBounds(x, y)) continue;
        const q = pieceAt(s, x, y);
        if (q) { if (q.side !== p.side) out.push({ type: "attack", pieceId: p.id, x, y, targetId: q.id }); }
        else if (canStand(p, x, y)) out.push({ type: "move", pieceId: p.id, x, y });
      }
      break;
    case "bishop":
      slide(s, p, DIAG, false, out, p.weapon === "staff" ? "heal" : "attack");
      if (p.weapon === "staff") {
        const moves = out.filter(a => a.type === "move");
        const heals = out.filter(a => a.type === "heal");
        out.length = 0; out.push(...moves, ...heals);
      }
      break;
    case "rook":
      slide(s, p, ORTHO, false, out, "attack");
      break;
    case "queen":
      if (s.casts[p.side] < QUEEN_CASTS) slide(s, p, ALL8, true, out, "cast");
      break;
    case "king":
      for (const [dx, dy] of ALL8) {
        const x = p.x + dx!, y = p.y + dy!;
        if (!inBounds(x, y)) continue;
        const q = pieceAt(s, x, y);
        if (q) { if (q.side !== p.side) out.push({ type: "attack", pieceId: p.id, x, y, targetId: q.id }); }
        else if (canStand(p, x, y)) out.push({ type: "move", pieceId: p.id, x, y });
      }
      if (s.kingCd[p.side] === 0) {
        out.push({ type: "rally", pieceId: p.id, x: p.x, y: p.y });
        out.push({ type: "curse", pieceId: p.id, x: p.x, y: p.y });
      }
      break;
  }
  return out;
}

export function legalChessActions(s: ChessState, side: Side = s.turn): ChessAction[] {
  if (s.winner) return [];
  return s.pieces.filter(p => p.alive && p.side === side).flatMap(p => pieceActions(s, p));
}

function auraMod(s: ChessState, p: Piece) {
  let atk = 0, def = 0;
  for (const a of s.auras) {
    if (a.kind === "rally" && a.by === p.side) atk += AURA_AMOUNT;
    if (a.kind === "curse" && a.by !== p.side) def -= AURA_AMOUNT;
  }
  return { atk, def };
}

function triangle(a: Weapon, d: Weapon): number {
  const beats: Partial<Record<Weapon, Weapon>> = { sword: "axe", axe: "lance", lance: "sword" };
  if (beats[a] === d) return 1.2;
  if (beats[d] === a) return 0.8;
  return 1;
}

export function strikeDamage(s: ChessState, a: Piece, d: Piece): number {
  const am = auraMod(s, a), dm = auraMod(s, d);
  if (a.weapon === "staff") return 0;
  if (a.weapon === "tome") {
    const eff = d.body === "armored" ? 2 : d.body === "flier" ? 0.5 : 1;
    return Math.max(1, Math.round((a.mag + am.atk + WEAPON_POWER.tome) * eff) - Math.max(0, d.res + dm.def));
  }
  const raw = (a.atk + am.atk + WEAPON_POWER[a.weapon]) * triangle(a.weapon, d.weapon);
  return Math.max(1, Math.round(raw) - Math.max(0, d.def + dm.def));
}

const isHero = (p: Piece) => p.kind !== "pawn" && p.kind !== "queen";
const chebyshev = (a: Piece, b: Piece) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function canCounter(att: Piece, def: Piece): boolean {
  if (!def.alive || def.kind === "queen" || def.weapon === "staff") return false;
  if (def.weapon === "tome") return chebyshev(att, def) <= 2;
  return chebyshev(att, def) <= 1;
}

export interface Preview { dealt: number; taken: number; kills: boolean; dies: boolean; capture: boolean; }

export function previewAction(s: ChessState, act: ChessAction): Preview {
  const sim = cloneChess(s);
  const a = byIdC(sim, act.pieceId)!;
  const t = act.targetId ? byIdC(sim, act.targetId) : undefined;
  const aHp = a.hp, tHp = t?.hp ?? 0;
  applyChess(sim, act);
  const a2 = byIdC(sim, act.pieceId)!, t2 = t ? byIdC(sim, t.id)! : undefined;
  return {
    dealt: t2 ? tHp - Math.max(0, t2.hp) : 0, taken: aHp - Math.max(0, a2.hp),
    kills: !!t2 && !t2.alive, dies: !a2.alive, capture: !!t && (t.kind === "pawn" || t.kind === "queen") && act.type === "attack",
  };
}

function kill(s: ChessState, p: Piece, ev: ChessEvent[], by: Piece) {
  p.alive = false; p.hp = 0;
  ev.push({ type: "kill", pieceId: by.id, targetId: p.id, x: p.x, y: p.y, text: `${label(by)} defeats ${label(p)}` });
  if (p.kind === "king") { s.winner = by.side === p.side ? other(p.side) : by.side; ev.push({ type: "win", pieceId: by.id, text: `${s.winner === "P" ? "Player" : "Enemy"} wins` }); }
}

export function label(p: Piece): string { return `${p.side === "P" ? "Your" : "Enemy"} ${CARDS[p.card]!.name}`; }

export function applyChess(s: ChessState, act: ChessAction): ChessEvent[] {
  const ev: ChessEvent[] = [];
  const p = byIdC(s, act.pieceId);
  if (!p || !p.alive || p.side !== s.turn || s.winner) return ev;
  const t = act.targetId ? byIdC(s, act.targetId) : undefined;
  switch (act.type) {
    case "move":
      p.x = act.x; p.y = act.y;
      ev.push({ type: "move", pieceId: p.id, x: act.x, y: act.y, text: `${label(p)} moves` });
      break;
    case "rally":
    case "curse":
      s.auras.push({ kind: act.type, by: p.side, until: s.ply + 2 });
      s.kingCd[p.side] = AURA_COOLDOWN + 1;
      ev.push({ type: act.type, pieceId: p.id, text: act.type === "rally" ? `${label(p)} rallies: allies +${AURA_AMOUNT} ATK` : `${label(p)} curses: foes -${AURA_AMOUNT} DEF` });
      break;
    case "heal":
      if (t && t.alive) {
        const amt = Math.min(t.maxHp - t.hp, (CARDS[p.card]!.heal ?? 10) + (p.level - 1) * 2);
        t.hp += amt;
        ev.push({ type: "heal", pieceId: p.id, targetId: t.id, amount: amt, text: `${label(p)} heals ${label(t)} +${amt}` });
      }
      break;
    case "cast":
      if (t && t.alive) {
        s.casts[p.side]++;
        ev.push({ type: "cast", pieceId: p.id, targetId: t.id, x: t.x, y: t.y, text: `${label(p)} strikes ${label(t)} (${s.casts[p.side]}/${QUEEN_CASTS})` });
        kill(s, t, ev, p);
        if (s.casts[p.side] >= QUEEN_CASTS) {
          p.alive = false;
          ev.push({ type: "vanish", pieceId: p.id, x: p.x, y: p.y, text: `${label(p)} fades away` });
        }
      }
      break;
    case "attack": {
      if (!t || !t.alive) break;
      if (t.kind === "pawn" || t.kind === "queen") {
        kill(s, t, ev, p);
        ev[0]!.type = "capture";
        if (canStand(p, t.x, t.y)) { p.x = t.x; p.y = t.y; }
        break;
      }
      const hit = (a: Piece, d: Piece, kind: "attack" | "counter") => {
        const dmg = strikeDamage(s, a, d);
        d.hp -= dmg;
        ev.push({ type: kind, pieceId: a.id, targetId: d.id, amount: dmg, x: d.x, y: d.y, text: `${label(a)} hits ${label(d)} for ${dmg}` });
        if (d.hp <= 0) kill(s, d, ev, a);
      };
      hit(p, t, "attack");
      if (t.alive && isHero(t) && canCounter(p, t)) hit(t, p, "counter");
      if (p.alive && t.alive && p.spd - t.spd >= 4 && p.kind !== "pawn") hit(p, t, "attack");
      else if (p.alive && t.alive && t.spd - p.spd >= 4 && canCounter(p, t)) hit(t, p, "counter");
      if (!t.alive && p.alive && canStand(p, t.x, t.y)) { p.x = t.x; p.y = t.y; }
      break;
    }
  }
  endTurn(s);
  s.log.push(...ev.map(e => e.text));
  return ev;
}

function endTurn(s: ChessState) {
  if (s.winner) return;
  s.ply++;
  s.turn = other(s.turn);
  s.auras = s.auras.filter(a => a.until > s.ply);
  if (s.kingCd[s.turn] > 0) s.kingCd[s.turn]--;
  if (s.ply >= TURN_LIMIT * 2) s.winner = materialWinner(s);
  else if (legalChessActions(s).length === 0) s.winner = other(s.turn);
}

export function material(s: ChessState, side: Side): number {
  return s.pieces.filter(p => p.alive && p.side === side && p.kind !== "king")
    .reduce((t, p) => t + VALUE[p.kind] * (p.hp / p.maxHp), 0);
}
function materialWinner(s: ChessState): Side | "draw" {
  const d = material(s, "P") - material(s, "E");
  return Math.abs(d) < 0.5 ? "draw" : d > 0 ? "P" : "E";
}

export type ChessPersonality = "rusher" | "turtle" | "tactician";
export const CHESS_AI: Record<ChessPersonality, { advance: number; guard: number; risk: number; castMin: number }> = {
  rusher: { advance: 0.6, guard: 0, risk: 0.3, castMin: 3 },
  turtle: { advance: 0.05, guard: 0.5, risk: 1.0, castMin: 5 },
  tactician: { advance: 0.25, guard: 0.2, risk: 0.7, castMin: 3 },
};

function threatened(s: ChessState, side: Side): Set<string> {
  const set = new Set<string>();
  for (const a of legalChessActions(s, other(side))) if (a.type === "attack" || a.type === "cast" || a.type === "move") set.add(`${a.x},${a.y}`);
  return set;
}

export function scoreChessAction(s: ChessState, act: ChessAction, pers: ChessPersonality = "tactician", threats?: Set<string>): number {
  const w = CHESS_AI[pers];
  const p = byIdC(s, act.pieceId)!;
  const t = act.targetId ? byIdC(s, act.targetId) : undefined;
  const fwd = p.side === "P" ? -1 : 1;
  let sc = 0;
  if (act.type === "rally" || act.type === "curse") {
    const enemiesNear = s.pieces.filter(q => q.alive && q.side !== p.side && Math.abs(q.y - p.y) <= 4).length;
    return enemiesNear >= 3 ? 6 + (act.type === "curse" ? 0.5 : 0) : 0.5;
  }
  if (act.type === "cast") {
    if (!t || t.side === p.side) return -100;
    const v = VALUE[t.kind] * (t.hp / t.maxHp) * 10;
    return VALUE[t.kind] >= w.castMin ? v + 5 : v - 20;
  }
  if (act.type === "heal") return t ? ((t.maxHp - t.hp) / t.maxHp) * VALUE[t.kind] * 8 : 0;
  if (act.type === "attack" && t) {
    const pv = previewAction(s, act);
    if (pv.kills && t.kind === "king") return 10000;
    sc += pv.kills ? VALUE[t.kind] * 10 : (pv.dealt / t.maxHp) * VALUE[t.kind] * 10;
    sc -= pv.dies ? VALUE[p.kind] * 10 : (pv.taken / p.maxHp) * VALUE[p.kind] * 6;
  }
  const nx = act.type === "move" ? act.x : p.x, ny = act.type === "move" ? act.y : p.y;
  if (act.type === "move") {
    sc += (ny - p.y) * fwd * w.advance * (p.kind === "pawn" ? 1.5 : 1);
    const king = s.pieces.find(q => q.alive && q.side === p.side && q.kind === "king");
    if (king) sc -= w.guard * Math.max(0, Math.max(Math.abs(nx - king.x), Math.abs(ny - king.y)) - 2) * 0.3;
    if (p.kind === "king") sc -= 1;
  }
  if (threats && threats.has(`${nx},${ny}`) && act.type === "move") sc -= Math.min(VALUE[p.kind], 20) * w.risk * 3;
  return sc;
}

export function chooseChessAction(s: ChessState, pers: ChessPersonality = "tactician", rng: () => number = Math.random): ChessAction | null {
  const acts = legalChessActions(s);
  if (!acts.length) return null;
  const threats = threatened(s, s.turn);
  let best = acts[0]!, bestS = -Infinity;
  for (const a of acts) {
    const sc = scoreChessAction(s, a, pers, threats) + rng() * 0.3;
    if (sc > bestS) { bestS = sc; best = a; }
  }
  return best;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function simulateChess(pd: Deck, ed: Deck, pp: ChessPersonality, ep: ChessPersonality, seed: number) {
  const s = createChess(pd, ed);
  const rng = mulberry(seed);
  while (!s.winner) {
    const a = chooseChessAction(s, s.turn === "P" ? pp : ep, rng);
    if (!a) break;
    applyChess(s, a);
  }
  return { winner: s.winner, plies: s.ply, casts: s.casts };
}

if ((globalThis as any).process?.argv?.[1]?.endsWith("/chess.ts")) {
  const pers: ChessPersonality[] = ["rusher", "turtle", "tactician"];
  for (const pp of pers) {
    const row: string[] = [];
    for (const ep of pers) {
      let w = 0, l = 0, d = 0, plies = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const r = simulateChess(DEFAULT_DECK, { pawn: "inf_axe", knight: "armored", bishop: "mage", rook: "dragon" }, pp, ep, seed);
        if (r.winner === "P") w++; else if (r.winner === "E") l++; else d++;
        plies += r.plies;
      }
      row.push(`${ep} ${w}-${l}-${d} avg ${Math.round(plies / 20)} plies`.padEnd(32));
    }
    console.log(`${pp.padEnd(10)} vs  ${row.join("")}`);
  }
}
