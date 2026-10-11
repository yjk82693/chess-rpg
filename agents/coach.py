"""Parallel persona coaches (PLAN §7.2)."""

from __future__ import annotations

import asyncio
import time
from typing import Any, List, Literal, Optional

CoachMode = Literal["llm", "mutate", "copy"]

from bson import ObjectId
from pymongo.database import Database

from db import (
    coach_battle_context_rows,
    insert_playbook,
    recent_playbooks_with_scores,
    win_rates_by_map_and_npc,
    worst_train_battles,
)
from coach_mutate import mutate_proposal
from defaults import DEFAULT_PLAYBOOK
from llm import call_with_retry_and_fallback, coach_model_name
from schemas import CoachProposal, Condition, Playbook

PERSONAS: dict[str, str] = {
    "Aggressor": "Favor faster advance_turn, focus_fire true, and early kill priorities (mage, highest_atk).",
    "Warden": "Favor turtle/front_armored, fort terrain_prefs, higher retreat_hp_threshold.",
    "Terrain Tactician": "Favor forest terrain_prefs and use_fire_on_forest when evidence supports it.",
    "Analyst": "Change at most 3 fields that battle summaries most clearly blame for losses.",
}

RULES_SHORT = """
8x8 grid, 4v5, max 10 turns. Rout all enemies or higher HP ratio at turn 10.
Terrain: plain, forest (evade), fort (heal), water (Winged only).
Weapon triangle Sword>Axe>Lance>Sword x1.2/x0.8. Attributes Fire/Water/Electric.
"""

PLAYBOOK_SCHEMA_TEXT = """
formation: front_armored | spread | wedge | turtle
advance_turn: 0-5
target_priority: ordered 1-4 from mage | lowest_hp | triangle_advantage | nearest | highest_atk
focus_fire: boolean
terrain_prefs: { forest: 0-1, fort: 0-1 }
retreat_hp_threshold: 0-0.9
use_fire_on_forest: boolean
avoid_triangle_disadvantage: boolean
Plus required string field rationale (one sentence).
Change at most 3 fields from parent.
"""


def _fallback_proposal(parent: Playbook, persona: str) -> CoachProposal:
    data = parent.model_dump()
    data["rationale"] = f"{persona} fallback: kept parent playbook after LLM/validation failure."
    return CoachProposal.model_validate(data)


def build_coach_user_payload(
    db: Database,
    run_id: str,
    generation: int,
    condition: Condition,
    parent_playbook: Playbook,
    parent_playbook_id: ObjectId,
    parent_win_rate: float,
    parent_avg_score: float,
) -> str:
    map_rates, npc_rates = win_rates_by_map_and_npc(
        db, run_id, generation - 1, condition, parent_playbook_id
    )
    worst = worst_train_battles(
        db, run_id, generation - 1, condition, parent_playbook_id, limit=5
    )
    battle_notes = coach_battle_context_rows(worst)
    history = recent_playbooks_with_scores(db, run_id, condition, generation - 1, limit=3)
    return (
        f"Parent playbook JSON:\n{parent_playbook.model_dump_json()}\n\n"
        f"Parent metrics: win_rate={parent_win_rate:.3f} avg_score={parent_avg_score:.3f}\n"
        f"Win rate by map_id: {map_rates}\n"
        f"Win rate by npc_id: {npc_rates}\n"
        f"Worst train battles (use summary.notes for evidence):\n{battle_notes}\n"
        f"Last generations best playbooks:\n{history}\n"
    )


async def _produce_coach_proposal(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    persona: str,
    persona_hint: str,
    parent: Playbook,
    parent_id: ObjectId,
    parent_win_rate: float,
    parent_avg_score: float,
    coach_mode: CoachMode,
) -> CoachProposal:
    system = (
        f"You are {persona}, a tactics coach for a turn-based grid SRPG. "
        "Improve the playbook so it wins more often. Output ONLY JSON matching the schema. "
        "Change at most 3 fields from the parent. Include a one-sentence rationale."
        f" Style hint: {persona_hint}"
    )
    user = (
        f"{RULES_SHORT}\nSchema:\n{PLAYBOOK_SCHEMA_TEXT}\n\n"
        + build_coach_user_payload(
            db,
            run_id,
            generation,
            condition,
            parent,
            parent_id,
            parent_win_rate,
            parent_avg_score,
        )
    )
    fallback = _fallback_proposal(parent, persona)
    if coach_mode == "llm":
        return await asyncio.to_thread(
            call_with_retry_and_fallback,
            model=coach_model_name(),
            system=system,
            user=user,
            temperature=0.7,
            schema=CoachProposal,
            fallback=fallback,
        )
    if coach_mode == "mutate":
        return mutate_proposal(
            parent,
            persona,
            run_id=run_id,
            generation=generation,
        )
    return fallback


