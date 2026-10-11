// chess.ts: Chess RPG home (Clash-style swipe tabs), arena modes, cards, shop, ranking, lab, and the battle screen.
import {
  BRIDGE_COLS, CARDS, DECK_BUDGET, H, QUEEN_CASTS, RARITY_COLOR, RARITY_LABEL, ROLE_CARDS, SPELLS, SPELL_IDS, SPELL_LIMIT, W,
  applyChess, byIdC, chooseChessAction, costOf, createChess, deckCost, isWater, pieceActions, pieceAt, rarityOf, spellPower,
  type ChessAction, type ChessEvent, type ChessPersonality, type ChessState, type Deck, type Piece, type Side,
} from "../../game/src/chess.js";
import {
  GEM_PACKS, MAX_LEVEL, canUpgrade, unlockCost, deckWithLevels, newCollection, normalizeCollection, recordResult, setDeckCard, unlockWithGems,
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
const ROLES = ["pawn", "knight", "bishop", "rook"] as const;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

type Tab = "shop" | "cards" | "arena" | "rank";
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "shop", icon: "🛒", label: "Shop" },
  { id: "cards", icon: "🃏", label: "Cards" },
  { id: "arena", icon: "⚔️", label: "Battle" },
  { id: "rank", icon: "🏆", label: "Ranking" },
];

interface Profile { player: string; collection: Collection; ladderCleared: number; trophies: number; }
interface Match {
  mode: "ladder" | "ghost" | "free" | "pvp"; level?: number; opponent?: string; enemy?: Deck; personality?: ChessPersonality;
  title: string; roomId?: string; me?: Side; state?: ChessState; seq?: number;
}
interface Reward { gems: number; chest: ChestDraw[]; firstClear: boolean; trophies: number; }
interface Room { status: "waiting" | "playing" | "over"; side: Side; opponent?: string; seq: number; state?: ChessState; winner?: Side | "draw" | null; }

let profile: Profile | null = null;
let online = false;
let tab: Tab = "arena";
try { tab = (localStorage.getItem("tg.tab") as Tab) || "arena"; } catch { /* ignore */ }
if (!["shop", "cards", "arena", "rank"].includes(tab)) tab = "arena";
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

async function call<T>(url: string, body?: unknown): Promise<T | null> {
  try {
    const r = await fetch(url, body === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}
const api = <T>(path: string, body?: unknown) => call<T>(`/api/chess/${path}`, body);
const pvp = <T>(path: string, body?: unknown) => call<T>(`/api/pvp/${path}`, body);

function saveLocal() {
  if (!profile || online) return;
  try { localStorage.setItem(LOCAL_KEY(), JSON.stringify(profile)); } catch { /* storage blocked */ }
}

async function loadProfile(): Promise<Profile> {
  const j = await api<{ profile: Profile }>(`profile?player=${encodeURIComponent(playerId())}`);
  if (j?.profile) { online = true; normalizeCollection(j.profile.collection); return j.profile; }
  online = false;
  try {
    const raw = localStorage.getItem(LOCAL_KEY());
    if (raw) { const pr = JSON.parse(raw) as Profile; normalizeCollection(pr.collection); return pr; }
  } catch { /* ignore */ }
  return { player: playerId(), collection: newCollection(), ladderCleared: 0, trophies: 0 };
}

async function cardOp(op: "upgrade" | "unlock" | "equip", card: string): Promise<boolean> {
  if (!profile) return false;
  if (online) {
    const j = await api<{ ok: boolean; profile: Profile }>("card", { player: profile.player, op, card });
    if (j) { profile = j.profile; normalizeCollection(profile.collection); return j.ok; }
    return false;
  }
  const c = profile.collection;
  const ok = op === "upgrade" ? upgrade(c, card) : op === "unlock" ? unlockWithGems(c, card) : setDeckCard(c, card);
  saveLocal();
  return ok;
}

const app = () => document.getElementById("app")!;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const gemsChip = () => `<span class="chip" style="color:#7fd8ff">💎 ${profile?.collection.gems ?? 0}</span>`;
const modeChip = () => `<span class="chip ${online ? "" : "muted"}">${online ? "MongoDB synced" : "Offline (local save)"}</span>`;

function injectStyle() {
  if (document.getElementById("cr-style")) return;
  const st = document.createElement("style");
  st.id = "cr-style";
  st.textContent = `
  .cr-shell{display:flex;flex-direction:column;height:100vh;max-width:1180px;margin:0 auto}
  .cr-top{display:flex;gap:10px;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(201,162,74,.3)}
  .cr-top .who{font-family:Cinzel,serif;color:#ecd28c;font-size:18px;letter-spacing:.06em}
  .cr-panes{flex:1;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}
  .cr-panes::-webkit-scrollbar{display:none}
  .cr-pane{flex:0 0 100%;scroll-snap-align:center;scroll-snap-stop:always;overflow-y:auto;padding:16px;box-sizing:border-box}
  .cr-nav{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(201,162,74,.35);background:rgba(10,14,30,.94)}
  .cr-nav button{background:none;border:0;color:#98a1b6;padding:8px 0 10px;cursor:pointer;font:inherit;transition:transform .18s,color .18s}
  .cr-nav button span{display:block;font-size:26px;line-height:1.1}
  .cr-nav button small{font-size:12px;letter-spacing:.05em;text-transform:uppercase}
  .cr-nav button.active{color:#ecd28c;transform:translateY(-8px);background:linear-gradient(180deg,rgba(201,162,74,.28),transparent 80%);border-radius:12px 12px 0 0}
  .cr-h{font-family:Cinzel,serif;color:#ecd28c;text-align:center;letter-spacing:.08em;margin:4px 0 2px}
  .cr-sub{text-align:center;color:#98a1b6;margin:0 0 10px}
  .cr-mini{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);width:min(400px,86vw);aspect-ratio:1;margin:10px auto;border:2px solid #c9a24a;border-radius:10px;overflow:hidden;box-shadow:0 0 30px rgba(201,162,74,.25)}
  .cr-mini div{display:flex;align-items:center;justify-content:center;font-size:clamp(11px,2.2vw,19px);color:#fff}
  .cr-modes{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:820px;margin:14px auto 0}
  @media (max-width:700px){.cr-modes{grid-template-columns:1fr}}
  .cr-mode{padding:18px;text-align:center;display:flex;flex-direction:column;gap:8px}
  .cr-mode h3{margin:0}
  .cr-big{font-size:19px;padding:14px 22px;letter-spacing:.08em}
  .cr-deck{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 0}
  .cr-mc{width:76px;padding:6px 4px;text-align:center;border:1px solid rgba(201,162,74,.45);border-radius:8px;background:rgba(20,28,56,.85)}
  .cr-mc .g{font-size:26px} .cr-mc img{width:44px;height:44px;object-fit:contain}
  .cr-mc .n{font-size:11px;line-height:1.2} .cr-mc .l{font-size:10px;color:#ecd28c}
  .cr-modal{position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;z-index:60}
  .cr-modal .panel{min-width:min(420px,90vw);text-align:center}
  .cr-spin{width:52px;height:52px;border:5px solid rgba(201,162,74,.25);border-top-color:#ecd28c;border-radius:50%;animation:crspin 1s linear infinite;margin:14px auto}
  @keyframes crspin{to{transform:rotate(360deg)}}
  .cr-vs{font-family:Cinzel,serif;font-size:34px;color:#ecd28c;margin:6px 0}
  .cr-lad li{cursor:pointer}
  .cr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
  .cr-rar{display:inline-block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:8px;border:1px solid currentColor}
  .cr-cost{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#b04ad8;color:#fff;font-size:11px;font-weight:700;box-shadow:0 0 6px rgba(180,108,255,.6)}
  .cr-spellbar{display:flex;gap:8px;flex-wrap:wrap}
  .cr-spell{border-width:2px !important}
  .cr-spell.on{box-shadow:0 0 12px currentColor}
  `;
  document.head.appendChild(st);
}

const rarColor = (id: string) => RARITY_COLOR[rarityOf(id)];
const rarBadge = (id: string) => `<span class="cr-rar" style="color:${rarColor(id)}">${RARITY_LABEL[rarityOf(id)]}</span> <span class="cr-cost" title="Deck cost">${costOf(id)}</span>`;
const cardLabel = (id: string) => CARDS[id]?.name ?? SPELLS[id]?.name ?? id;

function cardTile(id: string, extra = "", dim = false) {
  const o = profile?.collection.cards[id];
  const sp = SPELLS[id];
  const head = `<div class="row tight" style="justify-content:space-between">${rarBadge(id)}${o ? `<span class="muted small">Lv ${o.level}</span>` : ""}</div>`;
  const border = `border-color:${rarColor(id)}88;${dim ? "opacity:.45;" : ""}`;
  if (sp) {
    const art = spriteOk(id) ? `<img src="/assets/cards/${id}.png" alt="" style="width:56px;height:56px;object-fit:contain">` : `<div class="glyph" style="color:${rarColor(id)}">✦</div>`;
    return `<div class="panel card" style="${border}">${head}${art}<div class="name">${esc(sp.name)}</div>
      <div class="muted small">King spell · ${sp.target === "square" ? "targeted" : "instant"}</div>
      <div class="small" style="margin:4px 0">${esc(sp.blurb)}</div>${extra}</div>`;
  }
  const c = CARDS[id]!;
  const art = spriteOk(id) ? `<img src="/assets/cards/${id}.png" alt="" style="width:56px;height:56px;object-fit:contain">` : `<div class="glyph">${GLYPH[c.kind]}\uFE0E</div>`;
  return `<div class="panel card" style="${border}">${head}
    ${art}<div class="name">${esc(c.name)}</div>
    <div class="muted small">${ROLE_LABEL[c.kind] ?? c.kind} · ${c.weapon} · ${c.body}</div>
    <div class="small" style="margin:4px 0">HP ${c.hp} · ATK ${c.atk || c.mag} · DEF ${c.def} · SPD ${c.spd}</div>
    <div class="muted small">${esc(c.blurb)}</div>${extra}</div>`;
}

function miniCard(id: string, level?: number) {
  const glyph = SPELLS[id] ? "✦" : `${GLYPH[CARDS[id]?.kind ?? "pawn"]}\uFE0E`;
  const art = spriteOk(id) ? `<img src="/assets/cards/${id}.png" alt="">` : `<div class="g" style="color:${rarColor(id)}">${glyph}</div>`;
  return `<div class="cr-mc" style="border-color:${rarColor(id)}">${art}<div class="n">${esc(cardLabel(id))}</div><div class="l"><span class="cr-cost" style="width:16px;height:16px;font-size:10px">${costOf(id)}</span>${level ? ` Lv ${level}` : ""}</div></div>`;
}

function patternSquares(pc: Piece): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const add = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < W && y < H && !(x === pc.x && y === pc.y)) out.push({ x, y }); };
  const O = [[1, 0], [-1, 0], [0, 1], [0, -1]], D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const lines = (dirs: number[][]) => { for (const [dx, dy] of dirs) for (let i = 1; i < 8; i++) add(pc.x + dx! * i, pc.y + dy! * i); };
  switch (pc.kind) {
    case "pawn": {
      const f = pc.side === "P" ? -1 : 1;
      add(pc.x, pc.y + f); if (pc.y === pc.startY) add(pc.x, pc.y + 2 * f);
      add(pc.x - 1, pc.y); add(pc.x + 1, pc.y); add(pc.x - 1, pc.y + f); add(pc.x + 1, pc.y + f);
      break;
    }
    case "knight": for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(pc.x + dx!, pc.y + dy!); break;
    case "bishop": lines(D); break;
    case "rook": lines(O); break;
    case "queen": lines([...O, ...D]); break;
    case "king": for (const [dx, dy] of [...O, ...D]) add(pc.x + dx!, pc.y + dy!); break;
  }
  return out;
}

