import { isRecord, migrate, text, type ReadResult } from "../schema";

/**
 * The 9 categories of a look (spec §9); the layout is split into its bar and card sets. A look picks one preset
 * per key.
 */
export const CATEGORIES = [
  "layoutBar",
  "layoutCard",
  "font",
  "frame",
  "fill",
  "hpEffect",
  "motion",
  "portrait",
  "miniBars",
  "statuses",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const isCategory = (value: unknown): value is Category =>
  typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);

/** One parameter: the reader keeps a stored value only if it fits, else it takes the default. */
export type Param =
  | { type: "enum"; values: readonly string[]; default: string }
  | { type: "number"; min: number; max: number; step: number; default: number }
  | { type: "bool"; default: boolean }
  /** `optional`: "" is allowed and means "none". */
  | { type: "color"; default: string; optional?: boolean }
  | { type: "colors"; max: number; default: readonly string[] }
  /** A FilePicker path that ends up in CSS `url("…")`. */
  | { type: "path"; default: string }
  | { type: "text"; max: number; default: string }
  /** A built-in font id (`looks/fonts.ts`) or "custom" (the `fontFile` path). */
  | { type: "font"; default: string };

const e = (values: readonly string[], value = values[0] ?? "") =>
  ({ type: "enum", values, default: value }) as const;
const n = (min: number, max: number, value: number, step = 1) =>
  ({ type: "number", min, max, step, default: value }) as const;
const b = (value: boolean) => ({ type: "bool", default: value }) as const;
const c = (value: string, optional = false) => ({ type: "color", default: value, optional }) as const;

/**
 * Parameters of each category (spec §9 table). The defaults are the "Classic RPG" values, so a preset that lacks
 * a parameter (an older or hand-made one) still renders as the default look. Sizes are in em of the bar or card.
 */
