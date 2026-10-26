/** Fill types with a moving material of their own (the stand cycles through them). */
export const LIVE_FILLS = ["liquid", "energy", "flame", "ice", "void"] as const;
export type LiveFill = (typeof LIVE_FILLS)[number];

/** Palette slots in the shaders. */
export const PALETTE_SIZE = 5;

/**
 * `u_time` wraps after this many seconds: a float that keeps growing loses precision on fp16 GPUs (ticket #10).
 * Every shader moves in whole cycles of it, so the wrap does not jump.
 */
export const TIME_PERIOD = 120;

export const shaderTime = (ms: number) => (ms / 1000) % TIME_PERIOD;

/**
 * A look's fill colours as shader uniforms: rgb 0–1 in five slots, the last colour repeated, and how many are real
 * (at least two, so a single colour blends with itself).
 */
export function palette(colors: readonly string[]): { rgb: Float32Array; count: number } {
  const valid = colors.filter((each) => /^#[0-9a-f]{6}/i.test(each)).slice(0, PALETTE_SIZE);
  const list = valid.length ? valid : ["#000000"];
  const rgb = new Float32Array(PALETTE_SIZE * 3);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const hex = list[Math.min(i, list.length - 1)] ?? "#000000";
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = parseInt(hex.slice(1 + c * 2, 3 + c * 2), 16) / 255;
  }
  return { rgb, count: Math.max(2, list.length) };
}

/** How fast the drawn fill catches up with a new value: most of the way in about 0.6 s. */
const CATCH_UP_MS = 150;

/** The drawn fill after `dt` ms; it snaps once close, so the loop can slow down again. */
export function approach(current: number, target: number, dt: number): number {
  const next = current + (target - current) * Math.min(1, dt / CATCH_UP_MS);
  return Math.abs(target - next) < 0.001 ? target : next;
}
