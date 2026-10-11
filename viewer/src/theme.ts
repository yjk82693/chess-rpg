// theme.ts: every color and size in one place. Swap shapes for sprites here later.
export const TILE = 64;

export const COLORS = {
  terrain: { plain: "#9fbf72", forest: "#3d7a45", fort: "#8f8a80", water: "#3f78b8" } as Record<string, string>,
  forestDetail: "#2a5a31",
  fortDetail: "#5d5a54",
  waterDetail: "#79a9dd",
  grid: "rgba(0,0,0,0.22)",
  blueTile: "rgba(80,140,255,0.40)",
  redTile: "rgba(230,70,60,0.32)",
  team: { player: "#3b6fd8", npc: "#d24b4b" } as Record<string, string>,
  cursor: "#ff3b30",
  hpBack: "#111",
  hpGood: "#5fd07e",
  hpMid: "#f2c94c",
  hpLow: "#ff4d4d",
  attr: { fire: "#ff8a3d", water: "#3dc9ff", electric: "#ffe23d" } as Record<string, string>,
  damage: "#ff5a52",
  heal: "#5fd07e",
  burn: "#ff9f43",
  miss: "#d7dbe4",
  reaction: "#ffe23d",
  gold: "#c9a24a",
};
