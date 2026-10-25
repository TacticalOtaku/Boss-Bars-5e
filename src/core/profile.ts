import { isRecord, migrate, text, type ReadResult } from "./schema";

export const PROFILE_VERSION = 2;

export type ProfileKind = "boss" | "elite";
/** "token" — one bar or card per token; "actor" — one for all the actor's tokens on the scene, with ×N. */
export type DisplayMode = "token" | "actor";

interface ProfileBase {
  dataVersion: number;
  playerName: string;
  /** null — the actor's image. Images, GIF, WebP or a video (webm, mp4). */
  portrait: string | null;
  displayMode: DisplayMode;
}

/** Stored in the world actor's flags; one kind per actor. Fields of later stages are added with their stages. */
export interface BossProfile extends ProfileBase {
  kind: "boss";
  title: string;
  /** Size in percent. */
  size: number;
}

export interface EliteProfile extends ProfileBase {
  kind: "elite";
  /** Rank id; an unknown id falls back to the weakest rank. */
  rank: string;
}

export type Profile = BossProfile | EliteProfile;

export interface ProfileInput {
  kind: ProfileKind;
  playerName: string;
  title: string;
  portrait: string;
  size: number;
  rank: string;
}

export const PROFILE_LIMITS = { text: 80, path: 2048, sizeMin: 50, sizeMax: 200, rank: 32 } as const;

export function defaultProfile(kind: ProfileKind = "boss"): Profile {
  const base = {
    dataVersion: PROFILE_VERSION,
    playerName: "",
    portrait: null,
    displayMode: "token",
  } as const;
  return kind === "boss" ? { ...base, kind, title: "", size: 100 } : { ...base, kind, rank: "" };
}

const STEPS = { 1: (raw: Record<string, unknown>) => ({ ...raw, displayMode: "token" }) };

/**
 * Reads a stored profile. Bad field values fall back to safe ones; unknown keys (including the other kind's
 * fields after a kind switch) are kept for the next write.
 */
export function readProfile(raw: unknown): ReadResult<Profile> {
  if (raw === undefined || raw === null) return { status: "none" };
  if (!isRecord(raw) || (raw.kind !== "boss" && raw.kind !== "elite")) return { status: "invalid" };
  const migrated = migrate(raw, PROFILE_VERSION, STEPS);
  if (migrated.status !== "ok") return migrated;
  const value = migrated.value;
  const base = {
    ...value,
    dataVersion: PROFILE_VERSION,
    playerName: text(value.playerName, PROFILE_LIMITS.text),
    portrait: text(value.portrait, PROFILE_LIMITS.path) || null,
    displayMode: value.displayMode === "actor" ? "actor" : "token",
  } as const;
  if (value.kind === "elite") {
    return { status: "ok", value: { ...base, kind: "elite", rank: text(value.rank, PROFILE_LIMITS.rank) } };
  }
  const size = Number(value.size);
  return {
    status: "ok",
    value: {
      ...base,
      kind: "boss",
      title: text(value.title, PROFILE_LIMITS.text),
      size: Number.isFinite(size)
        ? Math.min(PROFILE_LIMITS.sizeMax, Math.max(PROFILE_LIMITS.sizeMin, size))
        : 100,
    },
  };
}

/** Editor validation: i18n key of the problem for each invalid field of the chosen kind. */
export function profileErrors(input: ProfileInput): Partial<Record<keyof ProfileInput, string>> {
  const errors: Partial<Record<keyof ProfileInput, string>> = {};
  if (input.playerName.trim().length > PROFILE_LIMITS.text) errors.playerName = "BB5E.Error.TooLong";
  if (input.portrait.trim().length > PROFILE_LIMITS.path) errors.portrait = "BB5E.Error.TooLong";
  if (input.kind === "boss") {
    if (input.title.trim().length > PROFILE_LIMITS.text) errors.title = "BB5E.Error.TooLong";
    if (!(input.size >= PROFILE_LIMITS.sizeMin && input.size <= PROFILE_LIMITS.sizeMax)) {
      errors.size = "BB5E.Error.SizeRange";
    }
  } else if (!input.rank || input.rank.length > PROFILE_LIMITS.rank) {
    errors.rank = "BB5E.Error.NoRank";
  }
  return errors;
}
