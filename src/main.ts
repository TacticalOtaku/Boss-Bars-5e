import "../styles/boss-bars-5e.scss";
import type { LayoutHost } from "./apps/layout-panel";
import { MODULE_ID } from "./constants";
import { ELITE_COLUMN_ID } from "./core/view";
import { pruneScenes, registerAuthority, syncPhases } from "./foundry/authority";
import { startCombatWatch } from "./foundry/combat";
import { startMusicWatch } from "./foundry/music";
import { startQuoteWatch } from "./foundry/quotes";
import { registerEntryPoints } from "./foundry/entry-points";
import { registerSettings, setCollapsed } from "./foundry/settings";
import { startStore, uiScale, type BossHud } from "./foundry/store";
import { logger } from "./logger";
import { createBossStack } from "./ui/boss-stack";
import { FONT_FACES } from "./core/look/fonts";
import { createEliteColumn } from "./ui/elite-column";
import { createParticleLayer } from "./ui/particles";
import { registerFonts } from "./ui/look";
import { mountOverlay } from "./ui/overlay";

let hud: BossHud | null = null;
let layoutHost: LayoutHost | null = null;

/** GM windows are separate chunks: players never download them. */
function loadFailed(error: unknown): void {
  logger.error("Window failed to load", error);
  ui.notifications.error("BB5E.Error.WindowFailed", { localize: true });
}

const openRanks = () =>
  void import("./apps/ranks-editor").then(({ openRanksEditor }) => openRanksEditor(), loadFailed);
const openLibrary = () => void import("./apps/library").then(({ openLibrary: open }) => open(), loadFailed);
const openLayout = () =>
  void import("./apps/layout-panel").then(
    ({ openLayoutPanel }) => layoutHost && openLayoutPanel(layoutHost),
    loadFailed,
  );

Hooks.once("init", () => {
  registerSettings(() => hud?.refresh(), openRanks, openLibrary);
  registerAuthority();
  registerEntryPoints({
    openProfile: (actor) =>
      void import("./apps/profile-editor").then(
        ({ openProfileEditor }) => openProfileEditor(actor),
        loadFailed,
      ),
    openPanel: () =>
      void import("./apps/active-bosses").then(
        ({ openActiveBosses }) => hud && openActiveBosses(hud, { openRanks, openLayout, openLibrary }),
        loadFailed,
      ),
  });
});

// The module root, from this script's own URL (scripts/boss-bars-5e.js): right under a route prefix or a CDN.
const moduleRoot = import.meta.url.replace(/scripts\/[^/]*$/, "");
registerFonts(FONT_FACES, (file) => `${moduleRoot}fonts/${file}`);

// #interface exists from Game#initializeUI, so it is guaranteed by "ready" (research/foundry-ui §1).
Hooks.once("ready", () => {
  const host = document.getElementById("interface");
  if (!host) {
    logger.error("#interface not found; overlay not mounted");
    return;
  }
  const reducedMotion = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.body.classList.contains("performance-low");
  // Ids the player may keep collapsed on this scene; anything else is dropped from the setting on the next write.
  let shownIds: string[] = [];
  const collapse = (id: string, collapsed: boolean) => {
    const scene = canvas?.scene;
    if (scene) void setCollapsed(scene.id, id, collapsed, shownIds);
  };
  const overlay = mountOverlay(host);
  const stack = createBossStack(overlay, {
    labels: {
      collapse: game.i18n.localize("BB5E.Bar.Collapse"),
      expand: game.i18n.localize("BB5E.Bar.Expand"),
      defeated: game.i18n.localize("BB5E.Bar.Defeated"),
      phase: game.i18n.localize("BB5E.Phase.Default"),
    },
    onCollapse: collapse,
    reducedMotion,
    particles: createParticleLayer(overlay, reducedMotion),
  });
  const column = createEliteColumn(overlay, {
    reducedMotion,
    collapse: {
      labels: {
        title: game.i18n.localize("BB5E.Column.Title"),
        collapse: game.i18n.localize("BB5E.Column.Collapse"),
        expand: game.i18n.localize("BB5E.Column.Expand"),
      },
      onToggle: (collapsed) => collapse(ELITE_COLUMN_ID, collapsed),
    },
  });
  hud = startStore((views, layout, scale) => {
    shownIds = [...views.bosses.map((view) => view.id), ELITE_COLUMN_ID];
    stack.update(views.bosses, layout.bosses, scale);
    column.update(views.elites, views, layout.elites, scale);
  });
  layoutHost = { host, overlay, blocks: { bosses: stack.element, elites: column.element }, hud, uiScale };
  // Before the first recompute: its defeat check hides what fell while no page was watching.
  startCombatWatch(hud);
  // Boss phases follow HP on the active GM; one that returns catches up on its first recompute.
  hud.subscribe(() => syncPhases(game.scenes.contents));
  // Boss quotes: the active GM decides and writes the quote on screen into the instance.
  startQuoteWatch(hud);
  // Boss music: the active GM switches the world's playlists after the leading boss.
  startMusicWatch(hud);
  hud.refresh();

  // Automatic clean-up, active GM only: deleted tokens and removed profiles take their bars and cards along.
  pruneScenes(game.scenes.contents);
  Hooks.on("deleteToken", (token: TokenDocument) => token.parent && pruneScenes([token.parent]));
  Hooks.on("updateActor", (actor: ActorDocument, changes: object) => {
    if (!actor.isToken && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) {
      pruneScenes(game.scenes.contents);
    }
  });
});
