import "../styles/boss-bars-5e.scss";
import { MODULE_ID } from "./constants";
import { pruneScenes, registerAuthority } from "./foundry/authority";
import { registerEntryPoints } from "./foundry/entry-points";
import { registerSettings, setCollapsed } from "./foundry/settings";
import { startStore, type BossHud } from "./foundry/store";
import { logger } from "./logger";
import { createBossStack } from "./ui/boss-stack";
import { mountOverlay } from "./ui/overlay";

let hud: BossHud | null = null;

/** GM windows are separate chunks: players never download them. */
function loadFailed(error: unknown): void {
  logger.error("Window failed to load", error);
  ui.notifications.error("BB5E.Error.WindowFailed", { localize: true });
}

Hooks.once("init", () => {
  registerSettings(() => hud?.refresh());
  registerAuthority();
  registerEntryPoints({
    openProfile: (actor) =>
      void import("./apps/profile-editor").then(
        ({ openProfileEditor }) => openProfileEditor(actor),
        loadFailed,
      ),
    openPanel: () =>
      void import("./apps/active-bosses").then(
        ({ openActiveBosses }) => hud && openActiveBosses(hud),
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
  let shownIds: string[] = [];
  const stack = createBossStack(mountOverlay(host), {
    labels: {
      collapse: game.i18n.localize("BB5E.Bar.Collapse"),
      expand: game.i18n.localize("BB5E.Bar.Expand"),
    },
    onCollapse(id, collapsed) {
      const scene = canvas?.scene;
      if (scene) void setCollapsed(scene.id, id, collapsed, shownIds);
    },
    reducedMotion: () =>
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.body.classList.contains("performance-low"),
  });
  hud = startStore((views, uiScale) => {
    shownIds = views.map((view) => view.id);
    stack.update(views, uiScale);
  });
  hud.refresh();

  // Automatic clean-up, active GM only: deleted tokens and removed profiles take their bars along.
  pruneScenes(game.scenes.contents);
  Hooks.on("deleteToken", (token: TokenDocument) => token.parent && pruneScenes([token.parent]));
  Hooks.on("updateActor", (actor: ActorDocument, changes: object) => {
    if (!actor.isToken && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`))
      pruneScenes(game.scenes.contents);
  });
});
