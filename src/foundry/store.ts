import { MODULE_ID } from "../constants";
import { isDefeated, type TokenState } from "../core/aggregate";
import { readInstances, type Instance } from "../core/instances";
import { readProfile, type Profile } from "../core/profile";
import { rankOf } from "../core/ranks";
import { buildViews, phaseEnterOf, type HudViews, type SubjectInput } from "../core/view";
import { hasDefeatedStatus, readBar, readEffects, readHp } from "../integrations/dnd5e/actor";
import { logger } from "../logger";
import type { Layout } from "../core/layout";
import { currentLayout } from "./layout";
import { lookFor } from "./library";
import { collapsedIds, currentRanks } from "./settings";

/**
 * Everything that can change what a bar or card shows. HP is read from the data on every update (ADR 0001); items
 * and effects change effectiveMax; updateActor also fires for an unlinked token's synthetic actor. Statuses follow
 * the same hooks: an effect suppressed by its item or by expiry fires no effect hook of its own. Combat and world
 * time move the remaining-time labels of the status tooltips.
 */
const HOOKS = [
  "updateActor",
  "createToken",
  "updateToken",
  "deleteToken",
  "createItem",
  "updateItem",
  "deleteItem",
  "createActiveEffect",
  "updateActiveEffect",
  "deleteActiveEffect",
  "createCombatant",
  "updateCombatant",
  "deleteCombatant",
  "updateCombat",
  "deleteCombat",
  "updateWorldTime",
  "updateScene",
  "canvasReady",
  "clientSettingChanged",
];

export interface BossHud {
  /** Schedules one recompute in a microtask, however many hooks fire. */
  refresh(): void;
  /** Called after each recompute (open GM windows follow the scene). Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** Temp HP peaks of mini-bars, kept between recomputes (core/minibars). */
const peaks = new Map<string, number>();

export function startStore(render: (views: HudViews, layout: Layout, uiScale: number) => void): BossHud {
  const listeners = new Set<() => void>();
  const warned = new Set<string>();
  let pending = false;
  const refresh = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      const layout = currentLayout(canvas?.scene);
      render(collectViews(warned, layout), layout, uiScale());
      for (const listener of listeners) listener();
    });
  };
  for (const hook of HOOKS) Hooks.on(hook, refresh);
  return {
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The CSS --ui-scale resets to 1 when the OS theme changes; the setting is reliable (research/foundry-ui §1). */
export function uiScale(): number {
  const scale = (game.settings.get("core", "uiConfig") as { uiScale?: number } | undefined)?.uiScale;
  return typeof scale === "number" && scale > 0 ? scale : 1;
}

/** The instance that covers a token: bound to it, or to its actor. */
export function instanceFor(items: Instance[], token: TokenDocument): Instance | undefined {
  return items.find((item) => item.tokenId === token.id || (item.actorId && item.actorId === token.actorId));
}

/** `token.combatant` follows the combat open in this client's tracker, which differs between clients. */
const combatantDefeated = (sceneId: string, tokenId: string) =>
  game.combats.some((combat) =>
    combat.combatants.some((each) => each.sceneId === sceneId && each.tokenId === tokenId && each.defeated),
  );

function tokenState(scene: SceneDocument, token: TokenDocument, profile: Profile): TokenState {
  const actor = token.actor;
  const hp = actor ? readHp(actor) : null;
  const bars = profile.miniBars.filter((bar) => bar.source.type !== "temp" && bar.source.type !== "counter");
  return {
    tokenId: token.id,
    hidden: token.hidden,
    linked: token.actorLink,
    hp,
    defeated: isDefeated(hp, actor ? hasDefeatedStatus(actor) : false, combatantDefeated(scene.id, token.id)),
    effects: actor ? readEffects(actor) : [],
    bars: Object.fromEntries(bars.map((bar) => [bar.id, actor ? readBar(actor, bar.source) : null])),
  };
}

/** The actor holding an instance's profile: a form's source, else the bound token's base actor or the bound actor. */
export function profileActorOf(scene: SceneDocument, instance: Instance): ActorDocument | null | undefined {
  if (instance.source) return game.actors.get(instance.source);
  return instance.tokenId
    ? scene.tokens.get(instance.tokenId)?.baseActor
    : game.actors.get(instance.actorId ?? "");
}

/**
 * What the store needs for one instance; null when its token or actor is gone or has no readable profile. On a
 * form's token the name and image stay the boss's (spec §6); HP, mini-bars and statuses come from the token.
 */
export function subjectOf(scene: SceneDocument, instance: Instance): SubjectInput | null {
  const actor = profileActorOf(scene, instance);
  let tokens: TokenDocument[];
  let name: string;
  if (instance.tokenId) {
    const token = scene.tokens.get(instance.tokenId);
    if (!token) return null;
    tokens = [token];
    // The boss keeps the name its own tokens carry, not the form token's.
    name = instance.source ? actor?.prototypeToken?.name || (actor?.name ?? "") : token.name;
  } else {
    tokens = scene.tokens.filter((token) => token.actorId === instance.actorId);
    name = actor?.name ?? "";
  }
  const profile = readProfile(actor?.flags[MODULE_ID]?.profile);
  if (!actor || !tokens.length || profile.status !== "ok") return null;
  return {
    instance,
    profile: profile.value,
    name,
    actorImg: instance.source ? actor.img : (tokens[0]?.actor ?? actor).img,
    tokens: tokens.map((token) => tokenState(scene, token, profile.value)),
  };
}

/** Bars and cards of the viewed scene. One broken instance is skipped (warned once) and never hides the others. */
function collectViews(warned: Set<string>, layout: Layout): HudViews {
  const empty: HudViews = {
    bosses: [],
    elites: [],
    eliteOverflow: 0,
    column: { canCollapse: false, collapsed: false, total: 0 },
  };
  const scene = canvas?.scene;
  if (!scene) return empty;
  const read = readInstances(scene.flags[MODULE_ID]?.instances);
  if (read.status !== "ok") return empty;
  const subjects: SubjectInput[] = [];
  const ranks = currentRanks();
  for (const instance of read.value.items) {
    try {
      const subject = subjectOf(scene, instance);
      if (!subject) continue;
      // Bosses wear their profile's look and overrides, then their phases' overrides; elites their rank's look.
      const { profile } = subject;
      subject.look =
        profile.kind === "boss"
          ? lookFor(profile.look, { ...profile.overrides, ...phaseEnterOf(subject).overrides })
          : lookFor(rankOf(ranks, profile.rank).rank.look);
      subjects.push(subject);
    } catch (error) {
      if (warned.has(instance.id)) continue;
      warned.add(instance.id);
      logger.warn("Bar or card skipped", instance.id, error);
    }
  }
  const viewer = {
    isGM: game.user.isGM,
    collapsed: collapsedIds(scene.id),
    mayCollapse: layout.bosses.collapse,
    mayCollapseElites: layout.elites.collapse,
  };
  return buildViews(subjects, ranks, viewer, layout.elites.max, peaks);
}
