import { MODULE_ID } from "../constants";
import { parseAction, type WriteAction } from "../core/actions";
import { aggregate } from "../core/aggregate";
import { hpFraction } from "../core/hp";
import {
  hideInstance,
  moveInstance,
  pruneInstances,
  readInstances,
  rebindInstances,
  setCounter,
  setPhaseState,
  setQuote,
  showInstance,
  toggleStatus,
  type Instance,
  type InstanceState,
  type InstanceTarget,
} from "../core/instances";
import { nextPhase, pickPhase, type PhaseStep } from "../core/phases";
import { freeQuote, pickQuote, speak, type QuoteContext, type QuoteEvent } from "../core/quotes";
import { playerLabels, type SubjectInput } from "../core/view";
import { readProfile, type BossProfile, type Profile } from "../core/profile";
import { logger } from "../logger";
import { profileActorOf, subjectOf } from "./store";

const QUERY = `${MODULE_ID}.write`;

/** The message is the i18n key; it is all that survives a User#query rejection. */
class WriteError extends Error {}

/** Writes of one client run one after another, so two writes never read the same flag state. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

export function registerAuthority(): void {
  // Another GM's request: the active GM checks the sender and the payload again before writing.
  CONFIG.queries[QUERY] = async (data, { user }) => {
    if (!game.user.isActiveGM) throw new WriteError("BB5E.Error.NotActiveGM");
    if (!user.isGM) throw new WriteError("BB5E.Error.NotGM");
    const action = parseAction(data);
    if (!action) throw new WriteError("BB5E.Error.Invalid");
    await enqueue(() => apply(action));
    return true;
  };
}

/** Only the active GM writes instances; another GM asks it; players and a world without a GM are refused. */
export async function requestWrite(action: WriteAction): Promise<void> {
  if (!game.user.isGM) throw new WriteError("BB5E.Error.NotGM");
  if (game.user.isActiveGM) return enqueue(() => apply(action));
  const gm = game.users.activeGM;
  if (!gm) throw new WriteError("BB5E.Error.NoGM");
  await gm.query(QUERY, action, { timeout: 10_000 });
}

/** The i18n key a refused write carries (its message), or the generic one. */
export const errorKey = (error: unknown) =>
  error instanceof Error && error.message.startsWith("BB5E.") ? error.message : "BB5E.Error.WriteFailed";

/** For UI buttons: a refused write becomes a localized notification. */
export async function writeOrNotify(action: WriteAction): Promise<boolean> {
  try {
    await requestWrite(action);
    return true;
  } catch (error) {
    const key = errorKey(error);
    logger.error("Write refused", action, error);
    ui.notifications.error(key, { localize: true });
    return false;
  }
}

function sceneInstances(scene: SceneDocument) {
  return readInstances(scene.flags[MODULE_ID]?.instances);
}

const profileStatus = (actor: ActorDocument | null | undefined) =>
  readProfile(actor?.flags[MODULE_ID]?.profile).status;

