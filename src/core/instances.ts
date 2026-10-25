import { DATA_VERSION, isRecord, versionStatus, type ReadResult } from "./schema";

/** One shown boss bar, stored in the scene's flags. */
export interface Instance {
  id: string;
  kind: "boss";
  tokenId: string;
  /** Show order: the stack follows it. */
  order: number;
}

export interface InstanceState {
  dataVersion: number;
  items: Instance[];
}

const isInstance = (item: unknown): item is Instance =>
  isRecord(item) &&
  typeof item.id === "string" &&
  item.kind === "boss" &&
  typeof item.tokenId === "string" &&
  Number.isFinite(item.order);

/** Missing flag = nothing shown. Malformed items are skipped; unknown keys are kept for the next write. */
export function readInstances(raw: unknown): ReadResult<InstanceState> {
  if (raw === undefined || raw === null)
    return { status: "ok", value: { dataVersion: DATA_VERSION, items: [] } };
  if (!isRecord(raw) || !Array.isArray(raw.items)) return { status: "invalid" };
  const version = versionStatus(raw);
  if (version !== "ok") return { status: version };
  return { status: "ok", value: { ...raw, dataVersion: DATA_VERSION, items: raw.items.filter(isInstance) } };
}

/** Shows the token's bar; a token that is already shown keeps its bar (same state returned). */
export function showInstance(state: InstanceState, tokenId: string, id: string): InstanceState {
  if (state.items.some((item) => item.tokenId === tokenId)) return state;
  const order = Math.max(0, ...state.items.map((item) => item.order)) + 1;
  return { ...state, items: [...state.items, { id, kind: "boss", tokenId, order }] };
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
