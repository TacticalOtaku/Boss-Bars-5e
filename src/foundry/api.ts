import { MODULE_ID } from "../constants";
import {
  isHudEffect,
  parseAction,
  parseEffect,
  type EffectMessage,
  type HudEffect,
  type WriteAction,
} from "../core/actions";
import { activeEntries, type ActiveEntry } from "../core/entries";
import type { Instance } from "../core/instances";
import { readProfile } from "../core/profile";
import { buildViews } from "../core/view";
import { baseActorOf } from "../integrations/dnd5e/actor";
import { logger } from "../logger";
import { serverTime } from "./time";
import { errorKey, requestWrite } from "./authority";
import { currentRanks } from "./settings";
import { instanceFor, sceneItems, sceneSubjects, subjectOf } from "./store";

const SOCKET = `module.${MODULE_ID}`;
const LAYOUT_PANEL = "bb5e-layout";

/** What the API needs from the HUD and the GM windows, wired in main. */
export interface ApiHost {
  /** Plays an effect on this client's HUD, if the bar or card is shown here. */
  play(message: EffectMessage): void;
  openEditor(actor: ActorDocument): Promise<void>;
  openPanel(): Promise<void>;
  openLayout(): Promise<void>;
}

/** A bar or card: its instance id, an entry of `getActive`, or a token it covers (document or placeable). */
type InstanceRef = string | { id: string } | TokenDocument | { document: TokenDocument };

/** A refused call: `code` is the i18n key, `message` its translation (spec §13). */
class BossBarsError extends Error {
  constructor(readonly code: string) {
    super(game.i18n.localize(code));
    this.name = "BossBarsError";
  }
}

/** Thrown inside a call; `guard` turns the key into a BossBarsError and a notification. */
const fail = (key: string): never => {
  throw new Error(key);
};

const documentOf = (value: unknown, name: "Token" | "Actor"): unknown => {
  if (typeof value !== "object" || value === null) return null;
  if ((value as { documentName?: unknown }).documentName === name) return value;
  const inner = (value as { document?: { documentName?: unknown } }).document;
  return inner?.documentName === name ? inner : null;
};

function resolve(ref: InstanceRef): { scene: SceneDocument; item: Instance } {
  const token = documentOf(ref, "Token") as TokenDocument | null;
  if (token) {
    const item = token.parent ? instanceFor(sceneItems(token.parent), token) : undefined;
    return token.parent && item ? { scene: token.parent, item } : fail("BB5E.Error.NoInstance");
  }
  const id = typeof ref === "string" ? ref : (ref as { id?: unknown }).id;
  for (const scene of game.scenes.values()) {
    const item = sceneItems(scene).find((each) => each.id === id);
    if (item) return { scene, item };
  }
  return fail("BB5E.Error.NoInstance");
}

const profileOf = (scene: SceneDocument, item: Instance) => subjectOf(scene, item)?.profile ?? null;

const sceneOf = (sceneId: string | undefined) =>
  (sceneId ? game.scenes.get(sceneId) : canvas?.scene) ?? fail("BB5E.Error.Invalid");

/** API input goes through the same payload check as another GM's query; the active GM checks it again. */
function write(action: WriteAction): Promise<void> {
  const clean = parseAction(action);
  return clean ? requestWrite(clean) : Promise.reject(new Error("BB5E.Error.Invalid"));
}

/** Players are refused at once; every refusal is logged, shown and rejected with its code. */
async function guard<T>(name: string, task: () => T | Promise<T>): Promise<T> {
  try {
    if (!game.user.isGM) fail("BB5E.Error.NotGM");
    return await task();
  } catch (error) {
    const code = errorKey(error);
    logger.warn(`api.${name} refused`, error);
    ui.notifications.error(code, { localize: true });
    throw new BossBarsError(code);
  }
}

/** Effects from other GMs: the sender's role and the payload are checked here, nothing is written. */
export function listenEffects(host: ApiHost): void {
  game.socket.on(SOCKET, (raw, senderId) => {
    const message = parseEffect(raw);
    if (message && game.users.get(senderId)?.isGM) host.play(message);
  });
}