async function apply(action: WriteAction): Promise<void> {
  const scene = game.scenes.get(action.sceneId);
  if (!scene) throw new WriteError("BB5E.Error.Invalid");
  const read = sceneInstances(scene);
  if (read.status === "newer") throw new WriteError("BB5E.Error.NewerData");
  if (read.status !== "ok") throw new WriteError("BB5E.Error.Invalid");
  let next = read.value;
  if (action.type === "show") {
    const token = scene.tokens.get(action.tokenId);
    const profile = readProfile(token?.baseActor?.flags[MODULE_ID]?.profile);
    if (!token || profile.status !== "ok") throw new WriteError("BB5E.Error.NoProfile");
    const byActor = profile.value.displayMode === "actor" && token.actorId;
    const target = byActor ? { actorId: byActor } : { tokenId: token.id };
    const shownAlready = next.items.some((item) =>
      byActor ? item.actorId === byActor : item.tokenId === token.id,
    );
    if (shownAlready) return;
    const info = { sceneId: scene.id, tokenId: token.id, actorId: token.actorId, kind: profile.value.kind };
    if (Hooks.call(`${MODULE_ID}.preShow`, info) === false) throw new WriteError("BB5E.Error.Cancelled");
    // After a display mode change, the bar bound the other way is replaced rather than doubled.
    next = pruneInstances(next, (item) =>
      byActor
        ? !(item.tokenId && scene.tokens.get(item.tokenId)?.actorId === token.actorId)
        : !(item.actorId && item.actorId === token.actorId),
    );
    const id = foundry.utils.randomID();
    next = showInstance(next, profile.value.kind, target, id);
    // A wounded boss appears in the phase its HP calls for, with no effect (decision 7).
    const shown = next.items.find((item) => item.id === id);
    const step = shown ? phaseStepOf(scene, shown) : null;
    if (shown && step) next = applyStep(scene, next, shown, step);
  } else if (action.type === "hide") {
    const item = next.items.find((each) => each.id === action.instanceId);
    if (item && !mayHide(scene, item)) throw new WriteError("BB5E.Error.Cancelled");
    next = hideInstance(next, action.instanceId);
  } else if (action.type === "hideAll") {
    // Bars a module keeps (preHide returns false) stay shown.
    next = pruneInstances(next, (item) => !mayHide(scene, item));
  } else if (action.type === "setPhase" || action.type === "bindToken") {
    next = applyPhaseAction(scene, next, action);
  } else if (action.type === "say") {
    next = applySay(scene, next, action);
  } else {
    next = applyInstanceEdit(scene, next, action);
  }
  if (next !== read.value) await scene.setFlag(MODULE_ID, "instances", next);
}

/** `preHide`, on the active GM before a hide is written: a module returning false keeps the bar. */
const mayHide = (scene: SceneDocument, item: Instance) =>
  Hooks.call(`${MODULE_ID}.preHide`, { id: item.id, sceneId: scene.id, kind: item.kind }) !== false;

function instanceProfile(scene: SceneDocument, item: Instance): Profile | null {
  const profile = readProfile(profileActorOf(scene, item)?.flags[MODULE_ID]?.profile);
  return profile.status === "ok" ? profile.value : null;
}

function phasedProfile(scene: SceneDocument, item: Instance): BossProfile | null {
  const profile = instanceProfile(scene, item);
  return profile?.kind === "boss" && profile.phases.length ? profile : null;
}

/** The HP share the phase engine reads: the bound token, or the sum of the actor's tokens, as the GM sees it. */
function fractionOf(scene: SceneDocument, item: Instance): number | null {
  const subject = subjectOf(scene, item);
  const hp = subject ? aggregate(subject.tokens, true)?.hp : null;
  return hp ? hpFraction(hp) : null;
}

function phaseStepOf(scene: SceneDocument, item: Instance): PhaseStep | null {
  const profile = phasedProfile(scene, item);
  return profile ? nextPhase(profile.phases, item.phase, fractionOf(scene, item)) : null;
}

/** Where a form's bar goes: the form actor's token nearest the fallen one, or the form actor (one per actor). */
function formTarget(scene: SceneDocument, item: Instance, actorId: string): InstanceTarget | null {
  const candidates = scene.tokens.filter((token) => token.actorId === actorId);
  if (!candidates.length) return null;
  if (item.actorId) return { actorId };
  const from = scene.tokens.get(item.tokenId ?? "");
  const distance = (token: TokenDocument) => (from ? (token.x - from.x) ** 2 + (token.y - from.y) ** 2 : 0);
  const nearest = candidates.reduce((best, token) => (distance(token) < distance(best) ? token : best));
  return { tokenId: nearest.id };
}

/** Writes an engine step; a form moves the bar onto its token, or waits for one and tells the GM. */
function applyStep(
  scene: SceneDocument,
  state: InstanceState,
  item: Instance,
  step: PhaseStep,
): InstanceState {
  if (!step.formActorId) return setPhaseState(state, item.id, step.state);
  const source = item.source ?? profileActorOf(scene, item)?.id;
  if (!source) return state;
  const target = formTarget(scene, item, step.formActorId);
  if (target) return moveInstance(state, item.id, target, source, step.state);
  const actor = game.actors.get(source);
  const name = instanceProfile(scene, item)?.playerName || actor?.prototypeToken?.name || actor?.name || "";
  ui.notifications.warn(game.i18n.format("BB5E.Phase.FormWaiting", { name }));
  return setPhaseState(state, item.id, { ...step.state, waiting: true }, source);
}

