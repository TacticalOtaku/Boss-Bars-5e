import { isDocumentId, isRecord, migrate, text, type ReadResult } from "./schema";

export const PROFILE_VERSION = 2;

export type ProfileKind = "boss" | "elite";
/** "token" — one bar or card per token; "actor" — one for all the actor's tokens on the scene, with ×N. */
export type DisplayMode = "token" | "actor";

/** Run by the active GM: show at round 1, hide at the end of combat or on defeat, after `delay` seconds. */
export interface AutoShow {
  onCombatStart: boolean;
  hideOnCombatEnd: boolean;
  hideOnDefeat: boolean;
  delay: number;
}

/** A boss status of the GM's own, switched on per instance from the panel. */
export interface CustomStatus {
  id: string;
  name: string;
  img: string;
  /** Plain text. */
  description: string;
}

export interface StatusRules {
  /** Status ids and effect names hidden on this profile's bars and cards. */
  hidden: string[];
  /** Boss only; an elite profile keeps them untouched after a kind switch. */
  custom: CustomStatus[];
}

export type MiniBarSource =
  | { type: "temp" | "legact" | "legres" }
  | { type: "item"; itemId: string }
  /** `max` is a number or another `system.` path. */
  | { type: "path"; path: string; max: number | string }
  | { type: "counter"; max: number };

export interface MiniBar {
  id: string;
  label: string;
  view: "bar" | "pips";
  players: boolean;
  source: MiniBarSource;
}

interface ProfileBase {
  dataVersion: number;
  playerName: string;
  /** null — the actor's image. Images, GIF, WebP or a video (webm, mp4). */
  portrait: string | null;
  displayMode: DisplayMode;
  autoShow: AutoShow;
  statuses: StatusRules;
  miniBars: MiniBar[];
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
  displayMode: DisplayMode;
  playerName: string;
  title: string;
  portrait: string;
  size: number;
  rank: string;
  autoShow: AutoShow;
  statuses: StatusRules;
  miniBars: MiniBar[];
}

export const PROFILE_LIMITS = {
  text: 80,
  path: 2048,
  sizeMin: 50,
  sizeMax: 200,
  rank: 32,
  delayMax: 60,
  miniBars: 6,
  label: 40,
  fieldPath: 200,
  counterMax: 9999,
  pips: 10,
  hidden: 50,
  custom: 20,
  description: 200,
} as const;

export const DEFAULT_AUTO_SHOW: AutoShow = {
  onCombatStart: false,
  hideOnCombatEnd: true,
  hideOnDefeat: true,
  delay: 3,
};

/** Mini-bar and custom status ids reach DOM attributes and flag keys. */
export const PROFILE_ID = /^[A-Za-z0-9_-]{1,32}$/;
/** Only prepared `system.` data, no prototype walks. */
export const FIELD_PATH = /^system(\.(?!(?:__proto__|constructor|prototype)(?:\.|$))[A-Za-z0-9_]+)+$/;

export const isLegendary = (type: string) => type === "legact" || type === "legres";

export function defaultProfile(kind: ProfileKind = "boss"): Profile {
  const base = {
    dataVersion: PROFILE_VERSION,
    playerName: "",
    portrait: null,
    displayMode: "token",
  } as const;
  const stage4 = { autoShow: { ...DEFAULT_AUTO_SHOW }, statuses: { hidden: [], custom: [] }, miniBars: [] };
  return kind === "boss"
    ? { ...base, ...stage4, kind, title: "", size: 100 }
    : { ...base, ...stage4, kind, rank: "" };
}

const STEPS = { 1: (raw: Record<string, unknown>) => ({ ...raw, displayMode: "token" }) };

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

function readAutoShow(raw: unknown): AutoShow {
  const value = isRecord(raw) ? raw : {};
  const flag = (key: "onCombatStart" | "hideOnCombatEnd" | "hideOnDefeat") => {
    const stored = value[key];
    return typeof stored === "boolean" ? stored : DEFAULT_AUTO_SHOW[key];
  };
  return {
    onCombatStart: flag("onCombatStart"),
    hideOnCombatEnd: flag("hideOnCombatEnd"),
    hideOnDefeat: flag("hideOnDefeat"),
    delay: clamp(value.delay, 0, PROFILE_LIMITS.delayMax, DEFAULT_AUTO_SHOW.delay),
  };
}

function readCustomStatus(raw: unknown): CustomStatus | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !PROFILE_ID.test(raw.id)) return null;
  const name = text(raw.name, PROFILE_LIMITS.label);
  if (!name) return null;
  return {
    id: raw.id,
    name,
    img: text(raw.img, PROFILE_LIMITS.path),
    description: text(raw.description, PROFILE_LIMITS.description),
  };
}

function readStatuses(raw: unknown): StatusRules {
  const value = isRecord(raw) ? raw : {};
  const hidden: unknown[] = Array.isArray(value.hidden) ? value.hidden : [];
  const custom: unknown[] = Array.isArray(value.custom) ? value.custom : [];
  return {
    hidden: hidden
      .map((entry) => text(entry, PROFILE_LIMITS.text))
      .filter(Boolean)
      .slice(0, PROFILE_LIMITS.hidden),
    custom: custom.flatMap((entry) => readCustomStatus(entry) ?? []).slice(0, PROFILE_LIMITS.custom),
  };
}

const validPath = (value: unknown): value is string =>
  typeof value === "string" && value.length <= PROFILE_LIMITS.fieldPath && FIELD_PATH.test(value);

