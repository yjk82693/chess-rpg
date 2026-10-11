// index.ts: smoke test. Random vs random on every training map, plus a determinism check.
import { Attribute, Team, UnitClass, Weapon } from "./data.js";
import { randomPolicy, runBattle } from "./engine.js";
import { TRAIN_MAPS } from "./maps.js";
import { BattleEvent, UnitSpec } from "./state.js";

const spec = (id: string, cls: UnitClass, weapon: Weapon, attribute: Attribute, level = 5): UnitSpec =>
  ({ id, class: cls, weapon, attribute, level, exp: 0, star: 1, promotion: 0, subskill: null });

export const DEMO_PLAYER: UnitSpec[] = [
  spec("p_rook", UnitClass.Armored, Weapon.Lance, Attribute.Water),
  spec("p_knight", UnitClass.Cavalier, Weapon.Sword, Attribute.Fire),
  spec("p_bishop", UnitClass.Winged, Weapon.Lance, Attribute.Electric),
  spec("p_queen", UnitClass.Mage, Weapon.Tome, Attribute.Fire),
];

export const DEMO_NPC: UnitSpec[] = [
  spec("n_pawn1", UnitClass.Infantry, Weapon.Sword, Attribute.Water),
  spec("n_pawn2", UnitClass.Infantry, Weapon.Axe, Attribute.Fire),
  spec("n_pawn3", UnitClass.Infantry, Weapon.Lance, Attribute.Electric),
  spec("n_rook", UnitClass.Armored, Weapon.Axe, Attribute.Water),
  spec("n_queen", UnitClass.Mage, Weapon.Tome, Attribute.Electric),
];

export function describe(e: BattleEvent): string {
  switch (e.t) {
    case "turn_start": return `-- turn ${e.turn}: ${e.team} phase --`;
    case "move": return `${e.unit} moves (${e.from.x},${e.from.y}) -> (${e.to.x},${e.to.y})`;
    case "attack":
      if (!e.hit) return `${e.attacker} misses ${e.defender}`;
      return `${e.attacker} hits ${e.defender} for ${e.damage}` +
        (e.reaction ? ` [${e.reaction}]` : "") +
        (e.triangle !== 1 ? ` (triangle x${e.triangle})` : "");
    case "evade": return `  ${e.unit} evades on ${e.terrain}`;
    case "death": return `  ${e.unit} falls${e.killer ? ` to ${e.killer}` : ""} on ${e.terrain}`;
    case "heal": return `${e.unit} heals ${e.amount} (${e.source})`;
    case "burn": return `${e.unit} burns for ${e.damage}`;
    case "end": return `== ${e.winner} wins by ${e.reason} on turn ${e.turn} ==`;
  }
}

const opts = (mapId: string, seed: number) => ({
  mapId, seed, player: DEMO_PLAYER, npc: DEMO_NPC, playerPolicy: randomPolicy, npcPolicy: randomPolicy,
});

let wins = 0;
let total = 0;
for (const map of TRAIN_MAPS) {
  for (const seed of [1, 2, 3]) {
    const r = runBattle(opts(map.id, seed));
    total++;
    if (r.winner === Team.Player) wins++;
    console.log(
      `${map.id.padEnd(13)} seed ${seed}  ${r.winner.padEnd(6)} by ${r.reason.padEnd(5)} turn ${String(r.turns).padStart(2)}` +
      `  score ${r.score.toFixed(2).padStart(5)}  events ${String(r.log.length).padStart(3)}` +
      (r.errors.length ? `  ERRORS ${r.errors.length}: ${r.errors[0]}` : ""),
    );
  }
}
console.log(`\nrandom vs random: player won ${wins}/${total}`);

const a = runBattle(opts("river_ford", 1));
const b = runBattle(opts("river_ford", 1));
console.log(`deterministic: ${JSON.stringify(a.log) === JSON.stringify(b.log) ? "yes" : "NO"}`);

console.log("\nSample log (river_ford, seed 1):");
for (const e of a.log) console.log(describe(e));
