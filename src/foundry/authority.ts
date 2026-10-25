import { MODULE_ID } from "../constants";
import { parseAction, type WriteAction } from "../core/actions";
import { hideAll, hideInstance, pruneInstances, readInstances, showInstance } from "../core/instances";
import { readProfile } from "../core/profile";
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
    if (!token || profileStatus(token.baseActor) !== "ok") throw new WriteError("BB5E.Error.NoProfile");
    next = showInstance(next, token.id, foundry.utils.randomID());
  } else if (action.type === "hide") {
    next = hideInstance(next, action.instanceId);
  } else {
    next = hideAll(next);
  }
  if (next !== read.value) await scene.setFlag(MODULE_ID, "instances", next);
}

/**
 * Automatic clean-up, active GM only: bars of deleted tokens and of actors whose profile was removed go away.
 * Scenes holding newer or unreadable data are left alone.
 */
export function pruneScenes(scenes: Iterable<SceneDocument>): void {
  if (!game.user.isActiveGM) return;
  for (const scene of scenes) {
    void enqueue(async () => {
      const read = sceneInstances(scene);
      if (read.status !== "ok") return;
      const next = pruneInstances(read.value, (item) => {
        const token = scene.tokens.get(item.tokenId);
        return Boolean(token) && profileStatus(token?.baseActor) !== "none";
      });
      if (next !== read.value) await scene.setFlag(MODULE_ID, "instances", next);
    }).catch((error) => logger.error("Clean-up failed", scene.id, error));
  }
}
