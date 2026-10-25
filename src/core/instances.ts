import { PROFILE_ID, type DisplayMode, type ProfileKind } from "./profile";
import { isRecord, migrate, type ReadResult } from "./schema";

export const INSTANCES_VERSION = 2;

/** One shown boss bar or elite card, stored in the scene's flags; bound to one token or to an actor. */
export interface Instance {
  id: string;
  kind: ProfileKind;
  tokenId?: string;
  actorId?: string;
  /** Show order: the stack and each rank of the column follow it. */
  order: number;
  /** Manual counter values by mini-bar id; a missing value means full. */
  counters?: Record<string, number>;
  /** Ids of the profile's custom statuses switched on for this instance. */
  customStatuses?: string[];
}

export interface InstanceState {
  dataVersion: number;
  items: Instance[];
}

export type InstanceTarget = { tokenId: string } | { actorId: string };

const isInstance = (item: unknown): item is Instance =>
  isRecord(item) &&
  typeof item.id === "string" &&
  (item.kind === "boss" || item.kind === "elite") &&
  (typeof item.tokenId === "string") !== (typeof item.actorId === "string") &&
  Number.isFinite(item.order);

// v2 added elites and actor-bound instances; v1 items are valid v2 items.
const STEPS = { 1: (raw: Record<string, unknown>) => raw };

/** Counters and custom statuses are optional (stage 4): bad entries are dropped, the instance stays. */
function cleanInstance(item: Instance): Instance {
  const { counters, customStatuses } = item as { counters?: unknown; customStatuses?: unknown };
  const clean: Instance = { ...item };
  if (counters !== undefined) {
    const entries = isRecord(counters)
      ? Object.entries(counters).filter(
          ([id, value]) => PROFILE_ID.test(id) && typeof value === "number" && Number.isFinite(value),
        )
      : [];
    clean.counters = Object.fromEntries(entries) as Record<string, number>;
  }
  if (customStatuses !== undefined) {
    clean.customStatuses = Array.isArray(customStatuses)
      ? customStatuses.filter((id): id is string => typeof id === "string" && PROFILE_ID.test(id))
      : [];
  }
  return clean;
}

/** Missing flag = nothing shown. Malformed items are skipped; unknown keys are kept for the next write. */
export function readInstances(raw: unknown): ReadResult<InstanceState> {
  if (raw === undefined || raw === null) {
    return { status: "ok", value: { dataVersion: INSTANCES_VERSION, items: [] } };
  }
  if (!isRecord(raw) || !Array.isArray(raw.items)) return { status: "invalid" };
  const migrated = migrate(raw, INSTANCES_VERSION, STEPS);
  if (migrated.status !== "ok") return migrated;
  const items = (migrated.value.items as unknown[]).filter(isInstance).map(cleanInstance);
  return { status: "ok", value: { ...migrated.value, dataVersion: INSTANCES_VERSION, items } };
}

function updateItem(state: InstanceState, id: string, change: (item: Instance) => Instance): InstanceState {
  const item = state.items.find((each) => each.id === id);
  if (!item) return state;
  const next = change(item);
  return next === item
    ? state
    : { ...state, items: state.items.map((each) => (each === item ? next : each)) };
}

/** Sets a manual counter; the caller clamps the value to the profile's maximum. */
export function setCounter(state: InstanceState, id: string, barId: string, value: number): InstanceState {
  return updateItem(state, id, (item) =>
    item.counters?.[barId] === value ? item : { ...item, counters: { ...item.counters, [barId]: value } },
  );
}

/** Switches a custom status on or off; the same state when nothing changes. */
export function toggleStatus(
  state: InstanceState,
  id: string,
  statusId: string,
  active: boolean,
): InstanceState {
  return updateItem(state, id, (item) => {
    const current = item.customStatuses ?? [];
    if (current.includes(statusId) === active) return item;
    return {
      ...item,
      customStatuses: active ? [...current, statusId] : current.filter((each) => each !== statusId),
    };
  });
}

const sameTarget = (item: Instance, target: InstanceTarget) =>
  "tokenId" in target ? item.tokenId === target.tokenId : item.actorId === target.actorId;

/** Shows a bar or card; a target that is already shown keeps it (same state returned). */
export function showInstance(
  state: InstanceState,
  kind: ProfileKind,
  target: InstanceTarget,
  id: string,
): InstanceState {
  if (state.items.some((item) => sameTarget(item, target))) return state;
  const order = Math.max(0, ...state.items.map((item) => item.order)) + 1;
  return { ...state, items: [...state.items, { id, kind, ...target, order }] };
}

export function hideInstance(state: InstanceState, id: string): InstanceState {
  return pruneInstances(state, (item) => item.id !== id);
}

export function hideAll(state: InstanceState): InstanceState {
  return state.items.length ? { ...state, items: [] } : state;
}

/** Keeps the items that pass; returns the same state when nothing is removed, so callers can skip the write. */
export function pruneInstances(state: InstanceState, keep: (item: Instance) => boolean): InstanceState {
  const items = state.items.filter(keep);
  return items.length === state.items.length ? state : { ...state, items };
}

/** What the profile behind an instance says now; null — leave the instance alone. */
export type BindingInfo = (
  item: Instance,
) => { actorId: string; mode: DisplayMode; kind: ProfileKind } | null;

/**
 * After a profile changed its display mode or kind, rebinds shown instances to match: per-token items of an actor
 * merge into one per-actor item, a per-actor item splits into one item per token. Shown stays shown, in its place.
 * Returns the same state when nothing changes.
 */
export function rebindInstances(
  state: InstanceState,
  info: BindingInfo,
  tokensOf: (actorId: string) => string[],
  newId: () => string,
): InstanceState {
  const items: Instance[] = [];
  let changed = false;
  for (const item of state.items) {
    const now = info(item);
    if (!now) {
      items.push(item);
      continue;
    }
    const kind = now.kind;
    if (now.mode === "actor" && item.tokenId) {
      changed = true;
      if (items.some((each) => each.actorId === now.actorId)) continue;
      const merged: Instance = { ...item, kind, actorId: now.actorId };
      delete merged.tokenId;
      items.push(merged);
    } else if (now.mode === "token" && item.actorId) {
      changed = true;
      tokensOf(now.actorId).forEach((tokenId, index) => {
        if (items.some((each) => each.tokenId === tokenId)) return;
        const split: Instance = { ...item, id: index ? newId() : item.id, kind, tokenId };
        delete split.actorId;
        items.push(split);
      });
    } else {
      if (item.kind !== kind) changed = true;
      items.push(item.kind === kind ? item : { ...item, kind });
    }
  }
  return changed ? { ...state, items } : state;
}
