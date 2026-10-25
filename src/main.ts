import "../styles/boss-bars-5e.scss";
import type { LayoutHost } from "./apps/layout-panel";
import { MODULE_ID } from "./constants";
import { ELITE_COLUMN_ID } from "./core/view";
import { pruneScenes, registerAuthority } from "./foundry/authority";
import { registerEntryPoints } from "./foundry/entry-points";
import { registerSettings, setCollapsed } from "./foundry/settings";
import { startStore, uiScale, type BossHud } from "./foundry/store";
import { logger } from "./logger";
import { createBossStack } from "./ui/boss-stack";
import { createEliteColumn } from "./ui/elite-column";
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
const openLayout = () =>
  void import("./apps/layout-panel").then(
    ({ openLayoutPanel }) => layoutHost && openLayoutPanel(layoutHost),
    loadFailed,
  );

Hooks.once("init", () => {
  registerSettings(() => hud?.refresh(), openRanks);
  registerAuthority();
  registerEntryPoints({
    openProfile: (actor) =>
      void import("./apps/profile-editor").then(
        ({ openProfileEditor }) => openProfileEditor(actor),
        loadFailed,
      ),
    openPanel: () =>
      void import("./apps/active-bosses").then(
        ({ openActiveBosses }) => hud && openActiveBosses(hud, { openRanks, openLayout }),
        loadFailed,
      ),
  });
});

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
    },
    onCollapse: collapse,
    reducedMotion,
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
