import { MODULE_ID } from "../constants";
import { BUILTIN_IDS, BUILTIN_LOOKS, BUILTIN_PRESETS, CLASSIC } from "../core/look/builtin";
import { resolveLook, type LookSources, type ResolvedLook } from "../core/look/resolve";
import { readLibrary, type Category, type Library } from "../core/look/schema";

/** Resolved looks by look id and overrides; dropped whenever the library setting changes. */
const cache = new Map<string, ResolvedLook>();

/** The library setting changed (any client): looks resolve again on the next recompute. */
export function clearLookCache(): void {
  cache.clear();
}

/** The GM's looks and presets; a library written by a newer version reads as empty and is left untouched. */
export function currentLibrary(): Library | null {
  const read = readLibrary(game.settings.get(MODULE_ID, "library"), BUILTIN_IDS);
  return read.status === "ok" ? read.value : null;
}

export function lookSources(): LookSources {
  const library = currentLibrary();
  return {
    looks: [...BUILTIN_LOOKS, ...(library?.looks ?? [])],
    presets: [...BUILTIN_PRESETS, ...(library?.presets ?? [])],
  };
}

/** One resolved object per distinct choice, so bars sharing a look share its style. */
export function lookFor(
  lookId: string | null,
  overrides: Partial<Record<Category, string>> = {},
): ResolvedLook {
  const key = JSON.stringify([lookId, overrides]);
  let look = cache.get(key);
  if (!look) {
    look = resolveLook(lookId, overrides, lookSources(), CLASSIC);
    cache.set(key, look);
  }
  return look;
}