/** `game.modules.get("boss-bars-5e").api` (spec §13). */
export function createApi(host: ApiHost) {
  return Object.freeze({
    version: 1,

    show: (
      target: TokenDocument | ActorDocument | { document: TokenDocument },
      options: { sceneId?: string } = {},
    ) =>
      guard("show", async () => {
        const token = documentOf(target, "Token") as TokenDocument | null;
        const actor = documentOf(target, "Actor") as ActorDocument | null;
        const tokens = token
          ? [token]
          : actor?.isToken && actor.token
            ? [actor.token]
            : actor
              ? sceneOf(options.sceneId).tokens.filter((each) => each.actorId === actor.id)
              : fail("BB5E.Error.Invalid");
        const first = tokens[0] ?? fail("BB5E.Error.NoToken");
        const profile = readProfile(first.baseActor?.flags[MODULE_ID]?.profile);
        // One bar for all the actor's tokens: showing one shows it.
        const shown = profile.status === "ok" && profile.value.displayMode === "actor" ? [first] : tokens;
        for (const each of shown) {
          await write({ type: "show", sceneId: each.parent?.id ?? "", tokenId: each.id });
        }
      }),

    hide: (instance: InstanceRef) =>
      guard("hide", () => {
        const { scene, item } = resolve(instance);
        return write({ type: "hide", sceneId: scene.id, instanceId: item.id });
      }),

    hideAll: (sceneId?: string) =>
      guard("hideAll", () => write({ type: "hideAll", sceneId: sceneOf(sceneId).id })),

    /** A phase id, or its number from 1. */
    setPhase: (instance: InstanceRef, phase: string | number) =>
      guard("setPhase", () => {
        const { scene, item } = resolve(instance);
        const profile = profileOf(scene, item);
        const phases = profile?.kind === "boss" ? profile.phases : [];
        const phaseId = typeof phase === "number" ? phases[phase - 1]?.id : phase;
        if (!phaseId) fail("BB5E.Error.NoSuchPhase");
        return write({ type: "setPhase", sceneId: scene.id, instanceId: item.id, phaseId: phaseId ?? "" });
      }),

    /** A profile quote by id, otherwise the text itself. */
    say: (instance: InstanceRef, quoteOrText: string) =>
      guard("say", () => {
        const { scene, item } = resolve(instance);
        const profile = profileOf(scene, item);
        const quote = profile?.kind === "boss" && profile.quotes.some((each) => each.id === quoteOrText);
        return write({
          type: "say",
          sceneId: scene.id,
          instanceId: item.id,
          ...(quote ? { quoteId: quoteOrText } : { text: quoteOrText }),
        });
      }),

    playEffect: (instance: InstanceRef, effect: HudEffect) =>
      guard("playEffect", () => {
        const { scene, item } = resolve(instance);
        if (!isHudEffect(effect) || (item.kind === "elite" && effect !== "damage" && effect !== "heal")) {
          fail("BB5E.Error.Invalid");
        }
        const message: EffectMessage = { type: "effect", sceneId: scene.id, instanceId: item.id, effect };
        game.socket.emit(SOCKET, message);
        host.play(message);
      }),

    setCounter: (instance: InstanceRef, miniBarId: string, value: number) =>
      guard("setCounter", () => {
        const { scene, item } = resolve(instance);
        return write({ type: "setCounter", sceneId: scene.id, instanceId: item.id, barId: miniBarId, value });
      }),

    /** Custom statuses of the profile; without `on` the status flips. */
    toggleStatus: (instance: InstanceRef, statusId: string, on?: boolean) =>
      guard("toggleStatus", () => {
        const { scene, item } = resolve(instance);
        const active = on ?? !item.customStatuses?.includes(statusId);
        return write({ type: "toggleStatus", sceneId: scene.id, instanceId: item.id, statusId, active });
      }),

    /** What this client's HUD shows on a scene (the viewed one by default); players get no hidden data. */
    getActive(sceneId?: string): readonly ActiveEntry[] {
      const scene = sceneId ? game.scenes.get(sceneId) : canvas?.scene;
      if (!scene) return [];
      const subjects = sceneSubjects(scene);
      const isGM = game.user.isGM;
      const viewer = { isGM, collapsed: new Set<string>(), mayCollapse: false, mayCollapseElites: false };
      const views = buildViews(subjects, currentRanks(), viewer, Infinity);
      const phaseLabel = (numeral: string) =>
        game.i18n.localize("BB5E.Phase.Default").replace("{n}", numeral);
      return Object.freeze(activeEntries(subjects, views, scene.id, isGM, serverTime(), phaseLabel));
    },

    openEditor: (actor: ActorDocument) =>
      guard("openEditor", () => {
        const doc = documentOf(actor, "Actor") as ActorDocument | null;
        const base = doc ? baseActorOf(doc) : null;
        return base ? host.openEditor(base) : fail("BB5E.Error.Invalid");
      }),

    openPanel: () => guard("openPanel", () => host.openPanel()),

    /** Opens or closes the layout panel (without `on`: flips it); resolves to whether it is open now. */
    layoutMode: (on?: boolean) =>
      guard("layoutMode", async () => {
        const panel = foundry.applications.instances.get(LAYOUT_PANEL);
        const want = on ?? !panel;
        if (want && !panel) await host.openLayout();
        if (!want && panel) await panel.close();
        return want;
      }),
  });
}
