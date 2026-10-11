// main.ts: loads run data and starts the screen router.
import "./style.css";
import { fullGens, loadRun } from "./runs.js";
import { AppState, start } from "./screens.js";

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
})();
