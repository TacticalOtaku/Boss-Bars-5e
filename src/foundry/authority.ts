import { MODULE_ID } from "../constants";
import { parseAction, type WriteAction } from "../core/actions";
import {
  hideAll,
  hideInstance,
  pruneInstances,
  readInstances,
  rebindInstances,
  setCounter,
  showInstance,
  toggleStatus,
  type Instance,
  type InstanceState,
} from "../core/instances";
import { readProfile, type Profile } from "../core/profile";
import { logger } from "../logger";

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

/** For UI buttons: a refused write becomes a localized notification. */
export async function writeOrNotify(action: WriteAction): Promise<boolean> {
  try {
    await requestWrite(action);
    return true;
  } catch (error) {
    const key =
      error instanceof Error && error.message.startsWith("BB5E.") ? error.message : "BB5E.Error.WriteFailed";
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
    // After a display mode change, the bar bound the other way is replaced rather than doubled.
    next = pruneInstances(next, (item) =>
      byActor
        ? !(item.tokenId && scene.tokens.get(item.tokenId)?.actorId === token.actorId)
        : !(item.actorId && item.actorId === token.actorId),
    );
    const target = byActor ? { actorId: byActor } : { tokenId: token.id };
    next = showInstance(next, profile.value.kind, target, foundry.utils.randomID());
  } else if (action.type === "hide") {
    next = hideInstance(next, action.instanceId);
  } else if (action.type === "hideAll") {
    next = hideAll(next);
  } else {
    next = applyInstanceEdit(scene, next, action);
  }
  if (next !== read.value) await scene.setFlag(MODULE_ID, "instances", next);
}

function instanceProfile(scene: SceneDocument, item: Instance): Profile | null {
  const actor = item.tokenId
    ? scene.tokens.get(item.tokenId)?.baseActor
    : game.actors.get(item.actorId ?? "");
  const profile = readProfile(actor?.flags[MODULE_ID]?.profile);
  return profile.status === "ok" ? profile.value : null;
}

/** Counters and custom statuses must exist in the instance's profile; a counter is clamped to its maximum. */
function applyInstanceEdit(
  scene: SceneDocument,
  state: InstanceState,
  action: Extract<WriteAction, { type: "setCounter" | "toggleStatus" }>,
): InstanceState {
  const item = state.items.find((each) => each.id === action.instanceId);
  const profile = item ? instanceProfile(scene, item) : null;
  if (!profile) throw new WriteError("BB5E.Error.Invalid");
  if (action.type === "setCounter") {
    const source = profile.miniBars.find((bar) => bar.id === action.barId)?.source;
    if (source?.type !== "counter") throw new WriteError("BB5E.Error.Invalid");
    return setCounter(state, action.instanceId, action.barId, Math.min(source.max, action.value));
  }
  const known =
    profile.kind === "boss" && profile.statuses.custom.some((status) => status.id === action.statusId);
  if (!known) throw new WriteError("BB5E.Error.Invalid");
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
        if (item.tokenId) {
          const token = scene.tokens.get(item.tokenId);
          return Boolean(token) && profileStatus(token?.baseActor) !== "none";
        }
        // Bound to an actor: kept while the actor has a token on the scene.
        const actor = game.actors.get(item.actorId ?? "");
        return (
          scene.tokens.some((token) => token.actorId === item.actorId) && profileStatus(actor) !== "none"
        );
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
