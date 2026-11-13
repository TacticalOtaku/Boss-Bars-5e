import { MODULE_ID } from "../constants";
import { aggregate } from "../core/aggregate";
import { instanceEvents, newlyDefeated, type Instance } from "../core/instances";
import { shownIndex } from "../core/phases";
import type { Phase } from "../core/profile";
import { phaseViewOf } from "../core/view";
import { liveFoundryEnv, type FoundryEnv } from "./env";
import { sceneItems, subjectOf, type BossHud } from "./store";

const phasesOf = (scene: SceneDocument, item: Instance, env: FoundryEnv): readonly Phase[] => {
  const profile = subjectOf(scene, item, env)?.profile;
  return profile?.kind === "boss" ? profile.phases : [];
};

/** The phase everyone is shown; null without phases. */
const phaseKey = (scene: SceneDocument, item: Instance, env: FoundryEnv) => {
  const phases = phasesOf(scene, item, env);
  return phases[shownIndex(phases, item.phase)]?.id ?? null;
};

/** Label for players, plus the id for the GM. */
function phaseInfo(scene: SceneDocument, item: Instance, env: FoundryEnv) {
  const phases = phasesOf(scene, item, env);
  const index = shownIndex(phases, item.phase);
  const view = phaseViewOf(phases, index);
  const label = view
    ? view.label ||
      (view.numeral ? env.game.i18n.localize("BB5E.Phase.Default").replace("{n}", view.numeral) : "")
    : "";
  return env.game.user.isGM ? { label, id: phases[index]?.id ?? null } : { label };
}

/**
 * A player hears only about bars and cards their HUD shows (a token not all hidden). A hidden bar whose token is
 * gone can no longer be told apart: its hide is reported.
 */
function visible(scene: SceneDocument, item: Instance, gone: boolean, env: FoundryEnv): boolean {
  if (env.game.user.isGM) return true;
  const subject = subjectOf(scene, item, env);
  return subject ? aggregate(subject.tokens, false) !== null : gone;
}

/**
 * The public hooks without `pre` (spec §13), on every client after a change is applied: show, hide, phase change
 * and quote from the difference of the scene flag, defeat from the recompute. A load only takes the baseline.
 */
export function startHookEvents(hud: BossHud, env: FoundryEnv = liveFoundryEnv()): void {
  const seen = new Map([...env.game.scenes.values()].map((scene) => [scene.id, sceneItems(scene)]));
  // Foundry catches and logs errors thrown by hook callbacks itself.
  const call = (hook: string, payload: object) => env.Hooks.callAll(`${MODULE_ID}.${hook}`, payload);

  env.Hooks.on("updateScene", (scene: SceneDocument) => {
    const before = seen.get(scene.id) ?? [];
    const after = sceneItems(scene);
    seen.set(scene.id, after);
    for (const event of instanceEvents(before, after, (item) => phaseKey(scene, item, env))) {
      const { item } = event;
      if (!visible(scene, item, event.type === "hide", env)) continue;
      const base = { id: item.id, sceneId: scene.id, kind: item.kind };
      if (event.type === "phaseChange") {
        call("phaseChange", {
          ...base,
          phase: phaseInfo(scene, item, env),
          previous: phaseInfo(scene, event.previous, env),
        });
      } else if (event.type === "quote") {
        call("quote", { ...base, text: item.quote?.text ?? "" });
      } else {
        call(event.type, base);
      }
    }
  });

  // Same rule as the auto-hide (defeatedOf).
  let previous: Map<string, boolean> | null = null;
  hud.subscribe((snapshot) => {
    const current = new Map<string, boolean>();
    const where = new Map<string, { sceneId: string; kind: Instance["kind"] }>();
    for (const { scene, subject, total, defeated } of snapshot.allEntries) {
      if (!total) continue;
      current.set(subject.instance.id, defeated);
      where.set(subject.instance.id, { sceneId: scene.id, kind: subject.instance.kind });
    }
    const fallen = previous ? newlyDefeated(previous, current) : [];
    previous = current;
    for (const id of fallen) {
      const place = where.get(id);
      if (place) call("defeated", { id, ...place });
    }
  });
}
