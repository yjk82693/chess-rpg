#!/usr/bin/env python3
"""Charts and tables for PLAN §9 and hackathon deliverables."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any, Optional

import matplotlib.pyplot as plt
from bson import ObjectId
from pymongo.database import Database

from coach import benchmark_coaches_parallel, load_playbook_doc
from db import aggregate_candidate_scores, ensure_indexes, get_db, get_generation_doc

REFERENCE_HELDOUT_WIN_RATE = 0.53


def load_generation_series(db: Database, run_id: str, condition: str) -> list[dict]:
    return list(
        db.generations.find(
            {"run_id": run_id, "condition": condition, "status": "done"}
        ).sort("generation", 1)
    )


def heldout_metrics(gen_doc: dict) -> Optional[tuple[float, float, int]]:
    ho = gen_doc.get("heldout")
    if not ho:
        return None
    best_id = ho.get("best_playbook_id")
    for r in ho.get("results") or []:
        if best_id and r.get("playbook_id") == best_id:
            return (
                float(r.get("win_rate") or ho.get("win_rate") or 0),
                float(r.get("avg_score") or ho.get("avg_score") or 0),
                int(r.get("n") or 128),
            )
    n = int(ho.get("n_battles") or 0)
    if n > 128 and ho.get("results"):
        n = int(ho["results"][0].get("n") or 128)
    if not n:
        n = 128
    return (
        float(ho.get("win_rate") or 0),
        float(ho.get("avg_score") or 0),
        n,
    )


def train_best_and_mean(gen_doc: dict) -> tuple[Optional[float], Optional[float], Optional[str]]:
    results = gen_doc.get("results") or []
    if not results:
        wr = gen_doc.get("win_rate")
        sc = gen_doc.get("avg_score")
        persona = None
        if gen_doc.get("best_playbook_id"):
            for r in results:
                if r.get("playbook_id") == gen_doc.get("best_playbook_id"):
                    persona = r.get("persona")
                    break
        if wr is not None and sc is not None:
            return float(sc), float(sc), persona or "baseline"
        return None, None, None
    scores = [float(r.get("avg_score") or 0) for r in results]
    best_i = max(range(len(scores)), key=lambda i: scores[i])
    winner = results[best_i].get("persona") or "?"
    return max(scores), sum(scores) / len(scores), str(winner)


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
        fig.savefig(out_dir / f"chart_{run_id}_{condition}.png", dpi=120)
        plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 5))
    for condition, color in [("full", "tab:blue"), ("frozen_stats", "tab:orange")]:
        rows = load_generation_series(db, run_id, condition)
        if not rows:
            continue
        gens = [r["generation"] for r in rows]
        sc = [float(r.get("avg_score") or 0) for r in rows]
        ax.plot(gens, sc, marker="o", color=color, label=condition)
    ax.set_title(f"{run_id}: avg score full vs frozen_stats")
    ax.set_xlabel("generation")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out_dir / f"chart_{run_id}_combined.png", dpi=120)
    plt.close(fig)


def plot_train_compare(
    db: Database, run_a: str, run_b: str, condition: str, out_dir: Path
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
    for run_id, color, label in [
        (run_a, "tab:blue", run_a),
        (run_b, "tab:red", run_b),
    ]:
        rows = load_generation_series(db, run_id, condition)
        if not rows:
            continue
        gens = [r["generation"] for r in rows]
        wr = [100 * float(r.get("win_rate") or 0) for r in rows]
        sc = [float(r.get("avg_score") or 0) for r in rows]
        axes[0].plot(gens, wr, marker="o", color=color, label=label, linewidth=2)
        axes[1].plot(gens, sc, marker="o", color=color, label=label, linewidth=2)
    axes[0].set_title("Train win rate (best candidate / gen)")
    axes[0].set_xlabel("generation")
    axes[0].set_ylabel("win %")
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)
    axes[1].set_title("Train avg score (best candidate / gen)")
    axes[1].set_xlabel("generation")
    axes[1].set_ylabel("avg score")
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)
    fig.suptitle(f"LLM ({run_a}) vs mutate ({run_b}) — {condition}")
    fig.tight_layout()
    fig.savefig(out_dir / "chart_train_tg1_vs_tg-mutate.png", dpi=120)
    plt.close(fig)


def plot_heldout_bars(db: Database, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    labels: list[str] = []
    values: list[float] = []
    colors: list[str] = []

    def add(label: str, gen_doc: Optional[dict], color: str) -> None:
        if not gen_doc:
            return
        m = heldout_metrics(gen_doc)
        if not m:
            return
        labels.append(label)
        values.append(100 * m[0])
        colors.append(color)

    add("tg1 gen0", get_generation_doc(db, "tg1", 0, "full"), "#4a6fa5")
    add("tg1 gen3", get_generation_doc(db, "tg1", 3, "full"), "#2e86ab")
    add("tg1 gen8", get_generation_doc(db, "tg1", 8, "full"), "#1b4965")
    add("tg-mutate gen8", get_generation_doc(db, "tg-mutate", 8, "full"), "#c1121f")
    labels.append("reference\n(hand-written)")
    values.append(100 * REFERENCE_HELDOUT_WIN_RATE)
    colors.append("#6c757d")

    fig, ax = plt.subplots(figsize=(9, 5))
    x = range(len(labels))
    bars = ax.bar(x, values, color=colors, edgecolor="black", linewidth=0.5)
    ax.axhline(100 * REFERENCE_HELDOUT_WIN_RATE, color="#6c757d", linestyle="--", linewidth=1.5, label="reference 53%")
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, rotation=15, ha="right")
    ax.set_ylabel("held-out win rate (%)")
    ax.set_title("Held-out win rate (n=128 per bar, ±~4 pp)")
    ax.set_ylim(0, max(values + [55]) * 1.1)
    for bar, v in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 1,
            f"{v:.1f}%",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
        )
    ax.legend(loc="upper left")
    fig.tight_layout()
    fig.savefig(out_dir / "chart_heldout_bars.png", dpi=120)
    plt.close(fig)


def plot_parallelism_best_vs_mean(db: Database, run_id: str, condition: str, out_dir: Path) -> None:
    rows = load_generation_series(db, run_id, condition)
    gens: list[int] = []
    best: list[float] = []
    mean: list[float] = []
    for r in rows:
        b, m, _ = train_best_and_mean(r)
        if b is None or m is None:
            continue
        gens.append(int(r["generation"]))
        best.append(b)
        mean.append(m)
    if not gens:
        return
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(gens, best, marker="o", label="best-of-4 (train avg score)", linewidth=2)
    ax.plot(gens, mean, marker="s", linestyle="--", label="mean-of-4 (train avg score)", linewidth=2)
    ax.set_xlabel("generation")
    ax.set_ylabel("avg score")
    ax.set_title(f"{run_id}: parallel coaches — best vs mean candidate")
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_dir / "chart_parallelism_best_vs_mean.png", dpi=120)
    plt.close(fig)

    gaps = [b - m for b, m in zip(best, mean)]
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar(gens, gaps, color="tab:green", alpha=0.8)
    ax.set_xlabel("generation")
    ax.set_ylabel("best − mean (avg score)")
    ax.set_title("Gain from selecting best of 4 vs average candidate")
    fig.tight_layout()
    fig.savefig(out_dir / "chart_parallelism_best_minus_mean.png", dpi=120)
    plt.close(fig)


def plot_winner_persona_table(db: Database, run_id: str, condition: str, out_dir: Path) -> None:
    rows = load_generation_series(db, run_id, condition)
    fig, ax = plt.subplots(figsize=(8, max(3, 0.45 * len(rows) + 1)))
    ax.axis("off")
    table_data = [["Gen", "Winner persona", "Train win%", "Train score"]]
    for r in rows:
        _, _, winner = train_best_and_mean(r)
        wr = 100 * float(r.get("win_rate") or 0)
        sc = float(r.get("avg_score") or 0)
        table_data.append(
            [str(r["generation"]), winner or "—", f"{wr:.1f}", f"{sc:.3f}"]
        )
    table = ax.table(cellText=table_data, loc="center", cellLoc="center")
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1.2, 1.4)
    for (row, col), cell in table.get_celld().items():
        if row == 0:
            cell.set_facecolor("#1b4965")
            cell.set_text_props(color="white", fontweight="bold")
    ax.set_title(f"{run_id} ({condition}): winning Coach persona per generation", pad=20)
    fig.tight_layout()
    fig.savefig(out_dir / "chart_parallelism_winner_persona.png", dpi=120)
    plt.close(fig)


def plot_coach_timing(timing: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    per = timing.get("per_persona_seconds") or {}
    names = list(per.keys())
    secs = [float(per[n]) for n in names]
    wall = float(timing.get("wall_seconds") or 0)
    total = float(timing.get("sum_persona_seconds") or sum(secs))

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    axes[0].barh(names, secs, color="tab:purple", alpha=0.85)
    axes[0].set_xlabel("seconds (per persona, parallel run)")
    axes[0].set_title("Individual coach call duration")
    axes[0].axvline(wall, color="tab:red", linestyle="--", linewidth=2, label=f"wall {wall:.1f}s")
    axes[0].legend()

    axes[1].bar(
        ["parallel wall", "sum if sequential"],
        [wall, total],
        color=["tab:blue", "tab:orange"],
        edgecolor="black",
    )
    axes[1].set_ylabel("seconds")
    sp = timing.get("speedup_vs_sequential") or (total / wall if wall else 0)
    axes[1].set_title(f"4 LLM coaches (gen {timing.get('generation')}): speedup ×{sp:.2f}")
    for i, v in enumerate([wall, total]):
        axes[1].text(i, v + 0.5, f"{v:.1f}s", ha="center", fontweight="bold")
    fig.suptitle(f"Coach parallelism — {timing.get('run_id')}")
    fig.tight_layout()
    fig.savefig(out_dir / "chart_coach_parallel_timing.png", dpi=120)
    plt.close(fig)


def run_coach_timing_benchmark(
    db: Database,
    run_id: str,
    generation: int,
    condition: str,
    out_path: Path,
) -> dict[str, Any]:
    parent_gen = generation - 1
    parent_doc = get_generation_doc(db, run_id, parent_gen, condition)
    if not parent_doc or not parent_doc.get("best_playbook_id"):
        raise SystemExit(f"no parent generation {parent_gen} for benchmark")
    parent_id = parent_doc["best_playbook_id"]
    if isinstance(parent_id, str):
        parent_id = ObjectId(parent_id)
    parent_pb = load_playbook_doc(db, parent_id)
    timing = asyncio.run(
        benchmark_coaches_parallel(
            db,
            run_id=run_id,
            generation=generation,
            condition=condition,
            parent_playbook=parent_pb,
            parent_id=parent_id,
            parent_win_rate=float(parent_doc.get("win_rate") or 0),
            parent_avg_score=float(parent_doc.get("avg_score") or 0),
            coach_mode="llm",
        )
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(timing, indent=2), encoding="utf-8")
    return timing


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

    for label, gen_doc in [("baseline", gen0), ("final", last)]:
        m = heldout_metrics(gen_doc)
        if not m:
            pb = gen_doc.get("best_playbook_id")
            if not pb:
                lines.append(f"{label} gen={gen_doc['generation']}: no heldout")
                continue
            agg = aggregate_candidate_scores(
                db, run_id, gen_doc["generation"], condition, [pb], split="heldout"
            ).get(pb, {})
            wr, sc, n = (
                float(agg.get("win_rate") or 0),
                float(agg.get("avg_score") or 0),
                int(agg.get("n_battles") or 0),
            )
        else:
            wr, sc, n = m
        lines.append(
            f"{label} gen={gen_doc['generation']} win_rate={wr:.3f} avg_score={sc:.3f} n={n}"
        )
    return "\n".join(lines)


def print_results_summary(db: Database) -> str:
    lines = ["=== README Results (full condition) ===", ""]
    rows_spec = [
        ("Gen 0 baseline playbook", "tg1", 0),
        ("Best generation, full (LLM) gen3 (best train rule)", "tg1", 3),
        ("Best generation, full (LLM) gen8 (final)", "tg1", 8),
        ("Blind mutation gen8 (tg-mutate)", "tg-mutate", 8),
    ]
    lines.append("| Row | Train win% | Train score | Held-out win% | Held-out score |")
    lines.append("|-----|------------|-------------|---------------|----------------|")
    for label, run_id, gen in rows_spec:
        g = get_generation_doc(db, run_id, gen, "full")
        if not g:
            lines.append(f"| {label} | — | — | — | — |")
            continue
        tw = 100 * float(g.get("win_rate") or 0)
        ts = float(g.get("avg_score") or 0)
        ho = heldout_metrics(g)
        if ho:
            hw, hs, _ = ho
            lines.append(
                f"| {label} | {tw:.1f} | {ts:.3f} | {100*hw:.1f} | {hs:.3f} |"
            )
        else:
            lines.append(f"| {label} | {tw:.1f} | {ts:.3f} | n/a | n/a |")
    lines.append(
        f"| Hand-written reference | 47.0 | 0.44 | {100*REFERENCE_HELDOUT_WIN_RATE:.1f} | (README) |"
    )
    lines.append("")
    lines.append("frozen_stats (train only, peak gen4 tg1):")
    g4 = get_generation_doc(db, "tg1", 4, "frozen_stats")
    g8f = get_generation_doc(db, "tg1", 8, "frozen_stats")
    m8 = get_generation_doc(db, "tg-mutate", 8, "frozen_stats")
    for name, g in [("tg1 gen4", g4), ("tg1 gen8", g8f), ("tg-mutate gen8", m8)]:
        if g:
            lines.append(
                f"  {name}: train win {100*float(g.get('win_rate') or 0):.1f}% "
                f"score {float(g.get('avg_score') or 0):.3f}"
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
    parser.add_argument("--run-id", default="tg1")
    parser.add_argument("--compare-run", default="tg-mutate")
    parser.add_argument("--out-dir", default="../shared")
    parser.add_argument("--condition", default="full")
    parser.add_argument(
        "--bench-coach-generation",
        type=int,
        default=1,
        help="Dry-run 4 parallel LLM coaches for timing (no new playbooks)",
    )
    parser.add_argument(
        "--skip-bench",
        action="store_true",
        help="Never run LLM timing benchmark",
    )
    parser.add_argument(
        "--force-bench",
        action="store_true",
        help="Re-run LLM timing benchmark even if coach_timing_tg1.json exists",
    )
    parser.add_argument("--all", action="store_true", help="Full hackathon chart pack")
    args = parser.parse_args()

    db = get_db()
    ensure_indexes(db)
    out = Path(args.out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)

    if args.all or args.run_id:
        plot_run(db, args.run_id, out)
        plot_train_compare(db, args.run_id, args.compare_run, args.condition, out)
        plot_heldout_bars(db, out)
        plot_parallelism_best_vs_mean(db, args.run_id, args.condition, out)
        plot_winner_persona_table(db, args.run_id, args.condition, out)

    timing_path = out / "coach_timing_tg1.json"
    timing: Optional[dict[str, Any]] = None
    if timing_path.is_file() and not args.force_bench:
        timing = json.loads(timing_path.read_text(encoding="utf-8"))
    if not args.skip_bench and (args.force_bench or not timing_path.is_file()):
        print(
            f"Benchmarking 4 parallel LLM coaches (dry-run, gen {args.bench_coach_generation})..."
        )
        timing = run_coach_timing_benchmark(
            db,
            args.run_id,
            args.bench_coach_generation,
            args.condition,
            timing_path,
        )
        print(f"Wrote {timing_path}")
    if timing:
        plot_coach_timing(timing, out)

    print(heldout_table(db, args.run_id, args.condition))
    summary = print_results_summary(db)
    print(summary)
    print_lineage(db, args.run_id, args.condition)
    print(f"charts saved under {out}")


if __name__ == "__main__":
    main()
