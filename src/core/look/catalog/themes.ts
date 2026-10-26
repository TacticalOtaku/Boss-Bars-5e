import type { Category } from "../schema";

/** A theme's values per styled category; what it leaves out keeps the "Classic RPG" default. */
export type ThemeValues = { [C in Category]?: Record<string, unknown> };

export interface ThemeSpec {
  id: string;
  name: string;
  /** Bar and card layout ids (catalog/layouts.ts). */
  layouts: [string, string];
  /** Archetype ids (catalog/archetypes.ts) for appearance and exit, the HP change effect and statuses. */
  styles: [motion: string, hpEffect: string, statuses: string];
  values: ThemeValues;
}

type Values = Record<string, unknown>;

/**
 * A theme from its accent colour: the frame, title, portrait border, mini-bars and sparks take the accent unless
 * the theme says otherwise, so each entry below only states what makes it itself.
 */
function themed(
  accent: string,
  values: {
    font: Values;
    fill: Values;
    frame?: Values;
    portrait?: Values;
    miniBars?: Values;
  },
): ThemeValues {
  return {
    font: { titleColor: accent, glowColor: accent, ...values.font },
    frame: { color: accent, glowColor: accent, ...values.frame },
    fill: values.fill,
    portrait: { borderColor: accent, glowColor: accent, ...values.portrait },
    miniBars: { color: accent, ...values.miniBars },
  };
}

