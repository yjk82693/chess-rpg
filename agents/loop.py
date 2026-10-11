#!/usr/bin/env python3
"""Generation handshake loop (PLAN §5.6, §8)."""

from __future__ import annotations

import argparse
import asyncio
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId

from coach import load_playbook_doc, run_coaches_parallel
from db import (
    aggregate_candidate_scores,
    ensure_indexes,
    get_db,
    get_generation_doc,
    insert_party,
    insert_playbook,
    pick_best_playbook,
    run_fake_runner_for_generation,
    upsert_generation,
    write_fake_battles,
)
from defaults import (
    DEFAULT_PARTY,
    DEFAULT_PLAYBOOK,
    HELDOUT_MAPS,
    HELDOUT_NPC,
    HELDOUT_SEEDS,
)
from quartermaster import party_from_previous_generation, run_quartermaster
from schemas import Condition, Party, party_for_frozen_stats

REPO_ROOT = Path(__file__).resolve().parents[1]


def new_run_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    suffix = hex(abs(hash(stamp)) % 0x100000000)[2:10]
    return f"tg-{stamp}-{suffix}"


def seed_generation_zero(db, run_id: str, condition: Condition) -> None:
    if get_generation_doc(db, run_id, 0, condition):
        return
    pb_id = insert_playbook(
        db,
        run_id=run_id,
        generation=0,
        condition=condition,
        persona="baseline",
        playbook=DEFAULT_PLAYBOOK,
        rationale="Hand-written generation 0 baseline (PLAN §8).",
        parent_id=None,
    )
    party = DEFAULT_PARTY
    if condition == "frozen_stats":
        party = party_for_frozen_stats(DEFAULT_PARTY)
    insert_party(db, run_id=run_id, generation=0, condition=condition, party=party)
    upsert_generation(
        db,
        run_id=run_id,
        generation=0,
        condition=condition,
        status="pending",
        candidates=[pb_id],
    )


def invoke_ts_runner(run_id: str, generation: int, condition: Condition) -> None:
    cmd = [
        "npm",
        "--prefix",
        str(REPO_ROOT / "game"),
        "run",
        "runner",
        "--",
        "--run",
        run_id,
        "--gen",
        str(generation),
        "--condition",
        condition,
    ]
    subprocess.run(cmd, cwd=REPO_ROOT, check=True)


def run_eval_step(
    db,
    run_id: str,
    generation: int,
    condition: Condition,
    fake_runner: bool,
) -> None:
    gen = get_generation_doc(db, run_id, generation, condition)
    if not gen:
        raise SystemExit(f"generation {generation} missing")
    if fake_runner:
        run_fake_runner_for_generation(db, run_id, generation, condition)
    else:
        upsert_generation(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            status="running",
            candidates=gen["candidates"],
        )
        invoke_ts_runner(run_id, generation, condition)
        refreshed = get_generation_doc(db, run_id, generation, condition)
        if not refreshed or refreshed.get("status") != "done":
            raise SystemExit(
                "TS runner did not set generation status to done; use --fake-runner for local tests."
            )


def prepare_generation(
    db,
    run_id: str,
    generation: int,
    condition: Condition,
    use_llm: bool,
) -> None:
    prev = get_generation_doc(db, run_id, generation - 1, condition)
    if not prev or prev.get("status") != "done":
        raise SystemExit(f"generation {generation - 1} must be done first")
    parent_id = prev["best_playbook_id"]
    parent_pb = load_playbook_doc(db, parent_id)
    parent_wr = float(prev.get("win_rate") or 0)
    parent_as = float(prev.get("avg_score") or 0)

    candidate_ids = asyncio.run(
        run_coaches_parallel(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            parent_playbook=parent_pb,
            parent_id=parent_id,
            parent_win_rate=parent_wr,
            parent_avg_score=parent_as,
            use_llm=use_llm,
        )
    )

    prev_party = party_from_previous_generation(db, run_id, generation - 1, condition) or DEFAULT_PARTY
    hints = {"note": "synthetic hints until TS summaries populate"}
    party = run_quartermaster(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        current=prev_party,
        battle_hints=hints,
        use_llm=use_llm and condition == "full",
    )
    if condition == "frozen_stats":
        party = party_for_frozen_stats(prev_party)
    insert_party(db, run_id=run_id, generation=generation, condition=condition, party=party)
    upsert_generation(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        status="pending",
        candidates=candidate_ids,
    )


