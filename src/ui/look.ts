import { hpColor } from "../core/look/effects";
import type { FontFaceSpec } from "../core/look/fonts";
import type { LookStyle } from "../core/look/style";

const applied = new WeakMap<HTMLElement, string>();
const fonts = new Set<string>();

/**
 * A `url()` inside a variable resolves against the stylesheet that uses it (`styles/`), not the page; FilePicker
 * paths are relative to the page, so they are made absolute first.
 */
const absoluteUrls = (value: string) =>
  value.replace(/url\("([^"]*)"\)/g, (_, path: string) => `url("${new URL(path, document.baseURI).href}")`);

/**
 * Puts a look on a bar or card root: data attributes for the structure (read by `_look.scss`) and the `--bb5e-*`
 * variables, on the element itself, never on `:root`. An equal style (same key) is not applied again.
 */
export function applyLook(el: HTMLElement, style: LookStyle): void {
  if (applied.get(el) === style.key) return;
  applied.set(el, style.key);
  el.classList.add("bb5e-look");
  for (const [name, value] of Object.entries(style.attrs)) el.setAttribute(`data-look-${name}`, value);
  for (const [name, value] of Object.entries(style.vars)) el.style.setProperty(name, absoluteUrls(value));
  if (style.customFont) loadFont(style.customFont);
}

/**
 * Registers the built-in faces without loading them: an unloaded FontFace in `document.fonts` is fetched only when
 * visible text uses its family and range (spec §9: lazy, per subset). CSS `@font-face` would do the same, but Vite's
 * library build inlines every CSS `url()` as base64. `urlOf` maps a file name to its URL.
 */
export function registerFonts(faces: readonly FontFaceSpec[], urlOf: (file: string) => string): void {
  if (typeof FontFace === "undefined") return;
  for (const face of faces) {
    const { family, file, unicodeRange, weight } = face;
    document.fonts.add(
      new FontFace(family, `url("${urlOf(file)}")`, { unicodeRange, weight, display: "swap" }),
    );
  }
}

/** A GM's woff2, registered once per family; a broken file just leaves the fallback font. */
function loadFont({ family, file }: { family: string; file: string }): void {
  if (fonts.has(family) || typeof FontFace === "undefined") return;
  fonts.add(family);
  const face = new FontFace(family, `url("${file}")`);
  face.load().then(
    (loaded) => document.fonts.add(loaded),
    () => fonts.delete(family),
  );
}

/** "Colour by % HP" replaces the fill with the colour of the current share. */
export function applyHpColor(fill: HTMLElement, style: LookStyle, fraction: number): void {
  if (style.fill.byHp) fill.style.background = hpColor(style.fill.colors, fraction);
  else fill.style.removeProperty("background");
}