function deckStrip(d: Deck) {
  const ids = [...ROLES.map(r => d[r]), ...(d.spells ?? [])];
  return `<div class="cr-deck">${ids.map(id => miniCard(id, d.levels?.[id] ?? profile?.collection.cards[id]?.level)).join("")}</div>
    <div class="muted small" style="text-align:center">Deck cost <b style="color:${deckCost(d) > DECK_BUDGET ? "#ff5a52" : "#ecd28c"}">${deckCost(d)} / ${DECK_BUDGET}</b> · ${(d.spells ?? []).length}/${SPELL_LIMIT} spells</div>`;
}

function miniBoard(mine?: Deck, theirs?: Deck) {
  const back = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  const cardFor = (kind: string, d?: Deck) => kind === "queen" || kind === "king" ? kind : d ? (d as unknown as Record<string, string>)[kind] ?? "" : "";
  let html = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const bridge = BRIDGE_COLS.includes(x) && (y === 3 || y === 4);
    const bg = isWater(x, y) ? COLORS.terrain.water : bridge ? "#8a5a33" : (x + y) % 2 === 0 ? "#a9c77e" : "#87a85f";
    const kind = y === 0 || y === 7 ? back[x]! : y === 1 || y === 6 ? "pawn" : "";
    const col = y < 2 ? COLORS.team.npc : COLORS.team.player;
    const id = kind ? cardFor(kind, y < 2 ? theirs : mine) : "";
    html += `<div style="background:${bg};position:relative">${kind ? `<span style="color:${col};text-shadow:0 0 2px #000">${GLYPH[kind]}\uFE0E</span>${id ? `<img src="/assets/cards/${id}.png" alt="" onerror="this.remove()" style="position:absolute;inset:7%;width:86%;height:86%;object-fit:contain;border-radius:50%;background:${col};box-shadow:0 0 0 2px ${y < 2 ? "#fff" : "#c9a24a"};${y < 2 ? "transform:scaleX(-1);" : ""}">` : ""}` : ""}</div>`;
  }
  return `<div class="cr-mini">${html}</div>`;
}

// ---------- Home shell ----------
export async function chessScreen() {
  loadSprites();
  injectStyle();
  app().innerHTML = `<div class="screen">${topbar("Chess RPG")}<p class="muted" style="padding:20px">Loading your collection…</p></div>`;
  profile = await loadProfile();
  shell(tab);
}

