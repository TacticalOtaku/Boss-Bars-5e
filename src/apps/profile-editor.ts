import { MODULE_ID } from "../constants";
import {
  DEFAULT_AUTO_SHOW,
  defaultProfile,
  isLegendary,
  PROFILE_LIMITS,
  profileErrors,
  readProfile,
  type CustomStatus,
  type MiniBar,
  type MiniBarSource,
  type Phase,
  type PhaseEnter,
  type PhaseTrigger,
  type ProfileInput,
  type ProfileKind,
} from "../core/profile";
import { CATEGORIES, isCategory, type Category } from "../core/look/schema";
import { phaseChanges, phaseTicks, romanNumeral } from "../core/phases";
import { QUOTE_LIMITS, speak, type Quote, type QuoteTrigger } from "../core/quotes";
import { isRecord } from "../core/schema";
import { phaseViewOf } from "../core/view";
import { CATEGORY_LABELS } from "./look-labels";
import { rankOf } from "../core/ranks";
import { currentRanks } from "../foundry/settings";
import { BUILTIN_LOOKS } from "../core/look/builtin";
import { currentLibrary, lookFor } from "../foundry/library";
import { confirmDiscard, displayName, previewBoss, previewCard, sourcesOf, styleFor } from "./shared";

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
      return KNOWN_QUOTE_TRIGGERS.has(str(raw.trigger))
        ? { type: raw.trigger as "appear" }
        : { type: "manual" };
  }
}

/** A quote row of the form: the pool comes one variant per line. */
function quoteOf(raw: Record<string, unknown>): Quote {
  const duration = str(raw.duration).trim();
  return {
    id: str(raw.id) || foundry.utils.randomID(),
    trigger: quoteTriggerOf(raw),
    texts: str(raw.texts)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    order: raw.order === "cycle" ? "cycle" : "random",
    cooldown: raw.cooldown === null ? Number.NaN : Number(raw.cooldown),
    once: raw.once === true,
    duration: duration ? Number(duration) : null,
  };
}

/** Tab of each field-name prefix, to bring the first invalid field into view. */
const TAB_OF: [RegExp, string][] = [
  [/^miniBars/, "miniBars"],
  [/^statuses/, "statuses"],
  [/^phases/, "phases"],
  [/^quotes/, "quotes"],
  [/^autoShow/, "autoShow"],
];

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
  return enter;
}

/** The form, expanded: rows come as index-keyed objects, statuses as checkboxes plus a name list. */
function inputOf(data: Record<string, unknown>): ProfileInput {
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
      id: str(raw.id) || foundry.utils.randomID(),
      label: str(raw.label).trim(),
      trigger: triggerOf(raw, index === 0),
      enter: enterOf(raw.enter),
    })),
    fillMode: data.fillMode === "refill" ? "refill" : "segments",
    playerTicks: data.playerTicks === true,
    quotes: entries(data.quotes).map(quoteOf),
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

