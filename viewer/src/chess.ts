// chess.ts: Chess RPG mode. Hero cards, river board, training ladder, chests, gems, ghost battles.
import {
  BRIDGE_COLS, CARDS, H, QUEEN_CASTS, ROLE_CARDS, W, applyChess, byIdC, chooseChessAction, createChess, isWater,
  pieceActions, pieceAt, type ChessAction, type ChessEvent, type ChessPersonality, type ChessState, type Deck, type Piece,
} from "../../game/src/chess.js";
import {
  GEM_PACKS, MAX_LEVEL, UNLOCK_GEMS, canUpgrade, deckWithLevels, newCollection, recordResult, setDeckCard, unlockWithGems,
  upgrade, upgradeCost, type ChestDraw, type Collection,
} from "../../game/src/cards.js";
import { LADDER, ladderReward, recommendDecks, type DeckPick } from "../../game/src/ladder.js";
import { candidates, describeAction } from "../../game/src/chess-hint.js";
import { bindGo, esc, setCleanup, topbar } from "./screens.js";
import { COLORS, TILE } from "./theme.js";
import { playerId } from "./api.js";

const STRIPE_LINK = "";
const GLYPH: Record<string, string> = { pawn: "♟", knight: "♞", bishop: "♝", rook: "♜", queen: "♛", king: "♚" };
const ROLE_LABEL: Record<string, string> = { pawn: "Pawn card", knight: "Knight", bishop: "Bishop", rook: "Rook" };

interface Profile { player: string; collection: Collection; ladderCleared: number; trophies: number; }
interface Match { mode: "ladder" | "ghost" | "free"; level?: number; opponent?: string; enemy: Deck; personality: ChessPersonality; title: string; }
interface Reward { gems: number; chest: ChestDraw[]; firstClear: boolean; trophies: number; }

let profile: Profile | null = null;
let online = false;
const sprites: Record<string, HTMLImageElement> = {};
const LOCAL_KEY = () => `tg.chess.${playerId()}`;

function loadSprites() {
  for (const id of Object.keys(CARDS)) {
    if (sprites[id]) continue;
    const img = new Image();
    img.src = `/assets/cards/${id}.png`;
    sprites[id] = img;
  }
}
const spriteOk = (id: string) => { const i = sprites[id]; return !!i && i.complete && i.naturalWidth > 0; };

