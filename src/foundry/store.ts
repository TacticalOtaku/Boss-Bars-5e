import { MODULE_ID } from "../constants";
import { isDefeated, aggregate, type Aggregate, type TokenState } from "../core/aggregate";
import { readInstances, type Instance } from "../core/instances";
import type { Layout } from "../core/layout";
import { readProfile, type Profile } from "../core/profile";
import { rankOf, type Rank } from "../core/ranks";
import { buildViews, defeatedOf, phaseEnterOf, type HudViews, type SubjectInput } from "../core/view";
import { hasDefeatedStatus, readBar, readEffects, readHp } from "../integrations/dnd5e/actor";
import { logger } from "../logger";
import { liveFoundryEnv, type FoundryEnv } from "./env";
import { currentLayout } from "./layout";
import { lookStyleFor } from "./library";
import { collapsedIds, currentRanks } from "./settings";

/**
 * Everything that can change what a bar or card shows. HP is read from the data on every update (ADR 0001); items
 * and effects change effectiveMax; updateActor also fires for an unlinked token's synthetic actor. Statuses follow
 * the same hooks: an effect suppressed by its item or by expiry fires no effect hook of its own. Combat and world
 * time move the remaining-time labels of the status tooltips.
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
  "updateCombat",
  "deleteCombat",
  "updateWorldTime",
  "updateScene",
  // Joining/leaving GMs or role changes can transfer authority without changing scene data.
  "userConnected",
  "updateUser",
  "canvasReady",
  "clientSettingChanged",
];

const EMPTY_VIEWS: HudViews = {
  bosses: [],
  elites: [],
  eliteOverflow: 0,
  column: { canCollapse: false, collapsed: false, total: 0 },
};

export interface SubjectSnapshot {
  scene: SceneDocument;
  subject: SubjectInput;
  /** Aggregate for the current user (`aggregate(tokens, isGM)`). */
  total: Aggregate | null;
  /** `defeatedOf(subject, total)` for the current user. */
  defeated: boolean;
}

export interface SceneSnapshot {
  scene: SceneDocument;
  items: Instance[];
  entries: SubjectSnapshot[];
}

export interface WorldSnapshot {
  isGM: boolean;
  isActiveGM: boolean;
  viewedSceneId: string | null;
  activeSceneId: string | null;
  layout: Layout;
  uiScale: number;
  viewedViews: HudViews;
  scenes: ReadonlyMap<string, SceneSnapshot>;
  allEntries: readonly SubjectSnapshot[];
  activeEntries: readonly SubjectSnapshot[];
}

export interface BossHud {
  /** Schedules one recompute in a microtask, however many hooks fire. */
  refresh(): void;
  /** Called after each recompute (open GM windows follow the scene). Returns the unsubscribe function. */
  subscribe(listener: (snapshot: WorldSnapshot, previous: WorldSnapshot | null) => void): () => void;
}

/** Temp HP peaks of mini-bars, kept between recomputes (core/minibars). */
const peaks = new Map<string, number>();

