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
  /** Hit effects the look plays, 0 or 1 each: sparks and rays, the white flash, big cracks. */
  hit: Float32Array;
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

export function barMaterial(look: ResolvedLook): BarMaterial {
  const fill = look.fill.params;
  const hp = look.hpEffect.params;
  const frame = look.frame.params;
  const portrait = look.portrait.params;
  const colors = palette(fill.colors);
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
    trail: rgb(hp.trailColor),
    shield: rgb(fill.shieldColor),
    spark: rgb(hp.sparkColor),
    shieldOn: Number(fill.shield),
    edgeGlow: Number(fill.edgeGlow),
    shine: Number(fill.shine),
    pattern: Math.max(0, FILL_PATTERNS.indexOf(fill.pattern)),
    motes: Math.max(0, FILL_MOTES.indexOf(fill.motes)),
    hit: new Float32Array([hp.sparks, hp.damageFlash, hp.bigCrack].map(Number)),
    phase: new Float32Array([look.motion.params.phaseFlash, look.motion.params.phaseCrack].map(Number)),
    portraitShape: Math.max(0, PORTRAIT_SHAPES.indexOf(portrait.shape)),
    portraitColor: rgb(portrait.borderColor),
    portraitWidth: portrait.borderWidth / PORTRAIT_EM,
    portraitGlow: portrait.glow,
    portraitGlowColor: rgb(portrait.glowColor),
    portraitFrame: Number(frame.portraitFrame),
  };
}
