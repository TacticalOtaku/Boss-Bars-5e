/** Fallback stacks while a font loads (or for "system"). */
const SERIF = 'georgia, "Times New Roman", serif';
const SANS = '"Arial Black", Arial, sans-serif';
const SCRIPT = '"Segoe Script", cursive';
const MONO = '"Courier New", monospace';

/**
 * The 30 built-in fonts (spec §9, ticket #5; OFL 1.1, `latin` + `cyrillic` from Fontsource): id → file stem, the
 * faces shipped ("wght" is a variable file covering `range`), the fallback stack. `bold` is true only when a real
 * bold face ships: there is no synthetic bold.
 */
const CATALOG: {
  id: string;
  name: string;
  weights: string[];
  range?: string;
  fallback: string;
}[] = [
  { id: "cormorant", name: "Cormorant", weights: ["wght"], range: "300 700", fallback: SERIF },
  { id: "yeseva-one", name: "Yeseva One", weights: ["400"], fallback: SERIF },
  { id: "philosopher", name: "Philosopher", weights: ["400", "700"], fallback: SERIF },
  { id: "jura", name: "Jura", weights: ["wght"], range: "300 700", fallback: SANS },
  { id: "triodion", name: "Triodion", weights: ["400"], fallback: SERIF },
  { id: "oranienbaum", name: "Oranienbaum", weights: ["400"], fallback: SERIF },
  { id: "rubik-wet-paint", name: "Rubik Wet Paint", weights: ["400"], fallback: SANS },
  { id: "cormorant-unicase", name: "Cormorant Unicase", weights: ["400", "700"], fallback: SERIF },
  { id: "kurale", name: "Kurale", weights: ["400"], fallback: SERIF },
  { id: "underdog", name: "Underdog", weights: ["400"], fallback: SANS },
  { id: "alegreya-sc", name: "Alegreya SC", weights: ["400", "700"], fallback: SERIF },
  { id: "viaoda-libre", name: "Viaoda Libre", weights: ["400"], fallback: SERIF },
  { id: "ponomar", name: "Ponomar", weights: ["400"], fallback: SERIF },
  { id: "ruslan-display", name: "Ruslan Display", weights: ["400"], fallback: SERIF },
  { id: "tektur", name: "Tektur", weights: ["wght"], range: "400 900", fallback: SANS },
  { id: "forum", name: "Forum", weights: ["400"], fallback: SERIF },
  { id: "exo-2", name: "Exo 2", weights: ["wght"], range: "100 900", fallback: SANS },
  { id: "russo-one", name: "Russo One", weights: ["400"], fallback: SANS },
  { id: "rubik-glitch", name: "Rubik Glitch", weights: ["400"], fallback: SANS },
  { id: "prata", name: "Prata", weights: ["400"], fallback: SERIF },
  { id: "shafarik", name: "Shafarik", weights: ["400"], fallback: SERIF },
  { id: "marck-script", name: "Marck Script", weights: ["400"], fallback: SCRIPT },
  { id: "unbounded", name: "Unbounded", weights: ["wght"], range: "200 900", fallback: SANS },
  { id: "press-start-2p", name: "Press Start 2P", weights: ["400"], fallback: MONO },
  { id: "bad-script", name: "Bad Script", weights: ["400"], fallback: SCRIPT },
  { id: "playfair-display-sc", name: "Playfair Display SC", weights: ["400", "700"], fallback: SERIF },
  { id: "oi", name: "Oi", weights: ["400"], fallback: SANS },
  { id: "bona-nova-sc", name: "Bona Nova SC", weights: ["400", "700"], fallback: SERIF },
  { id: "neucha", name: "Neucha", weights: ["400"], fallback: SCRIPT },
  { id: "dela-gothic-one", name: "Dela Gothic One", weights: ["400"], fallback: SANS },
];

const familyOf = (name: string) => `BB5E ${name}`;

/** Built-in fonts: id → CSS family stack, whether a real bold face ships, and the font's own name (for forms). */
export const FONTS: Record<string, { family: string; bold: boolean; name: string }> = {
  system: { family: SERIF, bold: true, name: "Georgia" },
  ...Object.fromEntries(
    CATALOG.map((font) => [
      font.id,
      {
        family: `"${familyOf(font.name)}", ${font.fallback}`,
        bold: font.weights.includes("700") || font.weights.includes("wght"),
        name: font.name,
      },
    ]),
  ),
};

/** Fontsource subset ranges: the browser fetches a subset only for text that needs it. */
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const CYRILLIC = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";

export interface FontFaceSpec {
  family: string;
  /** File name in the module's `fonts/` folder (OFL 1.1, from Fontsource). */
  file: string;
  unicodeRange: string;
  weight: string;
}

/** Every face file shipped in `fonts/`: `<id>-<subset>-<weight>.woff2`. */
export const FONT_FACES: FontFaceSpec[] = CATALOG.flatMap((font) =>
  font.weights.flatMap((each) => {
    const weight = each === "wght" ? (font.range ?? "400") : each;
    const family = familyOf(font.name);
    return [
      { family, file: `${font.id}-latin-${each}.woff2`, unicodeRange: LATIN, weight },
      { family, file: `${font.id}-cyrillic-${each}.woff2`, unicodeRange: CYRILLIC, weight },
    ];
  }),
);

/** A GM's own woff2 is registered under a family named after its preset. */
export const customFamily = (presetId: string) => `bb5e-custom-${presetId}`;
