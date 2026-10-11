// screens.ts: Main Menu, Training Grounds, Battle Prep, Battle, Settings.
import {
  CLASSES, COST_PER_STAR, GRID_SIZE, ITEM_PRICE, Item, PARTY_COST_CAP, SHOP_BUDGET, TERRAIN, WEAPON_POWER,
} from "../../game/src/data.js";
import { reachableTiles } from "../../game/src/actions.js";
import { createBattle, runBattle } from "../../game/src/engine.js";
import { Playbook, playbookPolicy } from "../../game/src/executor.js";
import { MAPS, getMap } from "../../game/src/maps.js";
import { NPC_POLICIES, PERSONALITIES } from "../../game/src/npc.js";
import { NPC_ARMIES } from "../../game/src/parties.js";
import { Pos, dist, getUnit } from "../../game/src/state.js";
import { BoardRenderer } from "./board.js";
import { Frame, battleAt, buildFrames, describe, initialUnits } from "./replay.js";
import { GenExport, RunExport, frozenGens, fullGens, partyOf, playbookOf } from "./runs.js";
import { COLORS, TILE } from "./theme.js";

export type ScreenName = "menu" | "training" | "prep" | "battle" | "settings" | "solo";

export interface AppState {
  run: RunExport;
  runId: string;
  genIdx: number;
  mapId: string;
  npc: string;
  seed: number;
  speed: number;
  reload: (runId: string) => Promise<void>;
}

let app: HTMLElement;
let S: AppState;
let cleanup: (() => void) | null = null;
let current: ScreenName = "menu";

export function start(root: HTMLElement, state: AppState) {
  app = root;
  S = state;
  go("menu");
}

export function go(name: ScreenName) {
  cleanup?.();
  cleanup = null;
  current = name;
  ({ menu: menuScreen, training: trainingScreen, prep: prepScreen, battle: battleScreen, settings: settingsScreen, solo: soloScreen })[name]();
}

// ---------- helpers ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);
const gens = () => fullGens(S.run);
const curGen = (): GenExport => gens()[Math.min(S.genIdx, gens().length - 1)] ?? gens()[0];

function bindGo() {
  app.querySelectorAll<HTMLElement>("[data-go]").forEach(el =>
    el.addEventListener("click", () => go(el.dataset.go as ScreenName)));
}

function topbar(title: string, right = "") {
  return `<div class="topbar"><button class="btn sm" data-go="menu">◀ Menu</button>
    <h2 class="title">${title}</h2><div class="spacer"></div>${right}</div>`;
}

function playbookList(pb: Playbook) {
  return `<dl class="kv">
    <dt>Formation</dt><dd>${cap(pb.formation)}</dd>
    <dt>Advance</dt><dd>${pb.advance_turn === 0 ? "Immediately" : `On turn ${pb.advance_turn}`}</dd>
    <dt>Targets</dt><dd>${pb.target_priority.map(cap).join(" → ")}</dd>
    <dt>Focus fire</dt><dd>${pb.focus_fire ? "Yes" : "No"}</dd>
    <dt>Terrain</dt><dd>Forest ${Math.round(pb.terrain_prefs.forest * 100)}% · Fort ${Math.round(pb.terrain_prefs.fort * 100)}%</dd>
    <dt>Retreat</dt><dd>Below ${Math.round(pb.retreat_hp_threshold * 100)}% HP</dd>
    <dt>Fire on forest</dt><dd>${pb.use_fire_on_forest ? "Yes" : "No"}</dd>
    <dt>Avoid ▼ triangle</dt><dd>${pb.avoid_triangle_disadvantage ? "Yes" : "No"}</dd>
  </dl>`;
}

// ---------- Main Menu ----------
function menuScreen() {
  const n = gens().length;
  app.innerHTML = `<div class="screen menu">
    <h1 class="title">Training Grounds</h1>
    <div class="tagline">An AI trainer that grows your SRPG army</div>
    <div class="menu-list">
      <button class="btn" data-go="training">Training Grounds<small>Watch the AI coach improve your army</small></button>
      <button class="btn" data-go="prep">Battle Prep<small>Party, loadout and stage</small></button>
      <button class="btn" data-go="battle">Battle<small>Replay a battle with the selected playbook</small></button>
      <button class="btn" data-go="solo">Solo Battle<small>Command your army yourself</small></button>
      <button class="btn" data-go="settings">Settings<small>Run data and playback</small></button>
    </div>
    <div class="menu-foot">${S.run.sample ? "Sample data · export a run to load live generations" : `Run ${esc(S.run.run_id)} · ${n} generation${n === 1 ? "" : "s"}`}</div>
  </div>`;
  bindGo();
}

