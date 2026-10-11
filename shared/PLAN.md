# Training Grounds: Plan, Contract, and Agent Guidelines
c0mpiled-15 · Track 1A (Self-Improving Agent Team, Luminal) · Oct 11, 2026

## 1. What we're building
An AI trainer that grows an SRPG army. A team of LLM agents proposes battle
strategies (playbooks) and party builds, a TypeScript engine plays training
battles against scripted NPC armies, results go to MongoDB, and the agents learn
from them. Each generation should measurably beat the last. At the end we prove
it on maps and opponents the agents never trained on.

Pitch framing: "Training Grounds" mode. Hand your army to an AI trainer, it
spars against NPCs, you come back to a stronger army and a playbook explaining
what it learned.

## 2. What judges must see (priority order)
1. Win rate / score rising across generations (core chart).
2. Frozen-stats control: same loop with promotions disabled, playbook learning
   only. If it still improves, it's real strategy, not stat inflation.
3. Held-out test: 2 unseen maps + 1 unseen NPC personality. Baseline vs final.
4. Replay: generation 1 vs final generation on the same battle.
5. Bonus: scouting advice, Coach memory via MongoDB queries.

## 3. Roles
- Yoojun (TypeScript, /game): engine, rules, NPC AI, maps, playbook executor,
  batch runner, battle summarizer, replay viewer.
- cucu071212 (Python, /agents): Coach, Quartermaster, generation loop,
  MongoDB queries, charts, frozen-stats + held-out experiments.
- MongoDB is the bridge. Neither side imports the other's code.

## 4. Game rules (frozen at 5 PM)
- 8x8 grid, battles 4v5, max 10 turns. Win = rout all enemies; at turn 10,
  higher remaining HP ratio wins.
- Terrain: plain (none), forest (evade + SPD, burns under Fire attack = DoT),
  fort (heal 10% max HP at turn start), water (impassable, except Winged).
- Weapon triangle: Sword > Axe > Lance > Sword. Advantage x1.2, disadvantage x0.8.
- Attributes: Fire / Water / Electric with reactions (Electric Shock, Cool Fire,
  Explosion).
- Damage: physical = ATK x mods - DEF; magic = (MAG+ATK)/2 x mods - DEF.
  Max 2 attacks per exchange. Hit/evade clamped to 0-100%.
- Classes: Infantry -> Armored / Cavalier / Winged at level caps 10/20/30,
  each promotion grants one subskill. Party cost = 3 x star, cap 30.
- All randomness seeded per battle. Same inputs = same result.

## 5. Shared contract

### 5.1 Playbook (Coach output, executed by TS)
{
  "formation": "front_armored" | "spread" | "wedge" | "turtle",
  "advance_turn": 0-5,
  "target_priority": ["mage" | "lowest_hp" | "triangle_advantage" |
                      "nearest" | "highest_atk"],   (ordered, 1-4 items)
  "focus_fire": true | false,
  "terrain_prefs": { "forest": 0-1, "fort": 0-1 },
  "retreat_hp_threshold": 0-0.9,
  "use_fire_on_forest": true | false,
  "avoid_triangle_disadvantage": true | false
}
- advance_turn: turn the army stops holding position and pushes.
- focus_fire: all units hit the same target when possible.
- terrain_prefs: how strongly units seek those tiles.
- retreat_hp_threshold: fall back to fort/rear below this HP ratio.
Rule: TS rejects anything outside these enums/ranges and falls back to the
parent playbook. Python validates with pydantic before writing.

### 5.2 Party (Quartermaster output)
{ "units": [ { "id", "class", "weapon", "attribute", "level", "exp",
               "star", "promotion", "subskill" } ], "cost": <= 30 }

### 5.3 MongoDB collections
playbooks:   { _id, run_id, generation, condition, persona, parent_id,
               playbook, rationale, created_at }
parties:     { _id, run_id, generation, condition, units, cost }
battles:     { _id, run_id, generation, condition, playbook_id, party_id,
               map_id, npc_id, seed, split: "train" | "heldout",
               winner, turns, score, summary, events }
generations: { run_id, generation, condition, status: "pending" | "running" |
               "done", candidates: [playbook_id], best_playbook_id,
               win_rate, avg_score, n_battles }
condition = "full" | "frozen_stats".
Index battles on (run_id, generation, condition, split).

