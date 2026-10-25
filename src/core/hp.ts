/** Prepared dnd5e hit points (`system.attributes.hp`). */
export interface HpData {
  value: number;
  effectiveMax: number;
  temp: number;
}

/** Fill = value / effectiveMax, unrounded (ADR 0001); temp HP is not part of it. null when it cannot be computed. */
export function hpFraction({ value, effectiveMax }: HpData): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(effectiveMax) || effectiveMax <= 0) return null;
  return Math.min(1, Math.max(0, value / effectiveMax));
}
