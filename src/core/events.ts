import type { Instance } from "./instances";

/** What changed between two states of a scene's instances; every client turns these into the public hooks. */
export type InstanceEvent =
  | { type: "show" | "hide" | "quote"; item: Instance }
  | { type: "phaseChange"; item: Instance; previous: Instance };

/**
 * A new id is shown, a missing one hidden: a form moving onto another token keeps its id, so it is neither. A phase
 * changes when `phaseKey` (the phase everyone is shown) differs; a bar shown straight into a phase is only shown.
 * A quote is a new quote key.
 */
export function instanceEvents(
  before: readonly Instance[],
  after: readonly Instance[],
  phaseKey: (item: Instance) => string | null,
): InstanceEvent[] {
  const old = new Map(before.map((item) => [item.id, item]));
  const ids = new Set(after.map((item) => item.id));
  const events: InstanceEvent[] = before
    .filter((item) => !ids.has(item.id))
    .map((item) => ({ type: "hide", item }));
  for (const item of after) {
    const previous = old.get(item.id);
    if (!previous) events.push({ type: "show", item });
    else if (phaseKey(previous) !== phaseKey(item)) events.push({ type: "phaseChange", item, previous });
    if (item.quote && item.quote.key !== previous?.quote?.key) events.push({ type: "quote", item });
  }
  return events;
}
