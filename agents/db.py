"""MongoDB helpers for PLAN §5.3 and Coach memory queries §7.4."""

from __future__ import annotations

import os
import random
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from defaults import (
    HELDOUT_EVAL_NPCS,
    HELDOUT_MAPS,
    HELDOUT_SEEDS,
    TRAIN_MAPS,
    TRAIN_NPCS,
    TRAIN_SEEDS,
)
from schemas import Condition, Party, Playbook, Split

load_dotenv()


def player_won(winner: Optional[str]) -> bool:
    """TS runner uses 'player' / 'npc'; legacy fake data may use own/enemy."""
    return winner in ("player", "own")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_db() -> Database:
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    name = os.environ.get("MONGODB_DB", "training_grounds")
    client = MongoClient(uri)
    return client[name]


def ensure_indexes(db: Database) -> None:
    db.battles.create_index(
        [
            ("run_id", ASCENDING),
            ("generation", ASCENDING),
            ("condition", ASCENDING),
            ("split", ASCENDING),
        ]
    )
    db.generations.create_index(
        [("run_id", ASCENDING), ("generation", ASCENDING), ("condition", ASCENDING)],
        unique=True,
    )


def playbooks(db: Database) -> Collection:
    return db.playbooks


def parties(db: Database) -> Collection:
    return db.parties


def battles(db: Database) -> Collection:
    return db.battles


def generations(db: Database) -> Collection:
    return db.generations


def insert_playbook(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    persona: str,
    playbook: Playbook,
    rationale: str,
    parent_id: Optional[ObjectId],
) -> ObjectId:
    doc = {
        "run_id": run_id,
        "generation": generation,
        "condition": condition,
        "persona": persona,
        "parent_id": parent_id,
        "playbook": playbook.model_dump(mode="json"),
        "rationale": rationale,
        "created_at": _utcnow(),
    }
    result = playbooks(db).insert_one(doc)
    return result.inserted_id


def units_to_mongo(units: list[dict]) -> list[dict]:
    """TS runner: missing items => one vulnerary; items: [] => no items. Omit empty lists."""
    out: list[dict] = []
    for raw in units:
        unit = dict(raw)
        if not unit.get("items"):
            unit.pop("items", None)
        out.append(unit)
    return out


def units_from_mongo(units: list[dict]) -> list[dict]:
    """Load: gen0 from game init often has no items key; avoid persisting items: []."""
    out: list[dict] = []
    for raw in units:
        unit = dict(raw)
        if not unit.get("items"):
            unit["items"] = ["vulnerary"]
        out.append(unit)
    return out


def insert_party(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    party: Party,
) -> ObjectId:
    payload = party.model_dump(mode="json", by_alias=True)
    doc = {
        "run_id": run_id,
        "generation": generation,
        "condition": condition,
        "units": units_to_mongo(payload["units"]),
        "cost": payload["cost"],
        "gold_spent": payload.get("gold_spent", 0),
    }
    result = parties(db).insert_one(doc)
    return result.inserted_id


def upsert_generation(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    status: str,
    candidates: list[ObjectId],
    best_playbook_id: Optional[ObjectId] = None,
    win_rate: Optional[float] = None,
    avg_score: Optional[float] = None,
    n_battles: Optional[int] = None,
) -> None:
    update: dict[str, Any] = {
        "run_id": run_id,
        "generation": generation,
        "condition": condition,
        "status": status,
        "candidates": candidates,
    }
    if best_playbook_id is not None:
        update["best_playbook_id"] = best_playbook_id
    if win_rate is not None:
        update["win_rate"] = win_rate
    if avg_score is not None:
        update["avg_score"] = avg_score
    if n_battles is not None:
        update["n_battles"] = n_battles
    generations(db).update_one(
        {"run_id": run_id, "generation": generation, "condition": condition},
        {"$set": update},
        upsert=True,
    )


def get_generation_doc(
    db: Database, run_id: str, generation: int, condition: Condition
) -> Optional[dict]:
    return generations(db).find_one(
        {"run_id": run_id, "generation": generation, "condition": condition}
    )


def battles_for_candidates(
    db: Database,
    run_id: str,
    generation: int,
    condition: Condition,
    playbook_ids: list[ObjectId],
    split: Split = "train",
) -> list[dict]:
    return list(
        battles(db).find(
            {
                "run_id": run_id,
                "generation": generation,
                "condition": condition,
                "playbook_id": {"$in": playbook_ids},
                "split": split,
            }
        )
    )


