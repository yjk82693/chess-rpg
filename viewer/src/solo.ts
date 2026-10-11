// solo.ts: Solo Battle. You command your army; the NPC plays its personality.
import { CLASSES, GRID_SIZE, MAX_TURNS, Team, Terrain, WEAPON_POWER } from "../../game/src/data.js";
import { reachableTiles, targetsFrom } from "../../game/src/actions.js";
import { BattleResult, applyAction, createBattle } from "../../game/src/engine.js";
import { getMap } from "../../game/src/maps.js";
import { NPC_POLICIES } from "../../game/src/npc.js";
import { NPC_ARMIES } from "../../game/src/parties.js";
import { canCounter, hitChance, previewDamage, startOfPhase, strikesFor } from "../../game/src/rules.js";
import { Battle, BattleEvent, Pos, Unit, aliveOf, dist, getUnit, hpRatio, unitAt } from "../../game/src/state.js";
import { BattleSummary, summarize } from "../../game/src/summary.js";
import { BoardRenderer } from "./board.js";
import { Frame, describe, initialUnits } from "./replay.js";
import { partyOf } from "./runs.js";
import { bindGo, byId, cap, curGen, esc, getState, go, setCleanup, topbar } from "./screens.js";
import { COLORS } from "./theme.js";
import { Rival, fetchRival, playerId, postSolo, setPlayerId } from "./api.js";
import { playbookPolicy } from "../../game/src/executor.js";

type Mode = "idle" | "move" | "menu" | "target" | "busy" | "over";
interface MenuItem { key: "attack" | "item" | "wait"; label: string; enabled: boolean; }

// Last finished solo battle; the adaptive rival will read this.
export let lastSolo: { result: BattleResult; summary: BattleSummary } | null = null;

const TERRAIN_NOTES: Record<string, string> = {
  plain: "No effect.",
  forest: "Evade + unit SPD. Burns when hit by fire.",
  fort: "Heals 10% max HP each turn.",
  water: "Impassable. Winged units fly over.",
};

function frameOf(b: Battle, event: BattleEvent | null, moved?: { id: string; to: Pos }): Frame {
  const units = Object.fromEntries(initialUnits(b).map(u =>
    [u.id, moved && u.id === moved.id ? { ...u, x: moved.to.x, y: moved.to.y } : u]));
  return { units, event, turn: b.turn, phase: null };
}

interface Forecast {
  dmg: number; hit: number; strikes: number; reaction: string | null; tri: number;
  counter: { dmg: number; hit: number; strikes: number } | null;
}

function forecast(b: Battle, u: Unit, to: Pos, def: Unit): Forecast {
  const orig = u.pos;
  u.pos = to;
  try {
    const pv = previewDamage(u, def);
    const f: Forecast = { dmg: pv.damage, hit: hitChance(b, u, def), strikes: strikesFor(u, def),
                          reaction: pv.reaction, tri: pv.triangle, counter: null };
    if (canCounter(def, u)) {
      const cp = previewDamage(def, u);
      f.counter = { dmg: cp.damage, hit: hitChance(b, def, u), strikes: strikesFor(def, u) };
    }
    return f;
  } finally {
    u.pos = orig;
  }
}

