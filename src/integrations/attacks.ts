/**
 * Who an attack roll in the chat was aimed at and how it went, for the crit and miss quotes (ticket #13). Only
 * targets the attacker picked before rolling are known: that is the documented limit.
 */
export type AttackTarget = { sceneId: string; tokenId: string } | { actorId: string };

export interface AttackResult {
  target: AttackTarget;
  outcome: "crit" | "miss" | "hit";
}

const TOKEN_UUID = /^Scene\.([A-Za-z0-9]{16})\.Token\.([A-Za-z0-9]{16})(\.Actor\.[A-Za-z0-9]{16})?$/;
const ACTOR_UUID = /^Actor\.([A-Za-z0-9]{16})$/;

/** A token uuid, an unlinked token's actor uuid (both → the token) or a world actor uuid (→ all its tokens). */
export function attackTarget(uuid: unknown): AttackTarget | null {
  if (typeof uuid !== "string") return null;
  const token = TOKEN_UUID.exec(uuid);
  if (token?.[1] && token[2]) return { sceneId: token[1], tokenId: token[2] };
  const actor = ACTOR_UUID.exec(uuid);
  return actor?.[1] ? { actorId: actor[1] } : null;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** The parts of a dnd5e attack roll the parser reads (a D20Roll has them as getters). */
interface D20Like {
  isCritical?: boolean;
  isFumble?: boolean;
  total?: number;
}

/**
 * dnd5e 5.3.3 without Midi: a created chat message with `flags.dnd5e.roll.type === "attack"`. Targets are actor
 * uuids with their AC (`null` under total cover). Crit: `isCritical`; miss: a fumble, or the total under the AC.
 * Total cover without a fumble tells nothing, so it counts as neither.
 */
export function dnd5eAttack(message: { flags?: unknown; rolls?: readonly D20Like[] }): AttackResult[] {
  const dnd5e = record(record(message.flags).dnd5e);
  if (record(dnd5e.roll).type !== "attack") return [];
  const roll = message.rolls?.[0];
  if (!roll) return [];
  const targets = Array.isArray(dnd5e.targets) ? dnd5e.targets : [];
  return targets.flatMap((raw): AttackResult[] => {
    const entry = record(raw);
    const target = attackTarget(entry.uuid);
    if (!target) return [];
    const ac = typeof entry.ac === "number" ? entry.ac : null;
    if (roll.isCritical) return [{ target, outcome: "crit" }];
    const missed = roll.isFumble || (ac !== null && typeof roll.total === "number" && roll.total < ac);
    return [{ target, outcome: missed ? "miss" : "hit" }];
  });
}

/**
 * Midi QOL 14 with hits checked: the card's update that brings `flags.midi-qol.GMOnlyAttackRoll: false` (the first
 * update, before `checkHits`, brings `true` and is skipped). Targets and hits are token uuids. null — not that
 * update.
 */
export function midiAttack(
  changed: { flags?: unknown },
  message: { flags?: unknown },
): AttackResult[] | null {
  if (record(record(changed.flags)["midi-qol"]).GMOnlyAttackRoll !== false) return null;
  const midi = record(record(message.flags)["midi-qol"]);
  const hits = new Set(Array.isArray(midi.hitTargetUuids) ? midi.hitTargetUuids : []);
  const targets = Array.isArray(midi.targets) ? midi.targets : [];
  return targets.flatMap((raw): AttackResult[] => {
    const uuid = record(raw).uuid;
    const target = attackTarget(uuid);
    if (!target) return [];
    const hit = hits.has(uuid);
    return [{ target, outcome: hit ? (midi.isCritical === true ? "crit" : "hit") : "miss" }];
  });
}
