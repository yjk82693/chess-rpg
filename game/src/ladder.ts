import { ROLE_CARDS, simulateChess, type ChessPersonality, type Deck } from "./chess.js";
import type { Collection } from "./cards.js";

export interface LadderLevel { level: number; name: string; personality: ChessPersonality; deck: Deck; gems: number; }

const NAMES = ["Squire", "Recruit", "Footman", "Sergeant", "Captain", "Knight-Errant", "Commander", "Warlord", "Grandmaster", "Storm King"];
const DECKS: Omit<Deck, "levels">[] = [
  { pawn: "inf_sword", knight: "armored", bishop: "cleric", rook: "griffon" },
  { pawn: "inf_axe", knight: "armored", bishop: "mage", rook: "griffon" },
  { pawn: "inf_lance", knight: "cavalier", bishop: "cleric", rook: "dragon" },
  { pawn: "inf_axe", knight: "aero", bishop: "mage", rook: "griffon" },
  { pawn: "inf_sword", knight: "cavalier", bishop: "mage", rook: "dragon" },
  { pawn: "inf_lance", knight: "aero", bishop: "cleric", rook: "dragon" },
  { pawn: "inf_axe", knight: "cavalier", bishop: "mage", rook: "dragon" },
  { pawn: "inf_lance", knight: "armored", bishop: "mage", rook: "dragon" },
  { pawn: "inf_sword", knight: "aero", bishop: "mage", rook: "dragon" },
  { pawn: "inf_axe", knight: "cavalier", bishop: "mage", rook: "griffon" },
];
const PERS: ChessPersonality[] = ["turtle", "rusher", "turtle", "rusher", "tactician", "rusher", "tactician", "turtle", "tactician", "tactician"];

export const LADDER: LadderLevel[] = NAMES.map((name, i) => {
  const lv = Math.min(5, 1 + Math.floor(i / 2));
  const base = DECKS[i]!;
  const levels: Record<string, number> = {};
  for (const id of Object.values(base)) levels[id] = lv;
  return { level: i + 1, name, personality: PERS[i]!, deck: { ...base, levels }, gems: 10 + 5 * i };
});

export function ladderReward(level: number, won: boolean, firstClear: boolean): number {
  const l = LADDER[level - 1];
  if (!l || !won) return 0;
  return firstClear ? l.gems * 3 : l.gems;
}

export interface DeckPick { deck: Deck; winRate: number; wins: number; games: number; reason: string; }

const ROLE_NOTE: Record<string, string> = {
  inf_sword: "swords beat their axes", inf_axe: "axes beat their lances", inf_lance: "lances beat their swords",
  armored: "armored knights wall the bridges", cavalier: "fast cavaliers strike twice", aero: "aero knights fly over the river",
  mage: "magic melts armor", cleric: "heals keep heroes alive", dragon: "dragon axes hit hardest", griffon: "griffons cross the river fast",
};

export function ownedDecks(c: Collection): Deck[] {
  const own = (ids: string[]) => ids.filter(id => c.cards[id]?.unlocked);
  const out: Deck[] = [];
  for (const pawn of own(ROLE_CARDS.pawn)) for (const knight of own(ROLE_CARDS.knight))
    for (const bishop of own(ROLE_CARDS.bishop)) for (const rook of own(ROLE_CARDS.rook)) {
      const levels: Record<string, number> = {};
      for (const id of [pawn, knight, bishop, rook]) levels[id] = c.cards[id]!.level;
      out.push({ pawn, knight, bishop, rook, levels });
    }
  return out;
}

export function recommendDecks(c: Collection, vs: { deck: Deck; personality: ChessPersonality }, seeds = 8, top = 3): DeckPick[] {
  const picks: DeckPick[] = [];
  for (const deck of ownedDecks(c)) {
    let wins = 0;
    for (let s = 1; s <= seeds; s++) if (simulateChess(deck, vs.deck, "tactician", vs.personality, 1000 + s).winner === "P") wins++;
    picks.push({ deck, wins, games: seeds, winRate: wins / seeds, reason: "" });
  }
  picks.sort((a, b) => b.winRate - a.winRate);
  const res = picks.slice(0, top);
  for (const p of res) {
    const changed = (["pawn", "knight", "bishop", "rook"] as const).filter(r => p.deck[r] !== c.deck[r]).map(r => ROLE_NOTE[p.deck[r]]!);
    p.reason = changed.length ? `Swap in: ${changed.join(", ")}.` : "Your current deck is already the best you own here.";
  }
  return res;
}
