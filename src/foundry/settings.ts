import { MODULE_ID } from "../constants";
import { defaultRanks, readRanks, type Rank } from "../core/ranks";
import { clearLookCache } from "./library";

/** onChange refreshes the HUD; openRanks and openLibrary open the (lazily loaded) GM windows. */
export function registerSettings(onChange: () => void, openRanks: () => void, openLibrary: () => void): void {
  // Per scene: ids of the bars this player collapsed (spec §2, client-side, never written to the world).
  game.settings.register(MODULE_ID, "collapsed", {
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange,
  });
  // Stages 1–2 only: now a field of the layout blocks; it still seeds the boss stack until the first layout save.
  game.settings.register(MODULE_ID, "playersMayCollapse", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange,
  });
  // World layout (spec §2); scenes override whole blocks with a flag.
  game.settings.register(MODULE_ID, "layout", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange,
  });
  // The GM's own looks and presets (spec §9); built-ins live in code and are never written here.
  game.settings.register(MODULE_ID, "library", {
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
  game.settings.register(MODULE_ID, "music", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  // Empty until the GM saves: the translated default ranks apply meanwhile.
  game.settings.register(MODULE_ID, "ranks", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange,
  });

  // registerMenu needs an ApplicationV2 class at init; this stand-in opens the real window on demand.
  class RanksMenu extends foundry.applications.api.ApplicationV2 {
    override render() {
      openRanks();
      return Promise.resolve(this);
    }
  }
  game.settings.registerMenu(MODULE_ID, "ranksMenu", {
    name: "BB5E.Ranks.Title",
    label: "BB5E.Ranks.Open",
    hint: "BB5E.Ranks.Hint",
    icon: "fa-solid fa-ranking-star",
    type: RanksMenu,
    restricted: true,
  });
  class LibraryMenu extends foundry.applications.api.ApplicationV2 {
    override render() {
      openLibrary();
      return Promise.resolve(this);
    }
  }
  game.settings.registerMenu(MODULE_ID, "libraryMenu", {
    name: "BB5E.Library.Title",
    label: "BB5E.Library.Open",
    hint: "BB5E.Library.Hint",
    icon: "fa-solid fa-palette",
    type: LibraryMenu,
    restricted: true,
  });
}

export function defaultRankList(): Rank[] {
  const name = (key: string) => game.i18n.localize(key);
  return defaultRanks([
    name("BB5E.Ranks.Default.Captain"),
    name("BB5E.Ranks.Default.Veteran"),
    name("BB5E.Ranks.Default.Fighter"),
    name("BB5E.Ranks.Default.Guard"),
  ]);
}

/** Saved ranks, or the defaults (also when the saved list was written by a newer version and cannot be read). */
export function currentRanks(): Rank[] {
  const read = readRanks(game.settings.get(MODULE_ID, "ranks"), defaultRankList());
  return read.status === "ok" ? read.value.items : defaultRankList();
}

function collapsedByScene(): Record<string, string[]> {
  const value = game.settings.get(MODULE_ID, "collapsed");
  return typeof value === "object" && value !== null ? (value as Record<string, string[]>) : {};
}

export function collapsedIds(sceneId: string): Set<string> {
  const ids = collapsedByScene()[sceneId];
  return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
}

/** Ids of bars no longer shown are dropped on each write, so the list never grows. */
export async function setCollapsed(sceneId: string, id: string, collapsed: boolean, shownIds: string[]) {
  const ids = new Set([...collapsedIds(sceneId)].filter((each) => shownIds.includes(each)));
  if (collapsed) ids.add(id);
  else ids.delete(id);
  await game.settings.set(MODULE_ID, "collapsed", { ...collapsedByScene(), [sceneId]: [...ids] });
}
