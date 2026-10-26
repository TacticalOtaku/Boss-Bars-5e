import { MODULE_ID } from "../constants";
import { aggregate } from "../core/aggregate";
import { isCombatStart, newlyDefeated } from "../core/combat";
import { defeatedOf } from "../core/view";
import { readProfile, type AutoShow } from "../core/profile";
import { logger } from "../logger";
import { requestWrite } from "./authority";
import { instanceFor, sceneItems, subjectOf, type BossHud } from "./store";

type Combatant = { sceneId: string; tokenId: string };

const autoShowOf = (token: TokenDocument | undefined): AutoShow | null => {
  const profile = readProfile(token?.baseActor?.flags[MODULE_ID]?.profile);
  return profile.status === "ok" ? profile.value.autoShow : null;
};

const write = (action: Parameters<typeof requestWrite>[0]) =>
  requestWrite(action).catch((error: unknown) => logger.warn("Auto show/hide skipped", action, error));

/** The instance covering a combatant's token and its profile (a form's bar keeps its boss's profile). */
function covering({ sceneId, tokenId }: Combatant) {
  const scene = game.scenes.get(sceneId);
  const token = scene?.tokens.get(tokenId);
  const instance = token ? instanceFor(sceneItems(scene), token) : undefined;
  const subject = scene && instance ? subjectOf(scene, instance) : null;
  return scene && subject
    ? { sceneId: scene.id, instanceId: subject.instance.id, profile: subject.profile }
    : null;
}

/** Whether a started combat holds a token the instance covers: the boss already fights again. */
function fighting(sceneId: string, instanceId: string): boolean {
  return game.combats.some(
    (combat) =>
      combat.started &&
      combat.combatants.some((each) => covering(each)?.instanceId === instanceId && each.sceneId === sceneId),
  );
}

/** Hides the instance covering a combatant's token, if it is still shown and not in a newer fight. */
function hideCovering(combatant: Combatant): void {
  const found = covering(combatant);
  if (found && !fighting(found.sceneId, found.instanceId)) {
    void write({ type: "hide", sceneId: found.sceneId, instanceId: found.instanceId });
  }
}

/** Defeat state of every shown instance whose profile hides on defeat, on all scenes (id → defeated). */
function defeatStates(): Map<string, { defeated: boolean; sceneId: string; delay: number }> {
  const states = new Map<string, { defeated: boolean; sceneId: string; delay: number }>();
  for (const scene of game.scenes.values()) {
    for (const instance of sceneItems(scene)) {
      const subject = subjectOf(scene, instance);
      if (!subject?.profile.autoShow.hideOnDefeat) continue;
      const defeated = defeatedOf(subject, aggregate(subject.tokens, true));
      states.set(instance.id, { defeated, sceneId: scene.id, delay: subject.profile.autoShow.delay });
    }
  }
  return states;
}

/**
 * Auto-show and auto-hide by profile (spec §3), on the active GM only: show combatants when combat reaches round 1,
 * hide them after the profile's delay when combat ends or when they fall. A fallen instance is checked again when
 * its delay runs out, so healing in time keeps it shown. Timers die with the page: the first check after a load
 * hides whatever is already defeated.
 */
export function startCombatWatch(hud: BossHud): void {
  Hooks.on("updateCombat", (combat: CombatDocument, changed: { round?: unknown }) => {
    if (!game.user.isActiveGM || !isCombatStart(combat.previous?.round, changed.round)) return;
    for (const { sceneId, tokenId } of combat.combatants.values()) {
      const scene = game.scenes.get(sceneId);
      if (scene && autoShowOf(scene.tokens.get(tokenId))?.onCombatStart) {
        void write({ type: "show", sceneId, tokenId });
      }
    }
  });

  Hooks.on("deleteCombat", (combat: CombatDocument) => {
    if (!game.user.isActiveGM) return;
    for (const combatant of combat.combatants.values()) {
      const autoShow = covering(combatant)?.profile.autoShow;
      if (autoShow?.hideOnCombatEnd) setTimeout(() => hideCovering(combatant), autoShow.delay * 1000);
    }
  });

  let previous: Map<string, boolean> | null = null;
  const pending = new Set<string>();
  const hideIfStillDefeated = (id: string) => {
    pending.delete(id);
    const state = defeatStates().get(id);
    if (state?.defeated && game.user.isActiveGM) {
      void write({ type: "hide", sceneId: state.sceneId, instanceId: id });
    }
  };
  hud.subscribe(() => {
    if (!game.user.isActiveGM) {
      previous = null;
      return;
    }
    const states = defeatStates();
    const current = new Map([...states].map(([id, state]) => [id, state.defeated]));
    for (const id of newlyDefeated(previous, current)) {
      const state = states.get(id);
      if (!state || pending.has(id)) continue;
      if (previous === null) {
        void write({ type: "hide", sceneId: state.sceneId, instanceId: id });
        continue;
      }
      pending.add(id);
      setTimeout(() => hideIfStillDefeated(id), state.delay * 1000);
    }
    previous = current;
  });
}
