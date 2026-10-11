#!/usr/bin/env bash
# Demo script: MongoDB as Coach memory (PLAN §9 sponsor angle)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/agents"
RUN_ID="${1:-}"
if [[ -z "$RUN_ID" ]]; then
  python3 loop.py --fake-runner --skip-llm --generations 2 | tee /tmp/tg_demo.log
  RUN_ID=$(grep -m1 '^run_id=' /tmp/tg_demo.log | cut -d= -f2 | cut -d' ' -f1)
fi
echo "=== MongoDB role ==="
echo "1. playbooks / parties / battles / generations collections bridge Python agents and TS runner."
echo "2. Coach reads battle summaries (not raw events) queried from battles."
python3 - <<PY
from db import get_db, worst_train_battles, win_rates_by_map_and_npc
import os
run_id = os.environ.get("DEMO_RUN_ID", "$RUN_ID")
db = get_db()
g = db.generations.find_one({"run_id": run_id, "generation": 0, "status": "done"})
if g:
    pid = g["best_playbook_id"]
    print("Worst train battles (sample):", len(worst_train_battles(db, run_id, 0, g["condition"], pid, 3)))
    print("Map win rates:", win_rates_by_map_and_npc(db, run_id, 0, g["condition"], pid)[0])
PY
python3 report.py --run-id "$RUN_ID" --out-dir output/demo