/** Boss or elite profile: "Main", "Mini-bars", "Statuses", "Phases", "Auto-show". It always edits the world actor. */
class ProfileEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["bb5e-app"],
    tag: "form",
    window: {
      title: "BB5E.Profile.Title",
      icon: "fa-solid fa-skull",
      contentClasses: ["standard-form"],
      resizable: true,
    },
    position: { width: 560, height: "auto" },
    form: { handler: ProfileEditor.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: {
      removeProfile: ProfileEditor.#onRemove,
      openWorkshop: ProfileEditor.#onWorkshop,
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
        input.quotes.push({
          id: foundry.utils.randomID(),
          trigger: { type: "appear" },
          texts: [],
          order: "random",
          cooldown: 0,
          once: false,
          duration: null,
        });
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
    miniBars: { template: `${TEMPLATES}/profile-minibars.hbs` },
    statuses: { template: `${TEMPLATES}/profile-statuses.hbs` },
    phases: { template: `${TEMPLATES}/profile-phases.hbs` },
    quotes: { template: `${TEMPLATES}/profile-quotes.hbs` },
    autoShow: { template: `${TEMPLATES}/profile-autoshow.hbs` },
    footer: { template: `${TEMPLATES}/editor-footer.hbs` },
  };

  static TABS = {
    sheet: {
      tabs: [
        { id: "main", icon: "fa-solid fa-id-card", label: "BB5E.Profile.Tab.Main" },
        { id: "miniBars", icon: "fa-solid fa-bars-progress", label: "BB5E.Profile.Tab.MiniBars" },
        { id: "statuses", icon: "fa-solid fa-circle-half-stroke", label: "BB5E.Profile.Tab.Statuses" },
        { id: "phases", icon: "fa-solid fa-layer-group", label: "BB5E.Profile.Tab.Phases" },
        { id: "quotes", icon: "fa-solid fa-comment", label: "BB5E.Profile.Tab.Quotes" },
        { id: "autoShow", icon: "fa-solid fa-eye", label: "BB5E.Profile.Tab.AutoShow" },
      ],
      initial: "main",
    },
  };

  readonly actor: ActorDocument;
  #dirty = false;
  #confirming = false;
  /** Unsaved form state, kept across the re-render that adding or removing a row needs. */
  #draft: ProfileInput | null = null;

  constructor(actor: ActorDocument) {
    super({ id: `bb5e-profile-${actor.id}` });
    this.actor = actor;
  }

  override get title(): string {
    return `${game.i18n.localize("BB5E.Profile.Title")}: ${this.actor.name}`;
  }

  /** Edits the current form state and re-renders with it, keeping unsaved edits. */
  static #edit(change: (input: ProfileInput, index: number, target: HTMLElement) => void) {
    return async function (this: ProfileEditor, _event: Event, target: HTMLElement) {
      const input = this.#formInput();
      change(input, Number(target.dataset.index), target);
      this.#draft = input;
      this.#setDirty(true);
      await this.render();
    };
  }

  #formInput(): ProfileInput {
    const form = new foundry.applications.ux.FormDataExtended(this.element as HTMLFormElement);
    return inputOf(foundry.utils.expandObject(form.object));
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
      ranks: ranks.map((rank) => ({ id: rank.id, name: rank.name, selected: rank.id === values.rank })),
      hasProfile: read.status === "ok",
      lookName: this.#lookName(read.status === "ok" && read.value.kind === "boss" ? read.value.look : null),
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
      ...this.#quotesContext(
        Array.isArray(values.quotes) ? (values.quotes as Quote[]) : [],
        Array.isArray(values.phases) ? (values.phases as Phase[]) : [],
      ),
    };
  }

  /** The "Phases" tab: rows with triggers, form actors and entry changes, and the HP scale with its thresholds. */
  #phasesContext(phases: Phase[]) {
    const presets = sourcesOf(currentLibrary()).presets;
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
      this.element.addEventListener("input", () => this.#setDirty(true));
      this.element.addEventListener("change", (event) => {
        this.#setDirty(true);
        const target = event.target as HTMLInputElement;
        if (target.name === "kind") this.#syncKind();
        else if (target.name.endsWith(".source.type")) this.#onSourceChange(target);
        else if (/^(phases|quotes)\.\d+\.trigger$/.test(target.name)) this.#syncTriggers();
        else this.#updatePreview();
      });
    }
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
    const host = this.element.querySelector<HTMLElement>(".bb5e-preview");
    if (!host || this.#kind() !== "elite") return;
    previewCard(host, {
      label: this.#field("playerName").trim() || this.actor.name,
      img: this.#field("portrait").trim() || this.actor.img,
      rank: rankOf(currentRanks(), this.#field("rank")).rank,
    });
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
    const tab = TAB_OF.find(([pattern]) => pattern.test(first))?.[1] ?? "main";
    this.changeTab(tab, "sheet");
  }

  static async #onSubmit(this: ProfileEditor, _event: Event, form: HTMLFormElement, formData: FormData) {
    const input = inputOf(foundry.utils.expandObject(formData.object));
    const errors = profileErrors(input);
    this.#showErrors(form, errors);
    if (Object.keys(errors).length) return;
    const current = readProfile(this.actor.flags[MODULE_ID]?.profile);
    if (current.status === "newer") return ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    const stored = current.status === "ok" ? current.value : defaultProfile(input.kind);
    // Only the chosen kind's fields are written; the other kind's stay in the flag for a switch back.
    const kindFields =
      input.kind === "boss"
        ? {
            title: input.title.trim(),
            size: input.size,
            phases: input.phases,
            fillMode: input.fillMode,
            playerTicks: input.playerTicks,
            quotes: input.quotes,
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
  /** The look the boss wears now (overrides aside), as the workshop button shows it. */
  #lookName(id: string | null): string {
    const look = [...BUILTIN_LOOKS, ...(currentLibrary()?.looks ?? [])].find(
      (each) => each.id === lookFor(id).id,
    );
    return look ? displayName(look) : "";
  }

  /** Looks are chosen in their own window (decision C of ticket #16), which writes only look and overrides. */
  static async #onWorkshop(this: ProfileEditor) {
    void import("./workshop").then(
      ({ openWorkshop }) => openWorkshop(this.actor),
      () => ui.notifications.error("BB5E.Error.WindowFailed", { localize: true }),
    );
  }

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

export function openProfileEditor(actor: ActorDocument): void {
  if (readProfile(actor.flags[MODULE_ID]?.profile).status === "newer") {
    ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    return;
  }
  const existing = foundry.applications.instances.get(`bb5e-profile-${actor.id}`);
  void (existing ?? new ProfileEditor(actor)).render({ force: true });
}