/** A phase picked by a GM, or the token a GM selected for a waiting form. */
function applyPhaseAction(
  scene: SceneDocument,
  state: InstanceState,
  action: Extract<WriteAction, { type: "setPhase" | "bindToken" }>,
): InstanceState {
  const item = state.items.find((each) => each.id === action.instanceId);
  if (!item) throw new WriteError("BB5E.Error.NoInstance");
  const profile = phasedProfile(scene, item);
  if (!profile) throw new WriteError("BB5E.Error.NoSuchPhase");
  if (action.type === "setPhase") {
    const step = pickPhase(profile.phases, action.phaseId, fractionOf(scene, item));
    if (!step) throw new WriteError("BB5E.Error.NoSuchPhase");
    return applyStep(scene, state, item, step);
  }
  const token = scene.tokens.get(action.tokenId);
  const source = item.source ?? profileActorOf(scene, item)?.id;
  if (!item.phase?.waiting || !token || !source) throw new WriteError("BB5E.Error.Invalid");
  const target = item.actorId && token.actorId ? { actorId: token.actorId } : { tokenId: token.id };
  return moveInstance(state, item.id, target, source, { id: item.phase.id, mark: 100 });
}

/** The fight a boss is in: the started combat holding one of its tokens (id, round), else this showing (decision 5). */
function fightOf(scene: SceneDocument, item: Instance): Pick<QuoteContext, "fight" | "round"> {
  const tokenIds = item.tokenId
    ? [item.tokenId]
    : scene.tokens.filter((token) => token.actorId === item.actorId).map((token) => token.id);
  const combat = game.combats.find(
    (each) =>
      each.started &&
      each.combatants.some(
        (combatant) => combatant.sceneId === scene.id && tokenIds.includes(combatant.tokenId),
      ),
  );
  return combat ? { fight: combat.id, round: combat.round } : { fight: item.id, round: null };
}

/** `{name}`: the bar's label as players see it, numbered among the scene's bars (decision 12). */
function playerNameOf(scene: SceneDocument, state: InstanceState, item: Instance): string {
  const subjects = state.items.flatMap((each): SubjectInput[] => {
    const subject = subjectOf(scene, each);
    return subject ? [subject] : [];
  });
  return playerLabels(subjects).get(item.id) ?? "";
}

function quoteContext(scene: SceneDocument, state: InstanceState, item: Instance): QuoteContext {
  return {
    ...fightOf(scene, item),
    now: Date.now(),
    name: playerNameOf(scene, state, item),
    random: Math.random,
  };
}

/** The GM says a profile quote (its pool and cursor, no cooldown) or their own text; either shows at once. */
function applySay(
  scene: SceneDocument,
  state: InstanceState,
  action: Extract<WriteAction, { type: "say" }>,
): InstanceState {
  const item = state.items.find((each) => each.id === action.instanceId);
  if (!item) throw new WriteError("BB5E.Error.NoInstance");
  const profile = instanceProfile(scene, item);
  if (profile?.kind !== "boss") throw new WriteError("BB5E.Error.Invalid");
  const context = quoteContext(scene, state, item);
  if (!action.quoteId) return setQuote(state, item.id, freeQuote(action.text ?? "", context));
  const quote = profile.quotes.find((each) => each.id === action.quoteId);
  if (!quote) throw new WriteError("BB5E.Error.NoQuote");
  const pick = speak(quote, item.quoteState?.[quote.id], context);
  return setQuote(
    state,
    item.id,
    { ...pick.shown, priority: Math.max(1, pick.shown.priority) },
    quote.id,
    pick.state,
  );
}

/**
 * Quote events of one boss (from the data, the chat or the tracker), active GM only. The flag is read again inside
 * the queue: cooldowns and cursors written there keep a reload from repeating a quote.
 */
export function applyQuoteEvents(scene: SceneDocument, instanceId: string, events: QuoteEvent[]): void {
  if (!game.user.isActiveGM || !events.length) return;
  void enqueue(async () => {
    const read = sceneInstances(scene);
    if (read.status !== "ok") return;
    const item = read.value.items.find((each) => each.id === instanceId);
    const profile = item ? instanceProfile(scene, item) : null;
    if (!item || profile?.kind !== "boss" || !profile.quotes.length) return;
    const context = quoteContext(scene, read.value, item);
    const pick = pickQuote(profile.quotes, events, item.quoteState ?? {}, item.quote, context);
    if (!pick) return;
    await scene.setFlag(
      MODULE_ID,
      "instances",
      setQuote(read.value, item.id, pick.shown, pick.quoteId, pick.state),
    );
  }).catch((error) => logger.error("Quote failed", scene.id, error));
}