function shell(start: Tab) {
  const p = profile!;
  app().innerHTML = `<div class="cr-shell">
    <header class="cr-top"><span class="who">${esc(p.player)}</span><span class="chip" style="color:var(--gold)" id="crtro">🏆 ${p.trophies}</span>
      <span id="crgems">${gemsChip()}</span><div class="spacer" style="flex:1"></div><button class="btn sm" data-go="classic" title="Agent training: curves, Gen vs Gen, replays">🧪 AI Lab</button>${modeChip()}</header>
    <main class="cr-panes" id="panes">${TABS.map(t => `<section class="cr-pane" id="pane-${t.id}"></section>`).join("")}</main>
    <nav class="cr-nav" id="crnav">${TABS.map(t => `<button data-tab="${t.id}"><span>${t.icon}</span><small>${t.label}</small></button>`).join("")}</nav>
  </div>`;
  shopPane(); cardsPane(); arenaPane(); void rankPane();
  bindGo();
  const panes = $("panes");
  const idx = (t: Tab) => TABS.findIndex(x => x.id === t);
  const setActive = (t: Tab) => {
    tab = t;
    try { localStorage.setItem("tg.tab", t); } catch { /* ignore */ }
    $("crnav").querySelectorAll<HTMLElement>("button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  };
  const goTab = (t: Tab, smooth = true) => { panes.scrollTo({ left: idx(t) * panes.clientWidth, behavior: smooth ? "smooth" : "auto" }); setActive(t); };
  $("crnav").querySelectorAll<HTMLElement>("button").forEach(b => b.addEventListener("click", () => goTab(b.dataset.tab as Tab)));
  let raf = 0;
  panes.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setActive(TABS[Math.round(panes.scrollLeft / Math.max(1, panes.clientWidth))]!.id));
  });
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || document.querySelector(".cr-modal") || !document.getElementById("panes")) return;
    const i = idx(tab);
    if (e.key === "ArrowRight" && i < TABS.length - 1) goTab(TABS[i + 1]!.id);
    if (e.key === "ArrowLeft" && i > 0) goTab(TABS[i - 1]!.id);
  };
  const onResize = () => goTab(tab, false);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  setCleanup(() => { window.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); });
  requestAnimationFrame(() => goTab(start, false));
}

function refreshTop() {
  const g = document.getElementById("crgems"), t = document.getElementById("crtro");
  if (g) g.innerHTML = gemsChip();
  if (t && profile) t.textContent = `🏆 ${profile.trophies}`;
}

// ---------- Arena ----------
function arenaPane() {
  const el = $("pane-arena");
  const p = profile!;
  const next = Math.min(LADDER.length, p.ladderCleared + 1);
  const nl = LADDER[next - 1]!;
  el.innerHTML = `
    <h2 class="cr-h">River Arena</h2>
    <p class="cr-sub">Chess, but your knights, bishops and rooks are RPG heroes.</p>
    ${miniBoard(deckWithLevels(p.collection), nl.deck)}
    <div style="display:flex;justify-content:center;gap:18px;margin-top:-4px" class="muted small"><span><b style="color:${COLORS.team.npc}">●</b> Next: ${esc(nl.name)}</span><span><b style="color:${COLORS.team.player}">●</b> You</span></div>
    <div style="text-align:center" class="muted small">Your battle deck</div>
    ${deckStrip(deckWithLevels(p.collection))}
    <div class="cr-modes">
      <div class="panel cr-mode">
        <h3>⚔️ Multiplayer</h3>
        <p class="muted small">Find a live opponent. If nobody is online, you face a real player's deck played by their AI ghost.</p>
        <button class="btn primary cr-big" id="mpbtn">Battle</button>
        <div class="muted small">Win +30 🏆 · Lose −15 🏆</div>
      </div>
      <div class="panel cr-mode">
        <h3>🧠 Solo · AI Trainer</h3>
        <p class="muted small">Climb the training ladder. Next: <b>${nl.level}. ${esc(nl.name)}</b> (${nl.personality}) · 💎 ${nl.gems}${next > p.ladderCleared ? " ×3 first clear" : ""}</p>
        <button class="btn primary cr-big" id="trainbtn">Train</button>
        <div class="row tight" style="justify-content:center"><button class="btn sm" id="ladbtn">All levels</button><button class="btn sm" id="advbtn">Trainer: best deck</button><button class="btn sm" id="quickbtn">Quick match</button></div>
      </div>
    </div>
    <div class="panel" id="ladpanel" style="display:none;max-width:820px;margin:14px auto 0"><h3>Training Ladder</h3>
      <ul class="gen-list cr-lad" id="ladder">${LADDER.map(l => {
        const done = l.level <= p.ladderCleared, open = l.level <= next;
        return `<li data-level="${l.level}" class="${l.level === next ? "sel" : ""}" style="${open ? "" : "opacity:.45"}">
          <span class="g">${done ? "✓" : open ? "▶" : "🔒"} ${l.level}. ${esc(l.name)}</span>
          <span class="muted small">${l.personality} · 💎 ${l.gems}${done ? "" : " (first ×3)"}</span></li>`;
      }).join("")}</ul></div>`;
  const startLadder = (lv: number) => {
    const l = LADDER[lv - 1]!;
    battle({ mode: "ladder", level: lv, enemy: l.deck, personality: l.personality, title: `Training ${lv} · ${l.name}` });
  };
  $("trainbtn").onclick = () => startLadder(next);
  $("ladbtn").onclick = () => { const lp = $("ladpanel"); lp.style.display = lp.style.display === "none" ? "" : "none"; };
  $("ladder").querySelectorAll<HTMLElement>("li").forEach(li => li.addEventListener("click", () => {
    const lv = Number(li.dataset.level);
    if (lv <= next) startLadder(lv);
  }));
  $("advbtn").onclick = () => { cardsPane(null, next, "", true); $("crnav").querySelector<HTMLElement>('[data-tab="cards"]')?.click(); };
  $("quickbtn").onclick = () => {
    const l = LADDER[Math.floor(Math.random() * Math.min(LADDER.length, next + 1))]!;
    battle({ mode: "free", enemy: l.deck, personality: l.personality, title: `Quick match vs ${l.name}` });
  };
  $("mpbtn").onclick = () => matchmake();
}

function matchmake() {
  const p = profile!;
  const m = document.createElement("div");
  m.className = "cr-modal";
  m.innerHTML = `<div class="panel"><h3 id="mmtitle">Searching for opponent…</h3><div class="cr-spin" id="mmspin"></div>
    <p class="muted small" id="mmmsg">Looking for a live player</p><div id="mmbody"></div>
    <button class="btn" id="mmcancel">Cancel</button></div>`;
  document.body.appendChild(m);
  let cancelled = false, roomId: string | null = null;
  const t0 = Date.now();
  const tick = window.setInterval(() => { const e = document.getElementById("mmmsg"); if (e && !cancelled) e.textContent = `Looking for a live player · ${Math.round((Date.now() - t0) / 1000)}s`; }, 1000);
  const close = () => { cancelled = true; window.clearInterval(tick); m.remove(); };
  $("mmcancel").onclick = () => { if (roomId) void pvp("leave", { roomId, player: p.player }); close(); };

  const found = (title: string, name: string, trophies: number | null, deck: Deck | null, go: () => void) => {
    if (cancelled) return;
    window.clearInterval(tick);
    $("mmtitle").textContent = title;
    $("mmspin").style.display = "none";
    $("mmmsg").textContent = "";
    $("mmbody").innerHTML = `<div class="cr-vs">VS</div><div class="who" style="font-size:20px">${esc(name)}${trophies != null ? ` · 🏆 ${trophies}` : ""}</div>${deck ? deckStrip(deck) : ""}`;
    window.setTimeout(() => { if (!cancelled) { close(); go(); } }, 1600);
  };

  const ghost = async (why: string) => {
    if (cancelled) return;
    window.clearInterval(tick);
    $("mmmsg").textContent = why;
    const j = await api<{ ghost: { opponent: string; deck: Deck; personality: ChessPersonality; trophies: number } | null }>(`ghost?player=${encodeURIComponent(p.player)}`);
    if (cancelled) return;
    if (!j?.ghost) {
      window.clearInterval(tick);
      $("mmtitle").textContent = "No opponents yet";
      $("mmspin").style.display = "none";
      $("mmmsg").textContent = online ? "Nobody else has played yet. Ask a friend to open the game and play one match." : "Multiplayer needs the API server.";
      return;
    }
    const g = j.ghost;
    found("Opponent found (ghost)", g.opponent, g.trophies, g.deck,
      () => battle({ mode: "ghost", opponent: g.opponent, enemy: g.deck, personality: g.personality, title: `vs ${g.opponent}'s ghost` }));
  };

  void (async () => {
    const q = await pvp<{ roomId: string; status: "waiting" | "matched"; side: Side }>("queue", { player: p.player });
    if (cancelled) return;
    if (!q) { window.setTimeout(() => void ghost("Live matchmaking is offline · finding a ghost"), 1200); return; }
    roomId = q.roomId;
    const poll = async (): Promise<void> => {
      if (cancelled) return;
      const r = await pvp<Room>(`room?id=${encodeURIComponent(q.roomId)}&player=${encodeURIComponent(p.player)}`);
      if (cancelled) return;
      if (r && r.status === "playing" && r.state) {
        found("Opponent found!", r.opponent ?? "Challenger", null, null,
          () => battle({ mode: "pvp", roomId: q.roomId, me: r.side, opponent: r.opponent, state: r.state, seq: r.seq, title: `Live vs ${r.opponent ?? "Challenger"}` }));
        return;
      }
      if (Date.now() - t0 > 20000) { void pvp("leave", { roomId: q.roomId, player: p.player }); roomId = null; void ghost("No live players right now · matching you with a ghost"); return; }
      window.setTimeout(() => void poll(), 1000);
    };
    void poll();
  })();
}