def run_heldout_eval(db, run_id: str, condition: Condition, fake_runner: bool) -> None:
    """Baseline gen0 vs final best on held-out maps (PLAN §8)."""
    gen0 = get_generation_doc(db, run_id, 0, condition)
    if not gen0:
        return
    last_gen = max(
        g["generation"]
        for g in db.generations.find({"run_id": run_id, "condition": condition, "status": "done"})
    )
    final = get_generation_doc(db, run_id, last_gen, condition)
    if not final:
        return
    party0 = party_from_previous_generation(db, run_id, 0, condition)
    party_f = party_from_previous_generation(db, run_id, last_gen, condition)
    if not party0 or not party_f:
        return
    from db import parties as parties_coll

    p0_id = parties_coll(db).find_one(
        {"run_id": run_id, "generation": 0, "condition": condition}
    )["_id"]
    pf_id = parties_coll(db).find_one(
        {"run_id": run_id, "generation": last_gen, "condition": condition}
    )["_id"]
    import random

    rng = random.Random(42)
    for label, pb_id, party_id, gen in [
        ("baseline", gen0["best_playbook_id"], p0_id, 0),
        ("final", final["best_playbook_id"], pf_id, last_gen),
    ]:
        if fake_runner:
            write_fake_battles(
                db,
                run_id=run_id,
                generation=gen,
                condition=condition,
                playbook_id=pb_id,
                party_id=party_id,
                split="heldout",
                maps=HELDOUT_MAPS,
                npcs=[HELDOUT_NPC],
                seeds=HELDOUT_SEEDS,
                rng=rng,
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Training Grounds agent loop")
    parser.add_argument("--run-id", default=None, help="Run id (default: new tg-...)")
    parser.add_argument("--condition", choices=["full", "frozen_stats"], default="full")
    parser.add_argument("--generations", type=int, default=2, help="Max generation index to reach")
    parser.add_argument("--fake-runner", action="store_true", help="Simulate TS runner in Python")
    parser.add_argument("--skip-llm", action="store_true", help="Coach/QM fallbacks only (no API)")
    parser.add_argument("--heldout", action="store_true", help="Run held-out eval after loop")
    parser.add_argument("--init-only", action="store_true", help="Seed gen0 and exit")
    args = parser.parse_args()

    run_id = args.run_id or new_run_id()
    condition: Condition = args.condition
    use_llm = not args.skip_llm

    db = get_db()
    ensure_indexes(db)
    print(f"run_id={run_id} condition={condition} fake_runner={args.fake_runner} use_llm={use_llm}")

    seed_generation_zero(db, run_id, condition)
    if args.init_only:
        if args.fake_runner:
            run_eval_step(db, run_id, 0, condition, True)
        print(f"init complete run_id={run_id}")
        return

    g0 = get_generation_doc(db, run_id, 0, condition)
    if g0 and g0.get("status") != "done":
        run_eval_step(db, run_id, 0, condition, args.fake_runner)

    for gen in range(1, args.generations + 1):
        if get_generation_doc(db, run_id, gen, condition):
            if get_generation_doc(db, run_id, gen, condition)["status"] == "done":
                continue
        else:
            prepare_generation(db, run_id, gen, condition, use_llm)
        run_eval_step(db, run_id, gen, condition, args.fake_runner)
        doc = get_generation_doc(db, run_id, gen, condition)
        print(
            f"gen {gen} done win_rate={doc.get('win_rate')} avg_score={doc.get('avg_score')}"
        )

    if args.heldout:
        run_heldout_eval(db, run_id, condition, args.fake_runner)
        print("held-out battles written (split=heldout)")

    print(f"finished run_id={run_id}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