### 5.4 Score (smooth signal, not just win/loss)
score = (1 if win else 0) + 0.5 x (own_hp_ratio - enemy_hp_ratio)
Range roughly -0.5 to 1.5. Report win rate AND avg score.

### 5.5 Battle summary (written by TS into battles.summary)
outcome, turns, units_lost {own, enemy}, deaths [{unit, killer, terrain,
triangle_disadvantage}], reactions [{type, by, damage}], fort_heals,
forest_evades, turning_point_turn, notes[]. The Coach reads summaries, never
raw events.

### 5.6 Handshake
1. Python writes N candidate playbooks + party, sets generation status "pending".
2. Python runs:
   npm --prefix game run runner -- --run RUN_ID --gen N --condition full
3. Runner plays every candidate on all 5 train maps x NPC set x seeds,
   writes battles, sets status "done".
4. Python reads results, keeps the best candidate, starts generation N+1.

## 6. Timeline
- 12:20-12:45  Agree on section 5 together. Ask organizers: submission
               deadline/format, Luminal API key + base URL + rate limits.
- 12:45-2:00   Yoojun: engine headless, random vs random runs.
               Teammate: Luminal calls + pydantic schemas + Mongo writes
               against fake battle data.
- 2:00         Merge #1. Runner reads real playbooks from Mongo.
- 2:00-5:00    Yoojun: executor, NPC personalities, summarizer, maps.
               Teammate: generation loop end to end, Quartermaster, charts.
- 5:00         Merge #2. Rules frozen. Start the real runs.
- 5:00-7:00    Yoojun: replay viewer, sprites, menu, advice panel.
               Teammate: full run, frozen-stats run, held-out eval, charts.
- 7:00         Merge #3. Feature freeze (earlier if submission is earlier).
- Last hour    Demo script, slides, submission.

## 7. Guidelines for the agents (LLM prompts)

### 7.1 Models
DeepSeek or GLM Flash on Luminal Cloud via the openai SDK with base_url from
.env. Temperature 0.7 for Coach proposals, 0.2 for Quartermaster.
Request JSON only. Parse, validate with pydantic, retry once with the error
message, then fall back to the parent playbook. Never crash the loop.

### 7.2 Coach team (parallel; this is the "multiple agents" part of the track)
Each generation, run 3-4 Coach calls in parallel, each with a persona:
- Aggressor: faster advance, focus fire, kill priority targets early.
- Warden: formation discipline, forts, retreat thresholds, attrition.
- Terrain Tactician: forest/fort usage, fire-on-forest combos.
- Analyst (optional): changes only what the data most clearly blames.
Each proposes one playbook. The runner evaluates all; the best survives.

Coach prompt structure:
- SYSTEM: "You are {persona}, a tactics coach for a turn-based grid SRPG.
  Improve the playbook so it wins more often. Output ONLY JSON matching the
  schema. Change at most 3 fields from the parent. Include a one-sentence
  'rationale' explaining which battle evidence motivated each change."
- CONTEXT: game rules (section 4, short form), playbook schema (5.1).
- INPUT: parent playbook + its win rate and avg score; aggregate stats
  (win rate per map and per NPC); 3-5 summaries of the parent's worst train
  battles; last 3 generations' playbooks with scores.
- Never include held-out battles. Keep input short (summaries, not event
  logs). Always show the schema enums verbatim.

### 7.3 Quartermaster ("full" condition only)
SYSTEM: "You manage an army's growth. Spend EXP on levels and choose
promotions and subskills under a party cost cap of 30. Output ONLY JSON
matching the party schema." INPUT: current party, EXP earned, which unit
types died most and to what, enemy composition stats. In "frozen_stats" the
party never changes and this agent is skipped.

### 7.4 MongoDB as Coach memory
Before each Coach call, query: worst train battles of the parent; win rate by
npc_id and map_id; past playbooks with field changes and resulting score delta.
Stretch: Atlas Vector Search over battle summaries to retrieve similar past
losses and what fixed them.

## 8. Experiment protocol
- Fixed seed list for training (e.g. 4 seeds x 5 maps x NPC set). Same list
  every generation so scores are comparable.
