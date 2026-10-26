import { resolveLook, type LookSources, type ResolvedLook } from "./resolve";
import { readParams, type Category, type Look, type Preset } from "./schema";
import { lookStyle, type LookStyle } from "./style";
import { BAR_LAYOUTS, CARD_LAYOUTS } from "./catalog/layouts";
import { THEMES } from "./catalog/themes";
import { ARCHETYPES } from "./catalog/archetypes";

/**
 * The built-in catalog (spec §9, ticket #9): themed looks with their own font, frame, fill, portrait and mini-bar
 * presets and shared archetypes for motion, HP effects and statuses, and the structural layouts of the bar and the card. The data lives in catalog/; this file only builds
 * read-only presets and looks from it. Names are i18n keys.
 */
/** Categories every theme styles itself; the others come from shared archetypes (catalog/archetypes.ts). */
const THEMED = ["font", "frame", "fill", "portrait", "miniBars"] as const;
const SHARED = ["motion", "hpEffect", "statuses"] as const;

function preset<C extends Category>(
  id: string,
  name: string,
  category: C,
  raw: Record<string, unknown>,
): Preset<C> {
  return { id, name, category, params: readParams(category, raw), builtIn: true };
}

export const BUILTIN_PRESETS: Preset[] = [
  ...BAR_LAYOUTS.map((layout) => preset(`layout-bar-${layout.id}`, layout.name, "layoutBar", layout.params)),
  ...CARD_LAYOUTS.map((layout) =>
    preset(`layout-card-${layout.id}`, layout.name, "layoutCard", layout.params),
  ),
  ...THEMES.flatMap((theme) =>
    THEMED.map((category) =>
      preset(`${theme.id}-${category}`, theme.name, category, theme.values[category] ?? {}),
    ),
  ),
  ...SHARED.flatMap((category) =>
    ARCHETYPES[category].map((each) => preset(`${category}-${each.id}`, each.name, category, each.params)),
  ),
];

export const BUILTIN_LOOKS: Look[] = THEMES.map((theme) => ({
  id: theme.id,
  name: theme.name,
  builtIn: true,
  presets: {
    layoutBar: `layout-bar-${theme.layouts[0]}`,
    layoutCard: `layout-card-${theme.layouts[1]}`,
    ...Object.fromEntries(THEMED.map((category) => [category, `${theme.id}-${category}`])),
    ...Object.fromEntries(SHARED.map((category, index) => [category, `${category}-${theme.styles[index]}`])),
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