export const PARAMS = {
  layoutBar: {
    portrait: e(["left", "right", "top", "medallion", "notch", "none"]),
    bar: e(["thick", "thin", "segmented"]),
    name: e(["above", "inside", "below"]),
    extras: e(["below", "above", "side", "portrait"]),
    /** Where the boss's quote shows (stage 7). */
    quote: e(["above", "below", "side"]),
    width: n(16, 80, 38.75, 0.25),
    height: n(0.25, 3, 1.125, 0.125),
    /** The whole bar, on top of the profile's own size. */
    size: e(["s", "m", "l", "xl"], "m"),
  },
  layoutCard: {
    icon: e(["left", "top", "tile"]),
    fill: e(["horizontal", "vertical"]),
    name: e(["beside", "below", "overlay"]),
    statuses: e(["below", "side"]),
    width: n(6, 30, 14.375, 0.125),
    size: e(["s", "m", "l", "xl"], "m"),
  },
  font: {
    family: { type: "font", default: "cormorant" },
    fontFile: { type: "path", default: "" },
    nameSize: n(0.6, 3, 1.25, 0.05),
    titleSize: n(0.5, 2, 0.8125, 0.05),
    bold: b(true),
    caps: b(true),
    spacing: n(-0.05, 0.5, 0.06, 0.01),
    color: c("#e8e2d6"),
    color2: c("", true),
    titleColor: c("#c9a45c"),
    stroke: n(0, 3, 0, 0.25),
    strokeColor: c("#000000"),
    glow: n(0, 2, 0, 0.05),
    glowColor: c("#ffcc66"),
    shadow: b(true),
  },
  frame: {
    style: e(["classic", "double", "inset", "none", "image"]),
    image: { type: "path", default: "" },
    slice: n(1, 200, 30),
    width: n(0, 0.5, 0.125, 0.0625),
    color: c("#c9a45c"),
    glow: n(0, 1, 0, 0.05),
    glowColor: c("#c9a45c"),
    corners: e(["none", "studs", "spikes", "filigree"]),
    portraitFrame: b(true),
  },
  fill: {
    type: e(["solid", "gradient", "texture", "liquid", "energy", "flame", "ice", "void"], "gradient"),
    colors: { type: "colors", max: 5, default: ["#e0473f", "#8e1414"] },
    byHp: b(false),
    empty: c("#1a0d0d"),
    texture: { type: "path", default: "" },
    shield: b(true),
    shieldColor: c("#6fb7f0"),
    /** "phases": gaps at the phase thresholds instead of thin ticks. */
    segments: e(["none", "every", "phases"]),
    segmentEvery: n(5, 50, 25),
    shine: b(false),
    edgeGlow: b(false),
    /** Carved into the fill: glowing runes, dragon scales, gold damask, ink soaking into paper. */
    pattern: e(["none", "runes", "scales", "damask", "ink"]),
    /** Drifting around the bar: fireflies, rising embers, twinkling sparkles. */
    motes: e(["none", "fireflies", "embers", "sparkles"]),
  },
  hpEffect: {
    damageShake: b(true),
    damageFlash: b(true),
    /** Sparks fly from the fill's edge on damage (stage 9; boss bars on the HUD). */
    sparks: b(true),
    sparkColor: c("#ffcc66"),
    scaleByDamage: b(true),
    bigThreshold: n(5, 100, 25),
    bigCrack: b(true),
    healRise: b(true),
    healWave: b(false),
    lowThreshold: n(0, 50, 25),
    lowPulse: b(true),
    lowFlicker: b(false),
    trailColor: c("#f3e3b0"),
    trailDelay: n(0, 3000, 550, 50),
    trailSpeed: n(100, 3000, 600, 50),
    trailAccumulate: b(true),
  },
  motion: {
    enter: e(["slide", "expand", "fade", "type"]),
    duration: n(100, 2000, 300, 50),
    leave: e(["slide", "fade"]),
    defeat: e(["fade", "dissolve", "banner"]),
    bannerText: { type: "text", max: 40, default: "" },
    // Phase change (spec §9, decision 5 of stage 6): any mix of these.
    phaseCrack: b(false),
    phaseFlash: b(true),
    phaseRefill: b(false),
    phasePalette: b(false),
    phaseBanner: b(true),
  },
  portrait: {
    shape: e(["circle", "square", "diamond", "shield", "hexagon", "notch"]),
    borderWidth: n(0, 0.5, 0.1875, 0.0625),
    borderColor: c("#c9a45c"),
    glow: n(0, 1, 0, 0.05),
    glowColor: c("#c9a45c"),
    shake: b(true),
    tint: e(["none", "darken", "red"]),
  },
  miniBars: {
    bar: e(["bar", "ring"]),
    pip: e(["diamond", "dot"]),
    color: c("#e9cf8c"),
    color2: c("#a8823c", true),
    empty: c("#1a0d0d"),
    height: n(0.2, 1.5, 0.5, 0.05),
    label: b(true),
  },
  statuses: {
    shape: e(["square", "circle", "diamond", "plain"]),
    size: n(0.8, 3, 1.5, 0.05),
    border: b(true),
    tipName: b(true),
    tipDescription: b(true),
    tipDuration: b(true),
    arrangement: e(["row", "grid"]),
    max: n(1, 30, 10),
    maxCard: n(0, 12, 4),
  },
} as const satisfies Record<Category, Record<string, Param>>;

type ValueOf<P extends Param> = P extends { type: "number" }
  ? number
  : P extends { type: "bool" }
    ? boolean
    : P extends { type: "colors" }
      ? string[]
      : string;
export type Params<C extends Category> = {
  [K in keyof (typeof PARAMS)[C]]: ValueOf<(typeof PARAMS)[C][K] & Param>;
};

export interface Preset<C extends Category = Category> {
  id: string;
  name: string;
  category: C;
  params: Params<C>;
  builtIn?: boolean;
}

export interface Look {
  id: string;
  name: string;
  /** Missing categories fall back to "Classic RPG". */
  presets: Partial<Record<Category, string>>;
  builtIn?: boolean;
}

export interface Library {
  dataVersion: number;
  looks: Look[];
  presets: Preset[];
}

