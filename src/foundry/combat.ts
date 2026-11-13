import { MODULE_ID } from "../constants";
import { aggregate } from "../core/aggregate";
import { newlyDefeated } from "../core/instances";
import { defeatedOf } from "../core/view";
import { readProfile, type AutoShow } from "../core/profile";
import { logger } from "../logger";
import { requestWrite } from "./authority";
import { liveFoundryEnv, type FoundryEnv } from "./env";
import { instanceFor, sceneItems, subjectOf, type BossHud } from "./store";

/** Combat starts when it moves from round 0 to round 1 (spec §3); a rewind to round 1 is not a start. */
export const isCombatStart = (previousRound: number | undefined, round: unknown) =>
  previousRound === 0 && round === 1;

type Combatant = { sceneId: string; tokenId: string };

const autoShowOf = (token: TokenDocument | undefined): AutoShow | null => {
  const profile = readProfile(token?.baseActor?.flags[MODULE_ID]?.profile);
  return profile.status === "ok" ? profile.value.autoShow : null;
};

/** The instance covering a combatant's token and its profile (a form's bar keeps its boss's profile). */
function covering({ sceneId, tokenId }: Combatant, env: FoundryEnv) {
  const scene = env.game.scenes.get(sceneId);
  const token = scene?.tokens.get(tokenId);
  const instance = token ? instanceFor(sceneItems(scene), token) : undefined;
  const subject = scene && instance ? subjectOf(scene, instance, env) : null;
  return scene && subject
    ? { sceneId: scene.id, instanceId: subject.instance.id, profile: subject.profile }
    : null;
}

/** Whether a started combat holds a token the instance covers: the boss already fights again. */
function fighting(sceneId: string, instanceId: string, env: FoundryEnv): boolean {
  return env.game.combats.some(
    (combat) =>
      combat.started &&
      combat.combatants.some(
        (each) => covering(each, env)?.instanceId === instanceId && each.sceneId === sceneId,
      ),
  );
}

/** Live defeat state of every shown instance whose profile hides on defeat (used on delayed hide re-check). */
function liveDefeatState(id: string, env: FoundryEnv): { defeated: boolean; sceneId: string } | null {
  for (const scene of env.game.scenes.values()) {
    const item = sceneItems(scene).find((each) => each.id === id);
    if (!item) continue;
    const subject = subjectOf(scene, item, env);
    if (!subject?.profile.autoShow.hideOnDefeat) return null;
    return { defeated: defeatedOf(subject, aggregate(subject.tokens, true)), sceneId: scene.id };
  }
  return null;
}

/**
 * Auto-show and auto-hide by profile (spec §3), on the active GM only: show combatants when combat reaches round 1,
 * hide them after the profile's delay when combat ends or when they fall. A fallen instance is checked again when
 * its delay runs out, so healing in time keeps it shown. Timers die with the page: the first check after a load
 * hides whatever is already defeated.
 */
export function startCombatWatch(hud: BossHud, env?: FoundryEnv): void {
  const runtime = env ?? liveFoundryEnv();
  const write = (action: Parameters<typeof requestWrite>[0]) =>
    (env ? requestWrite(action, env) : requestWrite(action)).catch((error: unknown) =>
      logger.warn("Auto show/hide skipped", action, error),
    );

  runtime.Hooks.on("updateCombat", (combat: CombatDocument, changed: { round?: unknown }) => {
    if (!runtime.game.user.isActiveGM || !isCombatStart(combat.previous?.round, changed.round)) return;
    for (const { sceneId, tokenId } of combat.combatants.values()) {
      const scene = runtime.game.scenes.get(sceneId);
      if (scene && autoShowOf(scene.tokens.get(tokenId))?.onCombatStart) {
        void write({ type: "show", sceneId, tokenId });
      }
    }
  });

  runtime.Hooks.on("deleteCombat", (combat: CombatDocument) => {
    if (!runtime.game.user.isActiveGM) return;
    for (const combatant of combat.combatants.values()) {
      const autoShow = covering(combatant, runtime)?.profile.autoShow;
      if (autoShow?.hideOnCombatEnd) {
        setTimeout(() => {
          const found = covering(combatant, runtime);
          if (found && !fighting(found.sceneId, found.instanceId, runtime)) {
            void write({ type: "hide", sceneId: found.sceneId, instanceId: found.instanceId });
          }
        }, autoShow.delay * 1000);
      }
    }
  });

  let previous: Map<string, boolean> | null = null;
  const pending = new Set<string>();
  const hideIfStillDefeated = (id: string) => {
    pending.delete(id);
    if (!runtime.game.user.isActiveGM) return;
    const state = liveDefeatState(id, runtime);
    if (state?.defeated) void write({ type: "hide", sceneId: state.sceneId, instanceId: id });
  };
  hud.subscribe((snapshot) => {
    if (!snapshot.isActiveGM) {
      previous = null;
      return;
    }
    const states = new Map<string, { defeated: boolean; sceneId: string; delay: number }>();
    const current = new Map<string, boolean>();
    for (const { scene, subject, defeated } of snapshot.allEntries) {
      if (!subject.profile.autoShow.hideOnDefeat) continue;
      states.set(subject.instance.id, {
        defeated,
        sceneId: scene.id,
        delay: subject.profile.autoShow.delay,
      });
      current.set(subject.instance.id, defeated);
    }
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
