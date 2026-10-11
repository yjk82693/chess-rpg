# Training Grounds

**A dark-fantasy Chess RPG where AI coaches train your army, and an adaptive rival learns how to counter you.**

Built at c0mpiled-15 (Penn State, Oct 11 2026) for **Track 1A: Build a Self-Improving Agent Team (Luminal)**.

## What it does

Training Grounds combines chess-inspired units and board positioning with
Fire Emblem-style combat, hero cards, terrain, elemental reactions, and army
progression. Behind the game, four parallel LLM coaches analyze battle results
and evolve the army's strategy over generations:

1. **Coach team (4 personas in parallel):** Aggressor, Warden, Terrain
   Tactician, and Analyst each read the last generation's battle summaries and
   propose a new *playbook*: a structured strategy (formation, when to advance,
   target priorities, focus fire, terrain use, retreat threshold, elemental
   tactics).
2. **Runner:** every candidate plays 60 deterministic battles (5 maps x 3 enemy
   personalities x 4 seeds). The best candidate by average score survives.
3. **Quartermaster:** spends experience and a 300-gold budget on levels,
   promotions, and items under a party cost cap.
4. **Memory in MongoDB:** every battle is stored with a compact summary (who
   died, to what, on which terrain, which reactions fired, when the HP lead
   flipped). The Coach queries this history instead of reading raw logs.

Then we **prove the improvement is real**:

- **Frozen-stats control:** the same loop with growth disabled. If it still
  improves, the gain is strategy, not stat inflation.
- **Held-out test:** 2 maps and 1 enemy personality the agents never saw.
- **Ablation:** LLM-guided search vs. blind persona-biased mutation with the
  same candidate budget.

**Solo mode with an adaptive rival:** you can play the game yourself. Every
battle you play is summarized and saved; the rival studies your habits (which
unit carries you, whether you turtle on forts, hide in forests, or rush) and
writes a counter-playbook for the enemy army. The more you play, the better it
gets at beating *you*.

## Results

| | Train win % | Train score | Held-out win % | Held-out score |
|---|---|---|---|---|
| Gen 0 baseline | 20.0 | 0.099 | 35.2 | 0.320 |
| Hand-written reference playbook | 47.0 | 0.44 | 53.0 | 0.44 |
| LLM Coach, gen 3 (best-train rule) | 66.7 | 0.702 | 64.8 | 0.719 |
| LLM Coach, gen 8 (final) | 60.0 | 0.623 | 67.2 | 0.725 |
| Blind mutation, gen 8 (same budget) | 53.3 | 0.548 | 57.0 | 0.607 |
| Frozen stats: LLM Coach gen 4 / gen 8 | 58.3 / 58.3 | 0.608 / 0.592 | n/a | n/a |
| Frozen stats: blind mutation gen 8 | 53.3 | 0.548 | n/a | n/a |
| Hand-written reference playbook | 47% | 0.44 | 53% |

Parallel coaches: one generation's 4 persona Coaches run concurrently in about 28 s, versus about 53 s run one after another (1.9x faster), and the best of the 4 candidates beats their average every generation (see charts).

### Charts

![Train score per generation: LLM Coach vs blind mutation](shared/chart_train_tg1_vs_tg-mutate.png)
![Held-out win rate](shared/chart_heldout_bars.png)
![Parallel coaches: best-of-4 vs mean-of-4 candidate](shared/chart_parallelism_best_vs_mean.png)
![Which persona won each generation](shared/chart_parallelism_winner_persona.png)
![Parallel vs sequential coach timing](shared/chart_coach_parallel_timing.png)

Score = win (1/0) + 0.5 x (own HP ratio - enemy HP ratio).

## Architecture

```
agents/ (Python)  --playbooks, parties-->  MongoDB Atlas  <--battles + summaries--  game/ (TypeScript)
  Coach x4 personas                          playbooks                               runner.ts
  Quartermaster                              parties                                 engine + rules
  loop.py (Luminal LLMs)  <--summaries---    generations      ---candidates-->       NPC personalities
                                             battles                                 playbook executor
                                               ^      |
                              solo battles     |      |  export --watch
                                               |      v
                     server.ts (API, adaptive rival)  <-->  viewer/ (Vite + canvas)
```

- **game/**: deterministic battle engine (seeded RNG, ~15 ms per battle),
  4 scripted NPC personalities (Rusher, Turtle, Elementalist, held-out Hunter),
  playbook executor with field-by-field validation and parent fallback, battle
  summarizer, MongoDB runner, export script, API server, rule-based rival.
- **agents/**: Coach personas, Quartermaster, generation loop, reports.
  LLMs: DeepSeek / GLM Flash on Luminal Cloud via an OpenAI-compatible client.
- **viewer/**: dark fantasy UI. Training Grounds (win-rate curve, Coach
  reasoning, playbook), Gen vs Gen (two generations on the same seed, plus a
  live re-run of both on all 60 training battles in the browser), Battle Prep,
  Battle replay, and Solo Battle with an FE-style combat forecast.

## How we use MongoDB

MongoDB is the shared memory and the contract between the TypeScript game and
the Python agents; neither side imports the other's code.

- `playbooks`: every strategy ever proposed, with persona, parent, and the
  Coach's rationale (a full lineage of how the strategy evolved).
- `parties`: the army per generation (levels, promotions, items).
- `generations`: status handshake (pending, running, done, failed) plus
  per-candidate results.
- `battles`: every battle with its event log and a compact summary. The Coach
  queries summaries (worst losses, failure patterns by map and enemy). Human
  Solo battles live here too (`split: "human"`) and feed the adaptive rival.
- The viewer stays live via `export --watch`, which re-exports a run whenever a
  generation finishes.

## Run it

Requirements: Node 20+, Python 3.11+, a MongoDB URI in `.env` (see `.env.example`).

```
# game + viewer
cd game && npm install && cd ../viewer && npm install && cd ..
npm --prefix game run runner -- --dry
npm --prefix game run runner -- --init --run myrun --condition full
npx concurrently "npm --prefix game run server" "npm --prefix viewer run dev" "npm --prefix game run export -- --run myrun --watch"
# open http://localhost:5173/?run=myrun

# agents (see agents/README)
cd agents && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python loop.py --run-id myrun --no-seed-gen0 --generations 8 --coach llm
```

## Repo layout

```
game/     engine, rules, maps, NPCs, executor, runner, summary, export, API server, rival
agents/   Coach, Quartermaster, generation loop, reports (Python)
viewer/   game-style web UI (Vite + TypeScript + canvas)
shared/   PLAN.md: the shared contract between game and agents
```

## Design credit

Game rules, classes, attributes, terrain, and UI flow are adapted from Yoojun's
own SRPG design docs (the "Purifier" project): weapon triangle, magic
effectiveness by class, attribute marks and elemental reactions, fort healing,
forest evasion and burning, and the Battle Prep and battle screen layouts.
Story, nations, the boss action phase, and 5 of the 8 attributes were cut for
the hackathon.

## Team

- **Yoojun Kim**: game engine, rules, NPCs, runner, MongoDB integration, viewer, Solo mode, adaptive rival
- **Jonghun Won**: agent team (Coach personas, Quartermaster), generation loop, experiments, reports
