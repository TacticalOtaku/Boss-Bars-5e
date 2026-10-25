/** Current version of every stored schema. shortcut: no migration code until a schema reaches version 2. */
export const DATA_VERSION = 1;

/** "none" — nothing stored; "newer" — written by a newer module version, shown but never rewritten. */
export type ReadResult<T> = { status: "ok"; value: T } | { status: "none" | "newer" | "invalid" };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function versionStatus(raw: Record<string, unknown>): "ok" | "newer" | "invalid" {
  const version = raw.dataVersion;
  if (!Number.isInteger(version) || (version as number) < 1) return "invalid";
  return (version as number) > DATA_VERSION ? "newer" : "ok";
}

/** Foundry document ids: 16 alphanumerics. Ids from flags and queries are checked before use. */
export function isDocumentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{16}$/.test(value);
}