// ---------- Training Grounds ----------
function drawSpark(canvas: HTMLCanvasElement, full: GenExport[], frozen: GenExport[], sel: number) {
  const W = Math.max(320, (canvas.parentElement?.clientWidth ?? 600) - 30), H = 200, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);
  const pad = 34, n = Math.max(full.length, frozen.length, 2);
  const X = (i: number) => pad + (i * (W - 2 * pad)) / (n - 1);
  const Y = (v: number) => H - pad - v * (H - 2 * pad);
  c.strokeStyle = "rgba(201,162,74,0.18)"; c.lineWidth = 1;
  c.font = "13px Inter, sans-serif"; c.fillStyle = "#98a1b6";
  for (const v of [0, 0.5, 1]) {
    c.beginPath(); c.moveTo(pad, Y(v)); c.lineTo(W - pad, Y(v)); c.stroke();
    c.fillText(`${v * 100}%`, 0, Y(v) - 3);
  }
  const series = (gs: GenExport[], color: string, dash: number[]) => {
    const pts = gs.filter(g => g.win_rate != null);
    if (!pts.length) return;
    c.strokeStyle = color; c.lineWidth = 3; c.setLineDash(dash);
    c.beginPath();
    pts.forEach((g, i) => (i ? c.lineTo(X(g.generation), Y(g.win_rate!)) : c.moveTo(X(g.generation), Y(g.win_rate!))));
    c.stroke(); c.setLineDash([]);
    c.fillStyle = color;
    for (const g of pts) { c.beginPath(); c.arc(X(g.generation), Y(g.win_rate!), 4, 0, Math.PI * 2); c.fill(); }
  };
  series(frozen, "#7d8699", [4, 4]);
  series(full, "#ecd28c", []);
  const s = full[sel];
  if (s?.win_rate != null) {
    c.strokeStyle = "#fff"; c.lineWidth = 2;
    c.beginPath(); c.arc(X(s.generation), Y(s.win_rate), 5, 0, Math.PI * 2); c.stroke();
  }
}

function trainingScreen() {
  const gs = gens();
  app.innerHTML = `<div class="screen">
    ${topbar("Training Grounds", `<span class="muted">${S.run.sample ? "Sample data" : `Run ${esc(S.run.run_id)}`}</span>`)}
    <div class="training">
      <div class="panel"><h3>Generations</h3>
        <ul class="gen-list" id="genlist"></ul>
      </div>
      <div class="panel" id="gendetail"></div>
    </div>
  </div>`;
  const render = () => {
    $("genlist").innerHTML = gs.map((g, i) => `<li data-i="${i}" class="${i === S.genIdx ? "sel" : ""}">
      <span class="g">Gen ${g.generation}</span><span>${pct(g.win_rate)} <span class="muted">· ${esc(g.best?.persona ?? "")}</span></span></li>`).join("");
    $("genlist").querySelectorAll<HTMLElement>("li").forEach(li =>
      li.addEventListener("click", () => { S.genIdx = Number(li.dataset.i); render(); }));
    const g = curGen();
    const base = gs[0]?.win_rate ?? null;
    const delta = g.win_rate != null && base != null && g !== gs[0]
      ? `<div><div class="stat-big ${g.win_rate >= base ? "up" : "down"}">${g.win_rate >= base ? "+" : ""}${Math.round((g.win_rate - base) * 100)}</div><div class="muted">pts vs Gen 0</div></div>` : "";
    const held = g.heldout
      ? `<div><div class="stat-big">${pct(g.heldout.win_rate)}</div><div class="muted">held-out win rate</div></div>` : "";
    $("gendetail").innerHTML = `<h3>Generation ${g.generation} · ${esc(g.best?.persona ?? "")}</h3>
      <canvas id="spark"></canvas>
      <div class="legend-line"><span class="sw gold"></span>Full <span class="sw grey"></span>Frozen stats</div>
      <div class="row stats-row">
        <div><div class="stat-big">${pct(g.win_rate)}</div><div class="muted">training win rate</div></div>
        <div><div class="stat-big">${g.avg_score?.toFixed(2) ?? "n/a"}</div><div class="muted">avg score</div></div>
        ${delta}${held}
      </div>
      <h4 class="sub-h">Coach's reasoning</h4>
      <p class="quote">${esc(g.best?.rationale || "No rationale recorded.")}</p>
      <h4 class="sub-h">Playbook</h4>
      ${playbookList(playbookOf(g))}
      <div class="row" style="margin-top:14px">
        <button class="btn" data-go="prep">Battle Prep</button>
        <button class="btn primary" data-go="battle">Watch a battle</button>
      </div>`;
    bindGo();
    drawSpark($("spark") as HTMLCanvasElement, gs, frozenGens(S.run), S.genIdx);
  };
  render();
  bindGo();
}

