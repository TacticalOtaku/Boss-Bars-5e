import { distinctActors, type TokenState } from "./aggregate";
import { PROFILE_LIMITS, type MiniBar } from "./profile";

/** A resource as read from one token's actor. */
export interface BarValue {
  value: number;
  max: number;
}

export interface MiniBarView {
  id: string;
  label: string;
  fraction: number;
  /** Pips instead of a bar: whole numbers up to 10. */
  pips: { filled: number; total: number } | null;
  /** GM only, like HP. */
  numbers?: BarValue;
}

/**
 * Temp HP has no maximum in dnd5e: the bar is measured against the largest value seen since the shield went up,
 * so it starts full and drains. `peaks` is kept by the caller between recomputes.
 */
function tempBar(value: number, peaks: Map<string, number>, key: string): BarValue | null {
  if (!(value > 0)) {
    peaks.delete(key);
    return null;
  }
  const peak = Math.max(peaks.get(key) ?? 0, value);
  peaks.set(key, peak);
  return { value, max: peak };
}

/** Summed over the counted tokens; linked tokens share one actor and count once (as HP does). */
function summed(
  tokens: TokenState[],
  pick: (token: TokenState) => BarValue | null | undefined,
): BarValue | null {
  const total = { value: 0, max: 0 };
  let found = false;
  for (const token of distinctActors(tokens)) {
    const each = pick(token);
    if (!each || !Number.isFinite(each.value) || !Number.isFinite(each.max)) continue;
    found = true;
    total.value += each.value;
    total.max += each.max;
  }
  return found ? total : null;
}

/**
 * Mini-bars of one bar or card for one viewer. Players get only the bars marked for them and no numbers; a bar
 * with nothing to measure (no maximum) is left out.
 */
export function buildMiniBars(
  bars: MiniBar[],
  tokens: TokenState[],
  counters: Record<string, number> | undefined,
  isGM: boolean,
  peaks: Map<string, number>,
  instanceId: string,
): MiniBarView[] {
  const views: MiniBarView[] = [];
  for (const bar of bars) {
    if (!isGM && !bar.players) continue;
    const { source } = bar;
    let value: BarValue | null;
    if (source.type === "counter") {
      value = { value: Math.min(source.max, counters?.[bar.id] ?? source.max), max: source.max };
    } else if (source.type === "temp") {
      const temp = summed(tokens, (token) => (token.hp ? { value: token.hp.temp, max: 0 } : null));
      value = tempBar(temp?.value ?? 0, peaks, `${instanceId}:${bar.id}`);
    } else {
      value = summed(tokens, (token) => token.bars?.[bar.id]);
    }
    if (!value || !(value.max > 0)) continue;
    const clamped = Math.min(value.max, Math.max(0, value.value));
    const pips =
      bar.view === "pips" && Number.isInteger(value.max) && value.max <= PROFILE_LIMITS.pips
        ? { filled: Math.round(clamped), total: value.max }
        : null;
    views.push({
      id: bar.id,
      label: bar.label,
      fraction: clamped / value.max,
      pips,
      ...(isGM ? { numbers: { value: value.value, max: value.max } } : {}),
    });
  }
  return views;
}
