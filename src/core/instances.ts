import type { PhaseState } from "./phases";
import { QUOTE_LIMITS, type QuoteState, type ShownQuote } from "./quotes";
import { PROFILE_ID, type DisplayMode, type ProfileKind } from "./profile";
import { isDocumentId, isRecord, migrate, type ReadResult } from "./schema";

/** v3: a form moves an instance onto another actor's token, the profile stays in `source` (0.6.0 would prune it). */
export const INSTANCES_VERSION = 3;

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
  /** Boss phases (stage 6); missing — the first phase, mark 100. */
  phase?: PhaseState;
  /** The actor holding the profile once a form moved the instance onto another actor's token or tokens. */
  source?: string;
  /** Per quote: cooldown, "already said", the pool cursor (stage 7). */
  quoteState?: Record<string, QuoteState>;
  /** The quote on screen. */
  quote?: ShownQuote;
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

// v2 added elites and actor-bound instances, v3 forms; older items are valid newer items.
const STEPS = { 1: (raw: Record<string, unknown>) => raw, 2: (raw: Record<string, unknown>) => raw };

function readPhaseState(raw: unknown): PhaseState | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string" || !PROFILE_ID.test(raw.id)) return undefined;
  const mark = typeof raw.mark === "number" && Number.isFinite(raw.mark) ? raw.mark : 100;
  const state: PhaseState = { id: raw.id, mark: Math.min(100, Math.max(0, mark)) };
  if (raw.waiting === true) state.waiting = true;
  return state;
}

const count = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined;

function readQuoteState(raw: unknown): Record<string, QuoteState> {
  const states: Record<string, QuoteState> = {};
  for (const [id, value] of Object.entries(isRecord(raw) ? raw : {})) {
    if (!PROFILE_ID.test(id) || !isRecord(value) || typeof value.fight !== "string") continue;
    const state: QuoteState = { fight: value.fight };
    const round = count(value.round);
    const cursor = count(value.cursor);
    if (round !== undefined) state.round = round;
    if (cursor !== undefined) state.cursor = cursor;
    if (value.done === true) state.done = true;
    states[id] = state;
  }
  return states;
}

/** The quote on screen reaches every client as text: checked like any other text. */
function readShownQuote(raw: unknown): ShownQuote | undefined {
  if (!isRecord(raw) || typeof raw.key !== "string" || typeof raw.text !== "string") return undefined;
  const { priority, at, duration } = raw;
  if (![priority, at, duration].every((value) => typeof value === "number" && Number.isFinite(value)))
    return undefined;
  return {
    key: raw.key.slice(0, 80),
    text: raw.text.slice(0, QUOTE_LIMITS.text),
    priority: priority as number,
    at: at as number,
    duration: Math.min(QUOTE_LIMITS.durationMax, Math.max(0, duration as number)),
  };
}

/** Counters, statuses, phase, source and quotes are optional: bad entries are dropped, the instance stays. */
function cleanInstance(item: Instance): Instance {
  const { counters, customStatuses, phase, source, quoteState, quote } = item as {
    counters?: unknown;
    customStatuses?: unknown;
    phase?: unknown;
    source?: unknown;
    quoteState?: unknown;
    quote?: unknown;
  };
  const clean: Instance = { ...item };
  if (quoteState !== undefined) clean.quoteState = readQuoteState(quoteState);
  if (quote !== undefined) {
    const shown = readShownQuote(quote);
    if (shown) clean.quote = shown;
    else delete clean.quote;
  }
  if (phase !== undefined) {
    const state = readPhaseState(phase);
    if (state) clean.phase = state;
    else delete clean.phase;
  }
  if (source !== undefined && !isDocumentId(source)) delete clean.source;
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

/**
 * Sets the phase state, and the profile's actor when a form starts waiting (the fallen token may go meanwhile).
 * The same state when nothing changes.
 */
export function setPhaseState(
  state: InstanceState,
  id: string,
  phase: PhaseState,
  source?: string,
): InstanceState {
  return updateItem(state, id, (item) => {
    const same =
      item.phase?.id === phase.id &&
      item.phase.mark === phase.mark &&
      item.phase.waiting === phase.waiting &&
      (source === undefined || item.source === source);
    return same ? item : { ...item, phase, ...(source ? { source } : {}) };
  });
}

/**
 * A form begins: the instance moves onto the form's token (or, one per actor, onto the form actor), keeping its
 * place, and remembers the actor holding the profile. Another instance already on that target goes.
 */
export function moveInstance(
  state: InstanceState,
  id: string,
  target: InstanceTarget,
  source: string,
  phase: PhaseState,
): InstanceState {
  const item = state.items.find((each) => each.id === id);
  if (!item) return state;
  const moved: Instance = { ...item, ...target, source, phase };
  if ("tokenId" in target) delete moved.actorId;
  else delete moved.tokenId;
  const items = state.items.flatMap((each) =>
    each === item ? [moved] : sameTarget(each, target) ? [] : [each],
  );
  return { ...state, items };
}

/** A quote goes on screen; the speaking quote's state is kept (a free text has none). */
export function setQuote(
  state: InstanceState,
  id: string,
  shown: ShownQuote,
  quoteId?: string,
  quoteState?: QuoteState,
): InstanceState {
  return updateItem(state, id, (item) => ({
    ...item,
    quote: shown,
    ...(quoteId && quoteState ? { quoteState: { ...item.quoteState, [quoteId]: quoteState } } : {}),
  }));
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
    // A form's instance follows its form, not the display mode of the actor under it.
    const now = item.source ? null : info(item);
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