async function api<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const r = await fetch(`/api/chess/${path}`, body === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

function saveLocal() {
  if (!profile || online) return;
  try { localStorage.setItem(LOCAL_KEY(), JSON.stringify(profile)); } catch { /* storage blocked */ }
}

async function loadProfile(): Promise<Profile> {
  const j = await api<{ profile: Profile }>(`profile?player=${encodeURIComponent(playerId())}`);
  if (j?.profile) { online = true; return j.profile; }
  online = false;
  try {
    const raw = localStorage.getItem(LOCAL_KEY());
    if (raw) return JSON.parse(raw) as Profile;
  } catch { /* ignore */ }
  return { player: playerId(), collection: newCollection(), ladderCleared: 0, trophies: 0 };
}

async function cardOp(op: "upgrade" | "unlock" | "equip", card: string): Promise<boolean> {
  if (!profile) return false;
  if (online) {
    const j = await api<{ ok: boolean; profile: Profile }>("card", { player: profile.player, op, card });
    if (j) { profile = j.profile; return j.ok; }
    return false;
  }
  const c = profile.collection;
  const ok = op === "upgrade" ? upgrade(c, card) : op === "unlock" ? unlockWithGems(c, card) : setDeckCard(c, card);
  saveLocal();
  return ok;
}

const app = () => document.getElementById("app")!;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const cardName = (id: string) => CARDS[id]?.name ?? id;
const gemsChip = () => `<span class="chip" style="color:#7fd8ff">💎 ${profile?.collection.gems ?? 0}</span>`;
const modeChip = () => `<span class="chip ${online ? "" : "muted"}">${online ? "MongoDB synced" : "Offline (local save)"}</span>`;

function cardTile(id: string, extra = "", dim = false) {
  const c = CARDS[id]!;
  const o = profile?.collection.cards[id];
  const art = spriteOk(id) ? `<img src="/assets/cards/${id}.png" alt="" style="width:56px;height:56px;object-fit:contain">` : `<div class="glyph">${GLYPH[c.kind]}\uFE0E</div>`;
  return `<div class="panel card" style="${dim ? "opacity:.45;" : ""}min-width:150px">
    ${art}<div class="name">${esc(c.name)}</div>
    <div class="muted small">${ROLE_LABEL[c.kind] ?? c.kind} · ${c.weapon} · ${c.body}${o ? ` · Lv ${o.level}` : ""}</div>
    <div class="small" style="margin:4px 0">HP ${c.hp} · ATK ${c.atk || c.mag} · DEF ${c.def} · SPD ${c.spd}</div>
    <div class="muted small">${esc(c.blurb)}</div>${extra}</div>`;
}

// ---------- Hub ----------
export async function chessScreen() {
  loadSprites();
  app().innerHTML = `<div class="screen">${topbar("Chess RPG")}<p class="muted" style="padding:20px">Loading your collection…</p></div>`;
  bindGo();
  profile = await loadProfile();
  hub();
}

async function hub() {
  const p = profile!;
  const next = Math.min(LADDER.length, p.ladderCleared + 1);
  app().innerHTML = `<div class="screen">
    ${topbar("Chess RPG", `${modeChip()}${gemsChip()}<span class="chip" style="color:var(--gold)">🏆 ${p.trophies}</span><span class="muted small">Player: ${esc(p.player)}</span>`)}
    <div style="display:grid;grid-template-columns:minmax(300px,1fr) minmax(300px,1.2fr);gap:14px;padding:14px">
      <div class="panel"><h3>Training Ladder</h3>
        <p class="muted small">Beat AI generals to earn gems and card chests. First clears pay triple.</p>
        <ul class="gen-list" id="ladder">${LADDER.map(l => {
          const done = l.level <= p.ladderCleared, open = l.level <= next;
          return `<li data-level="${l.level}" class="${l.level === next ? "sel" : ""}" style="${open ? "" : "opacity:.45"}">
            <span class="g">${done ? "✓" : open ? "▶" : "🔒"} ${l.level}. ${esc(l.name)}</span>
            <span class="muted small">${l.personality} · 💎 ${l.gems}${done ? "" : ` (first ×3)`}</span></li>`;
        }).join("")}</ul>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="panel"><h3>Your Deck</h3>
          <div class="cards" style="display:flex;gap:8px;flex-wrap:wrap">${(["pawn", "knight", "bishop", "rook"] as const).map(r => cardTile(p.collection.deck[r])).join("")}</div>
          <div class="row" style="margin-top:10px"><button class="btn primary" id="deckbtn">Cards &amp; Deck</button><button class="btn" id="shopbtn">Gem Shop</button>
            <button class="btn" id="freebtn">Quick match</button></div>
        </div>
        <div class="panel"><h3>Ghost Battle</h3>
          <p class="muted small">Fight another player's saved deck, played by the AI. Win +30 trophies, lose −15.</p>
          <div class="row"><button class="btn primary" id="ghostbtn" ${online ? "" : "disabled"}>Find a ghost</button><span class="muted small" id="ghostmsg">${online ? "" : "Needs the API server"}</span></div>
        </div>
        <div class="panel"><h3>Leaderboard</h3><ol class="log" id="lb"><li class="muted">${online ? "Loading…" : "Needs the API server"}</li></ol></div>
      </div>
    </div></div>`;
  bindGo();
  $("ladder").querySelectorAll<HTMLElement>("li").forEach(li => li.addEventListener("click", () => {
    const lv = Number(li.dataset.level);
    if (lv > next) return;
    const l = LADDER[lv - 1]!;
    battle({ mode: "ladder", level: lv, enemy: l.deck, personality: l.personality, title: `Ladder ${lv} · ${l.name}` });
  }));
  $("deckbtn").onclick = () => deckView();
  $("shopbtn").onclick = () => shopView();
  $("freebtn").onclick = () => {
    const l = LADDER[Math.floor(Math.random() * Math.min(LADDER.length, next + 1))]!;
    battle({ mode: "free", enemy: l.deck, personality: l.personality, title: `Quick match vs ${l.name}` });
  };
  $("ghostbtn").onclick = async () => {
    $("ghostmsg").textContent = "Searching…";
    const j = await api<{ ghost: { opponent: string; deck: Deck; personality: ChessPersonality; trophies: number } | null }>(`ghost?player=${encodeURIComponent(p.player)}`);
    if (!j?.ghost) { $("ghostmsg").textContent = "No other players yet. Ask a friend to play one match!"; return; }
    battle({ mode: "ghost", opponent: j.ghost.opponent, enemy: j.ghost.deck, personality: j.ghost.personality, title: `Ghost of ${j.ghost.opponent} (🏆 ${j.ghost.trophies})` });
  };
  if (online) {
    const lb = await api<{ top: { player: string; trophies: number; ladderCleared: number }[] }>("leaderboard");
    const el = document.getElementById("lb");
    if (el && lb) el.innerHTML = lb.top.map(r => `<li class="${r.player === p.player ? "current" : ""}">${esc(r.player)} · 🏆 ${r.trophies} · ladder ${r.ladderCleared}</li>`).join("") || `<li class="muted">No players yet</li>`;
  }
}

// ---------- Cards & Deck ----------
function deckView(recs: DeckPick[] | null = null, recLevel = Math.min(LADDER.length, (profile?.ladderCleared ?? 0) + 1), msg = "") {
  const p = profile!;
  const c = p.collection;
  const roles = ["pawn", "knight", "bishop", "rook"] as const;
  const tile = (id: string) => {
    const o = c.cards[id]!;
    const equipped = c.deck[CARDS[id]!.kind as (typeof roles)[number]] === id;
    const need = upgradeCost(o.level);
    const bar = o.unlocked && o.level < MAX_LEVEL ? `<div class="hpbar" title="${o.copies}/${need} copies"><div style="width:${Math.min(100, (o.copies / need) * 100)}%;background:${COLORS.gold}"></div></div><div class="muted small">${o.copies}/${need} copies to Lv ${o.level + 1}</div>` : o.unlocked ? `<div class="muted small">Max level</div>` : "";
    const btns = !o.unlocked
      ? `<button class="btn sm" data-op="unlock" data-card="${id}" ${c.gems >= UNLOCK_GEMS ? "" : "disabled"}>Unlock 💎 ${UNLOCK_GEMS}</button>`
      : `${equipped ? `<span class="chip" style="color:var(--gold)">Equipped</span>` : `<button class="btn sm" data-op="equip" data-card="${id}">Equip</button>`}
         ${canUpgrade(c, id) ? `<button class="btn sm primary" data-op="upgrade" data-card="${id}">Upgrade</button>` : ""}`;
    return cardTile(id, `${bar}<div class="row tight" style="margin-top:6px">${btns}</div>`, !o.unlocked);
  };
  app().innerHTML = `<div class="screen">
    ${topbar("Cards & Deck", `${modeChip()}${gemsChip()}<button class="btn sm" id="back">◀ Chess hub</button>`)}
    <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:14px;padding:14px">
      <div>${roles.map(r => `<div class="panel" style="margin-bottom:12px"><h3>${ROLE_LABEL[r]}</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${ROLE_CARDS[r].map(tile).join("")}</div></div>`).join("")}
        <p class="muted small" id="opmsg">${esc(msg)}</p></div>
      <div class="panel"><h3>Trainer · Recommend a deck</h3>
        <p class="muted small">The trainer plays every deck you own against the general you pick, then ranks them.</p>
        <div class="row"><label class="field">Opponent <select id="reclevel">${LADDER.map(l => `<option value="${l.level}" ${l.level === recLevel ? "selected" : ""}>${l.level}. ${esc(l.name)} (${l.personality})</option>`).join("")}</select></label>
          <button class="btn primary" id="recbtn">Recommend</button></div>
        <div id="recs">${recs ? recs.map((r, i) => `<div class="panel" style="margin-top:10px">
            <div class="row" style="justify-content:space-between"><b>#${i + 1} · ${Math.round(r.winRate * 100)}% wins</b><span class="muted small">${r.wins}/${r.games} sims</span></div>
            <div class="small">${roles.map(role => esc(cardName(r.deck[role]))).join(" · ")}</div>
            <p class="quote small">${esc(r.reason)}</p>
            <button class="btn sm" data-use="${i}">Use this deck</button></div>`).join("") : ""}</div>
      </div>
    </div></div>`;
  bindGo();
  $("back").onclick = () => hub();
  app().querySelectorAll<HTMLElement>("[data-op]").forEach(b => b.addEventListener("click", async () => {
    const op = b.dataset.op as "upgrade" | "unlock" | "equip", card = b.dataset.card!;
    const ok = await cardOp(op, card);
    deckView(recs, recLevel, ok ? `${op === "equip" ? "Equipped" : op === "upgrade" ? "Upgraded" : "Unlocked"} ${cardName(card)}.` : `Couldn't ${op} ${cardName(card)}.`);
  }));
  $("recbtn").onclick = async () => {
    const lv = Number($<HTMLSelectElement>("reclevel").value);
    $("recs").innerHTML = `<p class="muted">Simulating…</p>`;
    let picks: DeckPick[] | null = null;
    if (online) picks = (await api<{ picks: DeckPick[] }>(`recommend?player=${encodeURIComponent(p.player)}&level=${lv}`))?.picks ?? null;
    if (!picks) { await new Promise(r => setTimeout(r, 30)); picks = recommendDecks(c, LADDER[lv - 1]!); }
    deckView(picks, lv);
  };
  app().querySelectorAll<HTMLElement>("[data-use]").forEach(b => b.addEventListener("click", async () => {
    const r = recs?.[Number(b.dataset.use)];
    if (!r) return;
    for (const role of roles) if (c.deck[role] !== r.deck[role]) await cardOp("equip", r.deck[role]);
    deckView(recs, recLevel, "Deck updated from the trainer's pick.");
  }));
}

// ---------- Gem Shop ----------
function shopView(msg = "") {
  app().innerHTML = `<div class="screen">
    ${topbar("Gem Shop", `${modeChip()}${gemsChip()}<button class="btn sm" id="back">◀ Chess hub</button>`)}
    <div style="padding:14px;display:flex;gap:14px;flex-wrap:wrap">
      ${GEM_PACKS.map(k => `<div class="panel card" style="min-width:220px;text-align:center">
        <div class="glyph">💎</div><div class="name">${k.gems} gems</div><div class="stat-big">${k.price}</div>
        <button class="btn primary" data-pack="${k.id}" style="margin-top:8px">Buy</button></div>`).join("")}
      <div class="panel" style="max-width:420px"><h3>What gems do</h3>
        <p class="small">Unlock any card instantly for 💎 ${UNLOCK_GEMS}, instead of waiting for it to drop from a chest. Every ladder win pays gems, and first clears pay triple.</p>
        <p class="muted small">${STRIPE_LINK ? "Checkout opens in a new tab." : "Demo mode: purchases are recorded in MongoDB and gems are granted without payment."}</p>
        <p class="muted small" id="shopmsg">${esc(msg)}</p></div>
    </div></div>`;
  bindGo();
  $("back").onclick = () => hub();
  app().querySelectorAll<HTMLElement>("[data-pack]").forEach(b => b.addEventListener("click", async () => {
    const pack = GEM_PACKS.find(k => k.id === b.dataset.pack)!;
    if (STRIPE_LINK) window.open(STRIPE_LINK, "_blank");
    if (online) {
      const j = await api<{ profile: Profile }>("gems", { player: profile!.player, pack: pack.id });
      if (j) profile = j.profile;
    } else { profile!.collection.gems += pack.gems; saveLocal(); }
    shopView(`+${pack.gems} gems added.`);
  }));
}

// ---------- Battle ----------
interface Fx { x: number; y: number; text: string; color: string; until: number; }

function battle(m: Match) {
  const p = profile!;
  const s: ChessState = createChess(deckWithLevels(p.collection), m.enemy);
  let sel: string | null = null;
  let busy = false;
  let hint: ChessAction | null = null;
  let fx: Fx[] = [];
  let done = false;
  const timers: number[] = [];

  app().innerHTML = `<div class="screen">
    ${topbar(esc(m.title), `<span id="turninfo" class="muted"></span>${gemsChip()}<button class="btn sm" id="resign">Resign</button>`)}
    <div class="battle">
      <div class="panel unit-panel" id="info"></div>
      <div class="center-col">
        <div class="board"><canvas id="cboard"></canvas><div class="banner" id="banner"></div></div>
        <div class="panel bottombar"><div class="transport">
          <div class="row tight">
            <button class="btn sm primary" id="hintbtn">Ask the Coach</button>
            <button class="btn sm" id="rally">King: Rally</button>
            <button class="btn sm" id="curse">King: Curse</button>
          </div>
          <div class="hint" id="hinttext">Click a piece to see its moves. Blue: move · Red: attack · Green: heal · Purple: queen strike.</div>
        </div></div>
      </div>
      <div class="side-col">
        <div class="panel"><h3>Rules</h3><p class="small muted">Capture the enemy king to win. Pawns capture pawns but only chip HP off heroes. Hero vs hero is RPG combat with counters. River ranks 4–5: cross on the b/g bridges, or fly. Queen stays put and strikes ${QUEEN_CASTS} times, then vanishes.</p></div>
        <div class="panel"><h3>Battle Log</h3><ol class="log" id="clog"></ol></div>
      </div>
    </div></div>`;
  bindGo();

  const canvas = $<HTMLCanvasElement>("cboard");
  const size = W * TILE, dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);

  const actsFor = (id: string | null) => {
    const pc = id ? byIdC(s, id) : undefined;
    return pc && pc.alive && pc.side === "P" ? pieceActions(s, pc).filter(a => a.type !== "rally" && a.type !== "curse") : [];
  };

  const draw = () => {
    const now = performance.now();
    c.clearRect(0, 0, size, size);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x * TILE, py = y * TILE;
      if (isWater(x, y)) {
        c.fillStyle = COLORS.terrain.water!; c.fillRect(px, py, TILE, TILE);
        c.strokeStyle = COLORS.waterDetail; c.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
          const yy = py + 20 + i * 22 + Math.sin(now / 900 + x + i) * 2;
          c.beginPath(); c.moveTo(px + 8, yy); c.bezierCurveTo(px + 24, yy - 6, px + 40, yy + 6, px + TILE - 8, yy); c.stroke();
        }
      } else {
        c.fillStyle = (x + y) % 2 === 0 ? "#a9c77e" : "#87a85f"; c.fillRect(px, py, TILE, TILE);
        if (BRIDGE_COLS.includes(x) && (y === 3 || y === 4)) {
          c.fillStyle = COLORS.terrain.water!; c.fillRect(px, py, TILE, TILE);
          c.fillStyle = "#8a5a33"; c.fillRect(px + 8, py, TILE - 16, TILE);
          c.strokeStyle = "#5e3b1f"; c.lineWidth = 2;
          for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(px + 8, py + 6 + k * 13); c.lineTo(px + TILE - 8, py + 6 + k * 13); c.stroke(); }
        }
      }
    }
    c.strokeStyle = COLORS.grid; c.lineWidth = 1;
    for (let i = 0; i <= W; i++) {
      c.beginPath(); c.moveTo(i * TILE + 0.5, 0); c.lineTo(i * TILE + 0.5, size); c.stroke();
      c.beginPath(); c.moveTo(0, i * TILE + 0.5); c.lineTo(size, i * TILE + 0.5); c.stroke();
    }
    c.fillStyle = "rgba(0,0,0,0.45)"; c.font = "11px Inter, sans-serif";
    for (let x = 0; x < W; x++) c.fillText("abcdefgh"[x]!, x * TILE + 3, size - 3);
    for (let y = 0; y < H; y++) c.fillText(String(8 - y), 3, y * TILE + 12);
    for (const a of actsFor(sel)) {
      c.fillStyle = a.type === "move" ? COLORS.blueTile : a.type === "attack" ? COLORS.redTile : a.type === "heal" ? "rgba(95,208,126,0.45)" : "rgba(170,90,255,0.45)";
      c.fillRect(a.x * TILE + 2, a.y * TILE + 2, TILE - 4, TILE - 4);
    }
    if (hint) {
      const hp = byIdC(s, hint.pieceId);
      c.strokeStyle = COLORS.gold; c.lineWidth = 4; c.setLineDash([6, 4]);
      if (hp) c.strokeRect(hp.x * TILE + 4, hp.y * TILE + 4, TILE - 8, TILE - 8);
      c.strokeRect(hint.x * TILE + 4, hint.y * TILE + 4, TILE - 8, TILE - 8);
      c.setLineDash([]);
    }
    for (const pc of s.pieces) if (pc.alive) piece(pc);
    fx = fx.filter(f => f.until > now);
    for (const f of fx) {
      const t = 1 - (f.until - now) / 900;
      c.save(); c.font = "bold 20px Inter, sans-serif"; c.textAlign = "center";
      c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,.9)";
      const yy = f.y * TILE + 22 - t * 14;
      c.strokeText(f.text, f.x * TILE + TILE / 2, yy); c.fillStyle = f.color; c.fillText(f.text, f.x * TILE + TILE / 2, yy);
      c.restore();
    }
    if (canvas.isConnected) requestAnimationFrame(draw);
  };

  const piece = (pc: Piece) => {
    const cx = pc.x * TILE + TILE / 2, cy = pc.y * TILE + TILE / 2 - 3, r = TILE * 0.36;
    c.fillStyle = pc.side === "P" ? COLORS.team.player! : COLORS.team.npc!;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = sel === pc.id ? COLORS.cursor : pc.side === "P" ? COLORS.gold : "#fff"; c.lineWidth = sel === pc.id ? 4 : 2; c.stroke();
    if (spriteOk(pc.card)) c.drawImage(sprites[pc.card]!, cx - r, cy - r, r * 2, r * 2);
    else {
      c.fillStyle = "#fff"; c.font = `${Math.round(TILE * 0.46)}px "Apple Symbols", "Segoe UI Symbol", serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(GLYPH[pc.kind] + "\uFE0E", cx, cy + 1);
    }
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    if (pc.kind !== "queen") {
      const w = TILE * 0.72, bx = cx - w / 2, by = pc.y * TILE + TILE - 9, ratio = Math.max(0, pc.hp / pc.maxHp);
      c.fillStyle = COLORS.hpBack; c.fillRect(bx, by, w, 5);
      c.fillStyle = ratio > 0.6 ? COLORS.hpGood : ratio > 0.3 ? COLORS.hpMid : COLORS.hpLow; c.fillRect(bx, by, w * ratio, 5);
    } else {
      for (let i = 0; i < QUEEN_CASTS - s.casts[pc.side]; i++) { c.fillStyle = "#c58bff"; c.beginPath(); c.arc(cx - 10 + i * 10, pc.y * TILE + TILE - 7, 3.5, 0, Math.PI * 2); c.fill(); }
    }
    if (pc.level > 1) { c.fillStyle = COLORS.gold; c.font = "bold 11px Inter, sans-serif"; c.fillText(`L${pc.level}`, pc.x * TILE + TILE - 20, pc.y * TILE + 13); }
  };

  const info = () => {
    const pc = sel ? byIdC(s, sel) : undefined;
    const aura = s.auras.map(a => `<span class="chip">${a.by === "P" ? "Your" : "Enemy"} ${a.kind}</span>`).join("");
    if (!pc) { $("info").innerHTML = `<h3>Piece</h3><p class="muted small">Select one of your pieces.</p><div class="tags">${aura}</div>`; return; }
    const cd = CARDS[pc.card]!;
    const r = pc.hp / pc.maxHp;
    $("info").innerHTML = `<h3>${pc.side === "P" ? "Your" : "Enemy"} ${esc(cd.name)}</h3>
      <div class="uhead"><div class="uglyph" style="background:${pc.side === "P" ? COLORS.team.player : COLORS.team.npc}">${GLYPH[pc.kind]}\uFE0E</div>
      <div><div class="uname">${esc(cd.name)} · Lv ${pc.level}</div><div class="muted small">${pc.kind} · ${pc.weapon} · ${pc.body}</div></div></div>
      ${pc.kind === "queen" ? `<p class="small">Strikes left: ${QUEEN_CASTS - s.casts[pc.side]}</p>` : `<div class="hpbar"><div style="width:${r * 100}%;background:${r > 0.6 ? COLORS.hpGood : r > 0.3 ? COLORS.hpMid : COLORS.hpLow}"></div></div>
      <div class="muted small">HP ${pc.hp} / ${pc.maxHp}</div>
      <div class="stats"><span>ATK</span><span>${pc.atk}</span><span>MAG</span><span>${pc.mag}</span><span>DEF</span><span>${pc.def}</span><span>RES</span><span>${pc.res}</span><span>SPD</span><span>${pc.spd}</span></div>`}
      <p class="muted small">${esc(cd.blurb)}</p><div class="tags">${aura}</div>`;
  };

  const log = (ev: ChessEvent[], side: "P" | "E") => {
    const ol = $("clog");
    for (const e of ev) {
      ol.insertAdjacentHTML("beforeend", `<li class="side-${side === "P" ? "player" : "npc"}">${esc(e.text)}</li>`);
      if (e.x != null && e.y != null) {
        const until = performance.now() + 900;
        if (e.type === "attack" || e.type === "counter") fx.push({ x: e.x, y: e.y, text: `-${e.amount}`, color: COLORS.damage, until });
        if (e.type === "kill" || e.type === "capture") fx.push({ x: e.x, y: e.y, text: e.type === "capture" ? "CAPTURED" : "DEFEATED", color: COLORS.damage, until });
        if (e.type === "cast") fx.push({ x: e.x, y: e.y, text: "⚡ STRIKE", color: "#c58bff", until });
      }
      if (e.type === "heal" && e.targetId) { const t = byIdC(s, e.targetId); if (t) fx.push({ x: t.x, y: t.y, text: `+${e.amount}`, color: COLORS.heal, until: performance.now() + 900 }); }
    }
    ol.lastElementChild?.scrollIntoView({ block: "nearest" });
  };

  const hud = () => {
    $("turninfo").textContent = s.winner ? "Game over" : `Turn ${Math.floor(s.ply / 2) + 1} · ${s.turn === "P" ? "Your move" : "Enemy thinking…"}`;
    const king = s.pieces.find(q => q.alive && q.side === "P" && q.kind === "king");
    const ready = !!king && s.kingCd.P === 0 && s.turn === "P" && !busy && !s.winner;
    $<HTMLButtonElement>("rally").disabled = !ready;
    $<HTMLButtonElement>("curse").disabled = !ready;
    $<HTMLButtonElement>("rally").textContent = s.kingCd.P > 0 ? `Rally (${s.kingCd.P})` : "King: Rally";
    $<HTMLButtonElement>("curse").textContent = s.kingCd.P > 0 ? `Curse (${s.kingCd.P})` : "King: Curse";
    info();
  };

  const finish = async () => {
    if (done) return;
    done = true;
    const won = s.winner === "P";
    const banner = $("banner");
    banner.className = `banner ${won ? "win" : "loss"}`;
    banner.textContent = won ? "VICTORY" : s.winner === "draw" ? "DRAW" : "DEFEAT";
    let reward: Reward | null = null;
    if (online) {
      const j = await api<Reward & { profile: Profile }>("result", { player: p.player, mode: m.mode, level: m.level, opponent: m.opponent, won, plies: s.ply });
      if (j) { profile = j.profile; reward = j; }
    }
    if (!reward) {
      const firstClear = m.mode === "ladder" && won && (m.level ?? 0) > p.ladderCleared;
      const gems = m.mode === "ladder" ? ladderReward(m.level ?? 1, won, firstClear) : won ? 15 : 0;
      const chest = recordResult(p.collection, won);
      p.collection.gems += gems;
      if (firstClear) p.ladderCleared = m.level!;
      reward = { gems, chest, firstClear, trophies: 0 };
      saveLocal();
    }
    const r = reward;
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;max-width:760px;width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.6)";
    panel.innerHTML = `<h3>${won ? "Victory!" : "Defeat"}${r.firstClear ? " · First clear ×3" : ""}</h3>
      <p>${r.gems ? `💎 +${r.gems} gems` : "No gems this time."}${r.trophies ? ` · 🏆 ${r.trophies > 0 ? "+" : ""}${r.trophies}` : ""}</p>
      ${r.chest.length ? `<h4 class="sub-h">Chest · ${r.chest.length} cards</h4><div id="chest" style="display:flex;gap:8px;flex-wrap:wrap"></div>` : `<p class="muted small">Win to earn a chest of 5 cards.</p>`}
      <div class="row" style="margin-top:12px"><button class="btn primary" id="again">Rematch</button><button class="btn" id="tohub">Chess hub</button><button class="btn" id="todeck">Cards &amp; Deck</button></div>`;
    app().appendChild(panel);
    const chestEl = document.getElementById("chest");
    r.chest.forEach((d, i) => timers.push(window.setTimeout(() => chestEl?.insertAdjacentHTML("beforeend",
      cardTile(d.card, `<div class="chip" style="color:var(--gold);margin-top:6px">${d.newlyUnlocked ? "NEW! " : ""}×${d.copies}</div>`)), 350 * (i + 1))));
    $("again").onclick = () => battle(m);
    $("tohub").onclick = () => hub();
    $("todeck").onclick = () => deckView();
    hud();
  };

  const enemyTurn = () => {
    busy = true; hud();
    timers.push(window.setTimeout(() => {
      const a = chooseChessAction(s, m.personality);
      if (a) log(applyChess(s, a), "E");
      busy = false; hud();
      if (s.winner) void finish();
    }, 550));
  };

  const play = (a: ChessAction) => {
    hint = null; sel = null;
    log(applyChess(s, a), "P");
    hud();
    if (s.winner) { void finish(); return; }
    enemyTurn();
  };

  canvas.addEventListener("click", ev => {
    if (busy || s.winner || s.turn !== "P") return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(W - 1, Math.floor(((ev.clientX - rect.left) / rect.width) * W));
    const y = Math.min(H - 1, Math.floor(((ev.clientY - rect.top) / rect.height) * H));
    const act = actsFor(sel).find(a => a.x === x && a.y === y);
    if (act) { play(act); return; }
    const q = pieceAt(s, x, y);
    sel = q && q.side === "P" && sel !== q.id ? q.id : q && q.side === "E" ? q.id : null;
    hud();
  });
  $("rally").onclick = () => { const k = s.pieces.find(q => q.alive && q.side === "P" && q.kind === "king"); if (k) play({ type: "rally", pieceId: k.id, x: k.x, y: k.y }); };
  $("curse").onclick = () => { const k = s.pieces.find(q => q.alive && q.side === "P" && q.kind === "king"); if (k) play({ type: "curse", pieceId: k.id, x: k.x, y: k.y }); };
  $("resign").onclick = () => { if (!s.winner) { s.winner = "E"; void finish(); } };
  $("hintbtn").onclick = async () => {
    if (busy || s.winner) return;
    $("hinttext").textContent = "Coach is thinking…";
    const j = online ? await api<{ action: ChessAction | null; text: string; source: string }>("hint", { state: s }) : null;
    if (j?.action) { hint = j.action; $("hinttext").textContent = `${j.source === "llm" ? "🧠 Coach (Luminal)" : "📘 Coach"}: ${j.text}`; }
    else {
      const top = candidates(s)[0];
      hint = top ?? null;
      $("hinttext").textContent = top ? `📘 Coach: ${describeAction(s, top)}.` : "No legal moves.";
    }
  };

  setCleanup(() => timers.forEach(t => window.clearTimeout(t)));
  hud();
  requestAnimationFrame(draw);
}
