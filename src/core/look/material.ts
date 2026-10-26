import { palette } from "./live";
import type { ResolvedLook } from "./resolve";
import { PARAMS } from "./schema";

/** Fill types in the order of the bar shader's `u_fillType`. */
export const FILL_TYPES = PARAMS.fill.type.values;
/** Fill patterns and motes in the order of the shader's u_pattern and u_motes. */
export const FILL_PATTERNS = PARAMS.fill.pattern.values;
export const FILL_MOTES = PARAMS.fill.motes.values;
/** Frame styles in the order of the shader's u_frameStyle (an image frame draws the classic frame). */
export const FRAME_STYLES = PARAMS.frame.style.values;
/** Portrait shapes in the order of the shader's u_shape. */
export const PORTRAIT_SHAPES = PARAMS.portrait.shape.values;
/** The portrait size the border width is measured against (em, the default avatar). */
const PORTRAIT_EM = 4.75;

const rgb = (hex: string) => palette([hex]).rgb.slice(0, 3);

/** What the bar shader needs from a look: colours as rgb 0–1, sizes relative to the bar's height. */
export interface BarMaterial {
  fillType: number;
  colors: Float32Array;
  colorCount: number;
  empty: Float32Array;
  frameColor: Float32Array;
  frameWidth: number;
  frameStyle: number;
  /** 0–1: how far the frame's light reaches out. */
  frameGlow: number;
  glowColor: Float32Array;
  trail: Float32Array;
  shield: Float32Array;
  spark: Float32Array;
  /** Flags as 0 or 1, the way they reach the shader. */
  shieldOn: number;
  edgeGlow: number;
  shine: number;
  pattern: number;
  /** Hit effects the look plays, 0 or 1 each: sparks and rays, the white flash, big cracks, the heal wave. */
  hit: Float32Array;
  /** The trail waits this long after a hit (ms), then follows the fill in `trailSpeed` ms. */
  trailDelay: number;
  trailSpeed: number;
  /** 1: a series of hits gathers in one trail; 0: each hit starts its own from where the fill was. */
  trailAccumulate: number;
  /** Low HP: 0 no signal, 1 a pulse, 2 a flicker. */
  lowMode: number;
  /** A phase change sweeps the fill up from empty (1) and blends from the old palette (1). */
  phaseRefill: number;
  phasePalette: number;
  /** How a phase change plays, 0 or 1 each: the bright flash with light pillars, cracks through the fill. */
  phase: Float32Array;
  motes: number;
  portraitShape: number;
  portraitColor: Float32Array;
  /** Border width as a share of the portrait size. */
  portraitWidth: number;
  portraitGlow: number;
  portraitGlowColor: Float32Array;
  /** 0 when the look draws no portrait frame. */
  portraitFrame: number;
}

const luma = (c: ArrayLike<number>) => 0.299 * (c[0] ?? 0) + 0.587 * (c[1] ?? 0) + 0.114 * (c[2] ?? 0);

/**
 * Spark and trail colours (rgb 0–1): the HP effect's own, else the frame light for sparks and, for the trail, the
 * lightest fill colour 35% of the way to white, so shared effect archetypes fit every look.
 */
function hitRgb(look: ResolvedLook): { spark: Float32Array; trail: Float32Array } {
  const hp = look.hpEffect.params;
  const spark = rgb(hp.sparkColor || look.frame.params.glowColor);
  if (hp.trailColor) return { spark, trail: rgb(hp.trailColor) };
  const lightest = look.fill.params.colors
    .map(rgb)
    .reduce((a, b) => (luma(b) > luma(a) ? b : a), rgb("#000000"));
  return { spark, trail: lightest.map((value) => value + (1 - value) * 0.35) };
}

const hex = (c: Float32Array) =>
  "#" +
  [...c]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/** The same colours as #rrggbb for CSS and particles. */
export function hitColors(look: ResolvedLook): { sparkColor: string; trailColor: string } {
  const { spark, trail } = hitRgb(look);
  return { sparkColor: hex(spark), trailColor: hex(trail) };
}

export function barMaterial(look: ResolvedLook): BarMaterial {
  const fill = look.fill.params;
  const hp = look.hpEffect.params;
  const frame = look.frame.params;
  const portrait = look.portrait.params;
  const colors = palette(fill.colors);
  const hit = hitRgb(look);
  return {
    fillType: Math.max(0, FILL_TYPES.indexOf(fill.type)),
    colors: colors.rgb,
    colorCount: colors.count,
    empty: rgb(fill.empty),
    frameColor: rgb(frame.color),
    frameWidth: frame.width / look.layoutBar.params.height,
    frameStyle: Math.max(0, FRAME_STYLES.indexOf(frame.style === "image" ? "classic" : frame.style)),
    frameGlow: frame.glow,
    glowColor: rgb(frame.glowColor),
    trail: hit.trail,
    shield: rgb(fill.shieldColor),
    spark: hit.spark,
    shieldOn: Number(fill.shield),
    edgeGlow: Number(fill.edgeGlow),
    shine: Number(fill.shine),
    pattern: Math.max(0, FILL_PATTERNS.indexOf(fill.pattern)),
    motes: Math.max(0, FILL_MOTES.indexOf(fill.motes)),
    hit: new Float32Array([hp.sparks, hp.damageFlash, hp.bigCrack, hp.healWave].map(Number)),
    trailDelay: hp.trailDelay,
    trailSpeed: hp.trailSpeed,
    trailAccumulate: Number(hp.trailAccumulate),
    lowMode: hp.lowFlicker ? 2 : hp.lowPulse ? 1 : 0,
    phaseRefill: Number(look.motion.params.phaseRefill),
    phasePalette: Number(look.motion.params.phasePalette),
    phase: new Float32Array([look.motion.params.phaseFlash, look.motion.params.phaseCrack].map(Number)),
    portraitShape: Math.max(0, PORTRAIT_SHAPES.indexOf(portrait.shape)),
    portraitColor: rgb(portrait.borderColor),
    portraitWidth: portrait.borderWidth / PORTRAIT_EM,
    portraitGlow: portrait.glow,
    portraitGlowColor: rgb(portrait.glowColor),
    portraitFrame: Number(frame.portraitFrame),
  };
}