async def _one_coach(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    persona: str,
    persona_hint: str,
    parent: Playbook,
    parent_id: ObjectId,
    parent_win_rate: float,
    parent_avg_score: float,
    coach_mode: CoachMode,
) -> ObjectId:
    proposal = await _produce_coach_proposal(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        persona=persona,
        persona_hint=persona_hint,
        parent=parent,
        parent_id=parent_id,
        parent_win_rate=parent_win_rate,
        parent_avg_score=parent_avg_score,
        coach_mode=coach_mode,
    )
    return insert_playbook(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        persona=persona,
        playbook=proposal.to_playbook(),
        rationale=proposal.rationale,
        parent_id=parent_id,
    )


async def _one_coach_timed(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    persona: str,
    persona_hint: str,
    parent: Playbook,
    parent_id: ObjectId,
    parent_win_rate: float,
    parent_avg_score: float,
    coach_mode: CoachMode,
    insert: bool,
) -> tuple[Optional[ObjectId], float]:
    """Run one coach; return (playbook_id or None, seconds)."""
    t0 = time.monotonic()
    playbook_id = await _one_coach(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        persona=persona,
        persona_hint=persona_hint,
        parent=parent,
        parent_id=parent_id,
        parent_win_rate=parent_win_rate,
        parent_avg_score=parent_avg_score,
        coach_mode=coach_mode,
    ) if insert else None
    if not insert:
        await _produce_coach_proposal(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            persona=persona,
            persona_hint=persona_hint,
            parent=parent,
            parent_id=parent_id,
            parent_win_rate=parent_win_rate,
            parent_avg_score=parent_avg_score,
            coach_mode=coach_mode,
        )
    elapsed = time.monotonic() - t0
    if insert:
        return playbook_id, elapsed
    return None, elapsed


async def run_coaches_parallel(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    parent_playbook: Playbook,
    parent_id: ObjectId,
    parent_win_rate: float,
    parent_avg_score: float,
    coach_mode: CoachMode = "llm",
    personas: Optional[List[str]] = None,
) -> List[ObjectId]:
    names = personas or list(PERSONAS.keys())
    wall_t0 = time.monotonic()
    tasks = [
        _one_coach_timed(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            persona=name,
            persona_hint=PERSONAS[name],
            parent=parent_playbook,
            parent_id=parent_id,
            parent_win_rate=parent_win_rate,
            parent_avg_score=parent_avg_score,
            coach_mode=coach_mode,
            insert=True,
        )
        for name in names
    ]
    timed = await asyncio.gather(*tasks)
    wall = time.monotonic() - wall_t0
    ids = [t[0] for t in timed if t[0] is not None]
    per = {names[i]: timed[i][1] for i in range(len(names))}
    global _last_parallel_timing
    _last_parallel_timing = {
        "run_id": run_id,
        "generation": generation,
        "condition": condition,
        "coach_mode": coach_mode,
        "wall_seconds": wall,
        "per_persona_seconds": per,
        "sum_persona_seconds": sum(per.values()),
        "speedup_vs_sequential": sum(per.values()) / wall if wall > 0 else 0.0,
    }
    return ids


_last_parallel_timing: dict[str, Any] | None = None


def get_last_parallel_coach_timing() -> dict[str, Any] | None:
    return _last_parallel_timing


