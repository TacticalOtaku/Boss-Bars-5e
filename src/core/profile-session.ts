import { CLASSIC } from "./look/builtin";
import {
  compileLook,
  resolveLook,
  type LookSources,
  type LookStyle,
  type ResolvedLook,
} from "./look/compile";
import { CATEGORIES, isCategory, type Category } from "./look/schema";
import { keepMusic, readMusicSource, resolveMusic, type MusicSource, type PlaylistInfo } from "./music";
import { phaseChanges, phaseTicks } from "./phases";
import {
  DEFAULT_AUTO_SHOW,
  defaultProfile,
  profileErrors,
  readFocus,
  readProfile,
  type BossProfile,
  type CustomStatus,
  type MiniBar,
  type MiniBarSource,
  type Phase,
  type PhaseEnter,
  type PhaseTrigger,
  type PortraitFocus,
  type Profile,
  type ProfileInput,
} from "./profile";
import { autoDuration, QUOTE_TRIGGER_TYPES, speak, type Quote, type QuoteTrigger } from "./quotes";
import { isRecord } from "./schema";
import { phaseViewOf, type PhaseView } from "./view";

interface Choice {
  id: string;
  name: string;
}

export interface ProfileEditChoices {
  ranks: Choice[];
  actors: Choice[];
  items: Choice[];
  presets: (Choice & { category: Category })[];
  playlists: readonly PlaylistInfo[];
}

export interface ProfileEditLook {
  look: string | null;
  overrides: Partial<Record<Category, string>>;
}

export interface BossPreviewFrame {
  style: LookStyle;
  label: string;
  title: string;
  img: string;
  focus?: PortraitFocus;
  phase: PhaseView | null;
  ticks: number[];
  fraction?: number;
  quote?: { key: string; text: string; until: number };
}

const entries = (value: unknown): Record<string, unknown>[] =>
  isRecord(value) ? Object.values(value).filter(isRecord) : [];
const str = (value: unknown) => (typeof value === "string" ? value : "");

/** A newer version's trigger rides along as JSON in a hidden field and is written back unchanged. */
function newerTrigger(json: string): PhaseTrigger | null {
  try {
    const raw: unknown = JSON.parse(json);
    return isRecord(raw) && typeof raw.type === "string" ? (raw as unknown as PhaseTrigger) : null;
  } catch {
    return null;
  }
}

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
 * A select's options with the saved id picked. A saved id this world lacks (a rank, preset, actor or item left behind
 * by a move or deleted) comes first as `missing`, picked: a select with nothing picked falls back to its first option
 * and a save would write that instead.
 */
export function keepChoice(
  options: { id: string; name: string }[],
  saved: string,
  missing: string,
): { id: string; name: string; selected: boolean }[] {
  const choices = options.map(({ id, name }) => ({ id, name, selected: id === saved }));
  return saved && !choices.some((choice) => choice.selected)
    ? [{ id: saved, name: missing, selected: true }, ...choices]
    : choices;
}