// ---------- Battle Prep ----------
function prepScreen() {
  const g = curGen();
  const party = partyOf(g);
  const cost = party.reduce((s, u) => s + u.star * COST_PER_STAR, 0);
  const itemsOf = (u: (typeof party)[number]) => u.items ?? [Item.Vulnerary];
  const gold = party.reduce((s, u) => s + itemsOf(u).reduce((t, it) => t + ITEM_PRICE[it], 0), 0);
  const cards = party.map(u => {
    const info = CLASSES[u.class];
    return `<div class="panel card">
      <div class="glyph">${info.glyph}\uFE0E</div>
      <div class="name">${cap(u.class)}</div>
      <div class="muted">${cap(info.chess)} · Lv ${u.level} · ${"★".repeat(u.star)}</div>
      <div class="slot">Weapon: ${cap(u.weapon)} <span class="muted">(Pow ${WEAPON_POWER[u.weapon]})</span></div>
      <div class="slot"><span class="chip" style="color:${COLORS.attr[u.attribute]}">${cap(u.attribute)}</span>${u.subskill ? `<span class="chip">${cap(u.subskill)}</span>` : ""}</div>
      <div class="slot">${itemsOf(u).map(it => cap(it)).join(", ") || "No items"}</div>
    </div>`;
  }).join("");
  app.innerHTML = `<div class="screen">
    ${topbar("Battle Prep", `<span class="chip" style="color:var(--gold)">Gen ${g.generation}</span>`)}
    <div class="prep">
      <div>
        <div class="panel"><h3>Select Unit</h3><div class="cards">${cards}</div>
          <div class="row" style="margin-top:12px;justify-content:space-between">
            <span>Party cost <span class="cost ${cost <= PARTY_COST_CAP ? "ok" : "over"}">${cost} / ${PARTY_COST_CAP}</span></span>
            <span>Loadout gold <span class="cost ${gold <= SHOP_BUDGET ? "ok" : "over"}">${gold} / ${SHOP_BUDGET}</span></span>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="panel"><h3>Stage</h3>
          <div class="row">
            <label class="field">Map <select id="map">${MAPS.map(m => `<option value="${m.id}" ${m.id === S.mapId ? "selected" : ""}>${esc(m.name)}${m.split === "heldout" ? " (held-out)" : ""}</option>`).join("")}</select></label>
            <label class="field">Opponent <select id="npc">${Object.values(PERSONALITIES).map(p => `<option value="${p.name}" ${p.name === S.npc ? "selected" : ""}>${cap(p.name)}${p.split === "heldout" ? " (held-out)" : ""}</option>`).join("")}</select></label>
            <label class="field">Seed <input id="seed" type="number" min="1" value="${S.seed}" style="width:80px" /></label>
          </div>
          <p class="muted" id="mapdesc" style="margin:10px 0 0"></p>
        </div>
        <div class="panel"><h3>Shop</h3>
          <div class="shop">${Object.values(Item).map(it => `<span>${cap(it)}</span><span class="muted">${ITEM_PRICE[it]} G</span>`).join("")}</div>
          <p class="hint" style="margin-top:8px">The Quartermaster buys the loadout each generation within ${SHOP_BUDGET} G.</p>
        </div>
        <div class="row tight"><button class="btn primary big" data-go="solo">Play Solo</button><button class="btn big" data-go="battle">Watch AI</button></div>
      </div>
    </div>
  </div>`;
  const desc = () => { $("mapdesc").textContent = getMap(S.mapId).style; };
  $<HTMLSelectElement>("map").onchange = e => { S.mapId = (e.target as HTMLSelectElement).value; desc(); };
  $<HTMLSelectElement>("npc").onchange = e => { S.npc = (e.target as HTMLSelectElement).value; };
  $<HTMLInputElement>("seed").onchange = e => { S.seed = Math.max(1, Number((e.target as HTMLInputElement).value) || 1); };
  desc();
  bindGo();
}

