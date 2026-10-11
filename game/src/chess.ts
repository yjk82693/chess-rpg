export type Side = "P" | "E";
export type Kind = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
export type Weapon = "sword" | "axe" | "lance" | "tome" | "staff";
export type Body = "infantry" | "armored" | "flier";
export type Rarity = "common" | "rare" | "super_rare" | "epic" | "legend";

export const RARITY_OF: Record<number, Rarity> = { 1: "common", 2: "rare", 3: "super_rare", 4: "epic", 5: "legend" };
export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", rare: "Rare", super_rare: "Super Rare", epic: "Epic", legend: "Legend" };
export const RARITY_COLOR: Record<Rarity, string> = { common: "#b8c0cc", rare: "#4fa3ff", super_rare: "#3ddc97", epic: "#b46cff", legend: "#ffb020" };

export interface CardDef {
  id: string; name: string; kind: Kind; weapon: Weapon; body: Body; cost: number;
  hp: number; atk: number; mag: number; def: number; res: number; spd: number;
  heal?: number; blurb: string;
}

export const CARDS: Record<string, CardDef> = {
  inf_sword: { id: "inf_sword", name: "Swordsman", kind: "pawn", weapon: "sword", body: "infantry", cost: 1, hp: 12, atk: 5, mag: 0, def: 2, res: 1, spd: 6, blurb: "Quick blades. Beats axes." },
  inf_axe: { id: "inf_axe", name: "Axeman", kind: "pawn", weapon: "axe", body: "infantry", cost: 2, hp: 14, atk: 7, mag: 0, def: 1, res: 0, spd: 4, blurb: "Hits hard. Beats lances." },
  inf_lance: { id: "inf_lance", name: "Spearman", kind: "pawn", weapon: "lance", body: "infantry", cost: 1, hp: 13, atk: 6, mag: 0, def: 3, res: 1, spd: 5, blurb: "Steady line. Beats swords." },
  armored: { id: "armored", name: "Armored Knight", kind: "knight", weapon: "lance", body: "armored", cost: 3, hp: 30, atk: 7, mag: 0, def: 9, res: 2, spd: 2, blurb: "A wall that jumps. Weak to magic." },
  cavalier: { id: "cavalier", name: "Cavalier", kind: "knight", weapon: "sword", body: "infantry", cost: 2, hp: 24, atk: 8, mag: 0, def: 5, res: 3, spd: 8, blurb: "Fast striker, often hits twice." },
  aero: { id: "aero", name: "Aero Knight", kind: "knight", weapon: "lance", body: "flier", cost: 4, hp: 20, atk: 7, mag: 0, def: 4, res: 5, spd: 9, blurb: "Flies. Lands anywhere, even the river." },
  mage: { id: "mage", name: "Mage", kind: "bishop", weapon: "tome", body: "infantry", cost: 2, hp: 18, atk: 1, mag: 9, def: 2, res: 7, spd: 6, blurb: "Magic down the diagonals. Melts armor." },
  cleric: { id: "cleric", name: "Cleric", kind: "bishop", weapon: "staff", body: "infantry", cost: 3, hp: 18, atk: 0, mag: 6, def: 2, res: 8, spd: 6, heal: 10, blurb: "Heals allies along the diagonals." },
  dragon: { id: "dragon", name: "Dragon", kind: "rook", weapon: "axe", body: "flier", cost: 4, hp: 30, atk: 10, mag: 0, def: 7, res: 2, spd: 4, blurb: "Flying fortress. Huge axe hits." },
  griffon: { id: "griffon", name: "Griffon", kind: "rook", weapon: "sword", body: "flier", cost: 3, hp: 24, atk: 8, mag: 0, def: 5, res: 4, spd: 8, blurb: "Swift flier. Crosses the river at will." },
  queen: { id: "queen", name: "Queen of Storms", kind: "queen", weapon: "tome", body: "infantry", cost: 0, hp: 1, atk: 0, mag: 0, def: 0, res: 0, spd: 0, blurb: "Natural disaster. 3 instant kills, then gone. Pawns that reach the far rank become a new Queen." },
  king: { id: "king", name: "King", kind: "king", weapon: "sword", body: "armored", cost: 0, hp: 28, atk: 6, mag: 0, def: 6, res: 4, spd: 5, blurb: "Casts your spell cards. Lose him, lose all." },
};