- Generation 0 = hand-written default playbook = baseline.
- Run 6-10 generations for "full" and the same for "frozen_stats".
- Held-out eval only at the end: baseline vs final on 2 held-out maps +
  unseen NPC, new seeds. Never feed these to any agent.
- Log run_id, model name, and timestamps so every chart is reproducible.

## 9. Deliverables
- Chart: score/win rate per generation, full vs frozen_stats.
- Table: baseline vs final on held-out set.
- Playbook lineage: how the strategy evolved, with Coach rationales.
- Replay: gen 1 vs final, same seed.
- Short demo script naming MongoDB's role explicitly (sponsor prize).

## 10. Prompt for teammate's coding assistant
"I'm building the Python agent side of a hackathon project in /agents. Read
shared/PLAN.md, sections 5 and 7. Build: (1) schemas.py with pydantic models
for Playbook and Party matching sections 5.1-5.2 exactly; (2) db.py with
pymongo helpers for the four collections in 5.3; (3) llm.py calling an
OpenAI-compatible endpoint from env vars LUMINAL_BASE_URL / LUMINAL_API_KEY
with JSON-only output, validation, one retry, and fallback; (4) coach.py
running 3-4 persona coaches in parallel with asyncio as in 7.2;
(5) quartermaster.py per 7.3; (6) loop.py implementing the handshake in 5.6
with a --condition full|frozen_stats flag and a --fake-runner flag that writes
random battle results so I can test before the TS runner exists;
(7) report.py producing the charts in section 9 with matplotlib.
Keep everything runnable from the command line."

## 11. Amendment (12:45): Shop and inventory
- Party JSON (5.2) adds per-unit "items": [...] (max 2 per unit) and a
  top-level "gold_spent".
- Items and prices:
  - vulnerary: 50 gold, heals 30% max HP
  - elixir: 150 gold, heals 100% max HP
  - salve: 40 gold, heals 15% max HP and clears burn + attribute mark
- Budget: 300 gold per generation for the loadout, not carried over.
  Items are restored at the start of every battle (the party is a template).
- Quartermaster ("full" condition) buys and assigns items as part of its party
  output; add the price list to its prompt. In "frozen_stats", every unit
  carries one vulnerary and the shop is skipped.
- Using an item is a battle action (move, then use item instead of
  attacking); the engine already supports it.
- No shops on the map today. The Battle Prep screen shows the shop and each
  unit's inventory.

## 12. Amendment (13:50): Adaptive rival (Solo mode)
Humans play Solo Battle in the viewer. game/src/server.ts saves each finished
battle and serves the newest rival playbook. Run it with: cd game && npm run server

Saved human battles (collection battles):
  run_id "rival-<player>", condition "adaptive", split "human", player,
  generation (rival generation that played it; 0 = base AI),
  playbook_id (rival playbook used, null for base AI), party,
  map_id, npc_id (base army/personality), seed,
  winner ("player" = the HUMAN won, "npc" = the rival won), reason, turns,
  score (human's perspective), summary (5.5, "own"/"player" = the human), events.

Rival Coach (new script, e.g. agents/rival.py --player <id> [--watch]):
  - Read that player's battles {run_id: "rival-<player>", split: "human"}, newest
    first. Use summary.notes, deaths, reactions, hp_lead_by_turn to describe the
    human's habits (e.g. "leaves mage exposed", "turtles on forts", "rushes
    cavalry", "never uses fire on forest").
  - Write ONE new playbook doc per update:
      { run_id: "rival-<player>", generation: last + 1, condition: "adaptive",
        side: "npc", persona: "rival", parent_id: previous rival playbook or null,
        playbook: <5.1 schema>, rationale: "<which habit it counters>",
        created_at }
  - Perspective flip: the rival wants the human to LOSE. Counter their notes,
    e.g. exposed mage -> target_priority starts with "mage"; fort turtling ->
    use_fire_on_forest + focus_fire; cavalry rush -> turtle formation.
  - Same pydantic validation as 5.1. Never write side "player" docs here.
  - Watch mode: poll every ~10 s; after each new human battle, write the next
    rival playbook (or after every 2 battles to reduce noise).

The viewer fetches the newest {run_id: "rival-<player>", side: "npc"} playbook
before each Solo battle; the NPC army plays it. No runner call needed.
Default player id is "player1" (changeable in the viewer). A test rival gen 1
already exists for player1; the real script should continue from generation 2.
