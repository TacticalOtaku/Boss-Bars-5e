/** What one HP change between two renders means (ADR 0001: the signal comes from the data). */
export type HpChange =
  { kind: "damage"; share: number; big: boolean } | { kind: "heal"; share: number } | null;

/**
 * Change of the fill between two renders, as a share of the maximum. The first render and an unchanged fill are
 * no change, so re-rendering the same data never replays an effect.
 */
export function hpChange(previous: number | null, next: number, bigThreshold: number): HpChange {
  if (previous === null || previous === next) return null;
  const share = Math.abs(next - previous);
  return next < previous
    ? { kind: "damage", share, big: share * 100 >= bigThreshold }
    : { kind: "heal", share };
}

/** Low HP: alive and at or under the threshold (in %). */
export const isLow = (fraction: number, threshold: number) => fraction > 0 && fraction * 100 <= threshold;

/** Shake and flash strength 0.35–1: a scratch still shows, a third of the bar hits hard. */
export const effectStrength = (share: number, scale: boolean) => (scale ? Math.min(1, 0.35 + share * 2) : 1);

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/** "Colour by % HP": the colours are stops from 0% (first) to 100% HP (last), mixed in between. */
export function hpColor(colors: readonly string[], fraction: number): string {
  const first = colors[0] ?? "#000000";
  if (colors.length < 2) return first;
  const at = Math.min(1, Math.max(0, fraction)) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(at));
  const from = channels(colors[index] ?? first);
  const to = channels(colors[index + 1] ?? first);
  const mix = from.map((value, i) => Math.round(value + ((to[i] ?? value) - value) * (at - index)));
  return `#${mix.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
