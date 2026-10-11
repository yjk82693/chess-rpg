"""Generation 0 baseline and IDs aligned with game/src (runner eval sets)."""

from __future__ import annotations

from schemas import ItemId, Party, Playbook, Unit

DEFAULT_PLAYBOOK = Playbook(
    formation="spread",
    advance_turn=2,
    target_priority=["nearest", "lowest_hp"],
    focus_fire=False,
    terrain_prefs={"forest": 0.3, "fort": 0.5},
    retreat_hp_threshold=0.25,
    use_fire_on_forest=False,
    avoid_triangle_disadvantage=True,
)

# Matches game/src/parties.ts DEFAULT_PLAYER (lowercase enums for Mongo).
DEFAULT_PARTY = Party(
    units=[
        Unit(
            id="p_rook",
            class_="armored",
            weapon="lance",
            attribute="water",
            level=5,
            exp=0,
            star=1,
            promotion=0,
            subskill=None,
            items=[ItemId.vulnerary],
        ),
        Unit(
            id="p_knight",
            class_="cavalier",
            weapon="sword",
            attribute="fire",
            level=5,
            exp=0,
            star=1,
            promotion=0,
            subskill=None,
            items=[ItemId.vulnerary],
        ),
        Unit(
            id="p_bishop",
            class_="winged",
            weapon="lance",
            attribute="electric",
            level=5,
            exp=0,
            star=1,
            promotion=0,
            subskill=None,
            items=[ItemId.vulnerary],
        ),
        Unit(
            id="p_queen",
            class_="mage",
            weapon="tome",
            attribute="fire",
            level=5,
            exp=0,
            star=1,
            promotion=0,
            subskill=None,
            items=[ItemId.vulnerary],
        ),
    ],
    cost=12,
    gold_spent=200,
)

# For charts/filters only — runner picks maps/NPCs/seeds itself.
TRAIN_MAPS = [
    "open_field",
    "forest_road",
    "river_ford",
    "twin_forts",
    "mixed_valley",
]
TRAIN_NPCS = ["rusher", "turtle", "elementalist"]
TRAIN_SEEDS = [1, 2, 3, 4]

HELDOUT_MAPS = ["lake_crossing", "dense_woods"]
HELDOUT_NPCS = ["hunter"]
HELDOUT_EVAL_NPCS = TRAIN_NPCS + HELDOUT_NPCS
HELDOUT_SEEDS = list(range(101, 117))

SHOP_BUDGET = 300
