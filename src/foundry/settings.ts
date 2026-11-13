import { MODULE_ID } from "../constants";
import { defaultRanks, readRanks, type Rank } from "../core/ranks";
import { liveFoundryEnv, type FoundryEnv } from "./env";
import { clearLookCache } from "./library";

/** onChange refreshes the HUD; openRanks and openLibrary open the (lazily loaded) GM windows. */
export function registerSettings(
  onChange: () => void,
  openRanks: () => void,
  openLibrary: () => void,
  env: Pick<FoundryEnv, "game" | "foundry"> = liveFoundryEnv(),
): void {
  // Per scene: ids of the bars this player collapsed (spec §2, client-side, never written to the world).
  env.game.settings.register(MODULE_ID, "collapsed", {
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange,
  });
  // Stages 1–2 only: now a field of the layout blocks; it still seeds the boss stack until the first layout save.
  env.game.settings.register(MODULE_ID, "playersMayCollapse", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange,
  });
  // Legacy world layout remains registered for read-only initial defaults.
  env.game.settings.register(MODULE_ID, "clientLayout", {
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange,
  });
  // Legacy world layout; new positions and preferences are client-local.
  env.game.settings.register(MODULE_ID, "layout", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange,
  });
  // The GM's own looks and presets (spec §9); built-ins live in code and are never written here.
  env.game.settings.register(MODULE_ID, "library", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      clearLookCache();
      onChange();
    },
  });
  // What the boss music changed in the world's playlists (core/music snapshot); the active GM writes it.
  env.game.settings.register(MODULE_ID, "music", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  // Empty until the GM saves: the translated default ranks apply meanwhile.
  env.game.settings.register(MODULE_ID, "ranks", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange,
  });

  // registerMenu needs an ApplicationV2 class at init; this stand-in opens the real window on demand.
  class RanksMenu extends env.foundry.applications.api.ApplicationV2 {
    override render() {
      openRanks();
      return Promise.resolve(this);
    }
  }
  env.game.settings.registerMenu(MODULE_ID, "ranksMenu", {
    name: "BB5E.Ranks.Title",
    label: "BB5E.Ranks.Open",
    hint: "BB5E.Ranks.Hint",
    icon: "fa-solid fa-ranking-star",
    type: RanksMenu,
    restricted: true,
  });
  class LibraryMenu extends env.foundry.applications.api.ApplicationV2 {
    override render() {
      openLibrary();
      return Promise.resolve(this);
    }
  }
  env.game.settings.registerMenu(MODULE_ID, "libraryMenu", {
    name: "BB5E.Library.Title",
    label: "BB5E.Library.Open",
    hint: "BB5E.Library.Hint",
    icon: "fa-solid fa-palette",
    type: LibraryMenu,
    restricted: true,
  });
}

export function defaultRankList(env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): Rank[] {
  const name = (key: string) => env.game.i18n.localize(key);
  return defaultRanks([
    name("BB5E.Ranks.Default.Captain"),
    name("BB5E.Ranks.Default.Veteran"),
    name("BB5E.Ranks.Default.Fighter"),
    name("BB5E.Ranks.Default.Guard"),
  ]);
}

/** Saved ranks, or the defaults (also when the saved list was written by a newer version and cannot be read). */
export function currentRanks(env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): Rank[] {
  const defaults = defaultRankList(env);
  const read = readRanks(env.game.settings.get(MODULE_ID, "ranks"), defaults);
  return read.status === "ok" ? read.value.items : defaults;
}

function collapsedByScene(env: Pick<FoundryEnv, "game">): Record<string, string[]> {
  const value = env.game.settings.get(MODULE_ID, "collapsed");
  return typeof value === "object" && value !== null ? (value as Record<string, string[]>) : {};
}

export function collapsedIds(sceneId: string, env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): Set<string> {
  const ids = collapsedByScene(env)[sceneId];
  return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
}

/** Ids of bars no longer shown are dropped on each write, so the list never grows. */
export async function setCollapsed(
  sceneId: string,
  id: string,
  collapsed: boolean,
  shownIds: string[],
  env: Pick<FoundryEnv, "game"> = liveFoundryEnv(),
) {
  const ids = new Set([...collapsedIds(sceneId, env)].filter((each) => shownIds.includes(each)));
  if (collapsed) ids.add(id);
  else ids.delete(id);
  await env.game.settings.set(MODULE_ID, "collapsed", { ...collapsedByScene(env), [sceneId]: [...ids] });
}