export function startStore(
  render: (views: HudViews, layout: Layout, uiScale: number, snapshot: WorldSnapshot) => void,
  env: FoundryEnv = liveFoundryEnv(),
): BossHud {
  const listeners = new Set<(snapshot: WorldSnapshot, previous: WorldSnapshot | null) => void>();
  const warned = new Set<string>();
  let pending = false;
  let previous: WorldSnapshot | null = null;
  const refresh = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      const snapshot = collectWorldSnapshot(warned, env);
      const prev = previous;
      previous = snapshot;
      render(snapshot.viewedViews, snapshot.layout, snapshot.uiScale, snapshot);
      for (const listener of listeners) listener(snapshot, prev);
    });
  };
  for (const hook of HOOKS) env.Hooks.on(hook, refresh);
  return {
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The CSS --ui-scale resets to 1 when the OS theme changes; the setting is reliable (research/foundry-ui §1). */
export function uiScale(env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): number {
  const scale = (env.game.settings.get("core", "uiConfig") as { uiScale?: number } | undefined)?.uiScale;
  return typeof scale === "number" && scale > 0 ? scale : 1;
}

/** A scene's shown instances; none while the flag is unreadable or written by a newer version. */
export function sceneItems(scene: SceneDocument | null | undefined): Instance[] {
  const read = readInstances(scene?.flags[MODULE_ID]?.instances);
  return read.status === "ok" ? read.value.items : [];
}

/** The instance that covers a token: bound to it, or to its actor. */
export function instanceFor(items: Instance[], token: TokenDocument): Instance | undefined {
  return items.find((item) => item.tokenId === token.id || (item.actorId && item.actorId === token.actorId));
}

function defeatedCombatantKeys(env: Pick<FoundryEnv, "game">): ReadonlySet<string> {
  const defeated = new Set<string>();
  for (const combat of env.game.combats.values()) {
    for (const each of combat.combatants.values()) {
      if (each.defeated) defeated.add(`${each.sceneId}:${each.tokenId}`);
    }
  }
  return defeated;
}

/** `token.combatant` follows the combat open in this client's tracker, which differs between clients. */
const combatantDefeated = (sceneId: string, tokenId: string, env: Pick<FoundryEnv, "game">) =>
  env.game.combats.some((combat) =>
    combat.combatants.some((each) => each.sceneId === sceneId && each.tokenId === tokenId && each.defeated),
  );

function tokenState(
  scene: SceneDocument,
  token: TokenDocument,
  profile: Profile,
  env: Pick<FoundryEnv, "game" | "foundry" | "CONFIG">,
  combatantKeys?: ReadonlySet<string>,
): TokenState {
  const actor = token.actor;
  const hp = actor ? readHp(actor) : null;
  const bars = profile.miniBars.filter((bar) => bar.source.type !== "temp" && bar.source.type !== "counter");
  const isTrackerDefeated = combatantKeys
    ? combatantKeys.has(`${scene.id}:${token.id}`)
    : combatantDefeated(scene.id, token.id, env);
  const defeatedStatus = env.CONFIG?.specialStatusEffects?.DEFEATED ?? "dead";
  return {
    tokenId: token.id,
    hidden: token.hidden,
    linked: token.actorLink,
    hp,
    defeated: isDefeated(hp, actor ? hasDefeatedStatus(actor, defeatedStatus) : false, isTrackerDefeated),
    effects: actor ? readEffects(actor) : [],
    bars: Object.fromEntries(bars.map((bar) => [bar.id, actor ? readBar(actor, bar.source) : null])),
  };
}

/** The actor holding an instance's profile: a form's source, else the bound token's base actor or the bound actor. */
export function profileActorOf(
  scene: SceneDocument,
  instance: Instance,
  env: Pick<FoundryEnv, "game"> = liveFoundryEnv(),
): ActorDocument | null | undefined {
  if (instance.source) return env.game.actors.get(instance.source);
  return instance.tokenId
    ? scene.tokens.get(instance.tokenId)?.baseActor
    : env.game.actors.get(instance.actorId ?? "");
}

/**
 * What the store needs for one instance; null when its token or actor is gone or has no readable profile. On a
 * form's token the name and image stay the boss's (spec §6); HP, mini-bars and statuses come from the token.
 */
export function subjectOf(
  scene: SceneDocument,
  instance: Instance,
  env: Pick<FoundryEnv, "game" | "foundry" | "CONFIG"> = liveFoundryEnv(),
  combatantKeys?: ReadonlySet<string>,
): SubjectInput | null {
  const actor = profileActorOf(scene, instance, env);
  let tokens: TokenDocument[];
  let name: string;
  if (instance.tokenId) {
    const token = scene.tokens.get(instance.tokenId);
    if (!token) return null;
    tokens = [token];
    // The boss keeps the name its own tokens carry, not the form token's.
    name = instance.source ? actor?.prototypeToken?.name || (actor?.name ?? "") : token.name;
  } else {
    tokens = scene.tokens.filter((token) => token.actorId === instance.actorId);
    name = actor?.name ?? "";
  }
  const profile = readProfile(actor?.flags[MODULE_ID]?.profile);
  if (!actor || !tokens.length || profile.status !== "ok") return null;
  return {
    instance,
    profile: profile.value,
    name,
    actorImg: instance.source ? actor.img : (tokens[0]?.actor ?? actor).img,
    tokens: tokens.map((token) => tokenState(scene, token, profile.value, env, combatantKeys)),
  };
}

function collectSceneSubjects(
  scene: SceneDocument,
  items: Instance[],
  warned: Set<string>,
  ranks: Rank[],
  withLooks: boolean,
  env: Pick<FoundryEnv, "game" | "foundry" | "CONFIG">,
  combatantKeys?: ReadonlySet<string>,
): SubjectInput[] {
  const subjects: SubjectInput[] = [];
  for (const instance of items) {
    try {
      const subject = subjectOf(scene, instance, env, combatantKeys);
      if (!subject) continue;
      if (withLooks) {
        // Bosses wear their profile's look and overrides, then their phases' overrides; elites their rank's look.
        const { profile } = subject;
        subject.look =
          profile.kind === "boss"
            ? lookStyleFor(profile.look, { ...profile.overrides, ...phaseEnterOf(subject).overrides }, env)
            : lookStyleFor(rankOf(ranks, profile.rank).rank.look, {}, env);
      }
      subjects.push(subject);
    } catch (error) {
      if (warned.has(instance.id)) continue;
      warned.add(instance.id);
      logger.warn("Bar or card skipped", instance.id, error);
    }
  }
  return subjects;
}

/**
 * The subjects of a scene's instances, each in its look. One broken instance is skipped (warned once) and never
 * hides the others.
 */
export function sceneSubjects(
  scene: SceneDocument,
  warned = new Set<string>(),
  env: Pick<FoundryEnv, "game" | "foundry" | "CONFIG"> = liveFoundryEnv(),
): SubjectInput[] {
  return collectSceneSubjects(scene, sceneItems(scene), warned, currentRanks(env), true, env);
}

/** Single-pass world read shared by the HUD render and every recompute watcher. */
function collectWorldSnapshot(
  warned: Set<string>,
  env: Pick<FoundryEnv, "game" | "canvas" | "foundry" | "CONFIG">,
): WorldSnapshot {
  const isGM = env.game.user.isGM;
  const isActiveGM = env.game.user.isActiveGM;
  const viewedScene = env.canvas?.scene ?? null;
  const activeScene = env.game.scenes.active ?? null;
  const ranks = currentRanks(env);
  const layout = currentLayout(viewedScene, env);
  const scale = uiScale(env);
  const combatantKeys = defeatedCombatantKeys(env);
  const scenes = new Map<string, SceneSnapshot>();
  const allEntries: SubjectSnapshot[] = [];

  for (const scene of env.game.scenes.values()) {
    const items = sceneItems(scene);
    const withLooks = scene.id === viewedScene?.id;
    const subjects = collectSceneSubjects(scene, items, warned, ranks, withLooks, env, combatantKeys);
    const entries: SubjectSnapshot[] = subjects.map((subject) => {
      const total = aggregate(subject.tokens, isGM);
      return { scene, subject, total, defeated: defeatedOf(subject, total) };
    });
    scenes.set(scene.id, { scene, items, entries });
    allEntries.push(...entries);
  }

  let viewedViews = EMPTY_VIEWS;
  if (viewedScene) {
    const existing = scenes.get(viewedScene.id);
    const viewedSubjects = existing
      ? existing.entries.map((entry) => entry.subject)
      : collectSceneSubjects(viewedScene, sceneItems(viewedScene), warned, ranks, true, env, combatantKeys);
    const viewer = {
      isGM,
      collapsed: collapsedIds(viewedScene.id, env),
      mayCollapse: layout.bosses.collapse,
      mayCollapseElites: layout.elites.collapse,
    };
    viewedViews = buildViews(viewedSubjects, ranks, viewer, layout.elites.max, peaks);
  }

  const activeEntries = activeScene ? (scenes.get(activeScene.id)?.entries ?? []) : [];
  return {
    isGM,
    isActiveGM,
    viewedSceneId: viewedScene?.id ?? null,
    activeSceneId: activeScene?.id ?? null,
    layout,
    uiScale: scale,
    viewedViews,
    scenes,
    allEntries,
    activeEntries,
  };
}
