// parties.ts: default player party (generation 0 baseline) and NPC armies per personality.
import { Attribute, UnitClass, Weapon } from "./data.js";
import { UnitSpec } from "./state.js";

export const spec = (
  id: string, cls: UnitClass, weapon: Weapon, attribute: Attribute, level = 5, extra: Partial<UnitSpec> = {},
): UnitSpec => ({ id, class: cls, weapon, attribute, level, exp: 0, star: 1, promotion: 0, subskill: null, ...extra });

export const DEFAULT_PLAYER: UnitSpec[] = [
  spec("p_rook", UnitClass.Armored, Weapon.Lance, Attribute.Water),
  spec("p_knight", UnitClass.Cavalier, Weapon.Sword, Attribute.Fire),
  spec("p_bishop", UnitClass.Winged, Weapon.Lance, Attribute.Electric),
  spec("p_queen", UnitClass.Mage, Weapon.Tome, Attribute.Fire),
];

export const NPC_ARMIES: Record<string, UnitSpec[]> = {
  rusher: [
    spec("n_knight1", UnitClass.Cavalier, Weapon.Sword, Attribute.Fire),
    spec("n_knight2", UnitClass.Cavalier, Weapon.Lance, Attribute.Electric),
    spec("n_pawn1", UnitClass.Infantry, Weapon.Axe, Attribute.Fire),
    spec("n_pawn2", UnitClass.Infantry, Weapon.Axe, Attribute.Water),
    spec("n_bishop", UnitClass.Winged, Weapon.Sword, Attribute.Electric),
  ],
  turtle: [
    spec("n_rook1", UnitClass.Armored, Weapon.Lance, Attribute.Water),
    spec("n_rook2", UnitClass.Armored, Weapon.Axe, Attribute.Water),
    spec("n_pawn1", UnitClass.Infantry, Weapon.Sword, Attribute.Fire),
    spec("n_pawn2", UnitClass.Infantry, Weapon.Lance, Attribute.Electric),
    spec("n_queen", UnitClass.Mage, Weapon.Tome, Attribute.Water),
  ],
  elementalist: [
    spec("n_queen1", UnitClass.Mage, Weapon.Tome, Attribute.Fire),
    spec("n_queen2", UnitClass.Mage, Weapon.Tome, Attribute.Electric),
    spec("n_pawn1", UnitClass.Infantry, Weapon.Lance, Attribute.Water),
    spec("n_pawn2", UnitClass.Infantry, Weapon.Sword, Attribute.Water),
    spec("n_rook", UnitClass.Armored, Weapon.Axe, Attribute.Fire),
  ],
  hunter: [
    spec("n_bishop1", UnitClass.Winged, Weapon.Lance, Attribute.Electric),
    spec("n_bishop2", UnitClass.Winged, Weapon.Sword, Attribute.Fire),
    spec("n_queen", UnitClass.Mage, Weapon.Tome, Attribute.Electric),
    spec("n_knight", UnitClass.Cavalier, Weapon.Sword, Attribute.Water),
    spec("n_pawn", UnitClass.Infantry, Weapon.Axe, Attribute.Fire),
  ],
};
