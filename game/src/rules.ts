// rules.ts: combat math and turn-start effects, based on the Purifier SRPG design docs.
import {
  Attribute, BURN_DOT_PCT, BURN_TURNS, EXP_HIT, EXP_KILL, HIT_MAX, HIT_MIN,
  ITEM_HEAL_PCT, REACTIONS, Reaction, Subskill, TERRAIN, Team, UnitClass, WEAPON_RANGE,
  isMagic, triangleMod,
} from "./data.js";
import { Battle, Unit, aliveOf, dist, terrainAt } from "./state.js";

// ---------- Tunables ----------
export const DOUBLE_ATTACK_SPD_GAP = 4; // follow-up hit when SPD gap is at least this
export const EVADE_BASE = 10;           // design doc: evade = (SPD diff) + 10
export const EVADE_CAP = 60;            // keeps forest + high SPD from becoming untouchable
export const MIN_DAMAGE = 1;            // avoids 10-turn stalemates
export const RESPONSE_MAG_SCALE = 0.01; // response damage x (1 + MAG x 0.01)
export const PYROMANCER_MULT = 1.2;
export const BULWARK_MULT = 1.2;

// Mechanics doc: magic effectiveness by target type
export const MAGIC_EFFECTIVENESS: Record<UnitClass, number> = {
  [UnitClass.Infantry]: 1,
  [UnitClass.Armored]: 2,
  [UnitClass.Cavalier]: 1,
  [UnitClass.Winged]: 0.5,
  [UnitClass.Mage]: 1,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- Elemental responses (symmetric pairs) ----------
export function pairReaction(a: Attribute, b: Attribute): Reaction | null {
  if (a === b) return null;
  const has = (x: Attribute) => a === x || b === x;
  if (has(Attribute.Fire) && has(Attribute.Electric)) return Reaction.Explosion;
  if (has(Attribute.Water) && has(Attribute.Electric)) return Reaction.ElectricShock;
  if (has(Attribute.Fire) && has(Attribute.Water)) return Reaction.CoolFire;
  return null;
}

// ---------- Hit / evade ----------
export function evadeChance(b: Battle, att: Unit, def: Unit): number {
  const forestBonus = TERRAIN[terrainAt(b, def.pos)].evadeFromSpd ? def.stats.spd : 0;
  return clamp(def.stats.spd - att.stats.spd + EVADE_BASE + forestBonus, 0, EVADE_CAP);
}

export function hitChance(b: Battle, att: Unit, def: Unit): number {
  return clamp(100 - evadeChance(b, att, def), HIT_MIN, HIT_MAX);
}

export function strikesFor(att: Unit, def: Unit): number {
  return att.stats.spd - def.stats.spd >= DOUBLE_ATTACK_SPD_GAP ? 2 : 1;
}

export function canCounter(def: Unit, att: Unit): boolean {
  if (!def.alive) return false;
  const [min, max] = WEAPON_RANGE[def.weapon];
  const d = dist(def.pos, att.pos);
  return d >= min && d <= max;
}

// ---------- Damage ----------
export interface DamagePreview {
  damage: number;
  triangle: number;
  reaction: Reaction | null;
}

// Pure: no RNG, no state changes. NPC AI and the executor use this to evaluate targets.
export function previewDamage(att: Unit, def: Unit): DamagePreview {
  const triangle = triangleMod(att.weapon, def.weapon);
  const raw = isMagic(att.weapon)
    ? ((att.stats.mag + att.stats.atk) / 2) * MAGIC_EFFECTIVENESS[def.cls]
    : att.stats.atk * triangle;
  let dmg = Math.max(MIN_DAMAGE, raw - def.stats.def);

  const reaction = def.mark && def.mark !== att.attribute ? pairReaction(att.attribute, def.mark) : null;
  if (reaction) {
    let mult = REACTIONS[reaction].damageMult * (1 + att.stats.mag * RESPONSE_MAG_SCALE);
    if (att.subskill === Subskill.Pyromancer && att.attribute === Attribute.Fire) mult *= PYROMANCER_MULT;
    dmg *= mult;
  }
  return { damage: Math.max(MIN_DAMAGE, Math.round(dmg)), triangle, reaction };
}

export function expectedDamage(b: Battle, att: Unit, def: Unit): number {
  return previewDamage(att, def).damage * (hitChance(b, att, def) / 100) * strikesFor(att, def);
}

// ---------- Applying effects ----------
export function applyDamage(b: Battle, u: Unit, dmg: number, killer: string | null, triangleDisadvantage: boolean): boolean {
  u.hp = Math.max(0, u.hp - dmg);
  if (u.hp > 0) return false;
  u.alive = false;
  u.mark = null;
  u.burnTurns = 0;
  b.log.push({ t: "death", turn: b.turn, unit: u.id, killer, terrain: terrainAt(b, u.pos), triangleDisadvantage });
  return true;
}

// One strike. Returns true if the defender died.
export function strike(b: Battle, att: Unit, def: Unit): boolean {
  const terrain = terrainAt(b, def.pos);
  const preview = previewDamage(att, def);
  const hit = b.rng.chance(hitChance(b, att, def));

  if (!hit) {
    b.log.push({ t: "evade", turn: b.turn, unit: def.id, attacker: att.id, terrain });
    b.log.push({ t: "attack", turn: b.turn, attacker: att.id, defender: def.id, hit: false,
                 damage: 0, triangle: preview.triangle, reaction: null, terrain });
    return false;
  }

  if (preview.reaction) {
    def.mark = null;
    if (preview.reaction === Reaction.CoolFire) def.burnTurns = 0;
  } else {
    def.mark = att.attribute;
  }
  if (att.attribute === Attribute.Fire && TERRAIN[terrain].burnable && preview.reaction !== Reaction.CoolFire) {
    def.burnTurns = BURN_TURNS;
  }

  b.log.push({ t: "attack", turn: b.turn, attacker: att.id, defender: def.id, hit: true,
               damage: preview.damage, triangle: preview.triangle, reaction: preview.reaction, terrain });
  att.expGained += EXP_HIT;
  const killed = applyDamage(b, def, preview.damage, att.id, triangleMod(def.weapon, att.weapon) < 1);
  if (killed) att.expGained += EXP_KILL;
  return killed;
}

// Full exchange: attack, counter, then one follow-up from the faster side. Max 2 strikes per side.
export function resolveCombat(b: Battle, att: Unit, def: Unit): void {
  strike(b, att, def);
  if (att.alive && def.alive && canCounter(def, att)) strike(b, def, att);
  if (!att.alive || !def.alive) return;
  if (strikesFor(att, def) === 2) strike(b, att, def);
  else if (strikesFor(def, att) === 2 && canCounter(def, att)) strike(b, def, att);
}

export function useItem(b: Battle, u: Unit): void {
  const item = u.items.shift();
  if (!item) return;
  const amount = Math.min(u.maxHp - u.hp, Math.max(1, Math.round(u.maxHp * ITEM_HEAL_PCT[item])));
  u.hp += amount;
  b.log.push({ t: "heal", turn: b.turn, unit: u.id, amount, source: "item" });
}

// Fort heal and burn ticks for one team, at the start of its phase.
export function startOfPhase(b: Battle, team: Team): void {
  for (const u of aliveOf(b, team)) {
    const info = TERRAIN[terrainAt(b, u.pos)];
    if (info.healPct > 0 && u.hp < u.maxHp) {
      const pct = info.healPct * (u.subskill === Subskill.Bulwark ? BULWARK_MULT : 1);
      const amount = Math.min(u.maxHp - u.hp, Math.max(1, Math.round(u.maxHp * pct)));
      u.hp += amount;
      b.log.push({ t: "heal", turn: b.turn, unit: u.id, amount, source: "fort" });
    }
    if (u.burnTurns > 0) {
      const dmg = Math.max(1, Math.round(u.maxHp * BURN_DOT_PCT));
      u.burnTurns -= 1;
      b.log.push({ t: "burn", turn: b.turn, unit: u.id, damage: dmg });
      applyDamage(b, u, dmg, null, false);
    }
  }
}
