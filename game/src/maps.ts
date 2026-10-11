// maps.ts: hand-made 8x8 maps (Fire Emblem style). Train maps feed the agents;
// held-out maps are only used for the final evaluation.
import { GLYPH_TO_TERRAIN, GRID_SIZE, TERRAIN, Terrain } from "./data.js";
import { Pos, inBounds } from "./state.js";

export type Split = "train" | "heldout";

export interface GameMap {
  id: string;
  name: string;
  split: Split;
  style: string;           // one-line design note
  rows: string[];
  grid: Terrain[][];       // grid[y][x]
  playerSpawns: Pos[];     // bottom rows
  npcSpawns: Pos[];        // top rows
}

export const PLAYER_UNITS = 4;
export const NPC_UNITS = 5;

// Center-out order so spawns cluster in the middle of the row
const SPAWN_ORDER = [3, 4, 2, 5, 1, 6, 0, 7];

function parse(id: string, rows: string[]): Terrain[][] {
  if (rows.length !== GRID_SIZE) throw new Error(`${id}: expected ${GRID_SIZE} rows, got ${rows.length}`);
  return rows.map((row, y) => {
    if (row.length !== GRID_SIZE) throw new Error(`${id}: row ${y} has ${row.length} chars`);
    return [...row].map((ch, x) => {
      const t = GLYPH_TO_TERRAIN[ch];
      if (!t) throw new Error(`${id}: unknown glyph '${ch}' at (${x},${y})`);
      return t;
    });
  });
}

function autoSpawns(grid: Terrain[][], ys: number[], count: number): Pos[] {
  const out: Pos[] = [];
  for (const y of ys) {
    for (const x of SPAWN_ORDER) {
      if (out.length === count) return out;
      if (TERRAIN[grid[y][x]].passable) out.push({ x, y });
    }
  }
  return out;
}

function defineMap(id: string, name: string, split: Split, style: string, rows: string[]): GameMap {
  const grid = parse(id, rows);
  return {
    id, name, split, style, rows, grid,
    playerSpawns: autoSpawns(grid, [7, 6], PLAYER_UNITS),
    npcSpawns: autoSpawns(grid, [0, 1], NPC_UNITS),
  };
}

export const MAPS: GameMap[] = [
  // ---------- Training ----------
  defineMap("open_field", "Open Field", "train",
    "Baseline skirmish: open ground, scattered cover, one fort each side.", [
    "....T...",
    "........",
    ".F....F.",
    "........",
    "........",
    ".F....F.",
    "........",
    "...T....",
  ]),
  defineMap("forest_road", "Forest Road", "train",
    "Central road walled by forest: chokepoints and ambush lanes.", [
    "FF....FF",
    "F......F",
    "FFF..FFF",
    "FF....FF",
    "FF....FF",
    "FFF..FFF",
    "F......F",
    "FF....FF",
  ]),
  defineMap("river_ford", "River Ford", "train",
    "Two-tile river with two fords: hold the crossings or fly over.", [
    "..T.....",
    "...F....",
    "........",
    "WW.WWW.W",
    "WW.WWW.W",
    "........",
    "....F...",
    ".....T..",
  ]),
  defineMap("twin_forts", "Twin Forts", "train",
    "Mirrored fort pairs on both flanks: rewards turtling and attrition.", [
    "........",
    ".T....T.",
    "..F..F..",
    "........",
    "........",
    "..F..F..",
    ".T....T.",
    "........",
  ]),
  defineMap("mixed_valley", "Mixed Valley", "train",
    "Asymmetric streams and woods: forces routing decisions.", [
    "F..W....",
    "F..W.F..",
    "...W....",
    "..T....F",
    "F....T..",
    "....W...",
    "..F.W..F",
    "....W..F",
  ]),

  // ---------- Held-out (never shown to agents) ----------
  defineMap("lake_crossing", "Lake Crossing", "heldout",
    "Lake with a fort island only Winged units can reach; ground fights go around.", [
    "........",
    "..F..F..",
    ".WWWWWW.",
    ".WWTTWW.",
    ".WW..WW.",
    ".WWWWWW.",
    "..F..F..",
    "........",
  ]),
  defineMap("dense_woods", "Dense Woods", "heldout",
    "Forest everywhere: evasion and fire-on-forest dominate.", [
    "F.F..F.F",
    ".FF.FF..",
    "FF.F..FF",
    "..FTF.F.",
    ".F.FTF..",
    "FF..F.FF",
    "..FF.FF.",
    "F.F..F.F",
  ]),
];

export const TRAIN_MAPS = MAPS.filter(m => m.split === "train");
export const HELDOUT_MAPS = MAPS.filter(m => m.split === "heldout");

export function getMap(id: string): GameMap {
  const m = MAPS.find(m => m.id === id);
  if (!m) throw new Error(`unknown map ${id}`);
  return m;
}

// ---------- Validation ----------
const DIRS: Pos[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export function groundReachable(grid: Terrain[][], from: Pos, to: Pos): boolean {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue: Pos[] = [from];
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === to.x && p.y === to.y) return true;
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      const key = `${n.x},${n.y}`;
      if (!inBounds(n) || seen.has(key) || !TERRAIN[grid[n.y][n.x]].passable) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return false;
}

export function validateMap(m: GameMap): string[] {
  const errs: string[] = [];
  if (m.playerSpawns.length !== PLAYER_UNITS) errs.push(`player spawns ${m.playerSpawns.length}/${PLAYER_UNITS}`);
  if (m.npcSpawns.length !== NPC_UNITS) errs.push(`npc spawns ${m.npcSpawns.length}/${NPC_UNITS}`);
  for (const p of m.playerSpawns)
    if (!m.npcSpawns.some(n => groundReachable(m.grid, p, n)))
      errs.push(`player spawn (${p.x},${p.y}) cannot reach any NPC by ground`);
  return errs;
}

export function renderMap(m: GameMap): string {
  const rows = m.rows.map(r => [...r]);
  for (const p of m.playerSpawns) rows[p.y][p.x] = "P";
  for (const p of m.npcSpawns) rows[p.y][p.x] = "N";
  return rows.map(r => r.join(" ")).join("\n");
}

export function validateAll(): boolean {
  let ok = true;
  for (const m of MAPS) {
    const errs = validateMap(m);
    console.log(`\n[${m.split}] ${m.id}: ${m.style}`);
    console.log(renderMap(m));
    if (errs.length) { ok = false; for (const e of errs) console.log(`  ERROR ${e}`); }
  }
  console.log(ok ? "\nAll maps valid" : "\nMap errors found");
  return ok;
}

// Run directly: npx tsx src/maps.ts
if ((globalThis as any).process?.argv?.[1]?.endsWith("/maps.ts")) {
  process.exit(validateAll() ? 0 : 1);
}