export type SpellTarget = "none" | "square";
export interface SpellDef { id: string; name: string; cost: number; target: SpellTarget; power: number; blurb: string; }

export const SPELLS: Record<string, SpellDef> = {
  rally: { id: "rally", name: "Rally", cost: 1, target: "none", power: 3, blurb: "All allies +3 ATK/MAG for a round." },
  curse: { id: "curse", name: "Curse", cost: 1, target: "none", power: 3, blurb: "All enemies -3 DEF/RES for a round." },
  mend: { id: "mend", name: "Mend", cost: 2, target: "none", power: 8, blurb: "Heal every ally 8 HP." },
  lightning: { id: "lightning", name: "Lightning", cost: 2, target: "none", power: 9, blurb: "Strikes the 2 strongest enemy heroes for 9." },
  fireball: { id: "fireball", name: "Fireball", cost: 3, target: "square", power: 12, blurb: "12 damage to enemies in a 3x3 area." },
  bulwark: { id: "bulwark", name: "Bulwark", cost: 3, target: "none", power: 4, blurb: "All allies +4 DEF/RES for 2 rounds." },
  earthquake: { id: "earthquake", name: "Earthquake", cost: 4, target: "none", power: 7, blurb: "7 damage to every enemy piece." },
  meteor: { id: "meteor", name: "Meteor", cost: 5, target: "square", power: 22, blurb: "22 damage to enemies in a 3x3 area." },
  resurrect: { id: "resurrect", name: "Resurrect", cost: 5, target: "none", power: 60, blurb: "Revive your strongest fallen hero at 60% HP beside the King." },
};

export const ROLE_CARDS: Record<"pawn" | "knight" | "bishop" | "rook", string[]> = {
  pawn: ["inf_sword", "inf_axe", "inf_lance"],
  knight: ["armored", "cavalier", "aero"],
  bishop: ["mage", "cleric"],
  rook: ["dragon", "griffon"],
};
export const SPELL_IDS = Object.keys(SPELLS);
export const SPELL_LIMIT = 3;
export const DECK_BUDGET = 16;

export const costOf = (id: string): number => CARDS[id]?.cost ?? SPELLS[id]?.cost ?? 0;
export const rarityOf = (id: string): Rarity => RARITY_OF[Math.max(1, Math.min(5, costOf(id)))]!;

export interface Deck { pawn: string; knight: string; bishop: string; rook: string; spells?: string[]; levels?: Record<string, number>; }
export const DEFAULT_DECK: Deck = { pawn: "inf_lance", knight: "cavalier", bishop: "mage", rook: "griffon", spells: ["rally", "curse"] };

export function deckCost(d: Deck): number {
  return costOf(d.pawn) + costOf(d.knight) + costOf(d.bishop) + costOf(d.rook) + (d.spells ?? []).reduce((t, s) => t + costOf(s), 0);
}
export function validSpells(d: Deck): string[] {
  const out: string[] = [];
  for (const id of d.spells ?? []) if (SPELLS[id] && !out.includes(id) && out.length < SPELL_LIMIT) out.push(id);
  return out;
}

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
  weapon: Weapon; body: Body; alive: boolean; startY: number; charges: number;
}

export interface Aura { kind: "rally" | "curse" | "ward"; by: Side; until: number; amt: number; }
export interface ChessState {
  pieces: Piece[]; turn: Side; ply: number;
  casts: Record<Side, number>; kingCd: Record<Side, number>; auras: Aura[];
  spells: Record<Side, string[]>; used: Record<Side, string[]>; spellLv: Record<Side, Record<string, number>>;
  winner: Side | "draw" | null; log: string[];
}

export type ActionType = "move" | "attack" | "cast" | "heal" | "spell";
export interface ChessAction { type: ActionType; pieceId: string; x: number; y: number; targetId?: string; spell?: string; }

export interface ChessEvent {
  type: ActionType | "capture" | "kill" | "counter" | "vanish" | "win" | "promote" | "revive";
  pieceId: string; targetId?: string; x?: number; y?: number; amount?: number; text: string;
}

