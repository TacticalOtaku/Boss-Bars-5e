/** Combat starts when it moves from round 0 to round 1 (spec §3); a rewind to round 1 is not a start. */
export const isCombatStart = (previousRound: number | undefined, round: unknown) =>
  previousRound === 0 && round === 1;

/**
 * Instances to hide for defeat, from the defeat state of shown instances (id → defeated).
 * `previous` null is the first check after a (re)load: timers are lost on F5, so everything already defeated goes.
 * Afterwards only an instance seen alive and now defeated counts; one shown while already defeated stays.
 */
export function newlyDefeated(
  previous: ReadonlyMap<string, boolean> | null,
  current: ReadonlyMap<string, boolean>,
): string[] {
  return [...current]
    .filter(([id, defeated]) => defeated && (previous ? previous.get(id) === false : true))
    .map(([id]) => id);
}
