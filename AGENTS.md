# Instructions for AI coding agents (UI / art work)

Project: "Training Grounds", a Fire Emblem style SRPG where an AI coach improves
an army's battle playbook over generations. Hackathon build, ends ~8 PM today.
Full context: shared/PLAN.md. Game rules live in game/src (read-only for you).

You work ONLY on branch "ui", on visuals.

You MAY edit:
- viewer/src/style.css   (all styling)
- viewer/src/theme.ts    (colors, TILE size)
- viewer/src/board.ts    (canvas drawing: terrain, units, cursor, effects)
- viewer/index.html      (fonts/meta only)
- viewer/public/assets/  (new sprites/images)

Do NOT edit: anything in game/, or viewer/src/screens.ts, solo.ts, runs.ts,
api.ts, replay.ts, main.ts. If a change needs those, describe it instead.

Constraints:
- Keep BoardRenderer's API: constructor(canvas) and draw({ grid, frame, cursor, blue, red }).
- Keep COLORS keys and TILE exported from theme.ts.
- 8x8 board. Terrains: plain, forest, fort, water. Units: chess glyphs in team
  circles (player blue, enemy red), HP bar, attribute dot (fire/water/electric).
- Red corner-bracket cursor; blue = reachable tiles; red = blocked/danger.
- Style: dark fantasy (navy panels, gold trim, Cinzel headings, Inter body).
- Must be readable on a projector from across a room.
- No new npm dependencies. Sprites must fall back to current shapes if missing.
- Run: cd viewer && npm run dev. Keep changes small; commit after each task.

Tasks, in order:
1. Review the UI and list the top 5 visual improvements for a judge seeing it
   for 30 seconds on a projector.
2. Polish board.ts: richer canvas terrain (forest canopy, fort walls, water
   shimmer), subtle cursor pulse, bolder damage numbers, clearer defeat effect.
3. Polish style.css: panel depth, button states, spacing, layout under 1100px.
4. Optional: sprite support (viewer/public/assets/unit_<class>.png,
   tile_<terrain>.png) with automatic fallback.
