import { MODULE_ID } from "../constants";
import { readInstances } from "../core/instances";
import { readProfile } from "../core/profile";
import { buildBossView, type BossBarView } from "../core/view";
import { hasDefeatedStatus, readHp } from "../integrations/dnd5e/actor";
import { logger } from "../logger";
import { collapsedIds, playersMayCollapse } from "./settings";

/**
 * Everything that can change what a bar shows. HP is read from the data on every update (ADR 0001); items and
 * effects change effectiveMax; updateActor also fires for an unlinked token's synthetic actor.
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

export function startStore(render: (views: BossBarView[], uiScale: number) => void): BossHud {
  const listeners = new Set<() => void>();
  const warned = new Set<string>();
  let pending = false;
  const refresh = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      render(collectViews(warned), uiScale());
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
function uiScale(): number {
  const scale = (game.settings.get("core", "uiConfig") as { uiScale?: number } | undefined)?.uiScale;
  return typeof scale === "number" && scale > 0 ? scale : 1;
}

/** `token.combatant` follows the combat open in this client's tracker, which differs between clients. */
const combatantDefeated = (sceneId: string, tokenId: string) =>
  game.combats.some((combat) =>
    combat.combatants.some((each) => each.sceneId === sceneId && each.tokenId === tokenId && each.defeated),
  );

/** Bars of the viewed scene in stack order. One broken bar is skipped (warned once) and never hides the others. */
function collectViews(warned: Set<string>): BossBarView[] {
  const scene = canvas?.scene;
  if (!scene) return [];
  const read = readInstances(scene.flags[MODULE_ID]?.instances);
  if (read.status !== "ok") return [];
  const viewer = {
    isGM: game.user.isGM,
    collapsed: collapsedIds(scene.id),
    mayCollapse: playersMayCollapse(),
  };
  const views: BossBarView[] = [];
  for (const instance of [...read.value.items].sort((a, b) => a.order - b.order)) {
    try {
      const token = scene.tokens.get(instance.tokenId);
      const actor = token?.actor;
      if (!token || !actor) continue;
      const profile = readProfile(token.baseActor?.flags[MODULE_ID]?.profile);
      if (profile.status !== "ok") continue;
      const view = buildBossView(
        {
          instance,
          profile: profile.value,
          tokenName: token.name,
          tokenHidden: token.hidden,
          actorImg: actor.img,
          hp: readHp(actor),
          dead: hasDefeatedStatus(actor),
          combatantDefeated: combatantDefeated(scene.id, token.id),
        },
        viewer,
      );
      if (view) views.push(view);
    } catch (error) {
      if (warned.has(instance.id)) continue;
      warned.add(instance.id);
      logger.warn("Boss bar skipped", instance.id, error);
    }
  }
  return views;
}
