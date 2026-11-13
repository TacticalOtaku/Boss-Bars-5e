import { MODULE_ID } from "../constants";
import { BUILTIN_IDS } from "../core/look/builtin";
import { compileLook, sourcesOf, type LookSources, type LookStyle } from "../core/look/compile";
import { readLibrary, type Category, type Library } from "../core/look/schema";
import { liveFoundryEnv, type FoundryEnv } from "./env";

/** Compiled look styles by look id and overrides; dropped whenever the library setting changes. */
const cache = new Map<string, LookStyle>();

/** The library setting changed (any client): looks compile again on the next recompute. */
export function clearLookCache(): void {
  cache.clear();
}

/** The GM's looks and presets; a library written by a newer version reads as empty and is left untouched. */
export function currentLibrary(env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): Library | null {
  const read = readLibrary(env.game.settings.get(MODULE_ID, "library"), BUILTIN_IDS);
  return read.status === "ok" ? read.value : null;
}

export function lookSources(env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): LookSources {
  return sourcesOf(currentLibrary(env));
}

/** One compiled style per distinct choice, so bars sharing a look share the style object. */
export function lookStyleFor(
  lookId: string | null,
  overrides: Partial<Record<Category, string>> = {},
  env: Pick<FoundryEnv, "game"> = liveFoundryEnv(),
): LookStyle {
  const key = JSON.stringify([lookId, overrides]);
  let style = cache.get(key);
  if (!style) {
    style = compileLook(lookId, overrides, lookSources(env));
    cache.set(key, style);
  }
  return style;
}
