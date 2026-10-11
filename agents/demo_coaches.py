#!/usr/bin/env python3
"""Demo / video: four parallel coaches with rationales on stdout.

Example (Luminal, ~30s, no Mongo writes):
  cd agents && python3 demo_coaches.py --run-id tg1 --generation 1

Quick test without API:
  python3 demo_coaches.py --run-id tg1 --generation 1 --coach mutate
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from bson import ObjectId

from coach import CoachMode, load_playbook_doc, run_coaches_parallel_verbose
from db import ensure_indexes, get_db, get_generation_doc


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verbose parallel Coach demo for hackathon video"
    )
    parser.add_argument("--run-id", default="tg1", help="Existing run (e.g. tg1)")
    parser.add_argument(
        "--generation",
        type=int,
        default=1,
        help="Generation to propose (uses parent gen N-1 playbook)",
    )
    parser.add_argument("--condition", choices=["full", "frozen_stats"], default="full")
    parser.add_argument(
        "--coach",
        choices=["llm", "mutate"],
        default="llm",
        help="llm = Luminal; mutate = instant, no API",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write playbooks to MongoDB (default: dry-run)",
    )
    args = parser.parse_args()

    gen = args.generation
    if gen < 1:
        raise SystemExit("--generation must be >= 1")

    db = get_db()
    ensure_indexes(db)

    parent_doc = get_generation_doc(db, args.run_id, gen - 1, args.condition)
    if not parent_doc or not parent_doc.get("best_playbook_id"):
        raise SystemExit(f"parent generation {gen - 1} missing or has no best_playbook_id")

    parent_id = parent_doc["best_playbook_id"]
    if isinstance(parent_id, str):
        parent_id = ObjectId(parent_id)

    parent_pb = load_playbook_doc(db, parent_id)
    parent_wr = float(parent_doc.get("win_rate") or 0)
    parent_as = float(parent_doc.get("avg_score") or 0)

    asyncio.run(
        run_coaches_parallel_verbose(
            db,
            run_id=args.run_id,
            generation=gen,
            condition=args.condition,
            parent_playbook=parent_pb,
            parent_id=parent_id,
            parent_win_rate=parent_wr,
            parent_avg_score=parent_as,
            coach_mode=args.coach,
            write=args.write,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
