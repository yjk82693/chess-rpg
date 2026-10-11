"""Pydantic models for shared contract PLAN §5.1, §5.2, §11."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Condition = Literal["full", "frozen_stats"]
Split = Literal["train", "heldout"]
GenerationStatus = Literal["pending", "running", "done"]


class Formation(str, Enum):
    front_armored = "front_armored"
    spread = "spread"
    wedge = "wedge"
    turtle = "turtle"


class TargetPriority(str, Enum):
    mage = "mage"
    lowest_hp = "lowest_hp"
    triangle_advantage = "triangle_advantage"
    nearest = "nearest"
    highest_atk = "highest_atk"


class ItemId(str, Enum):
    vulnerary = "vulnerary"
    elixir = "elixir"
    salve = "salve"


class Playbook(BaseModel):
    formation: Formation
    advance_turn: Annotated[int, Field(ge=0, le=5)]
    target_priority: Annotated[list[TargetPriority], Field(min_length=1, max_length=4)]
    focus_fire: bool
    terrain_prefs: dict[Literal["forest", "fort"], Annotated[float, Field(ge=0, le=1)]]
    retreat_hp_threshold: Annotated[float, Field(ge=0, le=0.9)]
    use_fire_on_forest: bool
    avoid_triangle_disadvantage: bool

    @field_validator("terrain_prefs")
    @classmethod
    def terrain_keys(cls, v: dict) -> dict:
        if set(v.keys()) != {"forest", "fort"}:
            raise ValueError("terrain_prefs must include forest and fort")
        return v


class Unit(BaseModel):
    id: str
    class_: str = Field(alias="class")
    weapon: str
    attribute: str
    level: int = Field(ge=1)
    exp: int = Field(ge=0)
    star: int = Field(ge=1, le=5)
    promotion: Optional[str] = None
    subskill: Optional[str] = None
    items: list[ItemId] = Field(default_factory=list, max_length=2)

    model_config = {"populate_by_name": True}


class Party(BaseModel):
    units: list[Unit]
    cost: Annotated[int, Field(le=30)]
    gold_spent: Annotated[int, Field(ge=0)] = 0

    @model_validator(mode="after")
    def check_cost(self) -> Party:
        computed = sum(u.star * 3 for u in self.units)
        if self.cost != computed:
            # Allow explicit cost field from QM; warn by clamping validation only on cap.
            if computed > 30:
                raise ValueError("party star cost exceeds 30")
        if self.gold_spent > 300:
            raise ValueError("gold_spent exceeds 300 budget (§11)")
        return self


class CoachProposal(BaseModel):
    """LLM output: playbook fields plus rationale stored on playbooks doc."""

    formation: Formation
    advance_turn: Annotated[int, Field(ge=0, le=5)]
    target_priority: Annotated[list[TargetPriority], Field(min_length=1, max_length=4)]
    focus_fire: bool
    terrain_prefs: dict[Literal["forest", "fort"], Annotated[float, Field(ge=0, le=1)]]
    retreat_hp_threshold: Annotated[float, Field(ge=0, le=0.9)]
    use_fire_on_forest: bool
    avoid_triangle_disadvantage: bool
    rationale: str = Field(min_length=1)

    def to_playbook(self) -> Playbook:
        return Playbook(
            formation=self.formation,
            advance_turn=self.advance_turn,
            target_priority=self.target_priority,
            focus_fire=self.focus_fire,
            terrain_prefs=self.terrain_prefs,
            retreat_hp_threshold=self.retreat_hp_threshold,
            use_fire_on_forest=self.use_fire_on_forest,
            avoid_triangle_disadvantage=self.avoid_triangle_disadvantage,
        )


def party_for_frozen_stats(base: Party) -> Party:
    """§11: frozen_stats — one vulnerary per unit, shop skipped."""
    units = []
    for u in base.units:
        copy = u.model_copy(deep=True)
        copy.items = [ItemId.vulnerary]
        units.append(copy)
    return Party(units=units, cost=base.cost, gold_spent=0)
