import { CARDS, ROLE_CARDS, type Deck } from "./chess.js";

export const MAX_LEVEL = 5;
export const CHEST_SIZE = 5;
export const UNLOCK_GEMS = 100;
export const WIN_GEMS = 20;
export const UPGRADE_COPIES = [0, 2, 4, 8, 12];
export const GEM_PACKS = [
  { id: "pouch", gems: 100, price: "$0.99" },
  { id: "chest", gems: 550, price: "$4.99" },
];

export interface OwnedCard { unlocked: boolean; level: number; copies: number; }
export interface Collection { cards: Record<string, OwnedCard>; gems: number; wins: number; losses: number; chests: number; deck: Deck; }
export interface ChestDraw { card: string; copies: number; newlyUnlocked: boolean; }

export const COLLECTIBLE = [...ROLE_CARDS.pawn, ...ROLE_CARDS.knight, ...ROLE_CARDS.bishop, ...ROLE_CARDS.rook];
const STARTER = ["inf_lance", "cavalier", "mage", "griffon"];

export function newCollection(): Collection {
  const cards: Record<string, OwnedCard> = {};
  for (const id of COLLECTIBLE) cards[id] = { unlocked: STARTER.includes(id), level: 1, copies: 0 };
  return { cards, gems: 0, wins: 0, losses: 0, chests: 0, deck: { pawn: "inf_lance", knight: "cavalier", bishop: "mage", rook: "griffon" } };
}

export function upgradeCost(level: number): number { return UPGRADE_COPIES[level] ?? Infinity; }
export function canUpgrade(c: Collection, id: string): boolean {
  const o = c.cards[id];
  return !!o && o.unlocked && o.level < MAX_LEVEL && o.copies >= upgradeCost(o.level);
}
export function upgrade(c: Collection, id: string): boolean {
  if (!canUpgrade(c, id)) return false;
  const o = c.cards[id]!;
  o.copies -= upgradeCost(o.level);
  o.level++;
  return true;
}
export function unlockWithGems(c: Collection, id: string): boolean {
  const o = c.cards[id];
  if (!o || o.unlocked || c.gems < UNLOCK_GEMS) return false;
  c.gems -= UNLOCK_GEMS;
  o.unlocked = true;
  return true;
}

export function openChest(c: Collection, rng: () => number = Math.random): ChestDraw[] {
  const draws: ChestDraw[] = [];
  for (let i = 0; i < CHEST_SIZE; i++) {
    const id = COLLECTIBLE[Math.floor(rng() * COLLECTIBLE.length)]!;
    const copies = 1 + Math.floor(rng() * 5);
    const o = c.cards[id]!;
    const newlyUnlocked = !o.unlocked;
    if (newlyUnlocked) { o.unlocked = true; o.copies += copies - 1; }
    else o.copies += copies;
    draws.push({ card: id, copies, newlyUnlocked });
  }
  c.chests++;
  return draws;
}

export function recordResult(c: Collection, won: boolean, rng: () => number = Math.random): ChestDraw[] {
  if (!won) { c.losses++; return []; }
  c.wins++;
  c.gems += WIN_GEMS;
  return openChest(c, rng);
}

export function setDeckCard(c: Collection, id: string): boolean {
  const def = CARDS[id];
  const o = c.cards[id];
  if (!def || !o?.unlocked || def.kind === "queen" || def.kind === "king") return false;
  (c.deck as unknown as Record<string, string>)[def.kind] = id;
  return true;
}

export function deckWithLevels(c: Collection): Deck {
  const levels: Record<string, number> = {};
  for (const [id, o] of Object.entries(c.cards)) levels[id] = o.level;
  return { ...c.deck, levels };
}