/**
 * The phase engine, active GM only, after each recompute: scenes where a boss's phase should change are written.
 * The flag is read again inside the queue, so a reload or a second GM client never changes a phase twice.
 */
export function syncPhases(scenes: Iterable<SceneDocument>): void {
  if (!game.user.isActiveGM) return;
  for (const scene of scenes) {
    const read = sceneInstances(scene);
    if (read.status !== "ok" || !read.value.items.some((item) => phaseStepOf(scene, item))) continue;
    void enqueue(async () => {
      const again = sceneInstances(scene);
      if (again.status !== "ok") return;
      let next = again.value;
      for (const item of again.value.items) {
        const step = phaseStepOf(scene, item);
        if (step) next = applyStep(scene, next, item, step);
      }
      if (next !== again.value) await scene.setFlag(MODULE_ID, "instances", next);
    }).catch((error) => logger.error("Phase change failed", scene.id, error));
  }
}

/** Counters and custom statuses must exist in the instance's profile; a counter is clamped to its maximum. */
function applyInstanceEdit(
  scene: SceneDocument,
  state: InstanceState,
  action: Extract<WriteAction, { type: "setCounter" | "toggleStatus" }>,
): InstanceState {
  const item = state.items.find((each) => each.id === action.instanceId);
  if (!item) throw new WriteError("BB5E.Error.NoInstance");
  const profile = instanceProfile(scene, item);
  if (!profile) throw new WriteError("BB5E.Error.Invalid");
  if (action.type === "setCounter") {
    const source = profile.miniBars.find((bar) => bar.id === action.barId)?.source;
    if (source?.type !== "counter") throw new WriteError("BB5E.Error.NoCounter");
    return setCounter(state, action.instanceId, action.barId, Math.min(source.max, action.value));
  }
  const known =
    profile.kind === "boss" && profile.statuses.custom.some((status) => status.id === action.statusId);
  if (!known) throw new WriteError("BB5E.Error.NoSuchStatus");
  return toggleStatus(state, action.instanceId, action.statusId, action.active);
}

/**
 * Automatic clean-up, active GM only: bars and cards of deleted tokens, of actors without tokens left on the scene
 * and of actors whose profile was removed go away.
 * Scenes holding newer or unreadable data are left alone.
 */
export function pruneScenes(scenes: Iterable<SceneDocument>): void {
  if (!game.user.isActiveGM) return;
  for (const scene of scenes) {
    void enqueue(async () => {
      const read = sceneInstances(scene);
      if (read.status !== "ok") return;
      const pruned = pruneInstances(read.value, (item) => {
        if (profileStatus(profileActorOf(scene, item)) === "none") return false;
        // A waiting form keeps its bar even when the fallen token is gone (ticket #12).
        if (item.phase?.waiting) return true;
        if (item.tokenId) return Boolean(scene.tokens.get(item.tokenId));
        // Bound to an actor: kept while the actor has a token on the scene.
        return scene.tokens.some((token) => token.actorId === item.actorId);
      });
      // A profile whose display mode or kind changed gets its shown items rebound to match.
      const next = rebindInstances(
        pruned,
        (item) => {
          const actorId = item.actorId ?? scene.tokens.get(item.tokenId ?? "")?.actorId;
          const profile = readProfile(game.actors.get(actorId ?? "")?.flags[MODULE_ID]?.profile);
          if (!actorId || profile.status !== "ok") return null;
          return { actorId, mode: profile.value.displayMode, kind: profile.value.kind };
        },
        (actorId) => scene.tokens.filter((token) => token.actorId === actorId).map((token) => token.id),
        () => foundry.utils.randomID(),
      );
      if (next !== read.value) await scene.setFlag(MODULE_ID, "instances", next);
    }).catch((error) => logger.error("Clean-up failed", scene.id, error));
  }
}
