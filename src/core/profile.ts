import { LOOK_ID, readOverrides, type Category } from "./look/schema";
import { MUSIC_LIMITS, readMusicSource, type MusicSource } from "./music";
import { quoteErrors, readQuotes, type Quote } from "./quotes";
import { isDocumentId, isRecord, migrate, PROFILE_ID, text, type ReadResult } from "./schema";

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

/** Which point of the portrait stays in the frame (0–100%) and how close it is (100–300%). */
export interface PortraitFocus {
  x: number;
  y: number;
  zoom: number;
}

interface ProfileBase {
  dataVersion: number;
  playerName: string;
  /** null — the actor's image. Images, GIF, WebP or a video (webm, mp4). */
  portrait: string | null;
  /** Missing — centred at full size. */
  portraitFocus?: PortraitFocus;
  displayMode: DisplayMode;
  autoShow: AutoShow;
  statuses: StatusRules;
  miniBars: MiniBar[];
}

export type PhaseTrigger =
  /** The first phase only: the start of the fight. */
  | { type: "start" }
  /** Below this share of HP, in %. */
  | { type: "hp"; below: number }
  /** The bar moves onto a token of another actor; 0 HP before it is a transition, not a defeat. */
  | { type: "form"; actorId: string }
  | { type: "manual" };

/** What entering a phase changes; a missing field keeps what the phases before it set. */
export interface PhaseEnter {
  playerName?: string;
  title?: string;
  portrait?: string;
  /** Look categories, the phase change effect ("motion") among them. */
  overrides?: Partial<Record<Category, string>>;
  /** The music from this phase on (stage 8). */
  music?: MusicSource;
}

export interface Phase {
  id: string;
  /** Empty: "Phase II" by number; the first phase then shows no label. */
  label: string;
  trigger: PhaseTrigger;
  enter: PhaseEnter;
}

/** "segments": the bar is all HP, thresholds are ticks; "refill": the bar is the HP inside the current phase. */
export type FillMode = "segments" | "refill";

/** Stored in the world actor's flags; one kind per actor. Fields of later stages are added with their stages. */
export interface BossProfile extends ProfileBase {
  kind: "boss";
  /** Look id; null — "Classic RPG". Elites take their rank's look instead. */
  look: string | null;
  /** Category presets that replace the look's own. */
  overrides: Partial<Record<Category, string>>;
  title: string;
  /** Size in percent. */
  size: number;
  /** Empty: no phases. The first one is the start of the fight. */
  phases: Phase[];
  fillMode: FillMode;
  /** Players see the threshold ticks. */
  playerTicks: boolean;
  quotes: Quote[];
  /** null — no music of its own. */
  music: MusicSource | null;
  /** The leading boss's music plays: highest priority first. */
  musicPriority: number;
  /** Transition length, ms. */
  musicFade: number;
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
  portraitFocus?: PortraitFocus;
  size: number;
  rank: string;
  autoShow: AutoShow;
  statuses: StatusRules;
  miniBars: MiniBar[];
  phases: Phase[];
  fillMode: FillMode;
  playerTicks: boolean;
  quotes: Quote[];
  music: MusicSource | null;
  musicPriority: number;
  musicFade: number;
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
  phases: 6,
  phaseLabel: 40,
  thresholdMin: 5,
  thresholdMax: 95,
  thresholdGap: 8,
  zoomMax: 300,
} as const;

export const DEFAULT_AUTO_SHOW: AutoShow = {
  onCombatStart: false,
  hideOnCombatEnd: true,
  hideOnDefeat: true,
  delay: 3,
};

export { PROFILE_ID };
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
    ? {
        ...base,
        ...stage4,
        kind,
        look: null,
        overrides: {},
        title: "",
        size: 100,
        phases: [],
        fillMode: "segments",
        playerTicks: true,
        quotes: [],
        music: null,
        musicPriority: 0,
        musicFade: MUSIC_LIMITS.fadeDefault,
      }
    : { ...base, ...stage4, kind, rank: "" };
}

const STEPS = { 1: (raw: Record<string, unknown>) => ({ ...raw, displayMode: "token" }) };

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export const CENTRED_FOCUS: PortraitFocus = { x: 50, y: 50, zoom: 100 };

export const readFocus = (raw: unknown): PortraitFocus | undefined =>
  isRecord(raw)
    ? {
        x: clamp(raw.x, 0, 100, 50),
        y: clamp(raw.y, 0, 100, 50),
        zoom: clamp(raw.zoom, 100, PROFILE_LIMITS.zoomMax, 100),
      }
    : undefined;

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

function readTrigger(raw: unknown, first: boolean): PhaseTrigger {
  if (first) return { type: "start" };
  if (!isRecord(raw)) return { type: "manual" };
  switch (raw.type) {
    case "hp":
      return {
        type: "hp",
        below: clamp(raw.below, PROFILE_LIMITS.thresholdMin, PROFILE_LIMITS.thresholdMax, 50),
      };
    case "form":
      return isDocumentId(raw.actorId) ? { type: "form", actorId: raw.actorId } : { type: "manual" };
    case "start":
    case "manual":
      return { type: "manual" };
    default:
      // A newer version's trigger: it acts as manual (core/phases) and is written back as it is (ticket #12).
      return typeof raw.type === "string" ? (raw as unknown as PhaseTrigger) : { type: "manual" };
  }
}

