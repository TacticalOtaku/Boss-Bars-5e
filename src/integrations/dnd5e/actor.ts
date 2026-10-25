import type { HpData } from "../../core/hp";
import type { BarValue } from "../../core/minibars";
import type { MiniBarSource } from "../../core/profile";
import type { EffectInput } from "../../core/statuses";

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

/**
 * Applied effects with what the token-icon filter needs (Foundry 14 `Token#_drawEffects`). dnd5e's `isTemporary`
 * is false for Bloodied where it conceals it from this user (`ActiveEffect5e#isConcealed`).
 */
export function readEffects(actor: Pick<ActorDocument, "appliedEffects">): EffectInput[] {
  return actor.appliedEffects.map((effect) => ({
    id: effect.id,
    name: effect.name,
    img: effect.img ?? "",
    description: effect.description ?? "",
    statuses: [...effect.statuses],
    showIcon: effect.showIcon,
    temporary: effect.isTemporary,
    autoCreated: Boolean(effect.flags.dae?.autoCreated),
    stacks: Number(effect.flags.dae?.stacks) || 0,
    duration: Number.isFinite(effect.duration.remaining) ? (effect.duration.label ?? "") : "",
  }));
}

const pair = (value: unknown, max: unknown): BarValue | null => {
  const each = { value: Number(value), max: Number(max) };
  return Number.isFinite(each.value) && Number.isFinite(each.max) ? each : null;
};

/**
 * A mini-bar's value from prepared data: legendary actions and resistances (`value` is derived from `spent`),
 * an item's uses, or a `system.` path (checked by the profile reader) with a fixed or path maximum.
 */
export function readBar(
  actor: Pick<ActorDocument, "system" | "items">,
  source: MiniBarSource,
): BarValue | null {
  switch (source.type) {
    case "legact":
    case "legres": {
      const resource = actor.system.resources?.[source.type];
      return resource ? pair(resource.value, resource.max) : null;
    }
    case "item": {
      const uses = actor.items.get(source.itemId)?.system.uses;
      return uses ? pair(uses.value, uses.max) : null;
    }
    case "path": {
      const max = typeof source.max === "string" ? foundry.utils.getProperty(actor, source.max) : source.max;
      return pair(foundry.utils.getProperty(actor, source.path), max);
    }
    default:
      return null;
  }
}