export function soloScreen() {
  const S = getState();
  const g = curGen();
  const party = partyOf(g);
  const map = getMap(S.mapId);
  let npcPolicy = NPC_POLICIES[S.npc];
  let rival: Rival | null = null;
  let saved = "";
  const b = createBattle(S.mapId, party, NPC_ARMIES[S.npc], S.seed);
  b.turn = 1;
  const errors: string[] = [];
  const timers: number[] = [];
  const acted = new Set<string>();
  let mode: Mode = "busy";
  let phase: Team = Team.Player;
  let cursor: Pos = { ...aliveOf(b, Team.Player)[0].pos };
  let sel: string | null = null;
  let dest: Pos | null = null;
  let menu: MenuItem[] = [];
  let menuIdx = 0;
  let targets: Unit[] = [];
  let tIdx = 0;
  let lastEvent: BattleEvent | null = null;
  let result: BattleResult | null = null;
  let summary: BattleSummary | null = null;
  let notice = "";
  const delay = () => Math.max(160, 760 - S.speed * 55);

  document.getElementById("app")!.innerHTML = `<div class="screen">
    ${topbar(`Solo Battle · ${esc(map.name)} <span class="vs">vs ${cap(S.npc)}</span>`, `<span id="turninfo" class="muted"></span><span class="chip" id="rivalchip" style="color:var(--gold)">Rival: loading</span><span class="muted small">Player: ${esc(playerId())}</span><button class="btn sm" id="rename">Rename</button>`)}
    <div class="battle">
      <div class="panel unit-panel" id="unitpanel"></div>
      <div class="center-col">
        <div class="board"><canvas id="board"></canvas><div class="banner" id="banner"></div></div>
        <div class="panel bottombar">
          <div class="dpad">
            <span></span><button class="btn sm" data-dir="0,-1">▲</button><span></span>
            <button class="btn sm" data-dir="-1,0">◀</button><button class="btn sm sel" id="ok" title="Select (Enter)">SEL</button><button class="btn sm" data-dir="1,0">▶</button>
            <span></span><button class="btn sm" data-dir="0,1">▼</button><span></span>
          </div>
          <div class="transport">
            <div class="row tight">
              <button class="btn sm primary" id="confirm">Select</button>
              <button class="btn sm" id="cancel">Cancel</button>
              <button class="btn sm" id="endturn">End Turn</button>
            </div>
            <label class="field inline">Enemy speed <input type="range" id="speed" min="1" max="10" value="${S.speed}" /></label>
            <div class="hint">Arrows: cursor · Enter: select · Esc: cancel · E: end turn</div>
          </div>
        </div>
      </div>
      <div class="side-col">
        <div class="panel"><h3>Command</h3><div id="cmd"></div></div>
        <div class="panel"><h3>Battle Log</h3><ol class="log" id="log"></ol></div>
      </div>
    </div>
  </div>`;

  const canvas = byId<HTMLCanvasElement>("board");
  const board = new BoardRenderer(canvas);

  // ---------- rendering ----------
  const ranges = (u: Unit) => {
    const blue = reachableTiles(b, u);
    const red: Pos[] = [];
    const mv = CLASSES[u.cls].move;
    for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
      const d = dist({ x, y }, u.pos);
      if (d > 0 && d <= mv && !blue.some(p => p.x === x && p.y === y)) red.push({ x, y });
    }
    return { blue, red };
  };

  const unitPanel = () => {
    const t = b.grid[cursor.y][cursor.x] as Terrain;
    const tile = `<div class="tile-info"><span class="chip" style="color:${COLORS.terrain[t]}">${cap(t)}</span> ${TERRAIN_NOTES[t]}</div>`;
    const u = unitAt(b, cursor) ?? (sel ? getUnit(b, sel) : undefined);
    if (!u) {
      byId("unitpanel").innerHTML = `<h3>Unit</h3><p class="muted">Move the cursor onto a unit.</p>${tile}`;
      return;
    }
    const info = CLASSES[u.cls];
    const r = u.hp / u.maxHp;
    byId("unitpanel").innerHTML = `<h3>${u.team === Team.Player ? "Your Unit" : "Enemy Unit"}${acted.has(u.id) ? ` <span class="chip">Acted</span>` : ""}</h3>
      <div class="uhead"><div class="uglyph" style="background:${COLORS.team[u.team]}">${info.glyph}\uFE0E</div>
        <div><div class="uname">${cap(u.cls)}</div><div class="muted small">${esc(u.id)} · ${cap(info.chess)} · Lv ${u.level}</div></div></div>
      <div class="hpbar"><div style="width:${r * 100}%;background:${r > 0.6 ? COLORS.hpGood : r > 0.3 ? COLORS.hpMid : COLORS.hpLow}"></div></div>
      <div class="muted small">HP ${u.hp} / ${u.maxHp}</div>
      <div class="stats">
        <span>ATK</span><span>${u.stats.atk}</span><span>MAG</span><span>${u.stats.mag}</span>
        <span>DEF</span><span>${u.stats.def}</span><span>SPD</span><span>${u.stats.spd}</span>
        <span>MOVE</span><span>${info.move}${info.flying ? " · flies" : ""}</span>
        <span>Weapon</span><span>${cap(u.weapon)} · Pow ${WEAPON_POWER[u.weapon]}</span>
        <span>Items</span><span>${u.items.map(cap).join(", ") || "none"}</span>
      </div>
      <div class="tags"><span class="chip" style="color:${COLORS.attr[u.attribute]}">${cap(u.attribute)}</span>${u.mark ? `<span class="chip">Marked: ${cap(u.mark)}</span>` : ""}${u.burnTurns ? `<span class="chip" style="color:${COLORS.burn}">Burning</span>` : ""}</div>
      ${tile}`;
  };

  const cmdPanel = () => {
    const el = byId("cmd");
    if (mode === "over" && result) {
      const win = result.winner === Team.Player;
      el.innerHTML = `<div class="${win ? "win-text" : "loss-text"}">${win ? "Victory" : "Defeat"}</div>
        <p class="muted small">by ${result.reason} on turn ${result.turns} · score ${result.score.toFixed(2)}</p>
        <ul class="notes">${(summary?.notes ?? []).map(n => `<li>${esc(n)}</li>`).join("")}</ul>
        <p class="hint">${esc(saved || "Saving battle...")}</p>
        <div class="row tight" style="margin-top:10px">
          <button class="btn sm primary" id="again">Play again</button>
          <button class="btn sm" data-go="battle">Watch AI here</button>
          <button class="btn sm" data-go="menu">Menu</button>
        </div>`;
      byId("again").onclick = () => { S.seed += 1; go("solo"); };
      bindGo();
      return;
    }
    if (mode === "busy") {
      el.innerHTML = `<p class="muted">${phase === Team.Npc ? "Enemy phase..." : "Your phase begins..."}</p>`;
      return;
    }
    const noticeHtml = notice ? `<div class="notice">${esc(notice)}</div>` : "";
    if (mode === "idle") {
      const mine = aliveOf(b, Team.Player);
      el.innerHTML = `<p>Your phase. Select a unit to command.</p>
        <ul class="roster">${mine.map(u => `<li data-id="${u.id}" class="${acted.has(u.id) ? "done" : ""}">
          <span>${CLASSES[u.cls].glyph}\uFE0E ${cap(u.cls)}</span><span class="muted">${acted.has(u.id) ? "acted" : `${u.hp}/${u.maxHp} HP`}</span></li>`).join("")}</ul>
        ${noticeHtml}`;
      el.querySelectorAll<HTMLElement>(".roster li").forEach(li => li.addEventListener("click", () => {
        cursor = { ...getUnit(b, li.dataset.id!).pos };
        render();
      }));
      return;
    }
    if (mode === "move") {
      el.innerHTML = `<p>Move <b>${esc(sel!)}</b>: pick a blue tile (its own tile to stay).</p>${noticeHtml}
        <button class="btn sm" id="c-back">Back</button>`;
      byId("c-back").onclick = cancel;
      return;
    }
    if (mode === "menu") {
      el.innerHTML = `<div class="cmd-menu">${menu.map((m, i) =>
        `<button class="btn ${i === menuIdx ? "cur" : ""}" data-m="${i}" ${m.enabled ? "" : "disabled"}>${m.label}</button>`).join("")}</div>
        <p class="hint" style="margin-top:8px">▲ ▼ choose · Enter confirm · Esc back</p>`;
      el.querySelectorAll<HTMLElement>("[data-m]").forEach(btn => btn.addEventListener("click", () => {
        menuIdx = Number(btn.dataset.m);
        confirm();
      }));
      return;
    }
    if (mode === "target") {
      const u = getUnit(b, sel!);
      const def = targets[tIdx];
      const f = forecast(b, u, dest!, def);
      const c = f.counter;
      el.innerHTML = `<div class="forecast">
          <div class="fc you"><div class="fc-name">${cap(u.cls)}</div>
            <div class="fc-row"><span>HP</span><b>${u.hp}</b></div>
            <div class="fc-row"><span>DMG</span><b>${f.dmg}${f.strikes > 1 ? " ×2" : ""}</b></div>
            <div class="fc-row"><span>HIT</span><b>${f.hit}%</b></div></div>
          <div class="fc foe"><div class="fc-name">${cap(def.cls)}</div>
            <div class="fc-row"><span>HP</span><b>${def.hp}</b></div>
            <div class="fc-row"><span>DMG</span><b>${c ? `${c.dmg}${c.strikes > 1 && f.strikes < 2 ? " ×2" : ""}` : "-"}</b></div>
            <div class="fc-row"><span>HIT</span><b>${c ? `${c.hit}%` : "-"}</b></div></div>
        </div>
        ${f.reaction ? `<div class="react">Response: ${cap(f.reaction)}</div>` : ""}
        ${f.tri > 1 ? `<div class="tri up">Weapon advantage ▲</div>` : f.tri < 1 ? `<div class="tri down">Weapon disadvantage ▼</div>` : ""}
        ${!c ? `<div class="muted small" style="margin-top:4px">No counterattack</div>` : ""}
        ${def.hp <= f.dmg * f.strikes ? `<div class="kill">Can defeat</div>` : ""}
        <div class="row tight" style="margin-top:10px">
          <button class="btn sm primary" id="fc-attack">Attack</button><button class="btn sm" id="fc-back">Back</button>
        </div>
        <p class="hint">◀ ▶ switch target (${tIdx + 1}/${targets.length})</p>`;
      byId("fc-attack").onclick = confirm;
      byId("fc-back").onclick = cancel;
    }
  };

  const logPanel = () => {
    const evs = b.log.filter(e => e.t !== "evade");
    byId("log").innerHTML = evs.map(e => {
      const id = e.t === "attack" ? e.attacker : "unit" in e ? e.unit : null;
      const side = id ? getUnit(b, id).team : e.t === "turn_start" ? e.team : "";
      return `<li class="${e.t} ${side ? `side-${side}` : ""}">${esc(describe(e))}</li>`;
    }).join("");
    const el = byId("log");
    el.scrollTop = el.scrollHeight;
  };

  const render = () => {
    let blue: Pos[] = [];
    let red: Pos[] = [];
    if (mode === "move" && sel) ({ blue, red } = ranges(getUnit(b, sel)));
    else if (mode === "target") red = targets.map(t => ({ ...t.pos }));
    else if (mode === "idle") {
      const h = unitAt(b, cursor);
      if (h && h.team === Team.Npc) red = reachableTiles(b, h);
      else if (h && !acted.has(h.id)) ({ blue, red } = ranges(h));
    }
    const moved = sel && dest && (mode === "menu" || mode === "target") ? { id: sel, to: dest } : undefined;
    board.draw({ grid: b.grid, frame: frameOf(b, lastEvent, moved), cursor, blue, red });
    byId("turninfo").textContent = `Turn ${b.turn} / ${MAX_TURNS} · ${phase === Team.Player ? "Player" : "Enemy"} Phase`;
    byId("rivalchip").textContent = rival ? "Rival Gen " + rival.generation : "Rival: base AI";
    byId("rivalchip").title = rival ? rival.rationale : "";
    const banner = byId("banner");
    banner.className = `banner ${mode === "over" && result ? (result.winner === Team.Player ? "win" : "loss") : ""}`;
    banner.textContent = mode === "over" && result ? (result.winner === Team.Player ? "VICTORY" : "DEFEAT") : "";
    unitPanel();
    cmdPanel();
    logPanel();
  };

  // ---------- game flow ----------
  const animate = (events: BattleEvent[], done: () => void) => {
    const list = events.filter(e => e.t !== "evade");
    let i = 0;
    const tick = () => {
      if (i >= list.length) { done(); return; }
      const e = list[i++];
      lastEvent = e;
      if (e.t === "move") cursor = { ...e.to };
      else if (e.t === "attack") cursor = { ...getUnit(b, e.attacker).pos };
      else if ("unit" in e) cursor = { ...getUnit(b, e.unit).pos };
      render();
      timers.push(window.setTimeout(tick, e.t === "turn_start" ? delay() * 1.5 : delay()));
    };
    tick();
  };

  const finish = (w: Team, why: "rout" | "time") => {
    b.winner = w;
    b.log.push({ t: "end", turn: b.turn, winner: w, reason: why });
    const playerHp = hpRatio(b, Team.Player);
    const npcHp = hpRatio(b, Team.Npc);
    result = {
      mapId: S.mapId, seed: S.seed, winner: w, reason: why, turns: b.turn, playerHp, npcHp,
      score: (w === Team.Player ? 1 : 0) + 0.5 * (playerHp - npcHp),
      units: b.units.map(u => ({ id: u.id, team: u.team, alive: u.alive, hp: u.hp, maxHp: u.maxHp, expGained: u.expGained })),
      errors, log: b.log,
    };
    summary = summarize({ ...result, npc: S.npc });
    lastSolo = { result, summary };
    postSolo({ player: playerId(), map_id: S.mapId, npc_id: S.npc, seed: S.seed, rival_playbook_id: rival ? rival.id : null, rival_generation: rival ? rival.generation : null, result, summary, party }).then(msg => { saved = msg; if (mode === "over") render(); });
    mode = "over";
    lastEvent = null;
    render();
  };

  const checkEnd = () => {
    if (mode === "over") return true;
    if (!aliveOf(b, Team.Npc).length) { finish(Team.Player, "rout"); return true; }
    if (!aliveOf(b, Team.Player).length) { finish(Team.Npc, "rout"); return true; }
    return false;
  };

  const playerPhase = () => {
    acted.clear();
    mode = "busy";
    phase = Team.Player;
    b.log.push({ t: "turn_start", turn: b.turn, team: Team.Player });
    const start = b.log.length - 1;
    startOfPhase(b, Team.Player);
    animate(b.log.slice(start), () => {
      if (checkEnd()) return;
      mode = "idle";
      lastEvent = null;
      const first = aliveOf(b, Team.Player)[0];
      if (first) cursor = { ...first.pos };
      render();
    });
  };

  const endRound = () => {
    if (b.turn >= MAX_TURNS) {
      finish(hpRatio(b, Team.Player) > hpRatio(b, Team.Npc) ? Team.Player : Team.Npc, "time");
      return;
    }
    b.turn += 1;
    playerPhase();
  };

  const enemyPhase = () => {
    mode = "busy";
    phase = Team.Npc;
    sel = null;
    dest = null;
    notice = "";
    b.log.push({ t: "turn_start", turn: b.turn, team: Team.Npc });
    const start = b.log.length - 1;
    startOfPhase(b, Team.Npc);
    const queue = aliveOf(b, Team.Npc).map(u => u.id);
    const next = (i: number) => {
      if (checkEnd()) return;
      if (i >= queue.length) { endRound(); return; }
      const u = getUnit(b, queue[i]);
      if (!u.alive) { next(i + 1); return; }
      const a = npcPolicy.act(b, u);
      const s = b.log.length;
      if (a) {
        const err = applyAction(b, a);
        if (err) errors.push(`T${b.turn} npc: ${err}`);
      }
      animate(b.log.slice(s), () => next(i + 1));
    };
    animate(b.log.slice(start), () => next(0));
  };

  const act = (target: string | null, useItem: boolean) => {
    if (!sel || !dest) return;
    const unitId = sel;
    const start = b.log.length;
    const err = applyAction(b, { unit: unitId, to: dest, target, useItem });
    notice = err ?? "";
    if (err) errors.push(`T${b.turn} player: ${err}`);
    acted.add(unitId);
    sel = null;
    dest = null;
    mode = "busy";
    animate(b.log.slice(start), () => {
      if (checkEnd()) return;
      if (aliveOf(b, Team.Player).every(u => acted.has(u.id))) { enemyPhase(); return; }
      mode = "idle";
      lastEvent = null;
      render();
    });
  };

  // ---------- input ----------
  function confirm() {
    if (mode === "idle") {
      const u = unitAt(b, cursor);
      if (u && u.team === Team.Player && !acted.has(u.id)) { sel = u.id; mode = "move"; notice = ""; }
      else if (u && u.team === Team.Player) notice = `${u.id} has already acted.`;
      render();
      return;
    }
    if (mode === "move") {
      const u = getUnit(b, sel!);
      if (!reachableTiles(b, u).some(p => p.x === cursor.x && p.y === cursor.y)) {
        notice = "Can't move there.";
        render();
        return;
      }
      dest = { ...cursor };
      menu = [
        { key: "attack", label: "Attack", enabled: targetsFrom(b, u, dest).length > 0 },
        { key: "item", label: u.items.length ? `Item · ${cap(u.items[0])}` : "Item", enabled: u.items.length > 0 && u.hp < u.maxHp },
        { key: "wait", label: "Wait", enabled: true },
      ];
      menuIdx = menu.findIndex(m => m.enabled);
      notice = "";
      mode = "menu";
      render();
      return;
    }
    if (mode === "menu") {
      const m = menu[menuIdx];
      if (!m?.enabled) return;
      if (m.key === "attack") {
        targets = targetsFrom(b, getUnit(b, sel!), dest!);
        tIdx = 0;
        cursor = { ...targets[0].pos };
        mode = "target";
        render();
      } else act(null, m.key === "item");
      return;
    }
    if (mode === "target") act(targets[tIdx].id, false);
  }

  function cancel() {
    if (mode === "target") { mode = "menu"; cursor = { ...dest! }; }
    else if (mode === "menu") { mode = "move"; cursor = { ...dest! }; dest = null; }
    else if (mode === "move") { cursor = { ...getUnit(b, sel!).pos }; sel = null; mode = "idle"; }
    notice = "";
    render();
  }

  const arrow = (dx: number, dy: number) => {
    if (mode === "busy" || mode === "over") return;
    if (mode === "menu") {
      const step = dy || dx;
      do { menuIdx = (menuIdx + step + menu.length) % menu.length; } while (!menu[menuIdx].enabled);
      render();
      return;
    }
    if (mode === "target") {
      tIdx = (tIdx + (dx || dy) + targets.length) % targets.length;
      cursor = { ...targets[tIdx].pos };
      render();
      return;
    }
    cursor = { x: Math.max(0, Math.min(GRID_SIZE - 1, cursor.x + dx)), y: Math.max(0, Math.min(GRID_SIZE - 1, cursor.y + dy)) };
    render();
  };

  document.querySelectorAll<HTMLElement>("[data-dir]").forEach(btn => btn.addEventListener("click", () => {
    const [dx, dy] = btn.dataset.dir!.split(",").map(Number);
    arrow(dx, dy);
  }));
  byId("ok").onclick = () => { if (mode !== "busy" && mode !== "over") confirm(); };
  byId("confirm").onclick = () => { if (mode !== "busy" && mode !== "over") confirm(); };
  byId("cancel").onclick = () => { if (mode !== "busy" && mode !== "over") cancel(); };
  byId("endturn").onclick = () => { if (mode === "idle") enemyPhase(); };
  byId("rename").onclick = () => { const n = prompt("Player name (letters, numbers, - or _)", playerId()); if (n && setPlayerId(n)) go("solo"); };
  byId<HTMLInputElement>("speed").oninput = e => { S.speed = Number((e.target as HTMLInputElement).value); };
  canvas.addEventListener("click", ev => {
    if (mode === "busy" || mode === "over" || mode === "menu") return;
    const rect = canvas.getBoundingClientRect();
    const tile = {
      x: Math.min(GRID_SIZE - 1, Math.floor(((ev.clientX - rect.left) / rect.width) * GRID_SIZE)),
      y: Math.min(GRID_SIZE - 1, Math.floor(((ev.clientY - rect.top) / rect.height) * GRID_SIZE)),
    };
    if (mode === "target") {
      const i = targets.findIndex(t => t.pos.x === tile.x && t.pos.y === tile.y);
      if (i >= 0) { tIdx = i; cursor = tile; confirm(); }
      return;
    }
    cursor = tile;
    confirm();
  });
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT") return;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.key]) { e.preventDefault(); arrow(...dirs[e.key]); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (mode !== "busy" && mode !== "over") confirm(); }
    else if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); if (mode !== "busy" && mode !== "over") cancel(); }
    else if (e.key === "e" || e.key === "E") { if (mode === "idle") enemyPhase(); }
  };
  window.addEventListener("keydown", onKey);
  setCleanup(() => {
    timers.forEach(t => window.clearTimeout(t));
    window.removeEventListener("keydown", onKey);
  });

  bindGo();
  render();
  fetchRival(playerId()).then(r => {
    rival = r;
    if (r) npcPolicy = playbookPolicy(r.playbook, "rival");
    playerPhase();
  });
}
