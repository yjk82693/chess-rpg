"""Persona-biased playbook mutations without LLM (ablation / no API key)."""

from __future__ import annotations

import hashlib
import random
from typing import Any, Callable

from schemas import CoachProposal, Formation, Playbook, TargetPriority

ALL_FORMATIONS = list(Formation)
ALL_TARGETS = list(TargetPriority)
MUTABLE_BOOLS = ("focus_fire", "use_fire_on_forest", "avoid_triangle_disadvantage")


def mutate_rng(run_id: str, generation: int, persona: str) -> random.Random:
    seed_bytes = hashlib.sha256(f"{run_id}:{generation}:{persona}".encode()).digest()
    seed_int = int.from_bytes(seed_bytes[:8], "big")
    return random.Random(seed_int)


def _clamp_advance(v: int, delta: int) -> int:
    return max(0, min(5, v + delta))


def _clamp_pref(v: float, delta: float) -> float:
    return round(max(0.0, min(1.0, v + delta)), 2)


def _clamp_retreat(v: float, delta: float) -> float:
    return round(max(0.0, min(0.9, v + delta)), 2)


def _pick_different(rng: random.Random, current: str, options: list[str]) -> str:
    alts = [o for o in options if o != current]
    if not alts:
        return current
    return rng.choice(alts)


def _bump_priority(
    rng: random.Random, priority: list[TargetPriority], favor: list[TargetPriority]
) -> list[TargetPriority]:
    items = list(priority)
    if not items:
        items = [TargetPriority.nearest]
    favored = [t for t in favor if t not in items]
    if favored:
        items[0] = favored[0]
    elif len(items) > 1:
        rng.shuffle(items)
    return items[:4]


def _describe_change(field: str, old: Any, new: Any) -> str:
    if old == new:
        return ""
    return f"{field} {old!r}→{new!r}"


def mutate_proposal(
    parent: Playbook,
    persona: str,
    *,
    run_id: str,
    generation: int,
) -> CoachProposal:
    rng = mutate_rng(run_id, generation, persona)
    data = parent.model_dump()
    changes: list[str] = []

    n_fields = rng.randint(1, 3)
    persona_ops: dict[str, list[Callable[[], None]]] = {
        "Aggressor": [
            lambda: _mut_advance(data, changes, rng, -1),
            lambda: _mut_focus_fire(data, changes, True),
            lambda: _mut_formation(
                data, changes, rng, [Formation.wedge, Formation.spread]
            ),
            lambda: _mut_targets(
                data,
                changes,
                rng,
                [TargetPriority.mage, TargetPriority.highest_atk, TargetPriority.lowest_hp],
            ),
        ],
        "Warden": [
            lambda: _mut_formation(
                data, changes, rng, [Formation.turtle, Formation.front_armored]
            ),
            lambda: _mut_retreat(data, changes, rng, +0.1),
            lambda: _mut_terrain(data, changes, rng, fort_delta=0.15, forest_delta=0.0),
            lambda: _mut_avoid_triangle(data, changes, True),
        ],
        "Terrain Tactician": [
            lambda: _mut_terrain(data, changes, rng, forest_delta=0.15, fort_delta=0.05),
            lambda: _mut_use_fire(data, changes, True),
            lambda: _mut_formation(data, changes, rng, [Formation.spread, Formation.turtle]),
        ],
        "Analyst": [
            lambda: _mut_analyst_random(data, changes, rng),
        ],
    }
    ops = persona_ops.get(persona, persona_ops["Analyst"])
    rng.shuffle(ops)
    applied = 0
    for op in ops:
        if applied >= n_fields:
            break
        before = data.copy()
        op()
        if data != before:
            applied += 1
    if applied == 0:
        _mut_analyst_random(data, changes, rng)

    rationale = f"{persona}: " + "; ".join(c for c in changes if c) + "."
    if rationale.endswith(": ."):
        rationale = f"{persona}: small tactical tweak on parent playbook."

    proposal = CoachProposal.model_validate({**data, "rationale": rationale})
    return proposal


def _mut_advance(data: dict, changes: list[str], rng: random.Random, bias: int) -> None:
    old = data["advance_turn"]
    delta = bias if rng.random() < 0.7 else rng.choice([-1, 1])
    new = _clamp_advance(old, delta)
    data["advance_turn"] = new
    part = _describe_change("advance_turn", old, new)
    if part:
        changes.append(part)