/** v2: phase change parameters, segments "phases"; v3: layoutBar.quote. Older versions dropped unknown parameters. */
export const LIBRARY_VERSION = 3;
/** Import limit (decision 4). */
export const IMPORT_MAX_BYTES = 256 * 1024;
export const LOOK_ID = /^[A-Za-z0-9_-]{1,40}$/;
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
/** Paths go inside CSS `url("…")`: quotes, backslashes and line breaks would end the string. */
const SAFE_PATH = /^[^"\\\n\r]*$/;
const FONT_ID = /^[a-z0-9-]{1,40}$/;

function readParam(param: Param, raw: unknown): unknown {
  switch (param.type) {
    case "enum":
      return typeof raw === "string" && param.values.includes(raw) ? raw : param.default;
    case "number": {
      const value = typeof raw === "number" ? raw : Number.NaN;
      return Number.isFinite(value) ? Math.min(param.max, Math.max(param.min, value)) : param.default;
    }
    case "bool":
      return typeof raw === "boolean" ? raw : param.default;
    case "color":
      return typeof raw === "string" && (HEX.test(raw) || (param.optional && raw === ""))
        ? raw.toLowerCase()
        : param.default;
    case "colors": {
      const colors = Array.isArray(raw)
        ? raw.filter((each): each is string => typeof each === "string" && HEX.test(each)).slice(0, param.max)
        : [];
      return colors.length ? colors.map((each) => each.toLowerCase()) : [...param.default];
    }
    case "path":
      return typeof raw === "string" && raw.length <= 2048 && SAFE_PATH.test(raw)
        ? raw.trim()
        : param.default;
    case "text":
      return text(raw, param.max) || param.default;
    case "font":
      return typeof raw === "string" && FONT_ID.test(raw) ? raw : param.default;
  }
}

/**
 * Every parameter of the category, each one checked. Unknown keys (a newer version's parameters) are kept for the
 * next write; nothing reads them, so they never reach CSS.
 */
export function readParams<C extends Category>(category: C, raw: unknown): Params<C> {
  const value = isRecord(raw) ? raw : {};
  const params = PARAMS[category] as Record<string, Param>;
  return {
    ...value,
    ...Object.fromEntries(Object.entries(params).map(([key, param]) => [key, readParam(param, value[key])])),
  } as Params<C>;
}

export function readPreset(raw: unknown): Preset | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !LOOK_ID.test(raw.id) || !isCategory(raw.category))
    return null;
  return {
    id: raw.id,
    name: text(raw.name, 80) || raw.id,
    category: raw.category,
    params: readParams(raw.category, raw.params),
  };
}

function readPresetRefs(raw: unknown): Partial<Record<Category, string>> {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([key, id]) => isCategory(key) && typeof id === "string" && LOOK_ID.test(id)),
  ) as Partial<Record<Category, string>>;
}

export function readLook(raw: unknown): Look | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !LOOK_ID.test(raw.id)) return null;
  return { id: raw.id, name: text(raw.name, 80) || raw.id, presets: readPresetRefs(raw.presets) };
}

/** Category overrides of a boss profile: known categories, valid ids. */
export const readOverrides = readPresetRefs;

/**
 * The GM's library (world setting). Bad entries are left out; entries using a built-in id are dropped, so a GM
 * copy can never shadow a built-in. Nothing stored = an empty library.
 */
export function readLibrary(raw: unknown, builtInIds: ReadonlySet<string> = new Set()): ReadResult<Library> {
  const empty: ReadResult<Library> = {
    status: "ok",
    value: { dataVersion: LIBRARY_VERSION, looks: [], presets: [] },
  };
  if (!isRecord(raw) || raw.dataVersion === undefined) return empty;
  if (!Array.isArray(raw.looks) || !Array.isArray(raw.presets)) return { status: "invalid" };
  const migrated = migrate(raw, LIBRARY_VERSION, { 1: (value) => value, 2: (value) => value });
  if (migrated.status !== "ok") return migrated;
  const own = <T extends { id: string }>(item: T | null): item is T =>
    item !== null && !builtInIds.has(item.id);
  return {
    status: "ok",
    value: {
      ...migrated.value,
      dataVersion: LIBRARY_VERSION,
      looks: (migrated.value.looks as unknown[]).map(readLook).filter(own),
      presets: (migrated.value.presets as unknown[]).map(readPreset).filter(own),
    },
  };
}

/** UTF-8 size of a string (core has no TextEncoder typing). */
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Imported JSON, in the export shape `{ dataVersion, looks, presets }`: size limit first, then the same checks as
 * on every read. Returns the entries to add, or the i18n key of the problem.
 */
export function parseImport(
  json: string,
  builtInIds: ReadonlySet<string>,
): { looks: Look[]; presets: Preset[] } | { error: string } {
  if (utf8Bytes(json) > IMPORT_MAX_BYTES) return { error: "BB5E.Error.ImportTooLarge" };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "BB5E.Error.ImportInvalid" };
  }
  if (!isRecord(raw) || raw.dataVersion === undefined) return { error: "BB5E.Error.ImportInvalid" };
  const library = readLibrary(raw, builtInIds);
  if (library.status === "newer") return { error: "BB5E.Error.NewerData" };
  if (library.status !== "ok") return { error: "BB5E.Error.ImportInvalid" };
  const { looks, presets } = library.value;
  return looks.length || presets.length ? { looks, presets } : { error: "BB5E.Error.ImportEmpty" };
}
