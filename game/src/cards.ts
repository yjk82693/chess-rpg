import { CARDS, DECK_BUDGET, ROLE_CARDS, SPELLS, SPELL_IDS, SPELL_LIMIT, costOf, deckCost, type Deck } from "./chess.js";

export const MAX_LEVEL = 5;
export const CHEST_SIZE = 5;
export const UNLOCK_GEMS = 60;
export const unlockCost = (id: string) => UNLOCK_GEMS * Math.max(1, costOf(id));
export const WIN_GEMS = 20;
export const UPGRADE_COPIES = [0, 2, 4, 8, 12];
export const RARITY_WEIGHT: Record<number, number> = { 1: 40, 2: 28, 3: 18, 4: 10, 5: 4 };
export const GEM_PACKS = [
  { id: "pouch", gems: 100, price: "$0.99" },
  { id: "chest", gems: 550, price: "$4.99" },
];

export interface OwnedCard { unlocked: boolean; level: number; copies: number; }
export interface Collection { cards: Record<string, OwnedCard>; gems: number; wins: number; losses: number; chests: number; deck: Deck; stored?: number; lastChest?: ChestDraw[]; }
export interface ChestDraw { card: string; copies: number; newlyUnlocked: boolean; }

export const UNIT_CARDS = [...ROLE_CARDS.pawn, ...ROLE_CARDS.knight, ...ROLE_CARDS.bishop, ...ROLE_CARDS.rook];
export const COLLECTIBLE = [...UNIT_CARDS, ...SPELL_IDS];
const STARTER = ["inf_lance", "cavalier", "mage", "griffon", "rally", "curse"];
const STARTER_DECK: Deck = { pawn: "inf_lance", knight: "cavalier", bishop: "mage", rook: "griffon", spells: ["rally", "curse"] };

export function newCollection(): Collection {
  const cards: Record<string, OwnedCard> = {};
  for (const id of COLLECTIBLE) cards[id] = { unlocked: STARTER.includes(id), level: 1, copies: 0 };
  return { cards, gems: 0, wins: 0, losses: 0, chests: 0, deck: { ...STARTER_DECK, spells: [...STARTER_DECK.spells!] } };
}

export function normalizeCollection(c: Collection): Collection {
  for (const id of COLLECTIBLE) if (!c.cards[id]) c.cards[id] = { unlocked: STARTER.includes(id), level: 1, copies: 0 };
  if (!Array.isArray(c.deck.spells)) c.deck.spells = [...STARTER_DECK.spells!];
  for (const id of ["rally", "curse"]) c.cards[id]!.unlocked = true;
  if (typeof c.stored !== "number") c.stored = 0;
  return c;
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
  if (!o || o.unlocked || c.gems < unlockCost(id)) return false;
  c.gems -= unlockCost(id);
  o.unlocked = true;
  return true;
}

function drawCard(rng: () => number): string {
  const total = COLLECTIBLE.reduce((t, id) => t + RARITY_WEIGHT[costOf(id)]!, 0);
  let r = rng() * total;
  for (const id of COLLECTIBLE) { r -= RARITY_WEIGHT[costOf(id)]!; if (r <= 0) return id; }
  return COLLECTIBLE[0]!;
}

export function openChest(c: Collection, rng: () => number = Math.random): ChestDraw[] {
  const draws: ChestDraw[] = [];
  for (let i = 0; i < CHEST_SIZE; i++) {
    const id = drawCard(rng);
    const copies = 1 + Math.floor(rng() * Math.max(1, 6 - costOf(id)));
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
  c.stored = (c.stored ?? 0) + 1;
  void rng;
  return [];
}

export function openStored(c: Collection, rng: () => number = Math.random): boolean {
  if (!c.stored || c.stored <= 0) return false;
  c.stored -= 1;
  c.lastChest = openChest(c, rng);
  return true;
}

export function buyCard(c: Collection, id: string): boolean {
  const o = c.cards[id];
  const cost = unlockCost(id);
  if (!o || c.gems < cost) return false;
  if (!o.unlocked) o.unlocked = true;
  else if (o.level >= MAX_LEVEL) return false;
  else o.copies += 1;
  c.gems -= cost;
  return true;
}

export function setDeckCard(c: Collection, id: string): boolean {
  const o = c.cards[id];
  if (!o?.unlocked) return false;
  if (SPELLS[id]) {
    const spells = [...(c.deck.spells ?? [])];
    const i = spells.indexOf(id);
    if (i >= 0) { spells.splice(i, 1); c.deck.spells = spells; return true; }
    if (spells.length >= SPELL_LIMIT) return false;
    const next: Deck = { ...c.deck, spells: [...spells, id] };
    if (deckCost(next) > DECK_BUDGET) return false;
    c.deck.spells = next.spells;
    return true;
  }
  const def = CARDS[id];
  if (!def || def.kind === "queen" || def.kind === "king") return false;
  const next: Deck = { ...c.deck, [def.kind]: id };
  if (deckCost(next) > DECK_BUDGET) return false;
  (c.deck as unknown as Record<string, string>)[def.kind] = id;
  return true;
}

export function deckWithLevels(c: Collection): Deck {
  const levels: Record<string, number> = {};
  for (const [id, o] of Object.entries(c.cards)) levels[id] = o.level;
  return { ...c.deck, spells: [...(c.deck.spells ?? [])], levels };
}