function mkPiece(side: Side, kind: Kind, cardId: string, x: number, y: number, level: number, n: number | string): Piece {
  const c = CARDS[cardId]!;
  const lv = Math.max(1, Math.min(5, level)) - 1;
  const maxHp = c.hp + lv * 2;
  return {
    id: `${side}_${kind}_${n}`, side, kind, card: cardId, level: lv + 1, x, y, hp: maxHp, maxHp,
    atk: c.atk + (c.atk > 0 ? lv : 0), mag: c.mag + (c.mag > 0 ? lv : 0), def: c.def + lv, res: c.res + lv, spd: c.spd,
    weapon: c.weapon, body: c.body, alive: true, startY: y, charges: kind === "queen" ? QUEEN_CASTS : 0,
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
  const lvls = (d: Deck) => Object.fromEntries(validSpells(d).map(id => [id, d.levels?.[id] ?? 1]));
  return {
    pieces, turn: "P", ply: 0, casts: { P: 0, E: 0 }, kingCd: { P: 0, E: 0 }, auras: [],
    spells: { P: validSpells(player), E: validSpells(enemy) }, used: { P: [], E: [] }, spellLv: { P: lvls(player), E: lvls(enemy) },
    winner: null, log: [],
  };
}

export function cloneChess(s: ChessState): ChessState {
  return {
    ...s, pieces: s.pieces.map(p => ({ ...p })), casts: { ...s.casts }, kingCd: { ...s.kingCd }, auras: s.auras.map(a => ({ ...a })),
    spells: { P: [...s.spells.P], E: [...s.spells.E] }, used: { P: [...s.used.P], E: [...s.used.E] },
    spellLv: { P: { ...s.spellLv.P }, E: { ...s.spellLv.E } }, log: [],
  };
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

const isHero = (p: Piece) => p.kind !== "pawn" && p.kind !== "queen";
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function fallenHero(s: ChessState, side: Side): Piece | undefined {
  return s.pieces.filter(q => !q.alive && q.side === side && (q.kind === "knight" || q.kind === "bishop" || q.kind === "rook"))
    .sort((a, b) => VALUE[b.kind] - VALUE[a.kind] || b.maxHp - a.maxHp)[0];
}

function spellActions(s: ChessState, k: Piece, out: ChessAction[]) {
  if (s.kingCd[k.side] !== 0) return;
  const foes = s.pieces.filter(q => q.alive && q.side !== k.side);
  for (const id of s.spells[k.side]) {
    if (s.used[k.side].includes(id)) continue;
    const sp = SPELLS[id]!;
    if (sp.target === "square") {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (foes.some(f => chebyshev(f, { x, y }) <= 1)) out.push({ type: "spell", pieceId: k.id, x, y, spell: id });
      continue;
    }
    if (id === "resurrect" && !fallenHero(s, k.side)) continue;
    if (id === "mend" && !s.pieces.some(q => q.alive && q.side === k.side && q.hp < q.maxHp && q.kind !== "queen")) continue;
    out.push({ type: "spell", pieceId: k.id, x: k.x, y: k.y, spell: id });
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
      if (p.charges > 0) slide(s, p, ALL8, true, out, "cast");
      break;
    case "king":
      for (const [dx, dy] of ALL8) {
        const x = p.x + dx!, y = p.y + dy!;
        if (!inBounds(x, y)) continue;
        const q = pieceAt(s, x, y);
        if (q) { if (q.side !== p.side) out.push({ type: "attack", pieceId: p.id, x, y, targetId: q.id }); }
        else if (canStand(p, x, y)) out.push({ type: "move", pieceId: p.id, x, y });
      }
      spellActions(s, p, out);
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
    if (a.kind === "rally" && a.by === p.side) atk += a.amt;
    if (a.kind === "ward" && a.by === p.side) def += a.amt;
    if (a.kind === "curse" && a.by !== p.side) def -= a.amt;
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

function canCounter(att: Piece, def: Piece): boolean {
  if (!def.alive || def.kind === "queen" || def.weapon === "staff") return false;
  if (def.weapon === "tome") return chebyshev(att, def) <= 2;
  return chebyshev(att, def) <= 1;
}

export function spellPower(s: ChessState, side: Side, id: string): number {
  const sp = SPELLS[id]!;
  const lv = (s.spellLv[side][id] ?? 1) - 1;
  return sp.power + lv * (sp.power >= 8 ? 2 : 1);
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

function promote(s: ChessState, p: Piece, ev: ChessEvent[]) {
  if (!p.alive || p.kind !== "pawn") return;
  const last = p.side === "P" ? 0 : H - 1;
  if (p.y !== last) return;
  const n = s.pieces.filter(q => q.side === p.side && q.kind === "queen").length;
  const q = mkPiece(p.side, "queen", "queen", p.x, p.y, 1, `promo${n}`);
  p.alive = false;
  s.pieces.push(q);
  ev.push({ type: "promote", pieceId: q.id, x: q.x, y: q.y, text: `${label(q)} rises from a promoted pawn (${QUEEN_CASTS} strikes)` });
}

function castSpell(s: ChessState, k: Piece, act: ChessAction, ev: ChessEvent[]) {
  const sp = SPELLS[act.spell ?? ""];
  if (!sp || !s.spells[k.side].includes(sp.id) || s.used[k.side].includes(sp.id) || s.kingCd[k.side] !== 0) return;
  s.used[k.side].push(sp.id);
  s.kingCd[k.side] = AURA_COOLDOWN + 1;
  const pw = spellPower(s, k.side, sp.id);
  ev.push({ type: "spell", pieceId: k.id, x: act.x, y: act.y, text: `${label(k)} casts ${sp.name}` });
  const foes = () => s.pieces.filter(q => q.alive && q.side !== k.side);
  const hurt = (q: Piece, amt: number) => {
    if (s.winner || !q.alive) return;
    const d = q.kind === "king" ? Math.ceil(amt / 2) : amt;
    q.hp -= d;
    ev.push({ type: "attack", pieceId: k.id, targetId: q.id, amount: d, x: q.x, y: q.y, text: `${sp.name} hits ${label(q)} for ${d}` });
    if (q.hp <= 0) kill(s, q, ev, k);
  };
  switch (sp.id) {
    case "rally": s.auras.push({ kind: "rally", by: k.side, until: s.ply + 2, amt: pw }); break;
    case "curse": s.auras.push({ kind: "curse", by: k.side, until: s.ply + 2, amt: pw }); break;
    case "bulwark": s.auras.push({ kind: "ward", by: k.side, until: s.ply + 4, amt: pw }); break;
    case "mend":
      for (const q of s.pieces) if (q.alive && q.side === k.side && q.kind !== "queen" && q.hp < q.maxHp) {
        const amt = Math.min(pw, q.maxHp - q.hp);
        q.hp += amt;
        ev.push({ type: "heal", pieceId: k.id, targetId: q.id, amount: amt, x: q.x, y: q.y, text: `Mend heals ${label(q)} +${amt}` });
      }
      break;
    case "lightning":
      for (const q of foes().filter(isHero).sort((a, b) => VALUE[b.kind] - VALUE[a.kind] || b.hp - a.hp).slice(0, 2)) hurt(q, pw);
      break;
    case "fireball":
    case "meteor":
      for (const q of foes().filter(q => chebyshev(q, act) <= 1)) hurt(q, pw);
      break;
    case "earthquake":
      for (const q of foes()) hurt(q, pw);
      break;
    case "resurrect": {
      const f = fallenHero(s, k.side);
      if (!f) break;
      const spots = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!pieceAt(s, x, y) && canStand(f, x, y)) spots.push({ x, y, d: chebyshev(k, { x, y }) });
      spots.sort((a, b) => a.d - b.d);
      const spot = spots[0];
      if (!spot) break;
      f.alive = true; f.x = spot.x; f.y = spot.y; f.hp = Math.max(1, Math.round(f.maxHp * pw / 100));
      ev.push({ type: "revive", pieceId: f.id, x: f.x, y: f.y, text: `${label(f)} returns with ${f.hp} HP` });
      break;
    }
  }
}

export function applyChess(s: ChessState, act: ChessAction): ChessEvent[] {
  const ev: ChessEvent[] = [];
  const p = byIdC(s, act.pieceId);
  if (!p || !p.alive || p.side !== s.turn || s.winner) return ev;
  const t = act.targetId ? byIdC(s, act.targetId) : undefined;
  switch (act.type) {
    case "move":
      p.x = act.x; p.y = act.y;
      ev.push({ type: "move", pieceId: p.id, x: act.x, y: act.y, text: `${label(p)} moves` });
      promote(s, p, ev);
      break;
    case "spell":
      if (p.kind === "king") castSpell(s, p, act, ev);
      break;
    case "heal":
      if (t && t.alive) {
        const amt = Math.min(t.maxHp - t.hp, (CARDS[p.card]!.heal ?? 10) + (p.level - 1) * 2);
        t.hp += amt;
        ev.push({ type: "heal", pieceId: p.id, targetId: t.id, amount: amt, text: `${label(p)} heals ${label(t)} +${amt}` });
      }
      break;
    case "cast":
      if (t && t.alive && p.charges > 0) {
        p.charges--;
        s.casts[p.side]++;
        ev.push({ type: "cast", pieceId: p.id, targetId: t.id, x: t.x, y: t.y, text: `${label(p)} strikes ${label(t)} (${QUEEN_CASTS - p.charges}/${QUEEN_CASTS})` });
        kill(s, t, ev, p);
        if (p.charges <= 0) {
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
        promote(s, p, ev);
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
      if (!t.alive && p.alive && canStand(p, t.x, t.y)) { p.x = t.x; p.y = t.y; promote(s, p, ev); }
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
function kingHp(s: ChessState, side: Side): number {
  const k = s.pieces.find(p => p.side === side && p.kind === "king");
  return k && k.alive ? k.hp / k.maxHp : 0;
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

function scoreSpell(s: ChessState, act: ChessAction, side: Side): number {
  const sp = SPELLS[act.spell ?? ""];
  if (!sp) return -100;
  const foe = other(side);
  if (sp.id === "rally" || sp.id === "curse" || sp.id === "bulwark") {
    const near = s.pieces.filter(q => q.alive && q.side === foe && s.pieces.some(a => a.alive && a.side === side && a.kind !== "king" && chebyshev(a, q) <= 2)).length;
    return near >= 3 ? 4 + near * 0.5 - sp.cost : -2;
  }
  const sim = cloneChess(s);
  applyChess(sim, act);
  if (sim.winner === side) return 10000;
  const gain = (material(s, foe) - material(sim, foe)) + (material(sim, side) - material(s, side)) + (kingHp(s, foe) - kingHp(sim, foe)) * 6;
  return gain * 10 - sp.cost * 4;
}

export function scoreChessAction(s: ChessState, act: ChessAction, pers: ChessPersonality = "tactician", threats?: Set<string>): number {
  const w = CHESS_AI[pers];
  const p = byIdC(s, act.pieceId)!;
  const t = act.targetId ? byIdC(s, act.targetId) : undefined;
  const fwd = p.side === "P" ? -1 : 1;
  let sc = 0;
  if (act.type === "spell") return scoreSpell(s, act, p.side);
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
    if (p.kind === "pawn" && ny === (p.side === "P" ? 0 : H - 1)) sc += 60;
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
  return { winner: s.winner, plies: s.ply, casts: s.casts, spells: { P: s.used.P.length, E: s.used.E.length }, queens: s.pieces.filter(q => q.kind === "queen" && q.id.includes("promo")).length };
}

if ((globalThis as any).process?.argv?.[1]?.endsWith("/chess.ts")) {
  const pers: ChessPersonality[] = ["rusher", "turtle", "tactician"];
  const enemy: Deck = { pawn: "inf_axe", knight: "armored", bishop: "mage", rook: "dragon", spells: ["fireball", "mend", "curse"] };
  let spells = 0, promos = 0;
  for (const pp of pers) {
    const row: string[] = [];
    for (const ep of pers) {
      let w = 0, l = 0, d = 0, plies = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const r = simulateChess(DEFAULT_DECK, enemy, pp, ep, seed);
        if (r.winner === "P") w++; else if (r.winner === "E") l++; else d++;
        plies += r.plies; spells += r.spells.P + r.spells.E; promos += r.queens;
      }
      row.push(`${ep} ${w}-${l}-${d} avg ${Math.round(plies / 20)} plies`.padEnd(32));
    }
    console.log(`${pp.padEnd(10)} vs  ${row.join("")}`);
  }
  console.log(`spells cast: ${spells} over 180 games · promotions: ${promos}`);
}
