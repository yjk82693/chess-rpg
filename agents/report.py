#!/usr/bin/env python3
"""Charts and tables for PLAN §9."""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
from pymongo.database import Database

from db import aggregate_candidate_scores, ensure_indexes, get_db, get_generation_doc


def load_generation_series(db: Database, run_id: str, condition: str) -> list[dict]:
    return list(
        db.generations.find(
            {"run_id": run_id, "condition": condition, "status": "done"}
        ).sort("generation", 1)
    )


def plot_run(db: Database, run_id: str, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for condition, color in [("full", "tab:blue"), ("frozen_stats", "tab:orange")]:
        rows = load_generation_series(db, run_id, condition)
        if not rows:
            continue
        gens = [r["generation"] for r in rows]
        wr = [float(r.get("win_rate") or 0) for r in rows]
        sc = [float(r.get("avg_score") or 0) for r in rows]
        fig, ax = plt.subplots(1, 2, figsize=(10, 4))
        ax[0].plot(gens, wr, marker="o", color=color, label=condition)
        ax[0].set_title("Win rate by generation")
        ax[0].set_xlabel("generation")
        ax[0].legend()
        ax[1].plot(gens, sc, marker="o", color=color, label=condition)
        ax[1].set_title("Avg score by generation")
        ax[1].set_xlabel("generation")
        ax[1].legend()
        fig.suptitle(f"{run_id} — {condition}")
        fig.tight_layout()
        fig.savefig(out_dir / f"chart_{condition}.png")
        plt.close(fig)

    # Combined overlay if both exist
    fig, ax = plt.subplots(figsize=(8, 5))
    for condition, color in [("full", "tab:blue"), ("frozen_stats", "tab:orange")]:
        rows = load_generation_series(db, run_id, condition)
        if not rows:
            continue
        gens = [r["generation"] for r in rows]
        sc = [float(r.get("avg_score") or 0) for r in rows]
        ax.plot(gens, sc, marker="o", color=color, label=condition)
    ax.set_title("Avg score: full vs frozen_stats")
    ax.set_xlabel("generation")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out_dir / "chart_combined.png")
    plt.close(fig)


def heldout_table(db: Database, run_id: str, condition: str) -> str:
    gen0 = get_generation_doc(db, run_id, 0, condition)
    if not gen0:
        return "no gen0"
    last = db.generations.find_one(
        {"run_id": run_id, "condition": condition, "status": "done"},
        sort=[("generation", -1)],
    )
    if not last:
        return "no final generation"
    lines = ["held-out (split=heldout) baseline vs final", "-" * 40]

    def _heldout_metrics(gen_doc: dict) -> tuple[float, float, int]:
        ho = gen_doc.get("heldout")
        if ho:
            return (
                float(ho.get("win_rate") or 0),
                float(ho.get("avg_score") or 0),
                int(ho.get("n_battles") or 0),
            )
        pb = gen_doc.get("best_playbook_id")
        if not pb:
            return 0.0, 0.0, 0
        agg = aggregate_candidate_scores(
            db, run_id, gen_doc["generation"], condition, [pb], split="heldout"
        ).get(pb, {})
        return (
            float(agg.get("win_rate") or 0),
            float(agg.get("avg_score") or 0),
            int(agg.get("n_battles") or 0),
        )

    for label, gen_doc in [("baseline", gen0), ("final", last)]:
        wr, sc, n = _heldout_metrics(gen_doc)
        lines.append(
            f"{label} gen={gen_doc['generation']} win_rate={wr:.3f} avg_score={sc:.3f} n={n}"
        )
    return "\n".join(lines)


def print_lineage(db: Database, run_id: str, condition: str) -> None:
    print(f"\nPlaybook lineage ({condition}):")
    for pb in db.playbooks.find({"run_id": run_id, "condition": condition}).sort(
        [("generation", 1), ("persona", 1)]
    ):
        print(
            f"  gen={pb['generation']} persona={pb.get('persona')} "
            f"rationale={pb.get('rationale', '')[:120]}"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--out-dir", default="agents/output")
    parser.add_argument("--condition", default="full")
    args = parser.parse_args()

    db = get_db()
    ensure_indexes(db)
    out = Path(args.out_dir)
    plot_run(db, args.run_id, out)
    print(heldout_table(db, args.run_id, args.condition))
    print_lineage(db, args.run_id, args.condition)
    print(f"charts saved under {out.resolve()}")


if __name__ == "__main__":
    main()