def aggregate_candidate_scores(
    db: Database,
    run_id: str,
    generation: int,
    condition: Condition,
    playbook_ids: list[ObjectId],
    split: Split = "train",
) -> dict[ObjectId, dict[str, float]]:
    """Return per-playbook_id win_rate and avg_score."""
    stats: dict[ObjectId, dict[str, float]] = {
        pid: {"wins": 0.0, "n": 0.0, "score_sum": 0.0} for pid in playbook_ids
    }
    for row in battles_for_candidates(
        db, run_id, generation, condition, playbook_ids, split=split
    ):
        pid = row["playbook_id"]
        if pid not in stats:
            continue
        stats[pid]["n"] += 1
        stats[pid]["score_sum"] += float(row.get("score", 0))
        if player_won(row.get("winner")):
            stats[pid]["wins"] += 1
    out: dict[ObjectId, dict[str, float]] = {}
    for pid, s in stats.items():
        n = s["n"] or 1.0
        out[pid] = {
            "win_rate": s["wins"] / n,
            "avg_score": s["score_sum"] / n,
            "n_battles": s["n"],
        }
    return out


def pick_best_playbook(
    db: Database,
    run_id: str,
    generation: int,
    condition: Condition,
    playbook_ids: list[ObjectId],
    split: Split = "train",
) -> ObjectId:
    agg = aggregate_candidate_scores(
        db, run_id, generation, condition, playbook_ids, split=split
    )
    return max(
        playbook_ids,
        key=lambda pid: (agg.get(pid, {}).get("avg_score", -1), agg.get(pid, {}).get("win_rate", 0)),
    )


def worst_train_battles(
    db: Database,
    run_id: str,
    generation: int,
    condition: Condition,
    playbook_id: ObjectId,
    limit: int = 5,
) -> list[dict]:
    cursor = (
        battles(db)
        .find(
            {
                "run_id": run_id,
                "generation": generation,
                "condition": condition,
                "playbook_id": playbook_id,
                "split": "train",
            }
        )
        .sort("score", ASCENDING)
        .limit(limit)
    )
    return list(cursor)


def win_rates_by_map_and_npc(
    db: Database,
    run_id: str,
    generation: int,
    condition: Condition,
    playbook_id: ObjectId,
) -> tuple[dict[str, float], dict[str, float]]:
    by_map: dict[str, list[float]] = {}
    by_npc: dict[str, list[float]] = {}
    for row in battles(db).find(
        {
            "run_id": run_id,
            "generation": generation,
            "condition": condition,
            "playbook_id": playbook_id,
            "split": "train",
        }
    ):
        m = row.get("map_id", "unknown")
        n = row.get("npc_id", "unknown")
        win = 1.0 if player_won(row.get("winner")) else 0.0
        by_map.setdefault(m, []).append(win)
        by_npc.setdefault(n, []).append(win)
    map_rates = {k: sum(v) / len(v) for k, v in by_map.items()}
    npc_rates = {k: sum(v) / len(v) for k, v in by_npc.items()}
    return map_rates, npc_rates


def recent_playbooks_with_scores(
    db: Database,
    run_id: str,
    condition: Condition,
    up_to_generation: int,
    limit: int = 3,
) -> list[dict]:
    gens = list(
        generations(db)
        .find(
            {
                "run_id": run_id,
                "condition": condition,
                "generation": {"$lte": up_to_generation, "$gte": 0},
                "status": "done",
            }
        )
        .sort("generation", -1)
        .limit(limit)
    )
    rows = []
    for g in gens:
        best_id = g.get("best_playbook_id")
        if not best_id:
            continue
        pb = playbooks(db).find_one({"_id": best_id})
        if not pb:
            continue
        rows.append(
            {
                "generation": g["generation"],
                "playbook": pb.get("playbook"),
                "win_rate": g.get("win_rate"),
                "avg_score": g.get("avg_score"),
                "rationale": pb.get("rationale"),
            }
        )
    return rows


def compute_score(winner: str, own_hp_ratio: float, enemy_hp_ratio: float) -> float:
    """PLAN §5.4."""
    win_part = 1.0 if player_won(winner) else 0.0
    return win_part + 0.5 * (own_hp_ratio - enemy_hp_ratio)