// ---------- Cards ----------
function cardsPane(recs: DeckPick[] | null = null, recLevel = Math.min(LADDER.length, (profile?.ladderCleared ?? 0) + 1), msg = "", autoRec = false) {
  const el = $("pane-cards");
  const c = profile!.collection;
  const tile = (id: string) => {
    const o = c.cards[id]!;
    const equipped = SPELLS[id] ? (c.deck.spells ?? []).includes(id) : c.deck[CARDS[id]!.kind as (typeof ROLES)[number]] === id;
    const need = upgradeCost(o.level);
    const bar = o.unlocked && o.level < MAX_LEVEL ? `<div class="hpbar" title="${o.copies}/${need} copies"><div style="width:${Math.min(100, (o.copies / need) * 100)}%;background:${COLORS.gold}"></div></div><div class="muted small">${o.copies}/${need} copies to Lv ${o.level + 1}</div>` : o.unlocked ? `<div class="muted small">Max level</div>` : "";
    const btns = !o.unlocked
      ? `<button class="btn sm" data-op="unlock" data-card="${id}" ${c.gems >= unlockCost(id) ? "" : "disabled"}>Unlock 💎 ${unlockCost(id)}</button>`
      : `${equipped ? (SPELLS[id] ? `<button class="btn sm" data-op="equip" data-card="${id}">Remove</button>` : `<span class="chip" style="color:var(--gold)">Equipped</span>`) : `<button class="btn sm" data-op="equip" data-card="${id}">Equip</button>`}
         ${canUpgrade(c, id) ? `<button class="btn sm primary" data-op="upgrade" data-card="${id}">Upgrade</button>` : ""}`;
    return cardTile(id, `${bar}<div class="row tight" style="margin-top:6px">${btns}</div>`, !o.unlocked);
  };
  el.innerHTML = `<h2 class="cr-h">Cards</h2><p class="cr-sub">Battle deck</p>${deckStrip(deckWithLevels(c))}
    <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:14px;margin-top:10px">
      <div><p class="small" style="color:#ecd28c">${esc(msg)}</p>
        <div class="panel" style="margin-bottom:12px"><h3>✦ King's Spells <span class="muted small">(up to ${SPELL_LIMIT})</span></h3>
        <div class="cr-grid">${SPELL_IDS.map(tile).join("")}</div></div>
        ${ROLES.map(r => `<div class="panel" style="margin-bottom:12px"><h3>${ROLE_LABEL[r]}</h3>
        <div class="cr-grid">${ROLE_CARDS[r].map(tile).join("")}</div></div>`).join("")}</div>
      <div class="panel" style="align-self:start"><h3>🧠 AI Trainer · Best deck</h3>
        <p class="muted small">The trainer plays every deck you own against the general you pick, then ranks them.</p>
        <div class="row"><label class="field">Opponent <select id="reclevel">${LADDER.map(l => `<option value="${l.level}" ${l.level === recLevel ? "selected" : ""}>${l.level}. ${esc(l.name)} (${l.personality})</option>`).join("")}</select></label>
          <button class="btn primary" id="recbtn">Recommend</button></div>
        <div id="recs">${recs ? recs.map((r, i) => `<div class="panel" style="margin-top:10px">
            <div class="row" style="justify-content:space-between"><b>#${i + 1} · ${Math.round(r.winRate * 100)}% wins</b><span class="muted small">${r.wins}/${r.games} sims</span></div>
            ${deckStrip(r.deck)}
            <p class="quote small">${esc(r.reason)}</p>
            <button class="btn sm" data-use="${i}">Use this deck</button></div>`).join("") : ""}</div>
      </div>
    </div>`;
  el.querySelectorAll<HTMLElement>("[data-op]").forEach(b => b.addEventListener("click", async () => {
    const op = b.dataset.op as "upgrade" | "unlock" | "equip", card = b.dataset.card!;
    const ok = await cardOp(op, card);
    refreshTop(); arenaPane();
    const why = op === "equip" ? (SPELLS[card] && (c.deck.spells ?? []).length >= SPELL_LIMIT && !(c.deck.spells ?? []).includes(card) ? `the King holds at most ${SPELL_LIMIT} spells` : `deck cost would exceed ${DECK_BUDGET}`) : op === "unlock" ? "not enough gems" : "not enough copies";
    cardsPane(recs, recLevel, ok ? `${op === "equip" ? "Deck updated:" : op === "upgrade" ? "Upgraded" : "Unlocked"} ${cardLabel(card)}.` : `Can't ${op} ${cardLabel(card)}: ${why}.`);
  }));
  const recommend = async () => {
    const lv = Number($<HTMLSelectElement>("reclevel").value);
    $("recs").innerHTML = `<div class="cr-spin"></div><p class="muted small" style="text-align:center">Simulating your decks…</p>`;
    let picks: DeckPick[] | null = null;
    if (online) picks = (await api<{ picks: DeckPick[] }>(`recommend?player=${encodeURIComponent(profile!.player)}&level=${lv}`))?.picks ?? null;
    if (!picks) { await new Promise(r => setTimeout(r, 30)); picks = recommendDecks(c, LADDER[lv - 1]!); }
    cardsPane(picks, lv);
  };
  $("recbtn").onclick = () => void recommend();
  el.querySelectorAll<HTMLElement>("[data-use]").forEach(b => b.addEventListener("click", async () => {
    const r = recs?.[Number(b.dataset.use)];
    if (!r) return;
    for (const role of ROLES) if (c.deck[role] !== r.deck[role]) await cardOp("equip", r.deck[role]);
    arenaPane();
    cardsPane(recs, recLevel, "Deck updated from the trainer's pick.");
  }));
  if (autoRec) void recommend();
}