async def benchmark_coaches_parallel(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    parent_playbook: Playbook,
    parent_id: ObjectId,
    parent_win_rate: float,
    parent_avg_score: float,
    coach_mode: CoachMode = "llm",
    personas: Optional[List[str]] = None,
) -> dict[str, Any]:
    """Dry-run 4 coaches in parallel; no new playbooks written."""
    names = personas or list(PERSONAS.keys())
    wall_t0 = time.monotonic()
    tasks = [
        _one_coach_timed(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            persona=name,
            persona_hint=PERSONAS[name],
            parent=parent_playbook,
            parent_id=parent_id,
            parent_win_rate=parent_win_rate,
            parent_avg_score=parent_avg_score,
            coach_mode=coach_mode,
            insert=False,
        )
        for name in names
    ]
    timed = await asyncio.gather(*tasks)
    wall = time.monotonic() - wall_t0
    per = {names[i]: timed[i][1] for i in range(len(names))}
    return {
        "run_id": run_id,
        "generation": generation,
        "condition": condition,
        "coach_mode": coach_mode,
        "dry_run": True,
        "wall_seconds": wall,
        "per_persona_seconds": per,
        "sum_persona_seconds": sum(per.values()),
        "speedup_vs_sequential": sum(per.values()) / wall if wall > 0 else 0.0,
    }


async def _one_coach_verbose(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    persona: str,
    persona_hint: str,
    parent: Playbook,
    parent_id: ObjectId,
    parent_win_rate: float,
    parent_avg_score: float,
    coach_mode: CoachMode,
    write: bool,
) -> float:
    print(f"[Coach] ▶ {persona} …", flush=True)
    t0 = time.monotonic()
    proposal = await _produce_coach_proposal(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        persona=persona,
        persona_hint=persona_hint,
        parent=parent,
        parent_id=parent_id,
        parent_win_rate=parent_win_rate,
        parent_avg_score=parent_avg_score,
        coach_mode=coach_mode,
    )
    elapsed = time.monotonic() - t0
    print(f"[Coach] ✓ {persona} ({elapsed:.1f}s)", flush=True)
    print(f"       {proposal.rationale}", flush=True)
    if write:
        insert_playbook(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            persona=persona,
            playbook=proposal.to_playbook(),
            rationale=proposal.rationale,
            parent_id=parent_id,
        )
    return elapsed


async def run_coaches_parallel_verbose(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    parent_playbook: Playbook,
    parent_id: ObjectId,
    parent_win_rate: float,
    parent_avg_score: float,
    coach_mode: CoachMode = "llm",
    personas: Optional[List[str]] = None,
    write: bool = False,
) -> None:
    """Print each persona and rationale as they finish (for demo video)."""
    names = personas or list(PERSONAS.keys())
    print("=" * 60, flush=True)
    print(f"Training Grounds · {len(names)} Coach personas in parallel", flush=True)
    print(
        f"run_id={run_id}  generation={generation}  condition={condition}  coach={coach_mode}",
        flush=True,
    )
    print(
        f"parent metrics: win_rate={parent_win_rate:.1%}  avg_score={parent_avg_score:.3f}",
        flush=True,
    )
    print("=" * 60, flush=True)
    wall_t0 = time.monotonic()
    tasks = [
        _one_coach_verbose(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            persona=name,
            persona_hint=PERSONAS[name],
            parent=parent_playbook,
            parent_id=parent_id,
            parent_win_rate=parent_win_rate,
            parent_avg_score=parent_avg_score,
            coach_mode=coach_mode,
            write=write,
        )
        for name in names
    ]
    per_persona = await asyncio.gather(*tasks)
    wall = time.monotonic() - wall_t0
    total = sum(per_persona)
    print("-" * 60, flush=True)
    print(
        f"[Coach] All done · wall {wall:.1f}s parallel "
        f"(~{total:.1f}s if run one-by-one)",
        flush=True,
    )
    if write:
        print("[Coach] Playbooks saved to MongoDB.", flush=True)
    else:
        print("[Coach] Dry-run only — no MongoDB writes.", flush=True)


def load_playbook_doc(db: Database, playbook_id: ObjectId) -> Playbook:
    from db import playbooks

    doc = playbooks(db).find_one({"_id": playbook_id})
    if not doc:
        return DEFAULT_PLAYBOOK
    return Playbook.model_validate(doc["playbook"])
