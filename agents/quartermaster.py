"""Quartermaster agent (PLAN §7.3 + §11 shop)."""

from __future__ import annotations

from typing import Optional

from pymongo.database import Database

from db import parties, units_from_mongo
from defaults import SHOP_BUDGET
from llm import call_with_retry_and_fallback, qm_model_name
from schemas import Condition, Party, party_for_frozen_stats

SHOP_TEXT = """
Item prices (budget 300 gold per generation, not carried over):
- vulnerary: 50 gold — heals 30% max HP
- elixir: 150 gold — heals 100% max HP
- salve: 40 gold — heals 15% max HP and clears burn + attribute mark
Each unit: max 2 items. Output party JSON with units (class, weapon, attribute, level, exp, star, promotion, subskill, items), cost (<=30), gold_spent.
"""

QM_SYSTEM = (
    "You manage an army's growth. Spend EXP on levels and choose promotions and subskills "
    "under party cost cap of 30. Buy and assign items within gold budget. Output ONLY JSON matching the party schema."
)


def party_from_previous_generation(
    db: Database, run_id: str, generation: int, condition: Condition
) -> Optional[Party]:
    doc = parties(db).find_one(
        {"run_id": run_id, "generation": generation, "condition": condition}
    )
    if not doc:
        return None
    return Party.model_validate(
        {
            "units": units_from_mongo(doc["units"]),
            "cost": doc["cost"],
            "gold_spent": doc.get("gold_spent", 0),
        }
    )


def run_quartermaster(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    current: Party,
    battle_hints: dict,
    use_llm: bool,
) -> Party:
    if condition == "frozen_stats":
        return party_for_frozen_stats(current)
    user = (
        f"{SHOP_TEXT}\nBudget: {SHOP_BUDGET} gold.\n"
        f"Current party:\n{current.model_dump_json(by_alias=True)}\n"
        f"Battle hints: {battle_hints}\n"
    )
    if not use_llm:
        return current
    return call_with_retry_and_fallback(
        model=qm_model_name(),
        system=QM_SYSTEM,
        user=user,
        temperature=0.2,
        schema=Party,
        fallback=current,
    )