/** The themes (spec §9, ticket #9); ids classic, frost and neon never change. Names are literal i18n keys. */
export const THEMES: ThemeSpec[] = [
  {
    id: "classic",
    name: "BB5E.Look.Theme.Classic",
    layouts: ["a", "a"],
    styles: ["classic", "classic", "classic"],
    values: {},
  },
  {
    id: "ember",
    name: "BB5E.Look.Theme.Ember",
    layouts: ["a", "a"],
    styles: ["smoulder", "heavy", "classic"],
    values: themed("#ff9a3c", {
      font: { family: "yeseva-one", nameSize: 1.3, caps: false, color: "#ffe2b8", glow: 0.35 },
      frame: { style: "classic", corners: "spikes", glow: 0.35, color: "#c4561c" },
      fill: {
        type: "flame",
        colors: ["#3a0500", "#c2410c", "#ff9a3c", "#ffe08a"],
        empty: "#1a0703",
        edgeGlow: true,
      },
      portrait: { shape: "shield", tint: "red" },
      miniBars: { color2: "#c2410c", empty: "#1a0703" },
    }),
  },
  {
    id: "frost",
    name: "BB5E.Look.Theme.Frost",
    layouts: ["medallion", "top"],
    styles: ["smoulder", "brittle", "round"],
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
        motes: "sparkles",
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
    },
  },
  {
    id: "storm",
    name: "BB5E.Look.Theme.Storm",
    layouts: ["under", "a"],
    styles: ["swift", "snappy", "diamond"],
    values: themed("#8fd3ff", {
      font: { family: "jura", nameSize: 1.4, spacing: 0.12, color: "#eef7ff", glow: 0.5 },
      frame: { style: "double", color: "#6f86a8", glow: 0.45 },
      fill: {
        type: "energy",
        colors: ["#070d1f", "#1c3a78", "#4f8fe8", "#d6efff"],
        empty: "#050a16",
        edgeGlow: true,
      },
      portrait: { shape: "diamond", borderColor: "#6f86a8", glow: 0.45 },
      miniBars: { pip: "diamond", color2: "#1c3a78", empty: "#050a16" },
    }),
  },
  {
    id: "undead",
    name: "BB5E.Look.Theme.Undead",
    layouts: ["right", "a"],
    styles: ["haunting", "eerie", "classic"],
    values: themed("#9fd12a", {
      font: { family: "triodion", nameSize: 1.4, caps: false, color: "#e3ead0", glow: 0.35, shadow: true },
      frame: { style: "classic", corners: "spikes", color: "#b8ad8c", glow: 0.3 },
      fill: {
        type: "liquid",
        colors: ["#0d1408", "#3b5a12", "#8dbb1f", "#d6f562"],
        empty: "#0a0d06",
        edgeGlow: true,
      },
      portrait: { shape: "shield", borderColor: "#b8ad8c", tint: "darken" },
      miniBars: { color2: "#3b5a12", empty: "#0a0d06" },
    }),
  },
  {
    id: "abyss",
    name: "BB5E.Look.Theme.Abyss",
    layouts: ["bare", "top"],
    styles: ["haunting", "eerie", "plain"],
    values: themed("#8a6bff", {
      font: { family: "oranienbaum", nameSize: 1.5, spacing: 0.1, color: "#ece6ff", glow: 0.7 },
      frame: { style: "none", glow: 0.7 },
      fill: {
        type: "void",
        colors: ["#05020f", "#1d0b4a", "#5a2fc4", "#c9b6ff"],
        empty: "#020007",
        edgeGlow: true,
      },
      portrait: { shape: "circle", glow: 0.6 },
      miniBars: { bar: "ring", pip: "dot", empty: "#020007" },
    }),
  },
  {
    id: "celestial",
    name: "BB5E.Look.Theme.Celestial",
    layouts: ["crown", "top"],
    styles: ["majestic", "serene", "orbs"],
    values: themed("#ffe7a3", {
      font: {
        family: "cormorant-unicase",
        nameSize: 1.4,
        bold: true,
        spacing: 0.08,
        color: "#fffaf0",
        glow: 0.6,
      },
      frame: { style: "double", corners: "filigree", glow: 0.5, color: "#f5d78a" },
      fill: {
        type: "gradient",
        colors: ["#7a5418", "#c9932e", "#f2cf73", "#fff3c4"],
        empty: "#2a2416",
        shine: true,
        edgeGlow: true,
        motes: "sparkles",
      },
      portrait: { shape: "circle", glow: 0.7 },
      miniBars: { color2: "#a8822f", empty: "#2a2416" },
    }),
  },
  {
    id: "sylvan",
    name: "BB5E.Look.Theme.Sylvan",
    layouts: ["a", "a"],
    styles: ["haunting", "serene", "round"],
    values: themed("#b8e86a", {
      font: { family: "kurale", nameSize: 1.35, caps: false, color: "#eef6dc", glow: 0.3 },
      frame: { style: "classic", corners: "filigree", color: "#8a6a3a", glow: 0.25 },
      fill: {
        type: "gradient",
        colors: ["#1f3b14", "#4f7d2a", "#9ccf6b", "#d8f0a8"],
        empty: "#0e1a09",
        shine: true,
        edgeGlow: true,
        motes: "fireflies",
      },
      portrait: { shape: "circle", borderColor: "#8a6a3a" },
      miniBars: { pip: "dot", color2: "#4f7d2a", empty: "#0e1a09" },
    }),
  },
  {
    id: "dragon",
    name: "BB5E.Look.Theme.Dragon",
    layouts: ["medallion", "a"],
    styles: ["smoulder", "heavy", "diamond"],
    values: themed("#f0b24a", {
      font: {
        family: "alegreya-sc",
        nameSize: 1.45,
        bold: true,
        color: "#f6e3b4",
        glow: 0.35,
        glowColor: "#ff9a3c",
      },
      frame: {
        style: "double",
        corners: "spikes",
        width: 0.1875,
        color: "#8c5a1a",
        glow: 0.3,
        glowColor: "#ff7a2a",
      },
      fill: {
        type: "gradient",
        colors: ["#2a0705", "#7a1d0c", "#c8501c", "#f0b24a"],
        empty: "#170704",
        edgeGlow: true,
        pattern: "scales",
        motes: "embers",
      },
      portrait: {
        shape: "shield",
        borderWidth: 0.25,
        borderColor: "#8c5a1a",
        glow: 0.3,
        glowColor: "#ff7a2a",
      },
      miniBars: { pip: "diamond", color2: "#7a1d0c", empty: "#170704" },
    }),
  },
  {
    id: "deep",
    name: "BB5E.Look.Theme.Deep",
    layouts: ["inside", "a"],
    styles: ["haunting", "eerie", "orbs"],
    values: themed("#3fd0c9", {
      font: { family: "viaoda-libre", nameSize: 1.55, color: "#dcfbf8", glow: 0.4 },
      frame: { style: "inset", color: "#2c7f80", glow: 0.35 },
      fill: {
        type: "liquid",
        colors: ["#010d16", "#063a52", "#0f7f8a", "#5fe3d6"],
        empty: "#00080f",
        shine: true,
      },
      portrait: { shape: "circle", borderColor: "#2c7f80", tint: "darken" },
      miniBars: { bar: "ring", pip: "dot", color2: "#0b4f6c", empty: "#00080f" },
    }),
  },
  {
    id: "rune",
    name: "BB5E.Look.Theme.Rune",
    layouts: ["right", "row"],
    styles: ["smoulder", "classic", "grid"],
    values: themed("#5fe0d0", {
      font: { family: "tektur", nameSize: 1.35, bold: true, spacing: 0.14, color: "#d8e3e1", glow: 0.45 },
      frame: { style: "inset", corners: "studs", color: "#7c8885", glow: 0.25 },
      fill: {
        type: "gradient",
        colors: ["#2c3836", "#1c2725", "#121a19"],
        empty: "#0a100f",
        segments: "phases",
        pattern: "runes",
      },
      portrait: { shape: "hexagon", borderColor: "#7c8885", glow: 0.35 },
      miniBars: { pip: "diamond", color2: "#14504a", empty: "#0a100f" },
    }),
  },
  {
    id: "neon",
    name: "BB5E.Look.Theme.Neon",
    layouts: ["cinema", "tile"],
    styles: ["chronicle", "snappy", "diamond"],
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
      frame: { style: "none", width: 0.0625, color: "#00e5ff", glow: 0.8, glowColor: "#00e5ff" },
      fill: {
        type: "energy",
        colors: ["#ff2bd6", "#7a2bff", "#00e5ff"],
        empty: "#07021a",
        shieldColor: "#f5ff7a",
        segments: "every",
        segmentEvery: 10,
        edgeGlow: true,
      },
      portrait: { shape: "notch", borderWidth: 0, glow: 0.4, glowColor: "#ff2bd6", tint: "red" },
      miniBars: { pip: "dot", color: "#00e5ff", color2: "", empty: "#07021a", height: 0.3 },
    },
  },
  {
    id: "parchment",
    name: "BB5E.Look.Theme.Parchment",
    layouts: ["right", "row"],
    styles: ["chronicle", "quiet", "classic"],
    values: themed("#5a3a1e", {
      font: {
        family: "marck-script",
        nameSize: 1.5,
        caps: false,
        bold: false,
        // Light ink: the HUD sits on dark scenes, where brown ink on brown would vanish.
        color: "#f3e6c8",
        titleColor: "#d9b98a",
        shadow: true,
      },
      frame: { style: "classic", color: "#7a4e2a" },
      fill: {
        type: "gradient",
        colors: ["#120a04", "#2b1a0c", "#4a3018"],
        empty: "#e8d9b5",
        shieldColor: "#3c6e9e",
        pattern: "ink",
      },
      portrait: { shape: "square", tint: "none" },
      miniBars: { color2: "#8c5c30", empty: "#e8d9b5", label: true },
    }),
  },
  {
    id: "minimal",
    name: "BB5E.Look.Theme.Minimal",
    layouts: ["minimal", "row"],
    styles: ["quiet", "quiet", "bare"],
    values: themed("#ffffff", {
      font: {
        family: "unbounded",
        nameSize: 1.1,
        bold: false,
        caps: true,
        spacing: 0.2,
        color: "#ffffff",
        titleColor: "#bbbbbb",
        shadow: false,
      },
      frame: { style: "none", portraitFrame: false },
      fill: { type: "solid", colors: ["#f2f2f2"], empty: "#2a2a2a", shieldColor: "#9ad0ff" },
      portrait: { shape: "circle", borderWidth: 0, glow: 0 },
      miniBars: { color2: "", empty: "#2a2a2a", height: 0.25, label: false },
    }),
  },
  {
    id: "nightmare",
    name: "BB5E.Look.Theme.Nightmare",
    layouts: ["cinema", "tile"],
    styles: ["haunting", "eerie", "plain"],
    values: themed("#ff1f4b", {
      font: { family: "rubik-wet-paint", nameSize: 1.55, caps: false, color: "#f6d3da", glow: 0.45 },
      frame: { style: "double", color: "#4a0d1a", glow: 0.55 },
      fill: {
        type: "liquid",
        colors: ["#0a0003", "#3d0010", "#8a0a24", "#ff3355"],
        empty: "#050002",
        edgeGlow: true,
      },
      portrait: { shape: "notch", tint: "red", glow: 0.5 },
      miniBars: { pip: "dot", color2: "#3d0010", empty: "#050002" },
    }),
  },
  {
    id: "royal",
    name: "BB5E.Look.Theme.Royal",
    layouts: ["a", "a"],
    styles: ["majestic", "serene", "round"],
    values: themed("#e6c35c", {
      font: {
        family: "bona-nova-sc",
        nameSize: 1.45,
        bold: true,
        spacing: 0.08,
        color: "#fff7e0",
        color2: "#e6c35c",
      },
      frame: { style: "double", corners: "filigree", width: 0.1875, glow: 0.3 },
      fill: {
        type: "gradient",
        colors: ["#1a0830", "#3e1468", "#6a2aa8", "#a466e0"],
        empty: "#120622",
        shine: true,
        pattern: "damask",
      },
      portrait: { shape: "shield", borderWidth: 0.25, glow: 0.25 },
      miniBars: { color2: "#3e1468", empty: "#120622" },
    }),
  },
  {
    id: "steel",
    name: "BB5E.Look.Theme.Steel",
    layouts: ["inside", "a"],
    styles: ["swift", "heavy", "classic"],
    values: themed("#c8ccd4", {
      font: {
        family: "dela-gothic-one",
        nameSize: 1.3,
        caps: true,
        spacing: 0.05,
        color: "#f2f4f7",
        shadow: true,
      },
      frame: {
        style: "double",
        corners: "studs",
        width: 0.1875,
        color: "#9aa1ab",
        glow: 0.15,
        glowColor: "#d0d6de",
      },
      fill: {
        type: "liquid",
        colors: ["#2a0404", "#6e0a0a", "#b31414", "#e53030"],
        empty: "#140303",
        shine: true,
      },
      portrait: { shape: "shield", borderWidth: 0.25, borderColor: "#9aa1ab" },
      miniBars: { pip: "diamond", color2: "#8a9099", empty: "#140303" },
    }),
  },
];
