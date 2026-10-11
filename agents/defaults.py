"""Generation 0 baseline (PLAN §8) — hand-written playbook and party."""

from __future__ import annotations

from schemas import Party, Playbook, Unit

# §5.1 default tactics for baseline measurements.
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

# §5.2 + §11: four infantry, cost 24, no shop spend on gen0.
DEFAULT_PARTY = Party(
    units=[
        Unit(
            id="u1",
            class_="Infantry",
            weapon="Sword",
            attribute="Fire",
            level=5,
            exp=0,
            star=2,
            promotion=None,
            subskill=None,
            items=[],
        ),
        Unit(
            id="u2",
            class_="Infantry",
            weapon="Axe",
            attribute="Water",
            level=5,
            exp=0,
            star=2,
            promotion=None,
            subskill=None,
            items=[],
        ),
        Unit(
            id="u3",
            class_="Infantry",
            weapon="Lance",
            attribute="Electric",
            level=5,
            exp=0,
            star=2,
            promotion=None,
            subskill=None,
            items=[],
        ),
        Unit(
            id="u4",
            class_="Infantry",
            weapon="Sword",
            attribute="Water",
            level=5,
            exp=0,
            star=2,
            promotion=None,
            subskill=None,
            items=[],
        ),
    ],
    cost=24,
    gold_spent=0,
)

# Training grid (align with game runner when implemented).
TRAIN_MAPS = ["train_01", "train_02", "train_03", "train_04", "train_05"]
TRAIN_NPCS = ["aggressive", "defensive", "balanced", "mage_focus"]
TRAIN_SEEDS = [101, 202, 303, 404]

HELDOUT_MAPS = ["heldout_01", "heldout_02"]
HELDOUT_NPC = "ambusher"
HELDOUT_SEEDS = [9001, 9002, 9003, 9004]

SHOP_BUDGET = 300
