import { resolveLook, type LookSources, type ResolvedLook } from "./resolve";
import { readParams, type Category, type Look, type Preset } from "./schema";
import { lookStyle, type LookStyle } from "./style";

/**
 * Built-in looks and presets of stage 5 (decision 2): "Classic RPG" (the PARAMS defaults), "Permafrost" and "Neon",
 * with the bar and card layouts A, B and C of the mock-up. Read-only; their names are i18n keys. Stage 10 adds the
 * other 27 themes and layouts.
 */
type Raw = { [C in Category]?: Record<string, unknown> };

const THEMES: { id: string; name: string; values: Raw; layouts: [string, string] }[] = [
  { id: "classic", name: "BB5E.Look.Theme.Classic", values: {}, layouts: ["a", "a"] },
  {
    id: "frost",
    name: "BB5E.Look.Theme.Frost",
    layouts: ["b", "b"],
    values: {
      font: {
        family: "philosopher",
        nameSize: 1.35,
        caps: false,
        spacing: 0.02,
        color: "#e6f4ff",
        color2: "#9fd4ff",
        titleColor: "#9fd4ff",
        glow: 0.4,
        glowColor: "#7fc8ff",
      },
      frame: { style: "double", color: "#9fd4ff", glow: 0.3, glowColor: "#7fc8ff", corners: "studs" },
      fill: {
        type: "ice",
        colors: ["#dff6ff", "#5fb6ec", "#1f5c99"],
        empty: "#0b1a2a",
        shieldColor: "#ffffff",
        shine: true,
        edgeGlow: true,
      },
      hpEffect: {
        damageShake: false,
        sparkColor: "#cfefff",
        healWave: true,
        lowPulse: false,
        lowFlicker: true,
        trailColor: "#bfe6ff",
      },
      motion: {
        enter: "expand",
        duration: 450,
        leave: "fade",
        defeat: "dissolve",
        phaseCrack: true,
        phasePalette: true,
        phaseBanner: false,
      },
      portrait: { shape: "hexagon", borderColor: "#9fd4ff", glow: 0.3, glowColor: "#7fc8ff", tint: "darken" },
      miniBars: {
        bar: "ring",
        pip: "dot",
        color: "#bfe6ff",
        color2: "#5fb6ec",
        empty: "#0b1a2a",
        height: 0.45,
      },
      statuses: { shape: "circle", size: 1.4, max: 8, maxCard: 3 },
    },
  },
  {
    id: "neon",
    name: "BB5E.Look.Theme.Neon",
    layouts: ["c", "c"],
    values: {
      font: {
        family: "russo-one",
        nameSize: 1.6,
        spacing: 0.18,
        color: "#ffffff",
        titleColor: "#ff4fd8",
        glow: 0.6,
        glowColor: "#00e5ff",
        shadow: false,
      },
      frame: { style: "inset", width: 0.0625, color: "#00e5ff", glow: 0.5, glowColor: "#00e5ff" },
      fill: {
        type: "energy",
        colors: ["#ff2bd6", "#7a2bff", "#00e5ff"],
        empty: "#07021a",
        shieldColor: "#f5ff7a",
        segments: "every",
        segmentEvery: 10,
        edgeGlow: true,
      },
      hpEffect: {
        bigThreshold: 20,
        bigCrack: false,
        lowThreshold: 30,
        lowPulse: false,
        lowFlicker: true,
        trailColor: "#ffffff",
        sparkColor: "#ff2bd6",
        trailDelay: 250,
        trailSpeed: 400,
        trailAccumulate: false,
      },
      motion: { enter: "type", duration: 500, defeat: "banner", phaseRefill: true },
      portrait: { shape: "notch", borderWidth: 0, glow: 0.4, glowColor: "#ff2bd6", tint: "red" },
      miniBars: { pip: "dot", color: "#00e5ff", color2: "", empty: "#07021a", height: 0.3 },
      statuses: { shape: "diamond", size: 1.3, max: 12 },
    },
  },
];

/** Structural layouts (spec §9: the layout sets are not themed). */
const LAYOUTS: { id: string; name: string; bar: Record<string, unknown>; card: Record<string, unknown> }[] = [
  { id: "a", name: "BB5E.Look.Layout.A", bar: {}, card: {} },
  {
    id: "b",
    name: "BB5E.Look.Layout.B",
    bar: { bar: "ring", extras: "side", width: 32, height: 1 },
    card: { icon: "top", fill: "ring", name: "below", width: 7.5 },
  },
  {
    id: "c",
    name: "BB5E.Look.Layout.C",
    bar: { portrait: "notch", bar: "thin", quote: "below", width: 60, height: 0.625 },
    card: { icon: "tile", fill: "vertical", name: "overlay", statuses: "side", width: 8 },
  },
];

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