function readSource(raw: unknown): MiniBarSource | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case "temp":
    case "legact":
    case "legres":
      return { type: raw.type };
    case "item":
      return isDocumentId(raw.itemId) ? { type: "item", itemId: raw.itemId } : null;
    case "path": {
      const { path, max } = raw;
      if (!validPath(path)) return null;
      if (validPath(max)) return { type: "path", path, max };
      return typeof max === "number" && Number.isFinite(max) && max > 0 ? { type: "path", path, max } : null;
    }
    case "counter":
      return { type: "counter", max: Math.round(clamp(raw.max, 1, PROFILE_LIMITS.counterMax, 1)) };
    default:
      return null;
  }
}

function readMiniBar(raw: unknown): MiniBar | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !PROFILE_ID.test(raw.id)) return null;
  const source = readSource(raw.source);
  if (!source) return null;
  return {
    id: raw.id,
    label: text(raw.label, PROFILE_LIMITS.label),
    view: raw.view === "bar" || raw.view === "pips" ? raw.view : isLegendary(source.type) ? "pips" : "bar",
    players: raw.players !== false,
    source,
  };
}

/**
 * Reads a stored profile. Bad field values fall back to safe ones, bad mini-bars and custom statuses are left
 * out; unknown keys (including the other kind's fields after a kind switch) are kept for the next write.
 */
export function readProfile(raw: unknown): ReadResult<Profile> {
  if (raw === undefined || raw === null) return { status: "none" };
  if (!isRecord(raw) || (raw.kind !== "boss" && raw.kind !== "elite")) return { status: "invalid" };
  const migrated = migrate(raw, PROFILE_VERSION, STEPS);
  if (migrated.status !== "ok") return migrated;
  const value = migrated.value;
  const miniBars: unknown[] = Array.isArray(value.miniBars) ? value.miniBars : [];
  const base = {
    ...value,
    dataVersion: PROFILE_VERSION,
    playerName: text(value.playerName, PROFILE_LIMITS.text),
    portrait: text(value.portrait, PROFILE_LIMITS.path) || null,
    displayMode: value.displayMode === "actor" ? "actor" : "token",
    autoShow: readAutoShow(value.autoShow),
    statuses: readStatuses(value.statuses),
    miniBars: miniBars.flatMap((bar) => readMiniBar(bar) ?? []).slice(0, PROFILE_LIMITS.miniBars),
  } as const;
  if (value.kind === "elite") {
    return { status: "ok", value: { ...base, kind: "elite", rank: text(value.rank, PROFILE_LIMITS.rank) } };
  }
  return {
    status: "ok",
    value: {
      ...base,
      kind: "boss",
      title: text(value.title, PROFILE_LIMITS.text),
      size: clamp(value.size, PROFILE_LIMITS.sizeMin, PROFILE_LIMITS.sizeMax, 100),
    },
  };
}

const tooLong = (value: string, max: number) => value.trim().length > max;

function miniBarErrors(bar: MiniBar, at: string, errors: Record<string, string>): void {
  if (tooLong(bar.label, PROFILE_LIMITS.label)) errors[`${at}.label`] = "BB5E.Error.TooLong";
  const { source } = bar;
  if (source.type === "item" && !isDocumentId(source.itemId)) {
    errors[`${at}.source.itemId`] = "BB5E.Error.NoItem";
  }
  if (source.type === "path") {
    if (!validPath(source.path)) errors[`${at}.source.path`] = "BB5E.Error.FieldPath";
    if (typeof source.max === "string" ? !validPath(source.max) : !(source.max > 0)) {
      errors[`${at}.source.max`] = "BB5E.Error.BarMax";
    }
  }
  if (
    source.type === "counter" &&
    !(Number.isInteger(source.max) && source.max >= 1 && source.max <= PROFILE_LIMITS.counterMax)
  ) {
    errors[`${at}.source.max`] = "BB5E.Error.BarMax";
  }
}

/** Editor validation: i18n key of the problem for each invalid field of the chosen kind, keyed by field name. */
export function profileErrors(input: ProfileInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (tooLong(input.playerName, PROFILE_LIMITS.text)) errors.playerName = "BB5E.Error.TooLong";
  if (tooLong(input.portrait, PROFILE_LIMITS.path)) errors.portrait = "BB5E.Error.TooLong";
  if (input.kind === "boss") {
    if (tooLong(input.title, PROFILE_LIMITS.text)) errors.title = "BB5E.Error.TooLong";
    if (!(input.size >= PROFILE_LIMITS.sizeMin && input.size <= PROFILE_LIMITS.sizeMax)) {
      errors.size = "BB5E.Error.SizeRange";
    }
    input.statuses.custom.forEach((status, index) => {
      const at = `statuses.custom.${index}`;
      if (!status.name.trim() || tooLong(status.name, PROFILE_LIMITS.label)) {
        errors[`${at}.name`] = "BB5E.Error.StatusName";
      }
      if (tooLong(status.description, PROFILE_LIMITS.description)) {
        errors[`${at}.description`] = "BB5E.Error.TooLong";
      }
      if (tooLong(status.img, PROFILE_LIMITS.path)) errors[`${at}.img`] = "BB5E.Error.TooLong";
    });
  } else if (!input.rank || input.rank.length > PROFILE_LIMITS.rank) {
    errors.rank = "BB5E.Error.NoRank";
  }
  if (!(input.autoShow.delay >= 0 && input.autoShow.delay <= PROFILE_LIMITS.delayMax)) {
    errors["autoShow.delay"] = "BB5E.Error.DelayRange";
  }
  input.miniBars.forEach((bar, index) => miniBarErrors(bar, `miniBars.${index}`, errors));
  return errors;
}