// ---------- Battle ----------
const TERRAIN_NOTES: Record<string, string> = {
  plain: "No effect.",
  forest: "Evade + unit SPD. Burns when hit by fire.",
  fort: "Heals 10% max HP each turn.",
  water: "Impassable. Winged units fly over.",
};

function battleScreen() {
  const g = curGen();
  const pb = playbookOf(g);
  const party = partyOf(g);
  const map = getMap(S.mapId);
  const base = createBattle(S.mapId, party, NPC_ARMIES[S.npc], S.seed);
  const result = runBattle({ mapId: S.mapId, seed: S.seed, player: party, npc: NPC_ARMIES[S.npc],
                             playerPolicy: playbookPolicy(pb), npcPolicy: NPC_POLICIES[S.npc] });
  const frames = buildFrames(initialUnits(base), result.log);
  let idx = 0;
  let cursor: Pos = { ...base.units[0].pos };
  let selected: string | null = null;
  let timer: number | null = null;

  app.innerHTML = `<div class="screen">
    ${topbar(`${esc(map.name)} <span class="vs">vs ${cap(S.npc)}</span>`,
      `<span id="turninfo" class="muted"></span><span class="chip" style="color:var(--gold)">Gen ${g.generation}</span>
       <button class="btn sm" id="reseed">Next seed ▶</button>`)}
    <div class="battle">
      <div class="panel unit-panel" id="unitpanel"></div>
      <div class="center-col">
        <div class="board"><canvas id="board"></canvas><div class="banner" id="banner"></div></div>
        <div class="panel bottombar">
          <div class="dpad">
            <span></span><button class="btn sm" data-dir="0,-1">▲</button><span></span>
            <button class="btn sm" data-dir="-1,0">◀</button><button class="btn sm sel" id="sel" title="Select (Enter)">SEL</button><button class="btn sm" data-dir="1,0">▶</button>
            <span></span><button class="btn sm" data-dir="0,1">▼</button><span></span>
          </div>
          <div class="transport">
            <div class="row tight">
              <button class="btn sm" id="first" title="First">⏮</button>
              <button class="btn sm" id="prev" title="Previous (Z)">◀◀</button>
              <button class="btn sm primary" id="play" title="Play (Space)">Play</button>
              <button class="btn sm" id="next" title="Next (X)">▶▶</button>
              <button class="btn sm" id="last" title="Last">⏭</button>
            </div>
            <label class="field inline">Speed <input type="range" id="speed" min="1" max="10" value="${S.speed}" /></label>
            <div class="hint">Arrows: cursor · Enter: select · Space: play · Z/X: step</div>
          </div>
        </div>
      </div>
      <div class="side-col">
        <div class="panel"><h3>Coach · ${esc(g.best?.persona ?? "playbook")}</h3>
          <p class="quote small">${esc(g.best?.rationale || "No rationale recorded.")}</p>
          <div class="tags">
            <span class="chip">${cap(pb.formation)}</span>
            <span class="chip">Advance T${pb.advance_turn}</span>
            <span class="chip">${pb.target_priority.map(cap).join(" → ")}</span>
            ${pb.focus_fire ? `<span class="chip">Focus fire</span>` : ""}
            ${pb.use_fire_on_forest ? `<span class="chip">Fire on forest</span>` : ""}
          </div>
        </div>
        <div class="panel"><h3>Battle Log</h3><ol class="log" id="log"></ol></div>
      </div>
    </div>
  </div>`;

  const canvas = $<HTMLCanvasElement>("board");
  const board = new BoardRenderer(canvas);

  $("log").innerHTML = frames.map((f, i) => {
    if (!f.event) return "";
    const e = f.event;
    const id = e.t === "attack" ? e.attacker : "unit" in e ? e.unit : null;
    const side = id && f.units[id] ? f.units[id].team : e.t === "turn_start" ? e.team : "";
    return `<li data-i="${i}" class="${e.t} ${side ? `side-${side}` : ""}">${esc(describe(e))}</li>`;
  }).join("");

  const overlays = (i: number) => {
    const f = frames[i];
    let unitId: string | null = null;
    let from: Frame = f;
    if (selected && f.units[selected]?.alive) unitId = selected;
    else if (f.event?.t === "move" && i > 0) { unitId = f.event.unit; from = frames[i - 1]; }
    const blue: Pos[] = [];
    const red: Pos[] = [];
    if (unitId) {
      const b = battleAt(base, from);
      const u = getUnit(b, unitId);
      blue.push(...reachableTiles(b, u));
      const mv = CLASSES[u.cls].move;
      for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
        const d = dist({ x, y }, u.pos);
        if (d > 0 && d <= mv && !blue.some(p => p.x === x && p.y === y)) red.push({ x, y });
      }
    }
    return { blue, red };
  };

  const unitPanel = (f: Frame) => {
    const t = base.grid[cursor.y][cursor.x];
    const tile = `<div class="tile-info"><span class="chip" style="color:${COLORS.terrain[t]}">${cap(t)}</span> ${TERRAIN_NOTES[t]}</div>`;
    const v = Object.values(f.units).find(u => u.alive && u.x === cursor.x && u.y === cursor.y)
      ?? (selected ? f.units[selected] : undefined);
    if (!v) {
      $("unitpanel").innerHTML = `<h3>Unit</h3><p class="muted">Move the cursor onto a unit to inspect it. Select shows its movement range.</p>${tile}`;
      return;
    }
    const u = base.units.find(x => x.id === v.id)!;
    const info = CLASSES[u.cls];
    const r = v.hp / v.maxHp;
    $("unitpanel").innerHTML = `<h3>${v.team === "player" ? "Your Unit" : "Enemy Unit"}</h3>
      <div class="uhead"><div class="uglyph" style="background:${COLORS.team[v.team]}">${info.glyph}\uFE0E</div>
        <div><div class="uname">${cap(u.cls)}</div><div class="muted small">${esc(u.id)} · ${cap(info.chess)} · Lv ${u.level}</div></div></div>
      <div class="hpbar"><div style="width:${r * 100}%;background:${r > 0.6 ? COLORS.hpGood : r > 0.3 ? COLORS.hpMid : COLORS.hpLow}"></div></div>
      <div class="muted small">HP ${v.hp} / ${v.maxHp}${v.alive ? "" : " · defeated"}</div>
      <div class="stats">
        <span>ATK</span><span>${u.stats.atk}</span><span>MAG</span><span>${u.stats.mag}</span>
        <span>DEF</span><span>${u.stats.def}</span><span>SPD</span><span>${u.stats.spd}</span>
        <span>MOVE</span><span>${info.move}${info.flying ? " · flies" : ""}</span>
        <span>Weapon</span><span>${cap(u.weapon)} · Pow ${WEAPON_POWER[u.weapon]}</span>
      </div>
      <div class="tags"><span class="chip" style="color:${COLORS.attr[u.attribute]}">${cap(u.attribute)}</span>${u.subskill ? `<span class="chip">${cap(u.subskill)}</span>` : ""}</div>
      ${tile}`;
  };

  const render = () => {
    const f = frames[idx];
    const { blue, red } = overlays(idx);
    board.draw({ grid: base.grid, frame: f, cursor, blue, red });
    $("turninfo").textContent = `Turn ${f.turn}${f.phase ? ` · ${f.phase === "player" ? "Player" : "Enemy"} Phase` : ""} · ${idx}/${frames.length - 1}`;
    const last = idx === frames.length - 1;
    const banner = $("banner");
    banner.className = `banner ${last ? (result.winner === "player" ? "win" : "loss") : ""}`;
    banner.textContent = last ? (result.winner === "player" ? "VICTORY" : "DEFEAT") : "";
    unitPanel(f);
    $("log").querySelector(".current")?.classList.remove("current");
    const li = $("log").querySelector(`[data-i="${idx}"]`);
    if (li) { li.classList.add("current"); li.scrollIntoView({ block: "nearest" }); }
  };

  const follow = () => {
    const f = frames[idx];
    const e = f.event;
    if (!e) return;
    if (e.t === "move") cursor = { ...e.to };
    else if (e.t === "attack") cursor = { x: f.units[e.attacker].x, y: f.units[e.attacker].y };
    else if ("unit" in e && f.units[e.unit]) cursor = { x: f.units[e.unit].x, y: f.units[e.unit].y };
  };

  const step = (i: number) => { idx = Math.max(0, Math.min(frames.length - 1, i)); follow(); render(); };
  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    $("play").textContent = "Play";
  };
  const play = () => {
    if (timer !== null) return;
    selected = null;
    if (idx >= frames.length - 1) step(0);
    $("play").textContent = "Pause";
    timer = window.setInterval(() => (idx >= frames.length - 1 ? stop() : step(idx + 1)), 1150 - S.speed * 105);
  };
  const moveCursor = (dx: number, dy: number) => {
    stop();
    cursor = { x: Math.max(0, Math.min(GRID_SIZE - 1, cursor.x + dx)), y: Math.max(0, Math.min(GRID_SIZE - 1, cursor.y + dy)) };
    render();
  };
  const select = () => {
    stop();
    const v = Object.values(frames[idx].units).find(u => u.alive && u.x === cursor.x && u.y === cursor.y);
    selected = v && selected !== v.id ? v.id : null;
    render();
  };

  app.querySelectorAll<HTMLElement>("[data-dir]").forEach(b => b.addEventListener("click", () => {
    const [dx, dy] = b.dataset.dir!.split(",").map(Number);
    moveCursor(dx, dy);
  }));
  $("sel").onclick = select;
  $("first").onclick = () => { stop(); step(0); };
  $("prev").onclick = () => { stop(); step(idx - 1); };
  $("next").onclick = () => { stop(); step(idx + 1); };
  $("last").onclick = () => { stop(); step(frames.length - 1); };
  $("play").onclick = () => (timer === null ? play() : stop());
  $<HTMLInputElement>("speed").oninput = e => {
    S.speed = Number((e.target as HTMLInputElement).value);
    if (timer !== null) { stop(); play(); }
  };
  $("reseed").onclick = () => { S.seed += 1; go("battle"); };
  $("log").querySelectorAll<HTMLElement>("li").forEach(li =>
    li.addEventListener("click", () => { stop(); step(Number(li.dataset.i)); }));
  canvas.addEventListener("click", ev => {
    const rect = canvas.getBoundingClientRect();
    cursor = {
      x: Math.min(GRID_SIZE - 1, Math.floor(((ev.clientX - rect.left) / rect.width) * GRID_SIZE)),
      y: Math.min(GRID_SIZE - 1, Math.floor(((ev.clientY - rect.top) / rect.height) * GRID_SIZE)),
    };
    select();
  });
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT") return;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.key]) { e.preventDefault(); moveCursor(...dirs[e.key]); }
    else if (e.key === "Enter") select();
    else if (e.key === " ") { e.preventDefault(); timer === null ? play() : stop(); }
    else if (e.key === "z" || e.key === "Z") { stop(); step(idx - 1); }
    else if (e.key === "x" || e.key === "X") { stop(); step(idx + 1); }
    else if (e.key === "Escape") go("menu");
  };
  window.addEventListener("keydown", onKey);
  cleanup = () => { stop(); window.removeEventListener("keydown", onKey); };

  bindGo();
  render();
  void TERRAIN;
  void TILE;
}

