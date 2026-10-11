// data.ts: all static game data. Logic files read from here; never hardcode numbers elsewhere.

// ---------- Board ----------
export const GRID_SIZE = 8;
export const MAX_TURNS = 10;
export const PARTY_COST_CAP = 30;
export const COST_PER_STAR = 3;
export const MAX_ATTACKS_PER_EXCHANGE = 2;

// ---------- Tiles ----------
export enum Terrain {
  Plain = "plain",
  Forest = "forest",
  Fort = "fort",
  Water = "water",
}

export interface TerrainInfo {
  glyph: string;          // character used in map text grids
  passable: boolean;      // for ground units
  flyerPassable: boolean; // for Winged units
  evadeFromSpd: boolean;  // forest: evade += unit SPD
  healPct: number;        // fort: heal % of max HP at turn start
  burnable: boolean;      // forest: fire attacks leave a burn DoT
}

export const TERRAIN: Record<Terrain, TerrainInfo> = {
  [Terrain.Plain]:  { glyph: ".", passable: true,  flyerPassable: true, evadeFromSpd: false, healPct: 0,    burnable: false },
  [Terrain.Forest]: { glyph: "F", passable: true,  flyerPassable: true, evadeFromSpd: true,  healPct: 0,    burnable: true  },
  [Terrain.Fort]:   { glyph: "T", passable: true,  flyerPassable: true, evadeFromSpd: false, healPct: 0.10, burnable: false },
  [Terrain.Water]:  { glyph: "W", passable: false, flyerPassable: true, evadeFromSpd: false, healPct: 0,    burnable: false },
};

export const GLYPH_TO_TERRAIN: Record<string, Terrain> = Object.fromEntries(
  Object.entries(TERRAIN).map(([t, info]) => [info.glyph, t as Terrain]),
);

export const BURN_DOT_PCT = 0.08;   // % max HP per turn while burning
export const BURN_TURNS = 2;

// ---------- Map objects (decorative only for now, no rules) ----------
export enum MapObject {
  Ballista = "ballista",
  Banner = "banner",
  Ruins = "ruins",
  PollutedPatch = "polluted_patch",
}

// ---------- Weapons ----------
export enum Weapon {
  Sword = "sword",
  Axe = "axe",
  Lance = "lance",
  Tome = "tome", // magic, outside the triangle
}

export const TRIANGLE_ADV = 1.2;
export const TRIANGLE_DIS = 0.8;

// key beats value
const BEATS: Partial<Record<Weapon, Weapon>> = {
  [Weapon.Sword]: Weapon.Axe,
  [Weapon.Axe]: Weapon.Lance,
  [Weapon.Lance]: Weapon.Sword,
};

export function triangleMod(attacker: Weapon, defender: Weapon): number {
  if (BEATS[attacker] === defender) return TRIANGLE_ADV;
  if (BEATS[defender] === attacker) return TRIANGLE_DIS;
  return 1;
}

export function isMagic(w: Weapon): boolean {
  return w === Weapon.Tome;
}

export const WEAPON_RANGE: Record<Weapon, [min: number, max: number]> = {
  [Weapon.Sword]: [1, 1],
  [Weapon.Axe]: [1, 1],
  [Weapon.Lance]: [1, 1],
  [Weapon.Tome]: [1, 2],
};

// ---------- Attributes and reactions ----------
export enum Attribute {
  Fire = "fire",
  Water = "water",
  Electric = "electric",
}

export enum Reaction {
  ElectricShock = "electric_shock", // electric hits water: bonus damage
  CoolFire = "cool_fire",           // fire hits water: damage dampened
  Explosion = "explosion",          // fire and electric meet: big burst
}

export interface ReactionInfo {
  damageMult: number;
}

export const REACTIONS: Record<Reaction, ReactionInfo> = {
  [Reaction.ElectricShock]: { damageMult: 1.3 },
  [Reaction.CoolFire]:      { damageMult: 0.7 },
  [Reaction.Explosion]:     { damageMult: 1.5 },
};

export function reactionFor(attacker: Attribute, defender: Attribute): Reaction | null {
  if (attacker === Attribute.Electric && defender === Attribute.Water) return Reaction.ElectricShock;
  if (attacker === Attribute.Fire && defender === Attribute.Water) return Reaction.CoolFire;
  if (
    (attacker === Attribute.Fire && defender === Attribute.Electric) ||
    (attacker === Attribute.Electric && defender === Attribute.Fire)
  ) return Reaction.Explosion;
  return null;
}

// ---------- Items ----------
export enum Item {
  Vulnerary = "vulnerary", // heal 30% max HP
  Elixir = "elixir",       // heal 100% max HP
  Salve = "salve",         // heal 15% max HP, clears burn and attribute mark
}

export const ITEM_HEAL_PCT: Record<Item, number> = {
  [Item.Vulnerary]: 0.3,
  [Item.Elixir]: 1.0,
  [Item.Salve]: 0.15,
};

