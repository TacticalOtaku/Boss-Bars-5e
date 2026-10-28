import { isCategory, type Category } from "./look/schema";
import { readMusicSource, type MusicSource } from "./music";
import {
  readFocus,
  type CustomStatus,
  type MiniBar,
  type MiniBarSource,
  type Phase,
  type PhaseEnter,
  type PhaseTrigger,
  type ProfileInput,
} from "./profile";
import { QUOTE_TRIGGER_TYPES, type Quote, type QuoteTrigger } from "./quotes";
import { isRecord } from "./schema";

function quoteTriggerOf(raw: Record<string, unknown>): QuoteTrigger {
  const percent = raw.percent === null ? Number.NaN : Number(raw.percent);
  switch (raw.trigger) {
    case "phase":
      return { type: "phase", phaseId: str(raw.phaseId) };
    case "below":
    case "damage":
      return { type: raw.trigger, percent };
    case "status":
      return { type: "status", status: str(raw.status).trim() };
    case "newer":
      return (newerTrigger(str(raw.newer)) as QuoteTrigger | null) ?? { type: "manual" };
    default:
      return QUOTE_TRIGGER_TYPES.includes(str(raw.trigger))
        ? { type: raw.trigger as "appear" }
        : { type: "manual" };
  }
}

/** A quote row of the form: the pool comes one variant per line. */
function quoteOf(raw: Record<string, unknown>, newId: () => string): Quote {
  // A number field comes as a number, or null when empty ("auto").
  const duration =
    raw.duration === null || raw.duration === undefined || raw.duration === "" ? null : raw.duration;
  return {
    id: str(raw.id) || newId(),
    trigger: quoteTriggerOf(raw),
    texts: str(raw.texts)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    order: raw.order === "cycle" ? "cycle" : "random",
    cooldown: raw.cooldown === null ? Number.NaN : Number(raw.cooldown),
    once: raw.once === true,
    duration: duration === null ? null : Number(duration),
  };
}

const entries = (value: unknown): Record<string, unknown>[] =>
  isRecord(value) ? Object.values(value).filter(isRecord) : [];
const str = (value: unknown) => (typeof value === "string" ? value : "");

function sourceOf(raw: Record<string, unknown>): MiniBarSource {
  switch (raw.type) {
    case "item":
      return { type: "item", itemId: str(raw.itemId) };
    case "path": {
      const max = str(raw.max).trim();
      return { type: "path", path: str(raw.path).trim(), max: /^\d+(\.\d+)?$/.test(max) ? Number(max) : max };
    }
    case "counter":
      return { type: "counter", max: Number(raw.counterMax) };
    case "legact":
    case "legres":
      return { type: raw.type };
    default:
      return { type: "temp" };
  }
}

export function musicFrom(value: string): MusicSource | null {
  const [type, playlistId, soundId] = value.split(":");
  return readMusicSource({ type, playlistId, soundId });
}

/** A newer version's trigger rides along as JSON in a hidden field and is written back unchanged. */
function newerTrigger(json: string): PhaseTrigger | null {
  try {
    const raw: unknown = JSON.parse(json);
    return isRecord(raw) && typeof raw.type === "string" ? (raw as unknown as PhaseTrigger) : null;
  } catch {
    return null;
  }
}

function triggerOf(raw: Record<string, unknown>, first: boolean): PhaseTrigger {
  if (first) return { type: "start" };
  switch (raw.trigger) {
    case "hp":
      return { type: "hp", below: raw.below === null ? Number.NaN : Number(raw.below) };
    case "form":
      return { type: "form", actorId: str(raw.actorId) };
    case "newer":
      return newerTrigger(str(raw.newer)) ?? { type: "manual" };
    default:
      return { type: "manual" };
  }
}

/** Only what the phase changes: empty fields and "as before" categories are left out. */
function enterOf(raw: unknown): PhaseEnter {
  const value = isRecord(raw) ? raw : {};
  const enter: PhaseEnter = {};
  for (const key of ["playerName", "title", "portrait"] as const) {
    const text = str(value[key]).trim();
    if (text) enter[key] = text;
  }
  const overrides: Partial<Record<Category, string>> = {};
  for (const [category, id] of Object.entries(isRecord(value.overrides) ? value.overrides : {})) {
    if (isCategory(category) && typeof id === "string" && id) overrides[category] = id;
  }
  if (Object.keys(overrides).length) enter.overrides = overrides;
  const music = musicFrom(str(value.music));
  if (music) enter.music = music;
  return enter;
}

/**
 * The profile form, expanded (`foundry.utils.expandObject`): rows come as index-keyed objects, statuses as
 * checkboxes plus a name list. `newId` names new phases and quotes.
 */
export function inputOf(data: Record<string, unknown>, newId: () => string): ProfileInput {
  const autoShow = isRecord(data.autoShow) ? data.autoShow : {};
  const statuses = isRecord(data.statuses) ? data.statuses : {};
  const hiddenIds = isRecord(data.hiddenIds) ? data.hiddenIds : {};
  const names = str(data.hiddenNames)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    kind: data.kind === "elite" ? "elite" : "boss",
    displayMode: data.displayMode === "actor" ? "actor" : "token",
    playerName: str(data.playerName),
    title: str(data.title),
    portrait: str(data.portrait),
    portraitFocus: readFocus(data.portraitFocus),
    size: Number(data.size),
    rank: str(data.rank),
    autoShow: {
      onCombatStart: autoShow.onCombatStart === true,
      hideOnCombatEnd: autoShow.hideOnCombatEnd === true,
      hideOnDefeat: autoShow.hideOnDefeat === true,
      delay: autoShow.delay === null ? Number.NaN : Number(autoShow.delay),
    },
    statuses: {
      hidden: [...Object.keys(hiddenIds).filter((id) => hiddenIds[id] === true), ...names],
      custom: entries(statuses.custom).map((raw): CustomStatus => ({
        id: str(raw.id),
        name: str(raw.name).trim(),
        img: str(raw.img).trim(),
        description: str(raw.description).trim(),
      })),
    },
    miniBars: entries(data.miniBars).map((raw): MiniBar => ({
      id: str(raw.id),
      label: str(raw.label).trim(),
      view: raw.view === "pips" ? "pips" : "bar",
      players: raw.players === true,
      source: sourceOf(isRecord(raw.source) ? raw.source : {}),
    })),
    phases: entries(data.phases).map((raw, index): Phase => ({
      id: str(raw.id) || newId(),
      label: str(raw.label).trim(),
      trigger: triggerOf(raw, index === 0),
      enter: enterOf(raw.enter),
    })),
    fillMode: data.fillMode === "refill" ? "refill" : "segments",
    playerTicks: data.playerTicks === true,
    quotes: entries(data.quotes).map((raw) => quoteOf(raw, newId)),
    music: musicFrom(str(data.music)),
    musicPriority: data.musicPriority === null ? Number.NaN : Number(data.musicPriority),
    musicFade: data.musicFade === null ? Number.NaN : Math.round(Number(data.musicFade) * 1000),
  };
}
