import { MODULE_ID } from "../constants";
import { aggregate } from "../core/aggregate";
import { newlyDefeated } from "../core/combat";
import { instanceEvents } from "../core/events";
import { readInstances, type Instance } from "../core/instances";
import { formPending, shownIndex } from "../core/phases";
import type { Phase } from "../core/profile";
import { phaseViewOf } from "../core/view";
import { subjectOf, type BossHud } from "./store";

const itemsOf = (scene: SceneDocument) => {
  const read = readInstances(scene.flags[MODULE_ID]?.instances);
  return read.status === "ok" ? read.value.items : [];
};

const phasesOf = (scene: SceneDocument, item: Instance): readonly Phase[] => {
  const profile = subjectOf(scene, item)?.profile;
  return profile?.kind === "boss" ? profile.phases : [];
};

/** The phase everyone is shown; null without phases. */
const phaseKey = (scene: SceneDocument, item: Instance) => {
  const phases = phasesOf(scene, item);
  return phases[shownIndex(phases, item.phase)]?.id ?? null;
};

/** Label for players, plus the id for the GM. */
function phaseInfo(scene: SceneDocument, item: Instance) {
  const phases = phasesOf(scene, item);
  const index = shownIndex(phases, item.phase);
  const view = phaseViewOf(phases, index);
  const label = view
    ? view.label ||
      (view.numeral ? game.i18n.localize("BB5E.Phase.Default").replace("{n}", view.numeral) : "")
    : "";
  return game.user.isGM ? { label, id: phases[index]?.id ?? null } : { label };
}

/**
 * A player hears only about bars and cards their HUD shows (a token not all hidden). A hidden bar whose token is
 * gone can no longer be told apart: its hide is reported.
 */
function visible(scene: SceneDocument, item: Instance, gone: boolean): boolean {
  if (game.user.isGM) return true;
  const subject = subjectOf(scene, item);
  return subject ? aggregate(subject.tokens, false) !== null : gone;
}

/**
 * The public hooks without `pre` (spec §13), on every client after a change is applied: show, hide, phase change
 * and quote from the difference of the scene flag, defeat from the recompute. A load only takes the baseline.
 */
export function startHookEvents(hud: BossHud): void {
  const seen = new Map(game.scenes.contents.map((scene) => [scene.id, itemsOf(scene)]));
  // Foundry catches and logs errors thrown by hook callbacks itself.
  const call = (hook: string, payload: object) => Hooks.callAll(`${MODULE_ID}.${hook}`, payload);

  Hooks.on("updateScene", (scene: SceneDocument) => {
    const before = seen.get(scene.id) ?? [];
    const after = itemsOf(scene);
    seen.set(scene.id, after);
    for (const event of instanceEvents(before, after, (item) => phaseKey(scene, item))) {
      const { item } = event;
      if (!visible(scene, item, event.type === "hide")) continue;
      const base = { id: item.id, sceneId: scene.id, kind: item.kind };
      if (event.type === "phaseChange") {
        call("phaseChange", {
          ...base,
          phase: phaseInfo(scene, item),
          previous: phaseInfo(scene, event.previous),
        });
      } else if (event.type === "quote") {
        call("quote", { ...base, text: item.quote?.text ?? "" });
      } else {
        call(event.type, base);
      }
    }
  });

  // Same rule as the auto-hide: 0 HP, the defeated status or a defeated combatant, not while a form is ahead.
  let previous: Map<string, boolean> | null = null;
  hud.subscribe(() => {
    const current = new Map<string, boolean>();
    const where = new Map<string, { sceneId: string; kind: Instance["kind"] }>();
    for (const scene of game.scenes.values()) {
      for (const item of itemsOf(scene)) {
        const subject = subjectOf(scene, item);
        const total = subject ? aggregate(subject.tokens, game.user.isGM) : null;
        if (!total) continue;
        current.set(item.id, total.defeated && !formPending(phasesOf(scene, item), item.phase));
        where.set(item.id, { sceneId: scene.id, kind: item.kind });
      }
    }
    const fallen = previous ? newlyDefeated(previous, current) : [];
    previous = current;
    for (const id of fallen) {
      const place = where.get(id);
      if (place) call("defeated", { id, ...place });
    }
  });
}
