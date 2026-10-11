#!/usr/bin/env python3
"""Generation handshake loop (PLAN §5.6, §8)."""

from __future__ import annotations

import argparse
import asyncio
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from coach import CoachMode, load_playbook_doc, run_coaches_parallel
from db import (
    assert_runner_finished,
    ensure_indexes,
    get_db,
    get_generation_doc,
    insert_party,
    insert_playbook,
    run_fake_runner_for_generation,
    upsert_generation,
    write_fake_battles,
)
from defaults import (
    DEFAULT_PARTY,
    DEFAULT_PLAYBOOK,
    HELDOUT_EVAL_NPCS,
    HELDOUT_MAPS,
    HELDOUT_SEEDS,
)
from quartermaster import party_from_previous_generation, run_quartermaster
from schemas import Condition, Split, party_for_frozen_stats

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


def invoke_ts_runner(
    run_id: str,
    generation: int,
    condition: Condition,
    split: Split = "train",
) -> None:
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
        "--split",
        split,
    ]
    result = subprocess.run(cmd, cwd=REPO_ROOT, check=False)
    if result.returncode != 0:
        raise SystemExit(f"npm runner exited with code {result.returncode}")


def run_eval_step(
    db,
    run_id: str,
    generation: int,
    condition: Condition,
    fake_runner: bool,
    split: Split = "train",
) -> dict:
    gen = get_generation_doc(db, run_id, generation, condition)
    if not gen:
        raise SystemExit(f"generation {generation} missing")
    if fake_runner:
        if split != "train":
            raise SystemExit("fake-runner only supports train split; use TS runner for heldout")
        run_fake_runner_for_generation(db, run_id, generation, condition)
    else:
        invoke_ts_runner(run_id, generation, condition, split=split)
    return assert_runner_finished(db, run_id, generation, condition)


def prepare_generation(
    db,
    run_id: str,
    generation: int,
    condition: Condition,
    coach_mode: CoachMode,
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
            coach_mode=coach_mode,
        )
    )

    use_qm_llm = coach_mode == "llm"
    prev_party = party_from_previous_generation(db, run_id, generation - 1, condition) or DEFAULT_PARTY
    hints = {"note": "use battle summaries and exp from prior generation"}
    if condition == "full":
        party = run_quartermaster(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            current=prev_party,
            battle_hints=hints,
            use_llm=use_qm_llm,
        )
        insert_party(db, run_id=run_id, generation=generation, condition=condition, party=party)
    # frozen_stats: no new party docs after gen 0 — runner uses latest party with gen <= N

    upsert_generation(
        db,
        run_id=run_id,
        generation=generation,
        condition=condition,
        status="pending",
        candidates=candidate_ids,
    )


def run_heldout_eval(db, run_id: str, condition: Condition, fake_runner: bool) -> None:
    """Held-out eval: TS runner --split heldout on gen 0 and final gen (PLAN §8)."""
    gen0 = get_generation_doc(db, run_id, 0, condition)
    if not gen0:
        return
    last_gen = max(
        g["generation"]
        for g in db.generations.find({"run_id": run_id, "condition": condition, "status": "done"})
    )
    from db import parties as parties_coll

    for gen in (0, last_gen):
        gen_doc = get_generation_doc(db, run_id, gen, condition)
        if not gen_doc or not gen_doc.get("candidates"):
            continue
        if fake_runner:
            party_doc = parties_coll(db).find_one(
                {"run_id": run_id, "condition": condition, "generation": {"$lte": gen}},
                sort=[("generation", -1)],
            )
            if not party_doc:
                continue
            import random

            rng = random.Random(42 + gen)
            for pid in gen_doc["candidates"]:
                write_fake_battles(
                    db,
                    run_id=run_id,
                    generation=gen,
                    condition=condition,
                    playbook_id=pid,
                    party_id=party_doc["_id"],
                    split="heldout",
                    maps=HELDOUT_MAPS,
                    npcs=HELDOUT_EVAL_NPCS,
                    seeds=HELDOUT_SEEDS,
                    rng=rng,
                )
        else:
            run_eval_step(db, run_id, gen, condition, False, split="heldout")
            ho = get_generation_doc(db, run_id, gen, condition)
            if ho and ho.get("heldout"):
                print(f"heldout gen {gen}: best win_rate={ho['heldout'].get('win_rate')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Training Grounds agent loop")
    parser.add_argument("--run-id", default=None, help="Run id (default: new tg-...)")
    parser.add_argument("--condition", choices=["full", "frozen_stats"], default="full")
    parser.add_argument("--generations", type=int, default=2, help="Max generation index to reach")
    parser.add_argument("--fake-runner", action="store_true", help="Simulate TS runner in Python")
    parser.add_argument(
        "--coach",
        choices=["llm", "mutate", "copy"],
        default="llm",
        help="Coach: Luminal LLM, persona mutate (no API), or copy parent (legacy)",
    )
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        help="Alias for --coach mutate (QM also skips LLM)",
    )
    parser.add_argument("--heldout", action="store_true", help="Run held-out eval after loop")
    parser.add_argument("--init-only", action="store_true", help="Seed gen0 and exit")
    parser.add_argument(
        "--no-seed-gen0",
        action="store_true",
        help="Do not create gen0 (use existing run e.g. demo1)",
    )
    args = parser.parse_args()

    run_id = args.run_id or new_run_id()
    condition: Condition = args.condition
    coach_mode: CoachMode = "mutate" if args.skip_llm else args.coach

    db = get_db()
    ensure_indexes(db)
    print(
        f"run_id={run_id} condition={condition} fake_runner={args.fake_runner} "
        f"coach_mode={coach_mode}"
    )

    if not args.no_seed_gen0:
        seed_generation_zero(db, run_id, condition)
    if args.init_only:
        if args.fake_runner:
            run_eval_step(db, run_id, 0, condition, True)
        print(f"init complete run_id={run_id}")
        return

    g0 = get_generation_doc(db, run_id, 0, condition)
    if not g0:
        raise SystemExit("gen 0 missing; omit --no-seed-gen0 or use --init via game runner")
    if g0.get("status") != "done":
        run_eval_step(db, run_id, 0, condition, args.fake_runner)

    for gen in range(1, args.generations + 1):
        existing = get_generation_doc(db, run_id, gen, condition)
        if existing and existing.get("status") == "done":
            continue
        if not existing:
            prepare_generation(db, run_id, gen, condition, coach_mode)
        doc = run_eval_step(db, run_id, gen, condition, args.fake_runner)
        print(
            f"gen {gen} done win_rate={doc.get('win_rate')} avg_score={doc.get('avg_score')} "
            f"best={doc.get('best_playbook_id')}"
        )

    if args.heldout:
        run_heldout_eval(db, run_id, condition, args.fake_runner)
        print("held-out eval finished (split=heldout)")

    print(f"finished run_id={run_id}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