// ---------- Units (chess roles for readability) ----------
export enum UnitClass {
  Infantry = "infantry", // Pawn: cheap frontline, promotes into others
  Armored = "armored",   // Rook: slow wall, high DEF
  Cavalier = "cavalier", // Knight: fast flanker
  Winged = "winged",     // Bishop: flies over water, fragile
  Mage = "mage",         // Queen: magic damage, ranged, high value target
}

export enum ChessRole {
  Pawn = "pawn",
  Rook = "rook",
  Knight = "knight",
  Bishop = "bishop",
  Queen = "queen",
}

export interface Stats {
  hp: number;
  atk: number;
  mag: number;
  def: number;
  spd: number;
}

export interface ClassInfo {
  chess: ChessRole;
  glyph: string;        // chess piece used as placeholder art
  letter: string;       // fallback when glyph fonts are missing
  move: number;
  flying: boolean;
  allowedWeapons: Weapon[];
  base: Stats;
  growth: Stats;        // added per level
  promotesTo: UnitClass[];
}

export const CLASSES: Record<UnitClass, ClassInfo> = {
  [UnitClass.Infantry]: {
    chess: ChessRole.Pawn, glyph: "♟", letter: "I", move: 4, flying: false,
    allowedWeapons: [Weapon.Sword, Weapon.Axe, Weapon.Lance],
    base:   { hp: 20, atk: 7, mag: 1, def: 5, spd: 6 },
    growth: { hp: 2,  atk: 1, mag: 0, def: 1, spd: 1 },
    promotesTo: [UnitClass.Armored, UnitClass.Cavalier, UnitClass.Winged],
  },
  [UnitClass.Armored]: {
    chess: ChessRole.Rook, glyph: "♜", letter: "A", move: 3, flying: false,
    allowedWeapons: [Weapon.Sword, Weapon.Axe, Weapon.Lance],
    base:   { hp: 28, atk: 9, mag: 0, def: 11, spd: 3 },
    growth: { hp: 3,  atk: 1, mag: 0, def: 2,  spd: 0 },
    promotesTo: [],
  },
  [UnitClass.Cavalier]: {
    chess: ChessRole.Knight, glyph: "♞", letter: "C", move: 6, flying: false,
    allowedWeapons: [Weapon.Sword, Weapon.Lance],
    base:   { hp: 23, atk: 9, mag: 1, def: 6, spd: 8 },
    growth: { hp: 2,  atk: 1, mag: 0, def: 1, spd: 1 },
    promotesTo: [],
  },
  [UnitClass.Winged]: {
    chess: ChessRole.Bishop, glyph: "♝", letter: "W", move: 6, flying: true,
    allowedWeapons: [Weapon.Sword, Weapon.Lance],
    base:   { hp: 19, atk: 8, mag: 2, def: 4, spd: 10 },
    growth: { hp: 2,  atk: 1, mag: 0, def: 0, spd: 2 },
    promotesTo: [],
  },
  [UnitClass.Mage]: {
    chess: ChessRole.Queen, glyph: "♛", letter: "M", move: 4, flying: false,
    allowedWeapons: [Weapon.Tome],
    base:   { hp: 17, atk: 3, mag: 10, def: 3, spd: 6 },
    growth: { hp: 1,  atk: 0, mag: 2,  def: 0, spd: 1 },
    promotesTo: [],
  },
};

// ---------- Growth and promotion ----------
export const LEVEL_CAPS = [10, 20, 30] as const;
export const EXP_PER_LEVEL = 100;
export const EXP_KILL = 30;
export const EXP_HIT = 10;
export const PROMOTION_COST = [1, 2, 3] as const; // star cost added per promotion tier

export enum Subskill {
  Sturdy = "sturdy",       // +3 DEF
  Swift = "swift",         // +3 SPD
  Pyromancer = "pyromancer", // fire reactions x1.2 more
  Bulwark = "bulwark",     // +20% fort heal for this unit
}

export const SUBSKILL_BONUS: Record<Subskill, Partial<Stats>> = {
  [Subskill.Sturdy]: { def: 3 },
  [Subskill.Swift]: { spd: 3 },
  [Subskill.Pyromancer]: {},
  [Subskill.Bulwark]: {},
};

// ---------- Teams ----------
export enum Team {
  Player = "player",
  Npc = "npc",
}

export const HIT_MIN = 0;
export const HIT_MAX = 100;
export const BASE_HIT = 85;

// ---------- Weapon power (design doc: Power is added to ATK when attacking) ----------
export const WEAPON_POWER: Record<Weapon, number> = {
  [Weapon.Sword]: 5,
  [Weapon.Axe]: 7,
  [Weapon.Lance]: 6,
  [Weapon.Tome]: 5,
};

// ---------- Shop (PLAN section 11) ----------
export const ITEM_PRICE: Record<Item, number> = {
  [Item.Vulnerary]: 50,
  [Item.Elixir]: 150,
  [Item.Salve]: 40,
};

export const ITEM_CLEARS_STATUS: Record<Item, boolean> = {
  [Item.Vulnerary]: false,
  [Item.Elixir]: false,
  [Item.Salve]: true,
};

export const SHOP_BUDGET = 300;          // gold per generation, not carried over
export const MAX_ITEMS_PER_UNIT = 2;
