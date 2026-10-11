# Training Grounds — Python agents (PLAN §10)

## Setup

```bash
cd agents
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # set MONGODB_URI (Atlas) and LUMINAL_*
```

## Commands

```bash
# Smoke test without Luminal or TS runner
python loop.py --fake-runner --skip-llm --generations 2 --heldout

# Existing run (e.g. demo1) — do not recreate gen0
python loop.py --run-id demo1 --no-seed-gen0 --generations 1 --skip-llm

# Production handshake (needs game runner + API keys)
python loop.py --run-id tg-my-run --condition full --generations 6

# Charts + held-out table
python report.py --run-id tg-my-run --out-dir output
```

## Modules

| File | PLAN |
|------|------|
| `schemas.py` | §5.1–5.2, §11 |
| `db.py` | §5.3, §7.4, fake-runner battles |
| `llm.py` | §7.1 |
| `coach.py` | §7.2 |
| `quartermaster.py` | §7.3, §11 |
| `loop.py` | §5.6, §8 |
| `report.py` | §9 |
