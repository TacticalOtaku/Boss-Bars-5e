import { MODULE_ID } from "../constants";
import { isDefeated, type TokenState } from "../core/aggregate";
import { readInstances, type Instance } from "../core/instances";
import { readProfile } from "../core/profile";
import { buildViews, type HudViews, type SubjectInput } from "../core/view";
import { hasDefeatedStatus, readHp } from "../integrations/dnd5e/actor";
import { logger } from "../logger";
import type { Layout } from "../core/layout";
import { currentLayout } from "./layout";
import { collapsedIds, currentRanks } from "./settings";

/**
 * Everything that can change what a bar or card shows. HP is read from the data on every update (ADR 0001); items
 * and effects change effectiveMax; updateActor also fires for an unlinked token's synthetic actor.
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
  "deleteCombat",
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

function tokenState(scene: SceneDocument, token: TokenDocument): TokenState {
  const actor = token.actor;
  const hp = actor ? readHp(actor) : null;
  return {
    tokenId: token.id,
    hidden: token.hidden,
    linked: token.actorLink,
    hp,
    defeated: isDefeated(hp, actor ? hasDefeatedStatus(actor) : false, combatantDefeated(scene.id, token.id)),
  };
}

/** What the store needs for one instance; null when its token or actor is gone or has no readable profile. */
function subjectOf(scene: SceneDocument, instance: Instance): SubjectInput | null {
  let actor: ActorDocument | null | undefined;
  let tokens: TokenDocument[];
  let name: string;
  if (instance.tokenId) {
    const token = scene.tokens.get(instance.tokenId);
    if (!token) return null;
    actor = token.baseActor;
    tokens = [token];
    name = token.name;
  } else {
    actor = game.actors.get(instance.actorId ?? "");
    tokens = scene.tokens.filter((token) => token.actorId === instance.actorId);
    name = actor?.name ?? "";
  }
  const profile = readProfile(actor?.flags[MODULE_ID]?.profile);
  if (!actor || !tokens.length || profile.status !== "ok") return null;
  return {
    instance,
    profile: profile.value,
    name,
    actorImg: (tokens[0]?.actor ?? actor).img,
    tokens: tokens.map((token) => tokenState(scene, token)),
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
  for (const instance of read.value.items) {
    try {
      const subject = subjectOf(scene, instance);
      if (subject) subjects.push(subject);
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
  return buildViews(subjects, currentRanks(), viewer, layout.elites.max);
}