def coach_battle_context_rows(battle_docs: list[dict]) -> list[dict]:
    """Coach input: summary.notes and key fields (never raw events)."""
    rows = []
    for b in battle_docs:
        summary = b.get("summary") or {}
        rows.append(
            {
                "score": b.get("score"),
                "map_id": b.get("map_id"),
                "npc_id": b.get("npc_id"),
                "winner": b.get("winner"),
                "outcome": summary.get("outcome"),
                "turns": summary.get("turns"),
                "notes": summary.get("notes") or [],
            }
        )
    return rows


def assert_runner_finished(
    db: Database, run_id: str, generation: int, condition: Condition
) -> dict:
    """Verify TS runner left generation in a terminal state."""
    doc = get_generation_doc(db, run_id, generation, condition)
    if not doc:
        raise SystemExit(f"generation {generation} missing after runner")
    status = doc.get("status")
    if status == "failed":
        raise SystemExit(f"runner failed for gen {generation}: {doc.get('error')}")
    if status != "done":
        raise SystemExit(
            f"runner did not finish gen {generation} (status={status!r}); "
            "check npm output or use --fake-runner"
        )
    return doc


def _minimal_summary(winner: str, turns: int) -> dict:
    outcome = "win" if player_won(winner) else "loss"
    return {
        "outcome": outcome,
        "reason": "fake",
        "turns": turns,
        "units_lost": {"own": 0, "enemy": 0},
        "deaths": [],
        "reactions": [],
        "fort_heals": 0,
        "forest_evades": 0,
        "turning_point_turn": max(1, turns // 2),
        "notes": ["fake-runner synthetic summary for pipeline smoke test"],
    }


def write_fake_battles(
    db: Database,
    *,
    run_id: str,
    generation: int,
    condition: Condition,
    playbook_id: ObjectId,
    party_id: ObjectId,
    split: Split,
    maps: list[str],
    npcs: list[str],
    seeds: list[int],
    rng: random.Random,
) -> int:
    """Simulate runner output for local testing (PLAN §10 fake-runner)."""
    coll = battles(db)
    n = 0
    for map_id in maps:
        for npc_id in npcs:
            for seed in seeds:
                own_hp = rng.uniform(0.2, 1.0)
                enemy_hp = rng.uniform(0.0, 0.9)
                winner = "player" if own_hp >= enemy_hp else "npc"
                turns = rng.randint(3, 10)
                score = compute_score(winner, own_hp, enemy_hp)
                coll.insert_one(
                    {
                        "run_id": run_id,
                        "generation": generation,
                        "condition": condition,
                        "playbook_id": playbook_id,
                        "party_id": party_id,
                        "map_id": map_id,
                        "npc_id": npc_id,
                        "seed": seed,
                        "split": split,
                        "winner": winner,
                        "turns": turns,
                        "score": score,
                        "summary": _minimal_summary(winner, turns),
                        "events": [],
                    }
                )
                n += 1
    return n


def run_fake_runner_for_generation(
    db: Database,
    run_id: str,
    generation: int,
    condition: Condition,
) -> None:
    gen = get_generation_doc(db, run_id, generation, condition)
    if not gen:
        raise ValueError(f"generation {generation} not found")
    upsert_generation(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        status="running",
        candidates=gen["candidates"],
    )
    party = (
        parties(db)
        .find_one({"run_id": run_id, "generation": generation, "condition": condition})
    )
    if not party:
        raise ValueError("party missing for generation")
    party_id = party["_id"]
    rng = random.Random(hash((run_id, generation, condition)) & 0xFFFFFFFF)
    total = 0
    for pid in gen["candidates"]:
        total += write_fake_battles(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            playbook_id=pid,
            party_id=party_id,
            split="train",
            maps=TRAIN_MAPS,
            npcs=TRAIN_NPCS,
            seeds=TRAIN_SEEDS,
            rng=rng,
        )
    best = pick_best_playbook(
        db, run_id, generation, condition, gen["candidates"], split="train"
    )
    agg = aggregate_candidate_scores(
        db, run_id, generation, condition, gen["candidates"], split="train"
    )[best]
    upsert_generation(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        status="done",
        candidates=gen["candidates"],
        best_playbook_id=best,
        win_rate=agg["win_rate"],
        avg_score=agg["avg_score"],
        n_battles=int(agg["n_battles"]),
    )