def _mut_focus_fire(data: dict, changes: list[str], toward: bool) -> None:
    old = data["focus_fire"]
    new = toward if old != toward else not old
    data["focus_fire"] = new
    changes.append(_describe_change("focus_fire", old, new))


def _mut_formation(
    data: dict, changes: list[str], rng: random.Random, prefer: list[Formation]
) -> None:
    old = data["formation"]
    choice = rng.choice(prefer).value
    new = _pick_different(rng, old, [f.value for f in prefer] + [f.value for f in ALL_FORMATIONS])
    if rng.random() < 0.8:
        new = choice
    data["formation"] = new
    changes.append(_describe_change("formation", old, new))


def _mut_targets(
    data: dict,
    changes: list[str],
    rng: random.Random,
    favor: list[TargetPriority],
) -> None:
    old = list(data["target_priority"])
    new = _bump_priority(rng, [TargetPriority(x) for x in old], favor)
    data["target_priority"] = [t.value for t in new]
    if old != data["target_priority"]:
        changes.append(f"target_priority {old}→{data['target_priority']}")


def _mut_retreat(data: dict, changes: list[str], rng: random.Random, delta: float) -> None:
    old = data["retreat_hp_threshold"]
    d = delta if rng.random() < 0.7 else rng.choice([-0.1, 0.1])
    new = _clamp_retreat(old, d)
    data["retreat_hp_threshold"] = new
    part = _describe_change("retreat_hp_threshold", old, new)
    if part:
        changes.append(part)


def _mut_terrain(
    data: dict,
    changes: list[str],
    rng: random.Random,
    *,
    forest_delta: float,
    fort_delta: float,
) -> None:
    prefs = dict(data["terrain_prefs"])
    old_f, old_t = prefs["forest"], prefs["fort"]
    prefs["forest"] = _clamp_pref(old_f, forest_delta if rng.random() < 0.8 else rng.uniform(-0.1, 0.1))
    prefs["fort"] = _clamp_pref(old_t, fort_delta if rng.random() < 0.8 else rng.uniform(-0.1, 0.1))
    data["terrain_prefs"] = prefs
    if old_f != prefs["forest"] or old_t != prefs["fort"]:
        changes.append(f"terrain_prefs forest {old_f}→{prefs['forest']}, fort {old_t}→{prefs['fort']}")


def _mut_use_fire(data: dict, changes: list[str], toward: bool) -> None:
    old = data["use_fire_on_forest"]
    new = toward if old != toward else not old
    data["use_fire_on_forest"] = new
    changes.append(_describe_change("use_fire_on_forest", old, new))


def _mut_avoid_triangle(data: dict, changes: list[str], toward: bool) -> None:
    old = data["avoid_triangle_disadvantage"]
    new = toward if old != toward else not old
    data["avoid_triangle_disadvantage"] = new
    changes.append(_describe_change("avoid_triangle_disadvantage", old, new))


def _mut_analyst_random(data: dict, changes: list[str], rng: random.Random) -> None:
    field = rng.choice(
        [
            "advance_turn",
            "formation",
            "focus_fire",
            "retreat_hp_threshold",
            "use_fire_on_forest",
            "avoid_triangle_disadvantage",
            "terrain_prefs",
            "target_priority",
        ]
    )
    if field == "advance_turn":
        _mut_advance(data, changes, rng, rng.choice([-1, 1]))
    elif field == "formation":
        _mut_formation(data, changes, rng, ALL_FORMATIONS)
    elif field == "focus_fire":
        _mut_focus_fire(data, changes, rng.choice([True, False]))
    elif field == "retreat_hp_threshold":
        _mut_retreat(data, changes, rng, rng.choice([-0.1, 0.1]))
    elif field == "use_fire_on_forest":
        _mut_use_fire(data, changes, rng.choice([True, False]))
    elif field == "avoid_triangle_disadvantage":
        _mut_avoid_triangle(data, changes, rng.choice([True, False]))
    elif field == "terrain_prefs":
        _mut_terrain(data, changes, rng, forest_delta=0.1, fort_delta=0.1)
    else:
        _mut_targets(
            data,
            changes,
            rng,
            rng.sample(ALL_TARGETS, k=min(3, len(ALL_TARGETS))),
        )
