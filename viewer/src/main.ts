// main.ts: loads run data, starts the screen router, and polls for new generations.
import "./style.css";
import { fullGens, loadRun } from "./runs.js";
import { AppState, refreshIfIdle, start } from "./screens.js";

const POLL_MS = 30_000;

(async () => {
  const runId = new URLSearchParams(location.search).get("run") ?? "demo1";
  const state: AppState = {
    run: await loadRun(runId),
    runId,
    genIdx: 0,
    mapId: "river_ford",
    npc: "turtle",
    seed: 1,
    speed: 5,
    reload: async (id: string) => {
      state.run = await loadRun(id);
      state.runId = id;
      state.genIdx = Math.max(0, fullGens(state.run).length - 1);
    },
  };
  state.genIdx = Math.max(0, fullGens(state.run).length - 1);
  start(document.getElementById("app")!, state);

  window.setInterval(async () => {
    const run = await loadRun(state.runId);
    if (run.sample || run.exported_at === state.run.exported_at) return;
    const wasLatest = state.genIdx >= fullGens(state.run).length - 1;
    state.run = run;
    if (wasLatest) state.genIdx = Math.max(0, fullGens(run).length - 1);
    console.log(`[viewer] new data for ${run.run_id}: ${fullGens(run).length} full generations`);
    refreshIfIdle();
  }, POLL_MS);
})();
