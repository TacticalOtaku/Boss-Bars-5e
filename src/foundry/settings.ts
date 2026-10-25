import { MODULE_ID } from "../constants";

/** onChange refreshes the HUD. */
export function registerSettings(onChange: () => void): void {
  // Per scene: ids of the bars this player collapsed (spec §2, client-side, never written to the world).
  game.settings.register(MODULE_ID, "collapsed", {
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange,
  });
  // shortcut: lives in the module settings until the layout panel takes it over in stage 3.
  game.settings.register(MODULE_ID, "playersMayCollapse", {
    name: "BB5E.Setting.PlayersMayCollapse.Name",
    hint: "BB5E.Setting.PlayersMayCollapse.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange,
  });
}

export function playersMayCollapse(): boolean {
  return game.settings.get(MODULE_ID, "playersMayCollapse") === true;
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
