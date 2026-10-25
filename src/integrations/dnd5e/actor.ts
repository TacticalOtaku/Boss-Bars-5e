import type { HpData } from "../../core/hp";

/** Prepared dnd5e 5.3.3 hit points (`prepareHitPoints`); effectiveMax already includes tempmax. */
export function readHp(actor: Pick<ActorDocument, "system">): HpData | null {
  const hp = actor.system.attributes?.hp;
  if (!hp) return null;
  return {
    value: Number(hp.value),
    effectiveMax: Number(hp.effectiveMax ?? hp.max),
    temp: Number(hp.temp) || 0,
  };
}

export function hasHp(actor: Pick<ActorDocument, "system">): boolean {
  return Boolean(actor.system.attributes?.hp);
}

/** The defeated status ("dead" by default); the combat tracker sets it together with `combatant.defeated`. */
export function hasDefeatedStatus(actor: Pick<ActorDocument, "statuses">): boolean {
  return actor.statuses.has(CONFIG.specialStatusEffects.DEFEATED);
}

/** Profiles live on the world actor: an unlinked token's synthetic actor would write into the token's delta. */
export function baseActorOf(actor: ActorDocument): ActorDocument | null {
  return actor.isToken ? (actor.token?.baseActor ?? null) : actor;
}