export function musicFrom(value: string): MusicSource | null {
  const [type, playlistId, soundId] = value.split(":");
  return readMusicSource({ type, playlistId, soundId });
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

function selections(options: Choice[], saved: string) {
  return keepChoice(options, saved, "").map((choice) => ({
    ...choice,
    missing: Boolean(saved && choice.id === saved && !options.some((option) => option.id === saved)),
  }));
}

function musicValue(source: MusicSource | null | undefined) {
  return !source
    ? ""
    : source.type === "playlist"
      ? `playlist:${source.playlistId}`
      : `sound:${source.playlistId}:${source.soundId}`;
}

export function musicSelection(source: MusicSource | null, playlists: readonly PlaylistInfo[]) {
  const found = resolveMusic(source, playlists);
  const current = musicValue(found ?? source);
  const groups = [...playlists]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((playlist) => ({
      name: playlist.name,
      missing: false,
      options: [
        {
          value: `playlist:${playlist.id}`,
          label: "",
          whole: true,
          selected: current === `playlist:${playlist.id}`,
        },
        ...playlist.sounds.map((sound) => ({
          value: `sound:${playlist.id}:${sound.id}`,
          label: sound.name,
          whole: false,
          selected: current === `sound:${playlist.id}:${sound.id}`,
        })),
      ],
    }));
  if (source && !found)
    groups.unshift({
      name: "",
      missing: true,
      options: [
        {
          value: current,
          label: [source.playlistName, source.type === "sound" ? source.soundName : undefined]
            .filter(Boolean)
            .join(" — "),
          whole: source.type === "playlist",
          selected: true,
        },
      ],
    });
  return { groups };
}

/** Elite profiles retain boss fields as extra keys; use the same reader when restoring them. */
function bossFields(stored: Profile | null): BossProfile | null {
  const read = stored ? readProfile({ ...stored, kind: "boss" }) : null;
  return read?.status === "ok" && read.value.kind === "boss" ? read.value : null;
}

function namedInput(input: ProfileInput, stored: Profile | null, choices: ProfileEditChoices) {
  const boss = bossFields(stored);
  return {
    ...input,
    music: keepMusic(input.music, boss?.music ?? null, choices.playlists),
    phases: input.phases.map((phase) => {
      const saved = boss?.phases.find((each) => each.id === phase.id);
      const music = keepMusic(phase.enter.music ?? null, saved?.enter.music ?? null, choices.playlists);
      return { ...saved, ...phase, enter: { ...phase.enter, ...(music ? { music } : {}) } };
    }),
  };
}

export type ProfileEditResult =
  | { status: "ok"; value: Profile }
  | { status: "errors"; errors: Record<string, string> }
  | { status: "invalid" }
  | { status: "newer" };

/**
 * Self-contained editing session for a boss/elite profile: owns the unsaved form draft, look selection & category
 * overrides, open quote accordion state, preview phase index, dirty flag, live previews, and lossless commit.
 */
export class ProfileEditSession {
  #draft: ProfileInput | null = null;
  #look: string | null = null;
  #overrides: Partial<Record<Category, string>> = {};
  openQuote: string | null = null;
  phaseAt = 0;
  dirty = false;

  constructor(initialRaw?: unknown) {
    const read = readProfile(initialRaw);
    const boss = read.status === "ok" ? bossFields(read.value) : null;
    this.#look = boss?.look ?? null;
    this.#overrides = { ...boss?.overrides };
  }

  get look(): string | null {
    return this.#look;
  }

  get overrides(): Partial<Record<Category, string>> {
    return this.#overrides;
  }

  get hasDraft(): boolean {
    return this.#draft !== null;
  }

  /** Updates the in-memory form draft (used across row additions/removals or look changes). */
  setDraft(draft: ProfileInput | null): void {
    this.#draft = draft;
  }

  /** Applies an in-form structural mutation (add/remove/reorder row), retains draft, and marks dirty. */
  mutate(input: ProfileInput, change: (draft: ProfileInput) => unknown): void {
    const opened = change(input);
    if (typeof opened === "string") this.openQuote = opened;
    this.#draft = input;
    this.dirty = true;
  }

  /** Picks a look id from the Look tab (storing Classic as `null`), preserving unsaved form fields. */
  pickLook(id: string | null, draft: ProfileInput): void {
    this.#look = id === CLASSIC.id ? null : id;
    this.#draft = draft;
    this.dirty = true;
  }

  /** Switches to a newly copied library look, clearing category overrides. */
  applySavedLook(id: string, draft: ProfileInput): void {
    this.#look = id;
    this.#overrides = {};
    this.#draft = draft;
    this.dirty = true;
  }

  /** Updates or clears one category override on the Look tab. */
  setOverride(category: Category, presetId: string): void {
    if (presetId) this.#overrides[category] = presetId;
    else
      this.#overrides = Object.fromEntries(
        Object.entries(this.#overrides).filter(([key]) => key !== category),
      );
  }

  /** Stored values plus any unsaved draft and session look state, with missing references kept selectable. */
  view(raw: unknown, choices: ProfileEditChoices) {
    const read = readProfile(raw);
    const stored = read.status === "ok" ? read.value : null;
    const defaults = defaultProfile("boss") as BossProfile;
    const boss = bossFields(stored);
    const projected = {
      ...defaults,
      rank: choices.ranks[Math.min(1, choices.ranks.length - 1)]?.id ?? "",
      ...stored,
      // Retained inactive fields are unknown data until the boss reader projects them for editing.
      ...boss,
      kind: stored?.kind ?? defaults.kind,
      ...this.#draft,
    };
    const values = namedInput({ ...projected, portrait: projected.portrait ?? "" }, stored, choices);
    return {
      values,
      status: read.status,
      look: { look: this.#look, overrides: { ...this.#overrides } } as ProfileEditLook,
      ranks: selections(choices.ranks, values.rank),
      miniBars: values.miniBars.map((bar) => ({
        bar,
        items: selections(choices.items, bar.source.type === "item" ? bar.source.itemId : ""),
      })),
      phases: values.phases.map((phase) => ({
        phase,
        actors: selections(choices.actors, phase.trigger.type === "form" ? phase.trigger.actorId : ""),
        music: musicSelection(phase.enter.music ?? null, choices.playlists),
        overrides: CATEGORIES.map((category) => ({
          category,
          options: selections(
            choices.presets.filter((preset) => preset.category === category),
            phase.enter.overrides?.[category] ?? "",
          ),
        })),
      })),
      music: musicSelection(values.music, choices.playlists),
    };
  }

  /** Compiles the session's current unsaved look + overrides (plus any phase overrides). */
  bossStyle(sources: LookSources, extraOverrides?: Partial<Record<Category, string>>): LookStyle {
    const overrides = extraOverrides ? { ...this.#overrides, ...extraOverrides } : this.#overrides;
    return compileLook(this.#look, overrides, sources);
  }

  /** Resolves the selected look without overrides (for displaying inherited preset labels). */
  baseLook(sources: LookSources): ResolvedLook {
    return resolveLook(this.#look, {}, sources);
  }

  /** Resolves the session look + overrides into a concrete preset per category (for copying into library). */
  resolvedLook(sources: LookSources): ResolvedLook {
    return resolveLook(this.#look, this.#overrides, sources);
  }

  /** Builds a live boss bar preview frame for phase index `at` using unsaved session look & form values. */
  phaseFrame(
    input: ProfileInput,
    sources: LookSources,
    at: number,
    fallback: { name: string; img: string },
    options: { key?: string; fraction?: number; phaseFallback?: PhaseView | null } = {},
  ): BossPreviewFrame {
    const changes = phaseChanges(input.phases, at);
    return {
      style: this.bossStyle(sources, changes.overrides),
      label: changes.playerName || input.playerName.trim() || fallback.name,
      title: changes.title || input.title,
      img: changes.portrait || input.portrait || fallback.img,
      focus: input.portraitFocus,
      phase: options.key
        ? { key: options.key, label: "", numeral: null }
        : (options.phaseFallback ?? phaseViewOf(input.phases, at)),
      ticks: input.fillMode === "segments" ? phaseTicks(input.phases, at) : [],
      ...(options.fraction !== undefined ? { fraction: options.fraction } : {}),
    };
  }

  /** Builds the before/after preview frames for "Play phase" using unsaved session look & form values. */
  phaseTransition(
    input: ProfileInput,
    sources: LookSources,
    index: number,
    fallback: { name: string; img: string },
  ): [BossPreviewFrame, BossPreviewFrame] | null {
    const target = input.phases[index];
    if (!target) return null;
    const fraction = target.trigger.type === "hp" ? Math.max(0, target.trigger.below - 1) / 100 : 1;
    const before = this.phaseFrame(input, sources, Math.max(0, index - 1), fallback, {
      fraction,
      key: index ? undefined : "before",
    });
    const after = this.phaseFrame(input, sources, index, fallback, { fraction });
    return [before, after];
  }

  /** Builds the live preview frame for "Play quote" using unsaved session look & form values. */
  quotePreview(
    input: ProfileInput,
    sources: LookSources,
    index: number,
    fallback: { name: string; img: string; sampleAttacker: string },
    now = Date.now(),
    random = Math.random,
  ): BossPreviewFrame | null {
    const quote = input.quotes[index];
    if (!quote?.texts.length) return null;
    const label = input.playerName.trim() || fallback.name;
    const { shown } = speak(
      quote,
      undefined,
      { fight: "preview", round: null, now, name: label, random },
      fallback.sampleAttacker,
    );
    return {
      style: this.bossStyle(sources),
      label,
      title: input.title,
      img: input.portrait || fallback.img,
      focus: input.portraitFocus,
      phase: null,
      ticks: [],
      fraction: 0.74,
      quote: { key: shown.key, text: shown.text, until: now + shown.duration * 1000 },
    };
  }

  /** Picks a random quote line from the current draft (or fallback line) for the Look tab preview. */
  sampleQuote(
    input: ProfileInput,
    fallbackName: string,
    fallbackText: string,
    sampleAttacker: string,
    now = Date.now(),
    random = Math.random,
  ): { key: string; text: string; until: number } {
    const quote = input.quotes[Math.floor(random() * input.quotes.length)];
    if (!quote?.texts.length) {
      return { key: `sample-${now}`, text: fallbackText, until: now + autoDuration(fallbackText) * 1000 };
    }
    const name = input.playerName.trim() || fallbackName;
    const { shown } = speak(
      quote,
      undefined,
      { fight: "preview", round: null, now, name, random },
      sampleAttacker,
    );
    return { key: shown.key, text: shown.text, until: now + shown.duration * 1000 };
  }

  /** Validates and builds a lossless whole-profile replacement against current stored flags. */
  commit(raw: unknown, input: ProfileInput, choices: ProfileEditChoices): ProfileEditResult {
    const errors = profileErrors(input);
    if (Object.keys(errors).length) return { status: "errors", errors };
    const read = readProfile(raw);
    if (read.status === "invalid" || read.status === "newer") return { status: read.status };
    const stored = read.status === "ok" ? read.value : defaultProfile(input.kind);
    const named = namedInput(input, stored, choices);
    const kindFields =
      input.kind === "boss"
        ? {
            title: input.title.trim(),
            size: input.size,
            phases: named.phases,
            fillMode: input.fillMode,
            playerTicks: input.playerTicks,
            quotes: input.quotes,
            music: named.music,
            musicPriority: input.musicPriority,
            musicFade: input.musicFade,
            look: this.#look,
            overrides: { ...this.#overrides },
          }
        : { rank: input.rank };
    this.#draft = null;
    this.dirty = false;
    return {
      status: "ok",
      value: {
        ...stored,
        kind: input.kind,
        playerName: input.playerName.trim(),
        portrait: input.portrait.trim() || null,
        portraitFocus: input.portraitFocus,
        displayMode: input.displayMode,
        autoShow: { ...DEFAULT_AUTO_SHOW, ...input.autoShow },
        statuses: {
          hidden: input.statuses.hidden,
          custom: input.kind === "boss" ? input.statuses.custom : stored.statuses.custom,
        },
        miniBars: input.miniBars,
        ...kindFields,
      } as Profile,
    };
  }
}

export type ProfileEditView = ReturnType<ProfileEditSession["view"]>;