// ---------- Shop ----------
function shopPane(msg = "") {
  const el = $("pane-shop");
  el.innerHTML = `<h2 class="cr-h">Shop</h2><p class="cr-sub">Gems unlock cards instantly</p>
    <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center">
      ${GEM_PACKS.map(k => `<div class="panel card" style="min-width:220px;text-align:center">
        <div class="glyph">💎</div><div class="name">${k.gems} gems</div><div class="stat-big">${k.price}</div>
        <button class="btn primary" data-pack="${k.id}" style="margin-top:8px">Buy</button></div>`).join("")}
    </div>
    <div class="panel" style="max-width:640px;margin:14px auto 0"><h3>How it works</h3>
      <p class="small">Every win opens a chest of 5 random cards. Rarer cards drop less often (Common, Rare, Super Rare, Epic, Legend = deck cost 1 to 5). New cards unlock; duplicates upgrade cards up to Lv ${MAX_LEVEL}. Ladder wins pay gems, first clears pay triple. Unlock any card instantly with gems: 💎 60 per point of deck cost (Common 60, Legend 300).</p>
      <p class="muted small">${STRIPE_LINK ? "Checkout opens in a new tab." : "Demo mode: purchases are recorded in MongoDB and gems are granted without payment."}</p>
      <p class="muted small">${esc(msg)}</p></div>`;
  el.querySelectorAll<HTMLElement>("[data-pack]").forEach(b => b.addEventListener("click", async () => {
    const pack = GEM_PACKS.find(k => k.id === b.dataset.pack)!;
    if (STRIPE_LINK) window.open(STRIPE_LINK, "_blank");
    if (online) {
      const j = await api<{ profile: Profile }>("gems", { player: profile!.player, pack: pack.id });
      if (j) profile = j.profile;
    } else { profile!.collection.gems += pack.gems; saveLocal(); }
    refreshTop(); cardsPane();
    shopPane(`+${pack.gems} gems added.`);
  }));
}

// ---------- Ranking ----------
async function rankPane() {
  const el = $("pane-rank");
  const p = profile!;
  const c = p.collection;
  el.innerHTML = `<h2 class="cr-h">Ranking</h2><p class="cr-sub">Trophies from multiplayer battles</p>
    <div class="row" style="justify-content:center;gap:24px;margin:8px 0 14px">
      <div><div class="stat-big">🏆 ${p.trophies}</div><div class="muted small">trophies</div></div>
      <div><div class="stat-big">${c.wins}–${c.losses}</div><div class="muted small">wins–losses</div></div>
      <div><div class="stat-big">${p.ladderCleared}/${LADDER.length}</div><div class="muted small">ladder cleared</div></div>
      <div><div class="stat-big">${c.chests}</div><div class="muted small">chests opened</div></div>
    </div>
    <div class="panel" style="max-width:640px;margin:0 auto"><h3>Leaderboard</h3><ol class="log" id="lb"><li class="muted">${online ? "Loading…" : "Needs the API server"}</li></ol></div>`;
  if (!online) return;
  const lb = await api<{ top: { player: string; trophies: number; ladderCleared: number }[] }>("leaderboard");
  const ol = document.getElementById("lb");
  if (ol && lb) ol.innerHTML = lb.top.map(r => `<li class="${r.player === p.player ? "current" : ""}">${esc(r.player)} · 🏆 ${r.trophies} · ladder ${r.ladderCleared}</li>`).join("") || `<li class="muted">No players yet</li>`;
}

// ---------- Battle ----------
interface Fx { x: number; y: number; text: string; color: string; until: number; }