function readEnter(raw: unknown): PhaseEnter {
  if (!isRecord(raw)) return {};
  const enter: PhaseEnter = {};
  if (typeof raw.playerName === "string") enter.playerName = text(raw.playerName, PROFILE_LIMITS.text);
  if (typeof raw.title === "string") enter.title = text(raw.title, PROFILE_LIMITS.text);
  if (typeof raw.portrait === "string") enter.portrait = text(raw.portrait, PROFILE_LIMITS.path);
  if (raw.overrides !== undefined) enter.overrides = readOverrides(raw.overrides);
  const music = readMusicSource(raw.music);
  if (music) enter.music = music;
  return enter;
}

/** Bad or duplicate ids drop the phase (ticket #12: id collisions); unknown keys stay. */
function readPhases(raw: unknown): Phase[] {
  const phases: Phase[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (phases.length >= PROFILE_LIMITS.phases) break;
    if (!isRecord(entry) || typeof entry.id !== "string" || !PROFILE_ID.test(entry.id)) continue;
    if (phases.some((phase) => phase.id === entry.id)) continue;
    phases.push({
      ...entry,
      id: entry.id,
      label: text(entry.label, PROFILE_LIMITS.phaseLabel),
      trigger: readTrigger(entry.trigger, phases.length === 0),
      enter: readEnter(entry.enter),
    });
  }
  return phases;
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
    portraitFocus: readFocus(value.portraitFocus),
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
      look: typeof value.look === "string" && LOOK_ID.test(value.look) ? value.look : null,
      overrides: readOverrides(value.overrides),
      title: text(value.title, PROFILE_LIMITS.text),
      size: clamp(value.size, PROFILE_LIMITS.sizeMin, PROFILE_LIMITS.sizeMax, 100),
      phases: readPhases(value.phases),
      fillMode: value.fillMode === "refill" ? "refill" : "segments",
      playerTicks: value.playerTicks !== false,
      quotes: readQuotes(value.quotes),
      music: readMusicSource(value.music),
      musicPriority: Math.round(clamp(value.musicPriority, 0, MUSIC_LIMITS.priorityMax, 0)),
      musicFade: Math.round(clamp(value.musicFade, 0, MUSIC_LIMITS.fadeMax, MUSIC_LIMITS.fadeDefault)),
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

/**
 * Phase rows: thresholds 5–95% that fall and keep 8% apart within one HP pool (a form starts a new pool), a form
 * needs its actor, labels and entry texts fit their limits.
 */
function phaseErrors(phases: Phase[], errors: Record<string, string>): void {
  let previous: number | null = null;
  phases.forEach((phase, index) => {
    const at = `phases.${index}`;
    const { trigger, enter } = phase;
    if (tooLong(phase.label, PROFILE_LIMITS.phaseLabel)) errors[`${at}.label`] = "BB5E.Error.TooLong";
    if (tooLong(enter.playerName ?? "", PROFILE_LIMITS.text))
      errors[`${at}.enter.playerName`] = "BB5E.Error.TooLong";
    if (tooLong(enter.title ?? "", PROFILE_LIMITS.text)) errors[`${at}.enter.title`] = "BB5E.Error.TooLong";
    if (tooLong(enter.portrait ?? "", PROFILE_LIMITS.path))
      errors[`${at}.enter.portrait`] = "BB5E.Error.TooLong";
    if (trigger.type === "form") {
      if (!isDocumentId(trigger.actorId)) errors[`${at}.actorId`] = "BB5E.Error.NoFormActor";
      previous = null;
    } else if (trigger.type === "hp") {
      const { below } = trigger;
      if (!(below >= PROFILE_LIMITS.thresholdMin && below <= PROFILE_LIMITS.thresholdMax)) {
        errors[`${at}.below`] = "BB5E.Error.ThresholdRange";
      } else if (previous !== null && previous - below < PROFILE_LIMITS.thresholdGap) {
        errors[`${at}.below`] = "BB5E.Error.ThresholdGap";
      }
      previous = below;
    }
  });
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
    phaseErrors(input.phases, errors);
    if (!(
      Number.isInteger(input.musicPriority) &&
      input.musicPriority >= 0 &&
      input.musicPriority <= MUSIC_LIMITS.priorityMax
    )) {
      errors.musicPriority = "BB5E.Error.PriorityRange";
    }
    if (!(input.musicFade >= 0 && input.musicFade <= MUSIC_LIMITS.fadeMax))
      errors.musicFade = "BB5E.Error.FadeRange";
    quoteErrors(
      input.quotes,
      input.phases.map((phase) => phase.id),
      errors,
    );
  } else if (!input.rank || input.rank.length > PROFILE_LIMITS.rank) {
    errors.rank = "BB5E.Error.NoRank";
  }
  if (!(input.autoShow.delay >= 0 && input.autoShow.delay <= PROFILE_LIMITS.delayMax)) {
    errors["autoShow.delay"] = "BB5E.Error.DelayRange";
  }
  input.miniBars.forEach((bar, index) => miniBarErrors(bar, `miniBars.${index}`, errors));
  return errors;
}
