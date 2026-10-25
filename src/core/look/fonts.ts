/**
 * Built-in fonts: id → CSS family and whether a real bold face ships (spec §9: no synthetic bold).
 * Stage 5 ships the fonts of its three looks; stage 10 adds the rest of the 30.
 */
export const FONTS: Record<string, { family: string; bold: boolean }> = {
  system: { family: 'georgia, "Times New Roman", serif', bold: true },
  cormorant: { family: '"BB5E Cormorant", georgia, serif', bold: true },
  philosopher: { family: '"BB5E Philosopher", georgia, serif', bold: true },
  "russo-one": { family: '"BB5E Russo One", "Arial Black", sans-serif', bold: false },
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

const faces = (family: string, stem: string, weights: string[]): FontFaceSpec[] =>
  weights.flatMap((each) => {
    const weight = each === "wght" ? "300 700" : each;
    return [
      { family, file: `${stem}-latin-${each}.woff2`, unicodeRange: LATIN, weight },
      { family, file: `${stem}-cyrillic-${each}.woff2`, unicodeRange: CYRILLIC, weight },
    ];
  });

/** Every face file shipped in `fonts/` ("wght" is a variable font covering 300–700). */
export const FONT_FACES: FontFaceSpec[] = [
  ...faces("BB5E Cormorant", "cormorant", ["wght"]),
  ...faces("BB5E Philosopher", "philosopher", ["400", "700"]),
  ...faces("BB5E Russo One", "russo-one", ["400"]),
];

/** A GM's own woff2 is registered under a family named after its preset. */
export const customFamily = (presetId: string) => `bb5e-custom-${presetId}`;