function battle(m: Match) {
  const p = profile!;
  const me: Side = m.me ?? "P";
  const foe: Side = me === "P" ? "E" : "P";
  const flip = me === "E";
  let s: ChessState = m.state ?? createChess(deckWithLevels(p.collection), m.enemy!);
  let seq = m.seq ?? 0;
  let sel: string | null = null;
  let busy = false;
  let hint: ChessAction | null = null;
  let fx: Fx[] = [];
  let done = false;
  let logLen = 0;
  type MenuItem = { key: string; label: string; acts: ChessAction[] };
  let mode: "idle" | "menu" | "target" = "idle";
  let menu: MenuItem[] = [];
  let menuIdx = 0;
  let choice: MenuItem | null = null;
  let cursor = { x: 4, y: me === "P" ? 7 : 0 };
  const timers: number[] = [];

  app().innerHTML = `<div class="screen">
    ${topbar(esc(m.title), `<span id="turninfo" class="muted"></span>${gemsChip()}<button class="btn sm" id="resign">Resign</button>`)}
    <div class="battle">
      <div class="panel unit-panel" id="info"></div>
      <div class="center-col">
        <div class="board" style="position:relative"><canvas id="cboard"></canvas><div class="banner" id="banner"></div><div id="amenu" class="panel" style="position:absolute;display:none;z-index:6;min-width:170px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.55)"></div></div>
        <div class="panel bottombar"><div class="transport">
          <div class="row tight">
            <button class="btn sm primary" id="hintbtn">Ask the Coach</button>
            <span class="muted small">King's spells:</span><div class="cr-spellbar" id="spellbar"></div>
          </div>
          <div class="hint" id="hinttext">Arrows move · Space on your unit opens its actions · Space confirms · Esc goes back. Blue: can go · Red: blocked · Border: red attack, green heal, purple queen strike.</div>
        </div></div>
      </div>
      <div class="side-col">
        <div class="panel"><h3>Rules</h3><p class="small muted">Capture the enemy king to win. Pawns capture pawns but only chip HP off heroes. Hero vs hero is RPG combat with counters. River ranks 4–5: cross on the b/g bridges, or fly. Queen stays put and strikes ${QUEEN_CASTS} times, then vanishes. A pawn reaching the far rank becomes a new Queen. Your King casts spell cards (one per turn, 3-turn cooldown; spells deal half damage to Kings).</p></div>
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
  const SX = (x: number) => (flip ? W - 1 - x : x) * TILE;
  const SY = (y: number) => (flip ? H - 1 - y : y) * TILE;
  const myText = (t: string) => (flip ? t.replace(/\bYour\b/g, "§").replace(/\bEnemy\b/g, "Your").replace(/§/g, "Enemy") : t);

  const actsFor = (id: string | null) => {
    const pc = id ? byIdC(s, id) : undefined;
    return pc && pc.alive && pc.side === me ? pieceActions(s, pc).filter(a => a.type !== "spell") : [];
  };
  const myKing = () => s.pieces.find(q => q.alive && q.side === me && q.kind === "king");
  const spellActs = (id: string) => { const k = myKing(); return k ? pieceActions(s, k).filter(a => a.type === "spell" && a.spell === id) : []; };

  const draw = () => {
    const now = performance.now();
    c.clearRect(0, 0, size, size);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = SX(x), py = SY(y);
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
    for (let x = 0; x < W; x++) c.fillText("abcdefgh"[x]!, SX(x) + 3, size - 3);
    for (let y = 0; y < H; y++) c.fillText(String(8 - y), 3, SY(y) + 12);
    const range = (pc: Piece, strong: boolean, only?: ChessAction[]) => {
      const legal = only ?? pieceActions(s, pc).filter(a => a.type !== "spell");
      const ok = new Set(legal.map(a => `${a.x},${a.y}`));
      const k = strong ? 1 : 0.45;
      if (!only || only[0]?.type !== "spell") for (const q of patternSquares(pc)) if (!ok.has(`${q.x},${q.y}`)) {
        c.fillStyle = `rgba(230,70,60,${0.32 * k})`;
        c.fillRect(SX(q.x) + 2, SY(q.y) + 2, TILE - 4, TILE - 4);
      }
      for (const a of legal) {
        c.fillStyle = `rgba(80,140,255,${0.45 * k})`;
        c.fillRect(SX(a.x) + 2, SY(a.y) + 2, TILE - 4, TILE - 4);
        if (a.type !== "move") {
          c.strokeStyle = a.type === "attack" ? "#ff4d4d" : a.type === "heal" ? "#5fd07e" : a.type === "spell" ? "#ffb020" : "#c58bff";
          c.lineWidth = strong ? 3 : 2;
          c.strokeRect(SX(a.x) + 3, SY(a.y) + 3, TILE - 6, TILE - 6);
        }
      }
    };
    const selP = sel ? byIdC(s, sel) : undefined;
    if (mode === "target" && choice && selP?.alive) range(selP, true, choice.acts);
    else if (selP?.alive) range(selP, true);
    else { const under = pieceAt(s, cursor.x, cursor.y); if (under) range(under, false); }
    if (hint) {
      const hp = byIdC(s, hint.pieceId);
      c.strokeStyle = COLORS.gold; c.lineWidth = 4; c.setLineDash([6, 4]);
      if (hp) c.strokeRect(SX(hp.x) + 4, SY(hp.y) + 4, TILE - 8, TILE - 8);
      c.strokeRect(SX(hint.x) + 4, SY(hint.y) + 4, TILE - 8, TILE - 8);
      c.setLineDash([]);
    }
    for (const pc of s.pieces) if (pc.alive) piece(pc);
    {
      const cx = SX(cursor.x) + 3, cy = SY(cursor.y) + 3, sz = TILE - 6, k = 14;
      const pulse = (Math.sin(now / 350) + 1) / 2;
      c.save();
      c.shadowColor = COLORS.cursor; c.shadowBlur = 3 + pulse * 5;
      c.strokeStyle = COLORS.cursor; c.lineWidth = 3 + pulse;
      c.beginPath();
      c.moveTo(cx, cy + k); c.lineTo(cx, cy); c.lineTo(cx + k, cy);
      c.moveTo(cx + sz - k, cy); c.lineTo(cx + sz, cy); c.lineTo(cx + sz, cy + k);
      c.moveTo(cx, cy + sz - k); c.lineTo(cx, cy + sz); c.lineTo(cx + k, cy + sz);
      c.moveTo(cx + sz - k, cy + sz); c.lineTo(cx + sz, cy + sz); c.lineTo(cx + sz, cy + sz - k);
      c.stroke();
      c.restore();
    }
    fx = fx.filter(f => f.until > now);
    for (const f of fx) {
      const t = 1 - (f.until - now) / 900;
      c.save(); c.font = "bold 20px Inter, sans-serif"; c.textAlign = "center";
      c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,.9)";
      const yy = SY(f.y) + 22 - t * 14;
      c.strokeText(f.text, SX(f.x) + TILE / 2, yy); c.fillStyle = f.color; c.fillText(f.text, SX(f.x) + TILE / 2, yy);
      c.restore();
    }
    if (canvas.isConnected) requestAnimationFrame(draw);
  };

  const piece = (pc: Piece) => {
    const cx = SX(pc.x) + TILE / 2, cy = SY(pc.y) + TILE / 2 - 3, r = TILE * 0.36;
    c.fillStyle = pc.side === me ? COLORS.team.player! : COLORS.team.npc!;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = sel === pc.id ? COLORS.cursor : pc.side === me ? COLORS.gold : "#fff"; c.lineWidth = sel === pc.id ? 4 : 2; c.stroke();
    if (spriteOk(pc.card)) c.drawImage(sprites[pc.card]!, cx - r, cy - r, r * 2, r * 2);
    else {
      c.fillStyle = "#fff"; c.font = `${Math.round(TILE * 0.46)}px "Apple Symbols", "Segoe UI Symbol", serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(GLYPH[pc.kind] + "\uFE0E", cx, cy + 1);
    }
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    if (pc.kind !== "queen") {
      const w = TILE * 0.72, bx = cx - w / 2, by = SY(pc.y) + TILE - 9, ratio = Math.max(0, pc.hp / pc.maxHp);
      c.fillStyle = COLORS.hpBack; c.fillRect(bx, by, w, 5);
      c.fillStyle = ratio > 0.6 ? COLORS.hpGood : ratio > 0.3 ? COLORS.hpMid : COLORS.hpLow; c.fillRect(bx, by, w * ratio, 5);
    } else {
      for (let i = 0; i < pc.charges; i++) { c.fillStyle = "#c58bff"; c.beginPath(); c.arc(cx - 10 + i * 10, SY(pc.y) + TILE - 7, 3.5, 0, Math.PI * 2); c.fill(); }
    }
    if (pc.level > 1) { c.fillStyle = COLORS.gold; c.font = "bold 11px Inter, sans-serif"; c.fillText(`L${pc.level}`, SX(pc.x) + TILE - 20, SY(pc.y) + 13); }
  };

  const skillsOf = (pc: Piece): { name: string; desc: string; ready: boolean; color?: string }[] => {
    const cd = CARDS[pc.card]!;
    const fl = pc.body === "flier";
    switch (pc.kind) {
      case "pawn": return [
        { name: "Advance", desc: "Forward 1 (2 from start), or sidestep. Crosses the river only on bridges.", ready: true },
        { name: "Capture", desc: "Diagonal: captures pawns and queens, chips HP off heroes.", ready: true },
        { name: "Promotion", desc: "Reaching the far rank turns it into a new Queen with 3 strikes.", ready: true },
      ];
      case "knight": return [
        { name: "Leap", desc: fl ? "L-jump; flies, so it can land on the river." : "L-jump over anything; cannot land on the river.", ready: true },
        { name: `${cap(pc.weapon)} strike`, desc: "RPG combat with counters; fast units strike twice.", ready: true },
      ];
      case "bishop": return pc.weapon === "staff"
        ? [{ name: "Heal", desc: `Restores ${(cd.heal ?? 10) + (pc.level - 1) * 2} HP to an ally on its diagonals.`, ready: true }]
        : [{ name: "Arcane Bolt", desc: "Magic down the diagonals: x2 vs armored, x0.5 vs fliers. Counters at range 2.", ready: true }];
      case "rook": return [
        { name: "Charge", desc: fl ? "Slides along ranks and files, flying over the river." : "Slides along ranks and files.", ready: true },
        { name: `${cap(pc.weapon)} strike`, desc: "RPG combat with counters.", ready: true },
      ];
      case "queen": return [{ name: "Storm Strike", desc: `Instantly kills any non-king piece along her lines. ${pc.charges} left, then she vanishes. Can be captured.`, ready: pc.charges > 0 }];
      case "king": return [
        { name: "Royal guard", desc: "Moves 1 square, strikes adjacent foes. Lose him, lose the game.", ready: true },
        ...s.spells[pc.side].map(id => {
          const sp = SPELLS[id]!, used = s.used[pc.side].includes(id), cdn = s.kingCd[pc.side];
          return { name: `✦ ${sp.name}${used ? " · used" : cdn > 0 ? ` · cd ${cdn}` : " · ready"}`, desc: sp.blurb, ready: !used && cdn === 0, color: rarColor(id) };
        }),
      ];
    }
  };

  const info = () => {
    const pc = pieceAt(s, cursor.x, cursor.y) ?? (sel ? byIdC(s, sel) : undefined);
    const aura = s.auras.map(a => `<span class="chip">${a.by === me ? "Your" : "Enemy"} ${a.kind === "ward" ? "bulwark" : a.kind}</span>`).join("")
      + `<div class="muted small" style="margin-top:6px">Enemy spells left: ${s.spells[foe].filter(id => !s.used[foe].includes(id)).map(id => SPELLS[id]!.name).join(", ") || "none"}</div>`;
    if (!pc) { $("info").innerHTML = `<h3>Piece</h3><p class="muted small">Select one of your pieces.</p><div class="tags">${aura}</div>`; return; }
    const cd = CARDS[pc.card]!;
    const r = pc.hp / pc.maxHp;
    const portrait = spriteOk(pc.card)
      ? `<img src="/assets/cards/${pc.card}.png" alt="" style="width:88px;height:88px;object-fit:contain;border-radius:12px;background:${pc.side === me ? COLORS.team.player : COLORS.team.npc}">`
      : `<div style="width:88px;height:88px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:56px;color:#fff;background:${pc.side === me ? COLORS.team.player : COLORS.team.npc}">${GLYPH[pc.kind]}\uFE0E</div>`;
    const skills = skillsOf(pc).map(k => `<li style="opacity:${k.ready ? 1 : 0.5}"><b style="color:${k.color ?? (k.ready ? "#ecd28c" : "#98a1b6")}">${esc(k.name)}</b><div class="muted small">${esc(k.desc)}</div></li>`).join("");
    const nActs = pc.side === me && s.turn === me ? pieceActions(s, pc).length : 0;
    $("info").innerHTML = `<h3>${pc.side === me ? "Your" : "Enemy"} ${esc(cd.name)}</h3>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">${portrait}<div>${cd.cost ? rarBadge(pc.card) : ""}<div class="muted small" style="margin-top:4px">${pc.side === me && s.turn === me ? `${nActs} action${nActs === 1 ? "" : "s"} available` : ""}</div></div></div>
      <h4 class="sub-h">Skills</h4><ul class="log" style="max-height:none">${skills}</ul>
      <div class="uhead" style="display:none"><div class="uglyph" style="background:${pc.side === me ? COLORS.team.player : COLORS.team.npc}">${GLYPH[pc.kind]}\uFE0E</div>
      <div><div class="uname">${esc(cd.name)} · Lv ${pc.level}</div><div class="muted small">${pc.kind} · ${pc.weapon} · ${pc.body}</div></div></div>
      ${pc.kind === "queen" ? `<p class="small">Strikes left: ${pc.charges}</p>` : `<div class="hpbar"><div style="width:${r * 100}%;background:${r > 0.6 ? COLORS.hpGood : r > 0.3 ? COLORS.hpMid : COLORS.hpLow}"></div></div>
      <div class="muted small">HP ${pc.hp} / ${pc.maxHp}</div>
      <div class="stats"><span>ATK</span><span>${pc.atk}</span><span>MAG</span><span>${pc.mag}</span><span>DEF</span><span>${pc.def}</span><span>RES</span><span>${pc.res}</span><span>SPD</span><span>${pc.spd}</span></div>`}
      <p class="muted small">${esc(cd.blurb)}</p><div class="tags">${aura}</div>`;
  };

  const syncLog = () => {
    const ol = $("clog");
    for (; logLen < s.log.length; logLen++) ol.insertAdjacentHTML("beforeend", `<li>${esc(myText(s.log[logLen]!))}</li>`);
    ol.lastElementChild?.scrollIntoView({ block: "nearest" });
  };

  const showFx = (ev: ChessEvent[]) => {
    const until = performance.now() + 900;
    for (const e of ev) {
      if (e.x != null && e.y != null) {
        if (e.type === "attack" || e.type === "counter") fx.push({ x: e.x, y: e.y, text: `-${e.amount}`, color: COLORS.damage, until });
        if (e.type === "kill" || e.type === "capture") fx.push({ x: e.x, y: e.y, text: e.type === "capture" ? "CAPTURED" : "DEFEATED", color: COLORS.damage, until });
        if (e.type === "cast") fx.push({ x: e.x, y: e.y, text: "⚡ STRIKE", color: "#c58bff", until });
        if (e.type === "spell") fx.push({ x: e.x, y: e.y, text: `✦ ${e.text.split(" casts ")[1] ?? "SPELL"}`, color: "#ffb020", until: until + 400 });
        if (e.type === "promote") fx.push({ x: e.x, y: e.y, text: "♛ PROMOTED", color: "#c58bff", until: until + 600 });
        if (e.type === "revive") fx.push({ x: e.x, y: e.y, text: "✚ REVIVED", color: COLORS.heal, until: until + 400 });
      }
      if (e.type === "heal" && e.targetId) { const t = byIdC(s, e.targetId); if (t) fx.push({ x: t.x, y: t.y, text: `+${e.amount}`, color: COLORS.heal, until }); }
    }
  };

  const hud = () => {
    $("turninfo").textContent = s.winner ? "Game over" : `Turn ${Math.floor(s.ply / 2) + 1} · ${s.turn === me ? "Your move" : m.mode === "pvp" ? "Opponent's move…" : "Enemy thinking…"}`;
    const myTurn = s.turn === me && !busy && !s.winner;
    $("spellbar").innerHTML = s.spells[me].map(id => {
      const sp = SPELLS[id]!, used = s.used[me].includes(id), ok = myTurn && !used && spellActs(id).length > 0;
      const note = used ? "used" : s.kingCd[me] > 0 ? `cd ${s.kingCd[me]}` : `${spellPower(s, me, id)}`;
      return `<button class="btn sm cr-spell ${choice?.key === `spell:${id}` ? "on" : ""}" data-spell="${id}" ${ok ? "" : "disabled"} title="${esc(sp.blurb)}" style="border-color:${rarColor(id)};color:${rarColor(id)}">✦ ${esc(sp.name)} <span class="muted small">${note}</span></button>`;
    }).join("") || `<span class="muted small">none equipped</span>`;
    $("spellbar").querySelectorAll<HTMLElement>("[data-spell]").forEach(b => b.addEventListener("click", () => {
      const k = myKing();
      if (!k) return;
      openMenu(k);
      const i = menu.findIndex(it => it.key === `spell:${b.dataset.spell}`);
      if (i >= 0) choose(i);
    }));
    const am = $("amenu");
    const mp = sel ? byIdC(s, sel) : undefined;
    if (mode === "menu" && mp) {
      am.style.display = "";
      am.style.left = `${Math.min(size - 180, SX(mp.x) + TILE + 4)}px`;
      am.style.top = `${Math.min(size - 40 * menu.length - 20, SY(mp.y))}px`;
      am.innerHTML = `<div class="muted small" style="margin-bottom:6px">${esc(CARDS[mp.card]!.name)} · choose an action</div>` + menu.map((it, i) =>
        `<button class="btn sm ${i === menuIdx ? "primary" : ""}" data-mi="${i}" style="display:block;width:100%;text-align:left;margin:3px 0">${esc(it.label)}</button>`).join("");
      am.querySelectorAll<HTMLElement>("[data-mi]").forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); choose(Number(b.dataset.mi)); }));
    } else am.style.display = "none";
    if (mode === "target" && choice) $("hinttext").textContent = `${choice.label}: pick a blue square · Space confirms · Esc goes back`;
    syncLog();
    info();
  };

  const buildMenu = (pc: Piece): MenuItem[] => {
    const acts = pieceActions(s, pc);
    const items: MenuItem[] = [];
    const group = (type: ChessAction["type"], label: string) => { const a = acts.filter(x => x.type === type); if (a.length) items.push({ key: type, label: `${label} (${a.length})`, acts: a }); };
    group("move", "Move"); group("attack", "Attack"); group("heal", "Heal"); group("cast", "⚡ Storm Strike");
    for (const id of s.spells[pc.side]) {
      const a = acts.filter(x => x.type === "spell" && x.spell === id);
      if (a.length) items.push({ key: `spell:${id}`, label: `✦ ${SPELLS[id]!.name}${SPELLS[id]!.target === "square" ? " (aim)" : ""}`, acts: a });
    }
    items.push({ key: "cancel", label: "Cancel", acts: [] });
    return items;
  };
  const openMenu = (pc: Piece) => {
    sel = pc.id; menu = buildMenu(pc); menuIdx = 0; choice = null;
    if (menu.length === 1) { mode = "idle"; $("hinttext").textContent = `${CARDS[pc.card]!.name} has no legal actions right now.`; hud(); return; }
    mode = "menu"; hud();
  };
  const resetSel = () => { mode = "idle"; sel = null; menu = []; choice = null; };
  const choose = (i: number) => {
    const it = menu[i];
    if (!it || it.key === "cancel") { resetSel(); hud(); return; }
    if (it.key.startsWith("spell:") && it.acts.length === 1 && SPELLS[it.key.slice(6)]?.target === "none") { void play(it.acts[0]!); return; }
    choice = it; mode = "target";
    const first = it.acts[0];
    if (first) cursor = { x: first.x, y: first.y };
    hud();
  };

  const finish = async () => {
    if (done) return;
    done = true;
    timers.forEach(t => { window.clearTimeout(t); window.clearInterval(t); });
    const won = s.winner === me;
    const banner = $("banner");
    banner.className = `banner ${won ? "win" : "loss"}`;
    banner.textContent = won ? "VICTORY" : s.winner === "draw" ? "DRAW" : "DEFEAT";
    let reward: Reward | null = null;
    if (m.mode === "pvp") {
      const before = { gems: p.collection.gems, trophies: p.trophies, chests: p.collection.chests };
      await new Promise(r => setTimeout(r, 600));
      profile = await loadProfile();
      reward = { gems: profile.collection.gems - before.gems, chest: [], firstClear: false, trophies: profile.trophies - before.trophies };
    } else if (online) {
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
    panel.innerHTML = `<h3>${won ? "Victory!" : s.winner === "draw" ? "Draw" : "Defeat"}${r.firstClear ? " · First clear ×3" : ""}</h3>
      <p>${r.gems ? `💎 +${r.gems} gems` : "No gems this time."}${r.trophies ? ` · 🏆 ${r.trophies > 0 ? "+" : ""}${r.trophies}` : ""}</p>
      ${r.chest.length ? `<h4 class="sub-h">Chest · ${r.chest.length} cards</h4><div id="chest" style="display:flex;gap:8px;flex-wrap:wrap"></div>` : m.mode === "pvp" ? "" : `<p class="muted small">Win to earn a chest of 5 cards.</p>`}
      <div class="row" style="margin-top:12px">${m.mode === "pvp" ? "" : `<button class="btn primary" id="again">Rematch</button>`}<button class="btn" id="tohome">Home</button><button class="btn" id="todeck">Cards</button></div>`;
    app().appendChild(panel);
    const chestEl = document.getElementById("chest");
    r.chest.forEach((d, i) => window.setTimeout(() => chestEl?.insertAdjacentHTML("beforeend",
      cardTile(d.card, `<div class="chip" style="color:var(--gold);margin-top:6px">${d.newlyUnlocked ? "NEW! " : ""}×${d.copies}</div>`)), 350 * (i + 1)));
    document.getElementById("again")?.addEventListener("click", () => battle(m));
    $("tohome").onclick = () => shell("arena");
    $("todeck").onclick = () => shell("cards");
    hud();
  };

  const enemyTurn = () => {
    busy = true; hud();
    timers.push(window.setTimeout(() => {
      const a = chooseChessAction(s, m.personality ?? "tactician");
      if (a) showFx(applyChess(s, a));
      busy = false; hud();
      if (s.winner) void finish();
    }, 550));
  };

  const play = async (a: ChessAction) => {
    hint = null; resetSel();
    if (m.mode === "pvp") {
      busy = true; hud();
      const r = await pvp<{ ok: boolean; seq: number; state: ChessState }>("move", { roomId: m.roomId, player: p.player, seq, action: a });
      busy = false;
      if (r?.ok) { s = r.state; seq = r.seq; }
      else $("hinttext").textContent = "Move rejected by the server (out of sync). Refreshing…";
      hud();
      if (s.winner) void finish();
      return;
    }
    showFx(applyChess(s, a));
    hud();
    if (s.winner) { void finish(); return; }
    enemyTurn();
  };

  if (m.mode === "pvp") {
    const poll = window.setInterval(async () => {
      if (done) return;
      const r = await pvp<Room>(`room?id=${encodeURIComponent(m.roomId!)}&player=${encodeURIComponent(p.player)}`);
      if (!r || done) return;
      if (r.state && r.seq > seq) { s = r.state; seq = r.seq; hud(); }
      if (r.status === "over") { if (!s.winner) s.winner = r.winner ?? foe; void finish(); }
    }, 700);
    timers.push(poll);
  }

  const activate = (x: number, y: number) => {
    if (busy || s.winner || s.turn !== me) return;
    if (mode === "target" && choice) {
      const a = choice.acts.find(a => a.x === x && a.y === y);
      if (a) { void play(a); return; }
      mode = "menu"; choice = null; hud(); return;
    }
    if (mode === "menu") resetSel();
    const q = pieceAt(s, x, y);
    if (q && q.side === me) { openMenu(q); return; }
    sel = q ? q.id : null;
    hud();
  };
  canvas.addEventListener("click", ev => {
    const rect = canvas.getBoundingClientRect();
    const sx = Math.min(W - 1, Math.floor(((ev.clientX - rect.left) / rect.width) * W));
    const sy = Math.min(H - 1, Math.floor(((ev.clientY - rect.top) / rect.height) * H));
    cursor = { x: flip ? W - 1 - sx : sx, y: flip ? H - 1 - sy : sy };
    activate(cursor.x, cursor.y);
  });
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = dirs[e.key];
    if (mode === "menu") {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); menuIdx = (menuIdx + (e.key === "ArrowUp" ? menu.length - 1 : 1)) % menu.length; hud(); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); choose(menuIdx); }
      else if (e.key === "Escape") { resetSel(); hud(); }
      return;
    }
    if (e.key === "Escape" && mode === "target") { mode = "menu"; choice = null; hud(); return; }
    if (d) {
      e.preventDefault();
      const dx = flip ? -d[0] : d[0], dy = flip ? -d[1] : d[1];
      cursor = { x: Math.max(0, Math.min(W - 1, cursor.x + dx)), y: Math.max(0, Math.min(H - 1, cursor.y + dy)) };
      hud();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      activate(cursor.x, cursor.y);
    } else if (e.key === "Escape") {
      resetSel(); hud();
    }
  };
  window.addEventListener("keydown", onKey);
  $("resign").onclick = () => {
    if (s.winner) return;
    if (m.mode === "pvp") void pvp("leave", { roomId: m.roomId, player: p.player });
    s.winner = foe; void finish();
  };
  $("hintbtn").onclick = async () => {
    if (busy || s.winner || s.turn !== me) return;
    $("hinttext").textContent = "Coach is thinking…";
    const j = online ? await api<{ action: ChessAction | null; text: string; source: string }>("hint", { state: s }) : null;
    if (j?.action) { hint = j.action; $("hinttext").textContent = `${j.source === "llm" ? "🧠 Coach (Luminal)" : "📘 Coach"}: ${myText(j.text)}`; }
    else {
      const top = candidates(s)[0];
      hint = top ?? null;
      $("hinttext").textContent = top ? `📘 Coach: ${describeAction(s, top)}.` : "No legal moves.";
    }
  };

  setCleanup(() => { window.removeEventListener("keydown", onKey); timers.forEach(t => { window.clearTimeout(t); window.clearInterval(t); }); });
  { const k = myKing(); if (k) cursor = { x: k.x, y: k.y }; }
  hud();
  requestAnimationFrame(draw);
}
