# Training Grounds — Python agents (PLAN §10)

## Setup

```bash
cd agents
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # MONGODB_URI required; Luminal vars when using --coach llm
```

## Environment (Luminal)

All LLM access is via the OpenAI-compatible client in `llm.py`. When you get a key, only `.env` changes:

| Variable | Purpose |
|----------|---------|
| `LUMINAL_BASE_URL` | Luminal Cloud API base URL |
| `LUMINAL_API_KEY` | API key |
| `LUMINAL_MODEL` | Optional default for both agents |
| `LUMINAL_COACH_MODEL` | Coach (default: `LUMINAL_MODEL` or `deepseek-chat`) |
| `LUMINAL_QM_MODEL` | Quartermaster (default: `LUMINAL_MODEL` or `glm-4-flash`) |

## Commands

```bash
# Smoke test: fake battles + persona mutate (no API, no game runner)
python loop.py --fake-runner --coach mutate --generations 2 --heldout

# Ablation run (tg-mutate): game --init first, then 6–10 gens, both conditions
python loop.py --run-id tg-mutate --no-seed-gen0 --coach mutate --condition full --generations 8
python loop.py --run-id tg-mutate --no-seed-gen0 --coach mutate --condition frozen_stats --generations 8

# Luminal Coach + QM (needs LUMINAL_* in .env)
python loop.py --run-id tg1 --no-seed-gen0 --coach llm --condition full --generations 6

# Legacy: --skip-llm is the same as --coach mutate
python loop.py --run-id demo1 --no-seed-gen0 --generations 1 --skip-llm

# Charts + held-out table
python report.py --run-id tg-mutate --out-dir output
```

### Coach modes

| `--coach` | API | Behavior |
|-----------|-----|----------|
| `llm` | Yes | Luminal JSON coach + QM shop |
| `mutate` | No | Each persona mutates 1–3 parent fields (seeded RNG); best-of-4 selection unchanged |
| `copy` | No | Parent playbook unchanged (debug only) |

## Modules

| File | PLAN |
|------|------|
| `schemas.py` | §5.1–5.2, §11 |
| `db.py` | §5.3, §7.4, fake-runner battles |
| `llm.py` | §7.1 |
| `coach.py` | §7.2 |
| `coach_mutate.py` | Ablation / no-key mutate coach |
| `quartermaster.py` | §7.3, §11 |
| `loop.py` | §5.6, §8 |
| `report.py` | §9 |
