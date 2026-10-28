import { MODULE_ID } from "../constants";
import {
  CENTRED_FOCUS,
  DEFAULT_AUTO_SHOW,
  defaultProfile,
  isLegendary,
  PROFILE_LIMITS,
  profileErrors,
  readProfile,
  type Phase,
  type ProfileInput,
  type ProfileKind,
} from "../core/profile";
import { CATEGORIES, isCategory, LIBRARY_VERSION, readLibrary, type Category } from "../core/look/schema";
import { resolveLook } from "../core/look/resolve";
import { logger } from "../logger";
import { phaseChanges, phaseTicks, romanNumeral } from "../core/phases";
import { autoDuration, QUOTE_LIMITS, speak, type Quote } from "../core/quotes";
import { keepMusic, readMusicSource, resolveMusic, suggestMusic, type MusicSource } from "../core/music";
import { worldPlaylists } from "../foundry/music";
import { inputOf } from "../core/profile-form";
import { isVideoPath, phaseViewOf } from "../core/view";
import { setPortrait } from "../ui/dom";
import { CATEGORY_LABELS } from "./look-labels";
import { rankOf } from "../core/ranks";
import { currentRanks } from "../foundry/settings";
import { BUILTIN_IDS, CLASSIC } from "../core/look/builtin";
import { currentLibrary } from "../foundry/library";
import {
  confirmDiscard,
  displayName,
  freshPreview,
  playPreview,
  previewBoss,
  previewCard,
  previewSteps,
  sourcesOf,
  styleFor,
  type PreviewState,
  type PreviewStep,
} from "./shared";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const TEMPLATES = `modules/${MODULE_ID}/templates`;

type FormData = { object: Record<string, unknown> };

/** Mini-bar sources in the editor's order; labels are literal keys (the i18n test greps them). */
const SOURCES = [
  { value: "temp", label: "BB5E.MiniBars.SourceTemp" },
  { value: "legact", label: "BB5E.MiniBars.SourceLegact" },
  { value: "legres", label: "BB5E.MiniBars.SourceLegres" },
  { value: "item", label: "BB5E.MiniBars.SourceItem" },
  { value: "path", label: "BB5E.MiniBars.SourcePath" },
  { value: "counter", label: "BB5E.MiniBars.SourceCounter" },
] as const;

/** Phase triggers after the first phase; labels are literal keys. */
const TRIGGERS = [
  { value: "hp", label: "BB5E.Phases.Trigger.Hp" },
  { value: "form", label: "BB5E.Phases.Trigger.Form" },
  { value: "manual", label: "BB5E.Phases.Trigger.Manual" },
] as const;
const KNOWN_TRIGGERS = new Set(["start", "hp", "form", "manual"]);

/** Quote triggers in the editor's order (spec §7); labels are literal keys. */
const QUOTE_TRIGGERS = [
  { value: "appear", label: "BB5E.Quotes.Trigger.Appear" },
  { value: "phase", label: "BB5E.Quotes.Trigger.Phase" },
  { value: "below", label: "BB5E.Quotes.Trigger.Below" },
  { value: "damage", label: "BB5E.Quotes.Trigger.Damage" },
  { value: "heal", label: "BB5E.Quotes.Trigger.Heal" },
  { value: "turn", label: "BB5E.Quotes.Trigger.Turn" },
  { value: "status", label: "BB5E.Quotes.Trigger.Status" },
  { value: "crit", label: "BB5E.Quotes.Trigger.Crit" },
  { value: "miss", label: "BB5E.Quotes.Trigger.Miss" },
  { value: "defeat", label: "BB5E.Quotes.Trigger.Defeat" },
  { value: "manual", label: "BB5E.Quotes.Trigger.Manual" },
] as const;
const KNOWN_QUOTE_TRIGGERS = new Set<string>(QUOTE_TRIGGERS.map((each) => each.value));
/** Which parameter field each quote trigger shows. */
const QUOTE_GROUP: Record<string, string> = {
  phase: "phase",
  below: "percent",
  damage: "percent",
  status: "status",
};

/** A folded quote row: its trigger and its first line. */
const quoteSummary = (trigger: string, line: string) => `${trigger} — ${line.trim() || "…"}`;

/** Tab of each field-name prefix, to bring the first invalid field into view. */
const TAB_OF: [RegExp, string][] = [
  [/^miniBars/, "miniBars"],
  [/^statuses/, "statuses"],
  [/^phases/, "phases"],
  [/^quotes/, "quotes"],
  [/^music/, "music"],
  [/^autoShow/, "autoShow"],
];

/** Music in a select: "playlist:<id>" or "sound:<playlist id>:<sound id>"; "" — none (or "as before"). */
const musicValue = (source: MusicSource | null | undefined) =>
  !source
    ? ""
    : source.type === "playlist"
      ? `playlist:${source.playlistId}`
      : `sound:${source.playlistId}:${source.soundId}`;
/**
 * The world's playlists as option groups: the whole playlist, then each track. Saved music this world lacks comes
 * first as "Not found", picked, so a save keeps it (core/music keepMusic).
 */
