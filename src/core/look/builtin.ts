import { resolveLook, type LookSources, type ResolvedLook } from "./resolve";
import { readParams, type Category, type Look, type Preset } from "./schema";
import { lookStyle, type LookStyle } from "./style";
import { LAYOUTS } from "./catalog/layouts";
import { THEMES } from "./catalog/themes";

/**
 * The built-in catalog (spec §9, ticket #9): 30 themed looks, each with one preset in each of the 8 styled
 * categories, and 30 structural layouts for the bar and the card. The data lives in catalog/; this file only builds
 * read-only presets and looks from it. Names are i18n keys.
 */
const STYLED = ["font", "frame", "fill", "hpEffect", "motion", "portrait", "miniBars", "statuses"] as const;

function preset<C extends Category>(
  id: string,
  name: string,
  category: C,
  raw: Record<string, unknown>,
): Preset<C> {
  return { id, name, category, params: readParams(category, raw), builtIn: true };
}

export const BUILTIN_PRESETS: Preset[] = [
  ...LAYOUTS.flatMap((layout) => [
    preset(`layout-bar-${layout.id}`, layout.name, "layoutBar", layout.bar),
    preset(`layout-card-${layout.id}`, layout.name, "layoutCard", layout.card),
  ]),
  ...THEMES.flatMap((theme) =>
    STYLED.map((category) =>
      preset(`${theme.id}-${category}`, theme.name, category, theme.values[category] ?? {}),
    ),
  ),
];

export const BUILTIN_LOOKS: Look[] = THEMES.map((theme) => ({
  id: theme.id,
  name: theme.name,
  builtIn: true,
  presets: {
    layoutBar: `layout-bar-${theme.layouts[0]}`,
    layoutCard: `layout-card-${theme.layouts[1]}`,
    ...Object.fromEntries(STYLED.map((category) => [category, `${theme.id}-${category}`])),
  },
}));

export const BUILTIN_IDS: ReadonlySet<string> = new Set([
  ...BUILTIN_LOOKS.map((look) => look.id),
  ...BUILTIN_PRESETS.map((each) => each.id),
]);

/** "Classic RPG": the default look and the fallback of every category. */
export const CLASSIC = BUILTIN_LOOKS[0] as Look;

export const BUILTIN_SOURCES: LookSources = { looks: BUILTIN_LOOKS, presets: BUILTIN_PRESETS };

/** The default look, resolved once. */
export const CLASSIC_RESOLVED: ResolvedLook = resolveLook(CLASSIC.id, {}, BUILTIN_SOURCES, CLASSIC);
export const CLASSIC_STYLE: LookStyle = lookStyle(CLASSIC_RESOLVED);