// ---------- Settings ----------
function settingsScreen() {
  app.innerHTML = `<div class="screen">
    ${topbar("Settings")}
    <div class="settings">
      <div class="panel"><h3>Run Data</h3>
        <div class="row">
          <label class="field">Run id <input id="runid" value="${esc(S.runId)}" /></label>
          <button class="btn" id="load">Load</button>
          <span class="muted" id="loadmsg">${S.run.sample ? "Showing sample data" : `Loaded ${esc(S.run.run_id)} · ${gens().length} generations`}</span>
        </div>
        <p class="hint" style="margin-top:10px">Refresh data from MongoDB with:<br>
          <code>cd ~/Desktop/training-grounds/game && npm run export -- --run ${esc(S.runId)}</code></p>
      </div>
      <div class="panel"><h3>Playback</h3>
        <label class="field">Default speed <input type="range" id="spd" min="1" max="10" value="${S.speed}" /></label>
      </div>
    </div>
  </div>`;
  $("load").onclick = async () => {
    const id = $<HTMLInputElement>("runid").value.trim() || "demo1";
    await S.reload(id);
    $("loadmsg").textContent = S.run.sample ? `No export for ${id}, showing sample data` : `Loaded ${S.run.run_id} · ${gens().length} generations`;
  };
  $<HTMLInputElement>("spd").oninput = e => { S.speed = Number((e.target as HTMLInputElement).value); };
  bindGo();
}

// ---------- shared with solo.ts ----------
import { soloScreen } from "./solo.js";
export { bindGo, cap, curGen, esc, topbar };
export const byId = $;
export const getState = () => S;
export const setCleanup = (fn: () => void) => { cleanup = fn; };

// Re-render only screens that are safe to refresh (never interrupts Battle or Solo).
export function refreshIfIdle() {
  if (current === "training" || current === "menu") go(current);
}
