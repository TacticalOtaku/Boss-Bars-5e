import { DATA_VERSION, isRecord, versionStatus, type ReadResult } from "./schema";

/** Boss profile, stored in the base actor's flags. Fields of later stages are added with their stages. */
export interface BossProfile {
  dataVersion: number;
  kind: "boss";
  playerName: string;
  title: string;
  /** null — the actor's image. Images, GIF, WebP or a video (webm, mp4). */
  portrait: string | null;
  /** Size in percent. */
  size: number;
}

export type ProfileInput = Pick<BossProfile, "playerName" | "title" | "size"> & { portrait: string };

export const PROFILE_LIMITS = { text: 80, path: 2048, sizeMin: 50, sizeMax: 200 } as const;

export function defaultProfile(): BossProfile {
  return { dataVersion: DATA_VERSION, kind: "boss", playerName: "", title: "", portrait: null, size: 100 };
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Reads a stored profile. Bad field values fall back to safe ones; unknown keys are kept for the next write. */
export function readProfile(raw: unknown): ReadResult<BossProfile> {
  if (raw === undefined || raw === null) return { status: "none" };
  if (!isRecord(raw) || raw.kind !== "boss") return { status: "invalid" };
  const version = versionStatus(raw);
  if (version !== "ok") return { status: version };
  const size = Number(raw.size);
  return {
    status: "ok",
    value: {
      ...raw,
      dataVersion: DATA_VERSION,
      kind: "boss",
      playerName: text(raw.playerName, PROFILE_LIMITS.text),
      title: text(raw.title, PROFILE_LIMITS.text),
      portrait: text(raw.portrait, PROFILE_LIMITS.path) || null,
      size: Number.isFinite(size)
        ? Math.min(PROFILE_LIMITS.sizeMax, Math.max(PROFILE_LIMITS.sizeMin, size))
        : defaultProfile().size,
    },
  };
}

/** Editor validation: i18n key of the problem for each invalid field. */
export function profileErrors(input: ProfileInput): Partial<Record<keyof ProfileInput, string>> {
  const errors: Partial<Record<keyof ProfileInput, string>> = {};
  if (input.playerName.trim().length > PROFILE_LIMITS.text) errors.playerName = "BB5E.Error.TooLong";
  if (input.title.trim().length > PROFILE_LIMITS.text) errors.title = "BB5E.Error.TooLong";
  if (input.portrait.trim().length > PROFILE_LIMITS.path) errors.portrait = "BB5E.Error.TooLong";
  if (!(input.size >= PROFILE_LIMITS.sizeMin && input.size <= PROFILE_LIMITS.sizeMax)) {
    errors.size = "BB5E.Error.SizeRange";
  }
  return errors;
}
