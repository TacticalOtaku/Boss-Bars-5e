import { isRecord, migrate, text, type ReadResult } from "./schema";

export const RANKS_VERSION = 1;

/** A step of the GM's ordered list: the higher, the stronger. The icon is always on the card. */
export interface Rank {
  id: string;
  name: string;
  color: string;
  parts: { name: boolean; fill: boolean; statuses: boolean };
  /** Icon side in px. */
  size: number;
}

export interface RankState {
  dataVersion: number;
  items: Rank[];
}

export const RANK_LIMITS = { name: 40, sizeMin: 24, sizeMax: 64, count: 20 } as const;
const FALLBACK_COLOR = "#6a6a7a";
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[A-Za-z0-9_-]{1,32}$/;

/** The four ranks of the mock-up (prototype/hud-variants); names come from the translation. */
export function defaultRanks(names: readonly [string, string, string, string]): Rank[] {
  const parts = (name: boolean, fill: boolean, statuses: boolean) => ({ name, fill, statuses });
  return [
    { id: "captain", name: names[0], color: "#e5c06a", parts: parts(true, true, true), size: 40 },
    { id: "veteran", name: names[1], color: "#b0b8c8", parts: parts(true, true, false), size: 34 },
    { id: "fighter", name: names[2], color: "#9a7b5c", parts: parts(true, false, false), size: 30 },
    { id: "guard", name: names[3], color: FALLBACK_COLOR, parts: parts(false, false, false), size: 30 },
  ];
}

/** Colour and id go into CSS and attributes, so both are checked against strict patterns. */
function readRank(raw: unknown): Rank | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !ID.test(raw.id)) return null;
  const parts = isRecord(raw.parts) ? raw.parts : {};
  const size = Number(raw.size);
  return {
    id: raw.id,
    name: text(raw.name, RANK_LIMITS.name),
    color: typeof raw.color === "string" && HEX.test(raw.color) ? raw.color.toLowerCase() : FALLBACK_COLOR,
    parts: { name: Boolean(parts.name), fill: Boolean(parts.fill), statuses: Boolean(parts.statuses) },
    size: Number.isFinite(size) ? Math.min(RANK_LIMITS.sizeMax, Math.max(RANK_LIMITS.sizeMin, size)) : 30,
  };
}

/** Nothing saved (or an emptied list) means the defaults; a saved list is normalised. */
export function readRanks(raw: unknown, defaults: Rank[]): ReadResult<RankState> {
  const fallback = { status: "ok", value: { dataVersion: RANKS_VERSION, items: defaults } } as const;
  if (!isRecord(raw) || raw.dataVersion === undefined) return fallback;
  if (!Array.isArray(raw.items)) return { status: "invalid" };
  const migrated = migrate(raw, RANKS_VERSION, {});
  if (migrated.status !== "ok") return migrated;
  const items = (migrated.value.items as unknown[]).flatMap((item) => readRank(item) ?? []);
  return items.length
    ? { status: "ok", value: { ...migrated.value, dataVersion: RANKS_VERSION, items } }
    : fallback;
}

/** An elite whose rank was deleted takes the weakest one. */
export function rankOf(ranks: Rank[], id: string): { rank: Rank; index: number } {
  const index = ranks.findIndex((rank) => rank.id === id);
  const at = index >= 0 ? index : ranks.length - 1;
  const rank = ranks[at];
  // readRanks never yields an empty list: it falls back to the defaults.
  if (!rank) throw new Error("No elite ranks");
  return { rank, index: at };
}

/** Editor validation; index -1 is about the list as a whole. */
export function rankErrors(ranks: Rank[]): { index: number; key: string }[] {
  if (!ranks.length) return [{ index: -1, key: "BB5E.Error.NoRanks" }];
  if (ranks.length > RANK_LIMITS.count) return [{ index: -1, key: "BB5E.Error.TooManyRanks" }];
  return ranks.flatMap((rank, index) => {
    if (!rank.name.trim() || rank.name.length > RANK_LIMITS.name)
      return [{ index, key: "BB5E.Error.RankName" }];
    if (!(rank.size >= RANK_LIMITS.sizeMin && rank.size <= RANK_LIMITS.sizeMax)) {
      return [{ index, key: "BB5E.Error.RankSize" }];
    }
    return [];
  });
}