function musicChoices(saved: MusicSource | null | undefined, playlists = worldPlaylists()) {
  const found = resolveMusic(saved ?? null, playlists);
  const current = musicValue(found ?? saved);
  const missingLabel = game.i18n.localize("BB5E.Music.Missing");
  const missing =
    saved && !found
      ? [
          {
            name: missingLabel,
            options: [
              {
                value: current,
                label:
                  [
                    saved.playlistName,
                    saved.type === "sound" ? saved.soundName : game.i18n.localize("BB5E.Music.WholePlaylist"),
                  ]
                    .filter(Boolean)
                    .join(" — ") || missingLabel,
                selected: true,
              },
            ],
          },
        ]
      : [];
  return {
    groups: [
      ...missing,
      ...game.playlists.contents
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((playlist) => ({
          name: playlist.name,
          options: [
            { value: `playlist:${playlist.id}`, label: game.i18n.localize("BB5E.Music.WholePlaylist") },
            ...playlist.sounds.contents.map((sound) => ({
              value: `sound:${playlist.id}:${sound.id}`,
              label: sound.name,
            })),
          ].map((option) => ({ ...option, selected: option.value === current })),
        })),
    ],
  };
}

/** A new phase: the start first, then a threshold 25% under the last one (or 50%). */
function newPhase(phases: Phase[]): Phase {
  const id = foundry.utils.randomID();
  if (!phases.length) return { id, label: "", trigger: { type: "start" }, enter: {} };
  const last = [...phases].reverse().find((phase) => phase.trigger.type === "hp")?.trigger;
  const below = last?.type === "hp" ? Math.max(PROFILE_LIMITS.thresholdMin, last.below - 25) : 50;
  return { id, label: "", trigger: { type: "hp", below }, enter: {} };
}

/**
 * Boss or elite profile, a section of the hub (stage 13): "Main", "Look" (the former workshop), "Mini-bars",
 * "Statuses", "Phases", "Quotes", "Music", "Auto-show". It always edits the world actor.
 */
class ProfileEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["bb5e-app", "bb5e-hosted", "standard-form"],
    tag: "form",
    window: { frame: false, positioned: false },
    form: { handler: ProfileEditor.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: {
      removeProfile: ProfileEditor.#onRemove,
      pickLook: ProfileEditor.#onPickLook,
      lookPlay: ProfileEditor.#onLookPlay,
      copyLook: ProfileEditor.#onCopyLook,
      addBar: ProfileEditor.#edit((input) =>
        input.miniBars.push({
          id: foundry.utils.randomID(),
          label: "",
          view: "bar",
          players: true,
          source: { type: "temp" },
        }),
      ),
      removeBar: ProfileEditor.#edit((input, index) => input.miniBars.splice(index, 1)),
      addStatus: ProfileEditor.#edit((input) =>
        input.statuses.custom.push({ id: foundry.utils.randomID(), name: "", img: "", description: "" }),
      ),
      removeStatus: ProfileEditor.#edit((input, index) => input.statuses.custom.splice(index, 1)),
      addPhase: ProfileEditor.#edit((input) => {
        if (input.phases.length < PROFILE_LIMITS.phases) input.phases.push(newPhase(input.phases));
      }),
      removePhase: ProfileEditor.#edit((input, index) => input.phases.splice(index, 1)),
      movePhase: ProfileEditor.#edit((input, index, target) => {
        const to = index + Number(target.dataset.delta);
        const [phase] = input.phases.splice(index, 1);
        if (phase) input.phases.splice(Math.max(0, Math.min(input.phases.length, to)), 0, phase);
      }),
      playPhase: ProfileEditor.#onPlayPhase,
      addQuote: ProfileEditor.#edit((input) => {
        if (input.quotes.length >= QUOTE_LIMITS.quotes) return;
        const id = foundry.utils.randomID();
        input.quotes.push({
          id,
          trigger: { type: "appear" },
          texts: [],
          order: "random",
          cooldown: 0,
          once: false,
          duration: null,
        });
        return id;
      }),
      removeQuote: ProfileEditor.#edit((input, index) => input.quotes.splice(index, 1)),
      moveQuote: ProfileEditor.#edit((input, index, target) => {
        const to = index + Number(target.dataset.delta);
        const [quote] = input.quotes.splice(index, 1);
        if (quote) input.quotes.splice(Math.max(0, Math.min(input.quotes.length, to)), 0, quote);
      }),
      playQuote: ProfileEditor.#onPlayQuote,
    },
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${TEMPLATES}/profile-main.hbs` },
    look: { template: `${TEMPLATES}/profile-look.hbs` },
    miniBars: { template: `${TEMPLATES}/profile-minibars.hbs` },
    statuses: { template: `${TEMPLATES}/profile-statuses.hbs` },
    phases: { template: `${TEMPLATES}/profile-phases.hbs` },
    quotes: { template: `${TEMPLATES}/profile-quotes.hbs` },
    music: { template: `${TEMPLATES}/profile-music.hbs` },
    autoShow: { template: `${TEMPLATES}/profile-autoshow.hbs` },
    footer: { template: `${TEMPLATES}/editor-footer.hbs` },
  };

  static TABS = {
    sheet: {
      tabs: [
        {
          id: "main",
          icon: "fa-solid fa-id-card",
          label: "BB5E.Profile.Tab.Main",
          tooltip: "BB5E.Profile.Tab.Main",
        },
        {
          id: "look",
          icon: "fa-solid fa-wand-magic-sparkles",
          label: "BB5E.Profile.Tab.Look",
          tooltip: "BB5E.Profile.Tab.Look",
        },
        {
          id: "miniBars",
          icon: "fa-solid fa-bars-progress",
          label: "BB5E.Profile.Tab.MiniBars",
          tooltip: "BB5E.Profile.Tab.MiniBars",
        },
        {
          id: "statuses",
          icon: "fa-solid fa-circle-half-stroke",
          label: "BB5E.Profile.Tab.Statuses",
          tooltip: "BB5E.Profile.Tab.Statuses",
        },
        {
          id: "phases",
          icon: "fa-solid fa-layer-group",
          label: "BB5E.Profile.Tab.Phases",
          tooltip: "BB5E.Profile.Tab.Phases",
        },
        {
          id: "quotes",
          icon: "fa-solid fa-comment",
          label: "BB5E.Profile.Tab.Quotes",
          tooltip: "BB5E.Profile.Tab.Quotes",
        },
        {
          id: "music",
          icon: "fa-solid fa-music",
          label: "BB5E.Profile.Tab.Music",
          tooltip: "BB5E.Profile.Tab.Music",
        },
        {
          id: "autoShow",
          icon: "fa-solid fa-eye",
          label: "BB5E.Profile.Tab.AutoShow",
          tooltip: "BB5E.Profile.Tab.AutoShow",
        },
      ],
      initial: "main",
    },
  };

  readonly actor: ActorDocument;
  #dirty = false;
  #confirming = false;
  /** Unsaved form state, kept across the re-render that adding or removing a row needs. */
  #draft: ProfileInput | null = null;

  /** The "Look" tab: the boss's look and overrides (saved with the profile), and its preview. */
  #look: string | null = null;
  #overrides: Partial<Record<Category, string>> = {};
  #preview: PreviewState = freshPreview();
  /** The quote row shown expanded; the others are folded to one line. */
  #openQuote: string | null = null;
  #phaseAt = 0;

  constructor(
    readonly slot: HTMLElement,
    actor: ActorDocument,
  ) {
    super({ id: `bb5e-profile-${actor.id}` });
    this.actor = actor;
    this.#readLook();
  }

  /** Drawn inside the hub (stage 13): the element goes into the hub's slot, not the page. */
  override async _insertElement(element: HTMLElement) {
    if (element.parentElement !== this.slot) this.slot.replaceChildren(element);
  }

  #readLook() {
    const profile = readProfile(this.actor.flags[MODULE_ID]?.profile);
    const boss = profile.status === "ok" && profile.value.kind === "boss" ? profile.value : null;
    this.#look = boss?.look ?? null;
    this.#overrides = { ...boss?.overrides };
  }

  /** Edits the current form state and re-renders with it, keeping unsaved edits. */
  /** A change may return the id of the quote to show expanded (a new one); the others fold. */
  static #edit(change: (input: ProfileInput, index: number, target: HTMLElement) => unknown) {
    return async function (this: ProfileEditor, _event: Event, target: HTMLElement) {
      const input = this.#formInput();
      const opened = change(input, Number(target.dataset.index), target);
      if (typeof opened === "string") this.#openQuote = opened;
      this.#draft = input;
      this.#setDirty(true);
      await this.render();
    };
  }

  #formInput(): ProfileInput {
    const form = new foundry.applications.ux.FormDataExtended(this.element as HTMLFormElement);
    return inputOf(foundry.utils.expandObject(form.object), foundry.utils.randomID);
  }

  override async _prepareContext(options: Record<string, unknown>) {
    const read = readProfile(this.actor.flags[MODULE_ID]?.profile);
    const ranks = currentRanks();
    // Both kinds' fields: the stored profile keeps the other kind's values as extra keys.
    const values: Record<string, unknown> & Pick<ProfileInput, "autoShow" | "statuses" | "miniBars"> = {
      ...defaultProfile("boss"),
      rank: ranks[Math.min(1, ranks.length - 1)]?.id ?? "",
      ...(read.status === "ok" ? read.value : {}),
      ...this.#draft,
    };
    const choices = [...CONFIG.statusEffects].map(({ id, name, img }) => ({
      id,
      name: game.i18n.localize(name),
      img,
      hidden: values.statuses.hidden.includes(id),
    }));
    const statusIds = new Set(choices.map((choice) => choice.id));
    const items = this.actor.items.filter((item) => Boolean(item.hasLimitedUses));
    return {
      ...(await super._prepareContext(options)),
      values,
      isElite: values.kind === "elite",
      byActor: values.displayMode === "actor",
      focus: (values.portraitFocus as ProfileInput["portraitFocus"]) ?? CENTRED_FOCUS,
      ranks: ranks.map((rank) => ({ id: rank.id, name: rank.name, selected: rank.id === values.rank })),
      hasProfile: read.status === "ok",
      look: this.#lookContext(),
      limits: PROFILE_LIMITS,
      miniBars: values.miniBars.map((bar, index) => {
        const { source } = bar;
        return {
          index,
          id: bar.id,
          label: bar.label,
          pips: bar.view === "pips",
          players: bar.players,
          sources: SOURCES.map((each) => ({ ...each, selected: each.value === source.type })),
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            selected: source.type === "item" && source.itemId === item.id,
          })),
          path: source.type === "path" ? source.path : "",
          pathMax: source.type === "path" ? String(source.max) : "",
          counterMax: source.type === "counter" ? source.max : 3,
        };
      }),
      barsFull: values.miniBars.length >= PROFILE_LIMITS.miniBars,
      statusChoices: choices,
      hiddenNames: values.statuses.hidden.filter((entry) => !statusIds.has(entry)).join("\n"),
      customStatuses: values.statuses.custom.map((status, index) => ({ ...status, index })),
      statusesFull: values.statuses.custom.length >= PROFILE_LIMITS.custom,
      refill: values.fillMode === "refill",
      ...this.#phasesContext(Array.isArray(values.phases) ? (values.phases as Phase[]) : []),
      music: musicChoices(keepMusic(readMusicSource(values.music), this.#savedMusic(), worldPlaylists())),
      musicFadeSeconds: (Number(values.musicFade) || 0) / 1000,
      ...this.#quotesContext(
        Array.isArray(values.quotes) ? (values.quotes as Quote[]) : [],
        Array.isArray(values.phases) ? (values.phases as Phase[]) : [],
      ),
    };
  }

  /** The "Look" tab: the looks to pick from and a preset choice per category ("as in the look" by default). */
  #lookContext() {
    const sources = sourcesOf(currentLibrary());
    const current = this.#look ?? CLASSIC.id;
    const resolved = resolveLook(this.#look, {}, sources, CLASSIC);
    return {
      steps: previewSteps(),
      looks: sources.looks.map((look) => ({
        id: look.id,
        name: displayName(look),
        builtIn: BUILTIN_IDS.has(look.id),
        selected: look.id === current,
      })),
      rows: CATEGORIES.map((category) => ({
        category,
        label: game.i18n.localize(CATEGORY_LABELS[category]),
        inLook: game.i18n.format("BB5E.Workshop.AsInLook", { name: displayName(resolved[category]) }),
        options: sources.presets
          .filter((each) => each.category === category)
          .map((each) => ({
            id: each.id,
            name: displayName(each),
            selected: this.#overrides[category] === each.id,
          })),
      })),
    };
  }

  /** The look preview: the chosen look and overrides, with the shown phase's changes on top as on the HUD. */
  #drawLook() {
    const host = this.element.querySelector<HTMLElement>(".bb5e-look-preview");
    if (!host || this.#kind() !== "boss") return;
    const input = this.#formInput();
    const changes = phaseChanges(input.phases, this.#phaseAt);
    previewBoss(
      host,
      styleFor(sourcesOf(currentLibrary()), this.#look, { ...this.#overrides, ...changes.overrides }),
      {
        ...this.#preview,
        phase: this.#preview.phase ?? phaseViewOf(input.phases, this.#phaseAt),
        ticks: input.fillMode === "segments" ? phaseTicks(input.phases, this.#phaseAt) : [],
        title: changes.title || input.title,
        img: changes.portrait || input.portrait || this.actor.img,
        focus: input.portraitFocus,
      },
      changes.playerName || input.playerName.trim() || this.actor.name,
    );
  }

  static async #onPickLook(this: ProfileEditor, _event: Event, target: HTMLElement) {
    this.#look = target.dataset.id === CLASSIC.id ? null : (target.dataset.id ?? null);
    this.#draft = this.#formInput();
    this.#setDirty(true);
    await this.render({ parts: ["look"] });
  }

  /** The play buttons; a phase step walks the profile's own phases when it has some. */
  static #onLookPlay(this: ProfileEditor, _event: Event, target: HTMLElement) {
    const step = target.dataset.step;
    const phases = this.#formInput().phases;
    if (step === "quote") {
      this.#preview.quote = this.#sampleQuote();
      this.#drawLook();
    } else if (step === "phase" && phases.length > 1) {
      this.#phaseAt = (this.#phaseAt + 1) % phases.length;
      this.#preview.phase = null;
      this.#drawLook();
    } else {
      if (step === "appear") this.#phaseAt = 0;
      playPreview(this.#preview, step as PreviewStep, () => this.#drawLook());
    }
  }

  /** A random quote of the profile (or the sample line) over the preview bar. */
  #sampleQuote(): PreviewState["quote"] {
    const now = Date.now();
    const quotes = this.#formInput().quotes;
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    if (!quote?.texts.length) {
      const text = game.i18n.localize("BB5E.Workshop.SampleQuote");
      return { key: `sample-${now}`, text, until: now + autoDuration(text) * 1000 };
    }
    const context = { fight: "preview", round: null, now, name: this.actor.name, random: Math.random };
    const { shown } = speak(quote, undefined, context, game.i18n.localize("BB5E.Quotes.SampleAttacker"));
    return { key: shown.key, text: shown.text, until: now + shown.duration * 1000 };
  }

  /** The current choice (look plus overrides) becomes an own look in the library, then the profile's look. */
  static async #onCopyLook(this: ProfileEditor) {
    const library = readLibrary(game.settings.get(MODULE_ID, "library"), BUILTIN_IDS);
    if (library.status !== "ok") return ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    const sources = sourcesOf(library.value);
    const resolved = resolveLook(this.#look, this.#overrides, sources, CLASSIC);
    const id = foundry.utils.randomID();
    const name = game.i18n
      .format("BB5E.Library.CopyName", {
        name: displayName(sources.looks.find((each) => each.id === resolved.id) ?? CLASSIC),
      })
      .slice(0, 80);
    const presets = Object.fromEntries(CATEGORIES.map((category) => [category, resolved[category].id]));
    try {
      await game.settings.set(MODULE_ID, "library", {
        dataVersion: LIBRARY_VERSION,
        looks: [...library.value.looks, { id, name, presets }],
        presets: library.value.presets,
      });
    } catch (error) {
      logger.error("Look copy not saved", error);
      return ui.notifications.error("BB5E.Error.WriteFailed", { localize: true });
    }
    this.#look = id;
    this.#overrides = {};
    this.#draft = this.#formInput();
    this.#setDirty(true);
    await this.render({ parts: ["look"] });
  }

  /** The music saved in the flag, names and all: the profile's, or one phase's. */
  #savedMusic(phaseId?: string): MusicSource | null {
    const read = readProfile(this.actor.flags[MODULE_ID]?.profile);
    const boss = read.status === "ok" && read.value.kind === "boss" ? read.value : null;
    if (phaseId === undefined) return boss?.music ?? null;
    return boss?.phases.find((phase) => phase.id === phaseId)?.enter.music ?? null;
  }

  /** The "Phases" tab: rows with triggers, form actors and entry changes, and the HP scale with its thresholds. */
  #phasesContext(phases: Phase[]) {
    const presets = sourcesOf(currentLibrary()).presets;
    const playlists = worldPlaylists();
    const actors = game.actors
      .filter((actor) => actor.type === "npc" && actor.id !== this.actor.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const nameOf = (phase: Phase, index: number) =>
      phase.label ||
      (index ? game.i18n.format("BB5E.Phase.Default", { n: romanNumeral(index + 1) }) : romanNumeral(1));
    return {
      phases: phases.map((phase, index) => {
        const { trigger } = phase;
        const newer = !KNOWN_TRIGGERS.has(trigger.type);
        return {
          index,
          id: phase.id,
          label: phase.label,
          first: index === 0,
          last: index === phases.length - 1,
          numeral: romanNumeral(index + 1),
          placeholder: index
            ? game.i18n.format("BB5E.Phase.Default", { n: romanNumeral(index + 1) })
            : game.i18n.localize("BB5E.Phases.FirstPlaceholder"),
          triggers: [
            ...TRIGGERS.map((each) => ({ ...each, selected: each.value === trigger.type })),
            ...(newer ? [{ value: "newer", label: "BB5E.Phases.Trigger.Newer", selected: true }] : []),
          ],
          newer: newer ? JSON.stringify(trigger) : "",
          below: trigger.type === "hp" ? trigger.below : 50,
          actors: actors.map((actor) => ({
            id: actor.id,
            name: actor.name,
            selected: trigger.type === "form" && trigger.actorId === actor.id,
          })),
          enter: phase.enter,
          music: musicChoices(
            keepMusic(phase.enter.music ?? null, this.#savedMusic(phase.id), playlists),
            playlists,
          ),
          overrides: CATEGORIES.map((category) => ({
            category,
            label: game.i18n.localize(CATEGORY_LABELS[category]),
            options: presets
              .filter((preset) => preset.category === category)
              .map((preset) => ({
                id: preset.id,
                name: displayName(preset),
                selected: phase.enter.overrides?.[category] === preset.id,
              })),
          })),
        };
      }),
      phasesFull: phases.length >= PROFILE_LIMITS.phases,
      scale: phases.flatMap((phase, index) =>
        phase.trigger.type === "hp"
          ? [{ at: phase.trigger.below / 100, text: `${phase.trigger.below}% · ${nameOf(phase, index)}` }]
          : [],
      ),
      scaleLabel: game.i18n.localize("BB5E.Phases.Scale"),
    };
  }

  /** The "Quotes" tab: a row per quote; a phase trigger picks one of the phases on the form. */
  #quotesContext(quotes: Quote[], phases: Phase[]) {
    const phaseName = (phase: Phase, index: number) =>
      phase.label || game.i18n.format("BB5E.Phase.Default", { n: romanNumeral(index + 1) });
    return {
      quotes: quotes.map((quote, index) => {
        const { trigger } = quote;
        const newer = !KNOWN_QUOTE_TRIGGERS.has(trigger.type);
        return {
          index,
          id: quote.id,
          first: index === 0,
          last: index === quotes.length - 1,
          triggers: [
            ...QUOTE_TRIGGERS.map((each) => ({ ...each, selected: each.value === trigger.type })),
            ...(newer ? [{ value: "newer", label: "BB5E.Phases.Trigger.Newer", selected: true }] : []),
          ],
          newer: newer ? JSON.stringify(trigger) : "",
          phases: phases.map((phase, at) => ({
            id: phase.id,
            name: phaseName(phase, at),
            selected: trigger.type === "phase" && trigger.phaseId === phase.id,
          })),
          percent: trigger.type === "below" || trigger.type === "damage" ? trigger.percent : 50,
          status: trigger.type === "status" ? trigger.status : "",
          texts: quote.texts.join("\n"),
          cycle: quote.order === "cycle",
          cooldown: quote.cooldown,
          once: quote.once,
          duration: quote.duration ?? "",
          open: quote.id === this.#openQuote,
          summary: quoteSummary(
            game.i18n.localize(
              QUOTE_TRIGGERS.find((each) => each.value === trigger.type)?.label ??
                "BB5E.Phases.Trigger.Newer",
            ),
            quote.texts[0] ?? "",
          ),
        };
      }),
      quotesFull: quotes.length >= QUOTE_LIMITS.quotes,
    };
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    this.#setDirty(this.#dirty);
    this.#syncKind();
    this.#syncSources();
    this.#syncTriggers();
    // Re-rendering replaces the parts, so listening on the form root survives every render.
    if (options.isFirstRender) {
      this.element.addEventListener("input", (event) => {
        const target = event.target as HTMLInputElement;
        if (target.matches("[data-music-search]")) return this.#searchMusic(target);
        this.#setDirty(true);
        // A range-picker's slider has no name while dragged: the picker around it carries it.
        if (target.closest('[name^="portraitFocus."]')) this.#drawFocus();
      });
      this.element.addEventListener("click", (event) => {
        const hit = (event.target as HTMLElement).closest<HTMLElement>("[data-music-hit]");
        if (hit) this.#pickMusic(hit);
      });
      this.element.addEventListener(
        "toggle",
        (event) => this.#onQuoteToggle(event.target as HTMLElement),
        true,
      );
      this.element.addEventListener("change", (event) => {
        const target = event.target as HTMLInputElement;
        if (target.matches("[data-music-search]")) return;
        this.#setDirty(true);
        if (target.name === "kind") this.#syncKind();
        else if (target.name.startsWith("overrides.")) this.#onOverride(target);
        else if (target.name.endsWith(".source.type")) this.#onSourceChange(target);
        else if (/^(phases|quotes)\.\d+\.trigger$/.test(target.name)) this.#syncTriggers();
        else this.#updatePreview();
      });
    }
  }

  #onOverride(select: HTMLInputElement) {
    const category = select.name.slice("overrides.".length);
    if (!isCategory(category)) return;
    if (select.value) this.#overrides[category] = select.value;
    else
      this.#overrides = Object.fromEntries(
        Object.entries(this.#overrides).filter(([key]) => key !== category),
      );
    this.#drawLook();
  }

  #field(name: string): string {
    return this.element.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "";
  }

  #kind(): ProfileKind {
    return this.element.querySelector<HTMLInputElement>('[name="kind"]:checked')?.value === "elite"
      ? "elite"
      : "boss";
  }

  /** Shows the fields of the chosen kind only. */
  #syncKind() {
    const kind = this.#kind();
    for (const group of this.element.querySelectorAll<HTMLElement>("[data-kind-group]")) {
      group.hidden = group.dataset.kindGroup !== kind;
    }
    this.#updatePreview();
  }

  /** Each mini-bar row shows the fields of its source only. */
  #syncSources() {
    for (const row of this.element.querySelectorAll<HTMLElement>("[data-bar-index]")) {
      const type = row.querySelector<HTMLSelectElement>('select[name$=".source.type"]')?.value;
      for (const group of row.querySelectorAll<HTMLElement>("[data-source-group]")) {
        group.hidden = group.dataset.sourceGroup !== type;
      }
    }
  }

  /** Each phase and quote row shows the fields of its trigger only. */
  #syncTriggers() {
    for (const row of this.element.querySelectorAll<HTMLElement>("[data-phase-index]")) {
      const type = row.querySelector<HTMLInputElement>('[name$=".trigger"]')?.value;
      for (const group of row.querySelectorAll<HTMLElement>("[data-trigger-group]")) {
        group.hidden = group.dataset.triggerGroup !== type;
      }
    }
    for (const row of this.element.querySelectorAll<HTMLElement>("[data-quote-index]")) {
      const type = row.querySelector<HTMLInputElement>('[name$=".trigger"]')?.value ?? "";
      for (const group of row.querySelectorAll<HTMLElement>("[data-quote-group]")) {
        group.hidden = group.dataset.quoteGroup !== QUOTE_GROUP[type];
      }
    }
  }

  /** ▶: the quote on the tab's preview, `{attacker}` filled with a sample name. Nothing is written. */
  static async #onPlayQuote(this: ProfileEditor, _event: Event, target: HTMLElement) {
    const host = this.element.querySelector<HTMLElement>(".bb5e-quote-preview");
    const input = this.#formInput();
    const quote = input.quotes[Number(target.dataset.index)];
    if (!host || !quote?.texts.length) return;
    const read = readProfile(this.actor.flags[MODULE_ID]?.profile);
    const boss = read.status === "ok" && read.value.kind === "boss" ? read.value : null;
    const name = input.playerName.trim() || this.actor.name;
    const now = Date.now();
    const { shown } = speak(
      quote,
      undefined,
      { fight: "preview", round: null, now, name, random: Math.random },
      game.i18n.localize("BB5E.Quotes.SampleAttacker"),
    );
    previewBoss(
      host,
      styleFor(sourcesOf(currentLibrary()), boss?.look ?? null, boss?.overrides),
      {
        fraction: 0.74,
        defeated: false,
        shown: true,
        title: input.title,
        img: input.portrait || this.actor.img,
        focus: input.portraitFocus,
        quote: { key: shown.key, text: shown.text, until: now + shown.duration * 1000 },
      },
      name,
    );
  }

  /**
   * "Play": the phase's entry on the tab's preview, from the phase before it, in the look the phases build up.
   * Nothing is written to the actor.
   */
  static async #onPlayPhase(this: ProfileEditor, _event: Event, target: HTMLElement) {
    const host = this.element.querySelector<HTMLElement>(".bb5e-phase-preview");
    const input = this.#formInput();
    const index = Number(target.dataset.index);
    if (!host || !input.phases[index]) return;
    const read = readProfile(this.actor.flags[MODULE_ID]?.profile);
    const boss = read.status === "ok" && read.value.kind === "boss" ? read.value : null;
    const sources = sourcesOf(currentLibrary());
    const draw = (at: number, key?: string) => {
      const changes = phaseChanges(input.phases, at);
      const trigger = input.phases[index]?.trigger;
      previewBoss(
        host,
        styleFor(sources, boss?.look ?? null, { ...boss?.overrides, ...changes.overrides }),
        {
          fraction: trigger?.type === "hp" ? Math.max(0, trigger.below - 1) / 100 : 1,
          defeated: false,
          shown: true,
          phase: key ? { key, label: "", numeral: null } : phaseViewOf(input.phases, at),
          ticks: input.fillMode === "segments" ? phaseTicks(input.phases, at) : [],
          title: changes.title || input.title,
          img: changes.portrait || input.portrait || this.actor.img,
          focus: input.portraitFocus,
        },
        changes.playerName || input.playerName || this.actor.name,
      );
    };
    // The phase before (or a stand-in for the first one), then the phase itself: the change plays.
    draw(Math.max(0, index - 1), index ? undefined : "before");
    draw(index);
  }

  /** Legendary actions and resistances read best as pips: switching to them picks pips. */
  #onSourceChange(select: HTMLInputElement) {
    const view = select
      .closest("[data-bar-index]")
      ?.querySelector<HTMLSelectElement>('select[name$=".view"]');
    if (view && isLegendary(select.value)) view.value = "pips";
    this.#syncSources();
  }

  #updatePreview() {
    this.#drawLook();
    this.#drawFocus();
    const host = this.element.querySelector<HTMLElement>(".bb5e-card-preview");
    if (!host || this.#kind() !== "elite") return;
    previewCard(host, {
      label: this.#field("playerName").trim() || this.actor.name,
      img: this.#field("portrait").trim() || this.actor.img,
      focus: this.#formInput().portraitFocus,
      rank: rankOf(currentRanks(), this.#field("rank")).rank,
    });
  }

  /** The quote shown expanded survives re-renders; a folded one sums up its fields as they are now. */
  #onQuoteToggle(details: HTMLElement) {
    if (!(details instanceof HTMLDetailsElement) || !details.dataset.quoteId) return;
    if (details.open) this.#openQuote = details.dataset.quoteId;
    else if (this.#openQuote === details.dataset.quoteId) this.#openQuote = null;
    const trigger = details.querySelector<HTMLSelectElement>('select[name$=".trigger"]');
    const texts = details.querySelector<HTMLTextAreaElement>('textarea[name$=".texts"]');
    const summary = details.querySelector("[data-quote-summary]");
    if (summary && trigger && texts) {
      summary.textContent = quoteSummary(
        trigger.selectedOptions[0]?.text ?? "",
        texts.value.split("\n")[0] ?? "",
      );
    }
  }

  /** Suggestions under a music search, from the world's playlists as they are now: one added meanwhile shows up. */
  #searchMusic(search: HTMLInputElement) {
    const hits = search.parentElement?.querySelector<HTMLElement>("[data-music-hits]");
    if (!hits) return;
    const typed = search.value.trim() !== "";
    const found = suggestMusic(musicChoices(null).groups, search.value).map(({ value, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.musicHit = value;
      button.textContent = label;
      return button;
    });
    const none = document.createElement("span");
    none.textContent = game.i18n.localize("BB5E.Music.NoMatch");
    hits.replaceChildren(
      ...(found.length ? found : [none]).map((item) => {
        const li = document.createElement("li");
        li.append(item);
        return li;
      }),
    );
    hits.hidden = !typed;
  }

  /** A picked suggestion becomes the list's value, added to it first when its playlist came after the render. */
  #pickMusic(hit: HTMLElement) {
    const pick = hit.closest(".bb5e-music-pick");
    const select = pick?.querySelector("select");
    const search = pick?.querySelector<HTMLInputElement>("[data-music-search]");
    const value = hit.dataset.musicHit ?? "";
    if (!select || !search) return;
    if (![...select.options].some((option) => option.value === value)) {
      select.add(new Option(hit.textContent ?? value, value));
    }
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    search.value = "";
    this.#searchMusic(search);
  }

  /** The round frame next to the focus sliders follows them while they move. */
  #drawFocus() {
    const host = this.element.querySelector<HTMLElement>(".bb5e-focus-preview");
    if (!host) return;
    const src = this.#field("portrait").trim() || this.actor.img;
    setPortrait(host, { src, video: isVideoPath(src), focus: this.#formInput().portraitFocus });
  }

  #setDirty(dirty: boolean) {
    this.#dirty = dirty;
    const badge = this.element.querySelector<HTMLElement>(".bb5e-footer__dirty");
    if (badge) badge.hidden = !dirty;
  }

  /** Unsaved edits ask before closing; a second close while the question is open is ignored. */
  override async close(options: Record<string, unknown> = {}) {
    if (this.#dirty && !options.force) {
      if (this.#confirming) return this;
      this.#confirming = true;
      const discard = await confirmDiscard();
      this.#confirming = false;
      if (!discard) return this;
    }
    return super.close(options);
  }

  /** Errors go next to their fields; the first one's tab comes to the front. */
  #showErrors(form: HTMLFormElement, errors: Record<string, string>) {
    for (const field of form.querySelectorAll<HTMLElement>("[data-error-for]")) {
      const name = field.dataset.errorFor ?? "";
      const key = errors[name];
      field.hidden = !key;
      field.textContent = key ? game.i18n.localize(key) : "";
      form.querySelector(`[name="${name}"]`)?.toggleAttribute("aria-invalid", Boolean(key));
    }
    const first = Object.keys(errors)[0];
    if (first === undefined) return;
    form.querySelector(`[name="${first}"]`)?.closest("details")?.setAttribute("open", "");
    const tab = TAB_OF.find(([pattern]) => pattern.test(first))?.[1] ?? "main";
    this.changeTab(tab, "sheet");
  }

  static async #onSubmit(this: ProfileEditor, _event: Event, form: HTMLFormElement, formData: FormData) {
    const input = inputOf(foundry.utils.expandObject(formData.object), foundry.utils.randomID);
    const errors = profileErrors(input);
    this.#showErrors(form, errors);
    if (Object.keys(errors).length) return;
    const current = readProfile(this.actor.flags[MODULE_ID]?.profile);
    if (current.status === "newer") return ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    const stored = current.status === "ok" ? current.value : defaultProfile(input.kind);
    // Music keeps the names of its playlist and track: they find it again where the ids differ (another world).
    const playlists = worldPlaylists();
    const named = (music: MusicSource, phaseId?: string) =>
      keepMusic(music, this.#savedMusic(phaseId), playlists);
    // Only the chosen kind's fields are written; the other kind's stay in the flag for a switch back.
    const kindFields =
      input.kind === "boss"
        ? {
            title: input.title.trim(),
            size: input.size,
            phases: input.phases.map((phase) =>
              phase.enter.music
                ? { ...phase, enter: { ...phase.enter, music: named(phase.enter.music, phase.id) } }
                : phase,
            ),
            fillMode: input.fillMode,
            playerTicks: input.playerTicks,
            quotes: input.quotes,
            music: input.music && named(input.music),
            musicPriority: input.musicPriority,
            musicFade: input.musicFade,
            look: this.#look,
            overrides: this.#overrides,
          }
        : { rank: input.rank };
    // Written whole: a merge would keep removed overrides and entries.
    await this.actor.setFlag(
      MODULE_ID,
      "profile",
      _replace({
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
      }),
    );
    this.#draft = null;
    this.#setDirty(false);
    await this.render();
  }

  /** Removing the profile hides this actor's bars and cards on every scene (the active GM prunes them). */
  static async #onRemove(this: ProfileEditor) {
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("BB5E.Profile.Remove.Title") },
      content: `<p>${game.i18n.localize("BB5E.Profile.Remove.Body")}</p>`,
    });
    if (!confirmed) return;
    await this.actor.unsetFlag(MODULE_ID, "profile");
    this.#dirty = false;
    await this.close({ force: true });
  }
}

/** The hub's profile of one actor; null (with a warning) when a newer version wrote the profile. */
export function hostProfileEditor(slot: HTMLElement, actor: ActorDocument): ApplicationV2Instance | null {
  if (readProfile(actor.flags[MODULE_ID]?.profile).status === "newer") {
    ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    return null;
  }
  return new ProfileEditor(slot, actor);
}
