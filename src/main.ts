import "../styles/boss-bars-5e.scss";
import type { HubSection } from "./apps/hub";
import type { LayoutHost } from "./apps/layout-panel";
import { MODULE_ID } from "./constants";
import { ELITE_COLUMN_ID } from "./core/view";
import { createApi, listenEffects, type ApiHost } from "./foundry/api";
import { pruneScenes, registerAuthority, syncPhases } from "./foundry/authority";
import { startCombatWatch } from "./foundry/combat";
import { startMusicWatch } from "./foundry/music";
import { startQuoteWatch } from "./foundry/quotes";
import { registerEntryPoints } from "./foundry/entry-points";
import { startHookEvents } from "./foundry/hooks";
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
let playEffect: ApiHost["play"] = () => undefined;

/** GM windows are separate chunks: players never download them. */
function loadFailed(error: unknown): void {
  logger.error("Window failed to load", error);
  ui.notifications.error("BB5E.Error.WindowFailed", { localize: true });
}

const openLayout = () =>
  import("./apps/layout-panel").then(({ openLayoutPanel }) => {
    if (layoutHost) openLayoutPanel(layoutHost);
  }, loadFailed);
/** Every GM way in leads to the hub (stage 13), on the right section. */
const openHub = (section: HubSection, actor?: ActorDocument) =>
  import("./apps/hub").then(({ openHub: open }) => {
    if (hud) open({ hud, openLayout: () => void openLayout() }, section, actor);
  }, loadFailed);
const openRanks = () => void openHub("ranks");
const openLibrary = () => void openHub("library");
const openProfile = (actor: ActorDocument) => openHub("profiles", actor);
const openPanel = () => openHub("scene");

const apiHost: ApiHost = {
  play: (message) => playEffect(message),
  openEditor: openProfile,
  openPanel,
  openLayout,
};
const api = createApi(apiHost);

Hooks.once("init", () => {
  registerSettings(() => hud?.refresh(), openRanks, openLibrary);
  registerAuthority();
  registerEntryPoints({ openProfile: (actor) => void openProfile(actor), openPanel: () => void openPanel() });
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
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
  // API effects play on the viewed scene's HUD only.
  playEffect = ({ sceneId, instanceId, effect }) => {
    if (canvas?.scene?.id !== sceneId) return;
    stack.play(instanceId, effect);
    column.play(instanceId, effect);
  };
  listenEffects(apiHost);
  // Public hooks: the baseline is taken before the first recompute.
  startHookEvents(hud);
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
  Hooks.callAll(`${MODULE_ID}.ready`, api);
});
