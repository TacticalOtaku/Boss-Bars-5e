/** "none" — nothing stored; "newer" — written by a newer module version, shown but never rewritten. */
export type ReadResult<T> = { status: "ok"; value: T } | { status: "none" | "newer" | "invalid" };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Raw = Record<string, unknown>;

/**
 * Brings a stored record to `current` through `steps[n]` (version n → n + 1). Each schema has its own version, so a
 * module that only knows an older one sees "newer" and leaves the data alone.
 */
export function migrate(
  raw: Raw,
  current: number,
  steps: Record<number, (raw: Raw) => Raw>,
): { status: "ok"; value: Raw } | { status: "newer" | "invalid" } {
  let version = raw.dataVersion;
  if (!Number.isInteger(version) || (version as number) < 1) return { status: "invalid" };
  if ((version as number) > current) return { status: "newer" };
  let value = raw;
  while ((version as number) < current) {
    const step = steps[version as number];
    if (!step) return { status: "invalid" };
    value = { ...step(value), dataVersion: (version as number) + 1 };
    version = value.dataVersion;
  }
  return { status: "ok", value };
}

/** Foundry document ids: 16 alphanumerics. Ids from flags and queries are checked before use. */
export function isDocumentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{16}$/.test(value);
}

export const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Ids of profile entries (mini-bars, statuses, phases, quotes) reach DOM attributes and flag keys. */
export const PROFILE_ID = /^[A-Za-z0-9_-]{1,32}$/;
