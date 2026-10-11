// compare.ts: "Gen vs Gen". Two generations play the same battle side by side,
// plus a scoreboard that re-runs both playbooks on the whole training set in the browser.
import { Terrain } from "../../game/src/data.js";
import { BattleResult, createBattle, runBattle } from "../../game/src/engine.js";
import { evaluatePlaybook, playbookPolicy } from "../../game/src/executor.js";
import { MAPS } from "../../game/src/maps.js";
import { NPC_POLICIES, PERSONALITIES } from "../../game/src/npc.js";
import { NPC_ARMIES } from "../../game/src/parties.js";
import { BoardRenderer } from "./board.js";
import { Frame, buildFrames, initialUnits } from "./replay.js";
import { GenExport, fullGens, partyOf, playbookOf } from "./runs.js";
import { bindGo, byId, cap, esc, getState, setCleanup, topbar } from "./screens.js";

interface Side { gen: GenExport; result: BattleResult; frames: Frame[]; grid: Terrain[][]; }

const evalCache = new Map<string, { win: number; score: number; n: number }>();
const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);

export function compareScreen() {
  const S = getState();
  const gens = fullGens(S.run);
  let aIdx = 0;
  let bIdx = S.genIdx > 0 ? S.genIdx : Math.max(0, gens.length - 1);
  let t = 0;
  let timer: number | null = null;
  let sides: Side[] = [];

  const genLabel = (g: GenExport) => `Gen ${g.generation} · ${g.best?.persona ?? ""} (${pct(g.win_rate)})`;
  const genOptions = (sel: number) => gens.map((g, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${esc(genLabel(g))}</option>`).join("");

  document.getElementById("app")!.innerHTML = `<div class="screen">
    <style>
      .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .compare .side { display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .compare .side h3 { width: 100%; }
      .compare .board canvas { width: min(512px, 100%) !important; height: auto !important; }
      .cmp-result { font-size: 15px; min-height: 22px; }
      .cmp-score { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; text-align: center; }
      .cmp-score .big { font-family: var(--serif); font-size: 44px; color: var(--gold-hi); line-height: 1.1; }
      .cmp-score .delta { font-family: var(--serif); font-size: 30px; }
      .cmp-score .up { color: var(--win); } .cmp-score .down { color: var(--loss); }
      @media (max-width: 1100px) { .compare { grid-template-columns: 1fr; } }
    </style>
    ${topbar("Gen vs Gen", `<button class="btn sm" id="reseed">Next seed ▶</button>`)}
    <div class="panel"><div class="row">
      <label class="field">Left <select id="ga">${genOptions(aIdx)}</select></label>
      <label class="field">Right <select id="gb">${genOptions(bIdx)}</select></label>
      <label class="field">Map <select id="map">${MAPS.map(m => `<option value="${m.id}" ${m.id === S.mapId ? "selected" : ""}>${esc(m.name)}${m.split === "heldout" ? " (held-out)" : ""}</option>`).join("")}</select></label>
      <label class="field">Opponent <select id="npc">${Object.values(PERSONALITIES).map(p => `<option value="${p.name}" ${p.name === S.npc ? "selected" : ""}>${cap(p.name)}${p.split === "heldout" ? " (held-out)" : ""}</option>`).join("")}</select></label>
      <label class="field">Seed <input id="seed" type="number" min="1" value="${S.seed}" style="width:80px" /></label>
      <button class="btn sm primary" id="play">Play</button>
      <button class="btn sm" id="restart">Restart</button>
      <label class="field inline">Speed <input type="range" id="speed" min="1" max="10" value="${S.speed}" /></label>
    </div></div>
    <div class="compare">
      <div class="panel side"><h3 id="ta"></h3>
        <div class="board"><canvas id="ca"></canvas><div class="banner" id="bna"></div></div>
        <div class="cmp-result" id="ra"></div></div>
      <div class="panel side"><h3 id="tb"></h3>
        <div class="board"><canvas id="cb"></canvas><div class="banner" id="bnb"></div></div>
        <div class="cmp-result" id="rb"></div></div>
    </div>
    <div class="panel"><h3>Across the whole training set · 5 maps × 3 opponents × 4 seeds</h3><div id="score">Computing...</div></div>
  </div>`;

  const boards = [new BoardRenderer(byId<HTMLCanvasElement>("ca")), new BoardRenderer(byId<HTMLCanvasElement>("cb"))];
  const ids = [{ t: "ta", bn: "bna", r: "ra" }, { t: "tb", bn: "bnb", r: "rb" }];

  const draw = () => {
    sides.forEach((s, i) => {
      const last = s.frames.length - 1;
      const f = s.frames[Math.min(t, last)];
      boards[i].draw({ grid: s.grid, frame: f, cursor: null, blue: [], red: [] });
      const done = t >= last;
      const win = s.result.winner === "player";
      const bn = byId(ids[i].bn);
      bn.className = `banner ${done ? (win ? "win" : "loss") : ""}`;
      bn.textContent = done ? (win ? "VICTORY" : "DEFEAT") : "";
      byId(ids[i].r).innerHTML = done
        ? `<b>${win ? "Victory" : "Defeat"}</b> by ${s.result.reason} on turn ${s.result.turns} · score ${s.result.score.toFixed(2)}`
        : `<span class="muted">Turn ${f.turn}</span>`;
    });
  };

  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    byId("play").textContent = "Play";
  };
  const play = () => {
    if (timer !== null) return;
    const maxT = Math.max(...sides.map(s => s.frames.length - 1));
    if (t >= maxT) t = 0;
    byId("play").textContent = "Pause";
    timer = window.setInterval(() => {
      t += 1;
      draw();
      if (t >= maxT) stop();
    }, Math.max(120, 900 - S.speed * 80));
  };

  const scoreboard = () => {
    byId("score").innerHTML = `<p class="muted">Re-running both playbooks on 60 battles each...</p>`;
    window.setTimeout(() => {
      const rows = [gens[aIdx], gens[bIdx]].map(g => {
        const key = `${S.run.run_id}|${g.condition}|${g.generation}`;
        if (!evalCache.has(key)) {
          const ev = evaluatePlaybook({ playbook: playbookOf(g), party: partyOf(g) });
          evalCache.set(key, { win: ev.winRate, score: ev.avgScore, n: ev.n });
        }
        return { g, ...evalCache.get(key)! };
      });
      const d = Math.round((rows[1].win - rows[0].win) * 100);
      byId("score").innerHTML = `<div class="cmp-score">
        <div><div class="big">${pct(rows[0].win)}</div><div class="muted">Gen ${rows[0].g.generation} win rate · score ${rows[0].score.toFixed(2)}</div></div>
        <div class="delta ${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d} pts</div>
        <div><div class="big">${pct(rows[1].win)}</div><div class="muted">Gen ${rows[1].g.generation} win rate · score ${rows[1].score.toFixed(2)}</div></div>
      </div><p class="hint" style="margin-top:8px">Recomputed live in your browser from each generation's playbook: ${rows[0].n} battles per side, same seeds as training.</p>`;
    }, 40);
  };

  const setup = () => {
    stop();
    t = 0;
    sides = [gens[aIdx], gens[bIdx]].map(g => {
      const party = partyOf(g);
      const base = createBattle(S.mapId, party, NPC_ARMIES[S.npc], S.seed);
      const result = runBattle({ mapId: S.mapId, seed: S.seed, player: party, npc: NPC_ARMIES[S.npc],
                                 playerPolicy: playbookPolicy(playbookOf(g)), npcPolicy: NPC_POLICIES[S.npc] });
      return { gen: g, result, frames: buildFrames(initialUnits(base), result.log), grid: base.grid };
    });
    sides.forEach((s, i) => { byId(ids[i].t).textContent = genLabel(s.gen); });
    draw();
    scoreboard();
  };

  byId<HTMLSelectElement>("ga").onchange = e => { aIdx = Number((e.target as HTMLSelectElement).value); setup(); };
  byId<HTMLSelectElement>("gb").onchange = e => { bIdx = Number((e.target as HTMLSelectElement).value); setup(); };
  byId<HTMLSelectElement>("map").onchange = e => { S.mapId = (e.target as HTMLSelectElement).value; setup(); };
  byId<HTMLSelectElement>("npc").onchange = e => { S.npc = (e.target as HTMLSelectElement).value; setup(); };
  byId<HTMLInputElement>("seed").onchange = e => { S.seed = Math.max(1, Number((e.target as HTMLInputElement).value) || 1); setup(); };
  byId<HTMLInputElement>("speed").oninput = e => { S.speed = Number((e.target as HTMLInputElement).value); if (timer !== null) { stop(); play(); } };
  byId("play").onclick = () => (timer === null ? play() : stop());
  byId("restart").onclick = () => { stop(); t = 0; draw(); };
  byId("reseed").onclick = () => { S.seed += 1; byId<HTMLInputElement>("seed").value = String(S.seed); setup(); };
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT") return;
    if (e.key === " ") { e.preventDefault(); timer === null ? play() : stop(); }
  };
  window.addEventListener("keydown", onKey);
  setCleanup(() => { stop(); window.removeEventListener("keydown", onKey); });

  bindGo();
  setup();
}
