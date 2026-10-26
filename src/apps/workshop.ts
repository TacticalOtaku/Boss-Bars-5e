import { MODULE_ID } from "../constants";
import { BUILTIN_IDS, CLASSIC } from "../core/look/builtin";
import { resolveLook } from "../core/look/resolve";
import { CATEGORIES, isCategory, LIBRARY_VERSION, readLibrary, type Category } from "../core/look/schema";
import { phaseChanges, phaseTicks } from "../core/phases";
import { readProfile, type Phase } from "../core/profile";
import { autoDuration, speak, type Quote } from "../core/quotes";
import { isRecord } from "../core/schema";
import { phaseViewOf } from "../core/view";
import { logger } from "../logger";
import { CATEGORY_LABELS } from "./look-labels";
import {
  confirmDiscard,
  displayName,
  freshPreview,
  previewBoss,
  sourcesOf,
  styleFor,
  type PreviewState,
} from "./shared";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = (key: string) => game.i18n.localize(key);

const storedLibrary = () => {
  const read = readLibrary(game.settings.get(MODULE_ID, "library"), BUILTIN_IDS);
  return read.status === "ok" ? read.value : null;
};

/**
 * "Look workshop" (spec §11, decision 6 of stage 5): picks the boss profile's look and category overrides, with a
 * live preview and a test console that never writes to the actor. Presets are edited in "Looks and presets".
 */
class Workshop extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["bb5e-app"],
    tag: "form",
    window: { title: "BB5E.Workshop.Title", icon: "fa-solid fa-wand-magic-sparkles", resizable: true },
    position: { width: 640, height: "auto" },
    form: { handler: Workshop.#onApply, closeOnSubmit: false, submitOnChange: false },
    actions: {
      look: Workshop.#onLook,
      console: Workshop.#onConsole,
      copyLook: Workshop.#onCopy,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/workshop.hbs` },
    footer: { template: `modules/${MODULE_ID}/templates/workshop-footer.hbs` },
  };

  readonly actor: ActorDocument;
  #look: string | null = null;
  #overrides: Partial<Record<Category, string>> = {};
  #preview: PreviewState = freshPreview();
  /** The profile's phases and the one the preview shows ("Next phase"). */
  #phases: Phase[] = [];
  #phaseAt = 0;
  /** The profile's quotes for "Quote" (a sample line when there are none). */
  #quotes: Quote[] = [];
  #dirty = false;
  #confirming = false;

  constructor(actor: ActorDocument) {
    super({ id: `bb5e-workshop-${actor.id}` });
    this.actor = actor;
    const profile = readProfile(actor.flags[MODULE_ID]?.profile);
    if (profile.status === "ok" && profile.value.kind === "boss") {
      this.#look = profile.value.look;
      this.#overrides = { ...profile.value.overrides };
      this.#phases = profile.value.phases;
      this.#quotes = profile.value.quotes;
    }
  }

  override get title(): string {
    return `${loc("BB5E.Workshop.Title")}: ${this.actor.name}`;
  }

  override async _prepareContext(options: Record<string, unknown>) {
    const sources = sourcesOf(storedLibrary());
    const current = this.#look ?? CLASSIC.id;
    const resolved = resolveLook(this.#look, {}, sources, CLASSIC);
    return {
      ...(await super._prepareContext(options)),
      hasPhases: this.#phases.length > 1,
      looks: sources.looks.map((look) => ({
        id: look.id,
        name: displayName(look),
        builtIn: BUILTIN_IDS.has(look.id),
        selected: look.id === current,
      })),
      rows: CATEGORIES.map((category) => ({
        category,
        label: loc(CATEGORY_LABELS[category]),
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

  #draw() {
    const host = this.element.querySelector<HTMLElement>(".bb5e-workshop__preview");
    if (!host) return;
    // The phase shown wears its changes on top of the chosen look, as on the HUD.
    const changes = phaseChanges(this.#phases, this.#phaseAt);
    previewBoss(
      host,
      styleFor(sourcesOf(storedLibrary()), this.#look, { ...this.#overrides, ...changes.overrides }),
      {
        ...this.#preview,
        phase: phaseViewOf(this.#phases, this.#phaseAt),
        ticks: phaseTicks(this.#phases, this.#phaseAt),
        title: changes.title,
        img: changes.portrait,
      },
      changes.playerName || this.actor.name,
    );
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    this.#setDirty(this.#dirty);
    this.#draw();
    if (options.isFirstRender) {
      this.element.addEventListener("change", () => {
        const form = new foundry.applications.ux.FormDataExtended(this.element as HTMLFormElement);
        const data = foundry.utils.expandObject(form.object);
        const overrides: Partial<Record<Category, string>> = {};
        if (isRecord(data.overrides)) {
          for (const [category, id] of Object.entries(data.overrides)) {
            if (isCategory(category) && typeof id === "string" && id) overrides[category] = id;
          }
        }
        this.#overrides = overrides;
        this.#setDirty(true);
        this.#draw();
      });
    }
  }

  #setDirty(dirty: boolean) {
    this.#dirty = dirty;
    const badge = this.element.querySelector<HTMLElement>(".bb5e-footer__dirty");
    if (badge) badge.hidden = !dirty;
  }

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

  static async #onLook(this: Workshop, _event: Event, target: HTMLElement) {
    this.#look = target.dataset.id === CLASSIC.id ? null : (target.dataset.id ?? null);
    this.#setDirty(true);
    await this.render();
  }

  /** A random quote of the profile (or the sample line) over the preview bar. */
  #sampleQuote(): PreviewState["quote"] {
    const now = Date.now();
    const quote = this.#quotes[Math.floor(Math.random() * this.#quotes.length)];
    if (!quote) {
      const text = loc("BB5E.Workshop.SampleQuote");
      return { key: `sample-${now}`, text, until: now + autoDuration(text) * 1000 };
    }
    const context = { fight: "preview", round: null, now, name: this.actor.name, random: Math.random };
    const { shown } = speak(quote, undefined, context, loc("BB5E.Quotes.SampleAttacker"));
    return { key: shown.key, text: shown.text, until: now + shown.duration * 1000 };
  }

  /** Test console: damage, healing, the next phase, a quote, defeat and reset play on the preview only. */
  static async #onConsole(this: Workshop, _event: Event, target: HTMLElement) {
    const state = this.#preview;
    switch (target.dataset.step) {
      case "damage10":
        state.fraction = Math.max(0, state.fraction - 0.1);
        break;
      case "damage30":
        state.fraction = Math.max(0, state.fraction - 0.3);
        break;
      case "heal":
        state.fraction = Math.min(1, state.fraction + 0.2);
        break;
      case "phase":
        this.#phaseAt = (this.#phaseAt + 1) % Math.max(1, this.#phases.length);
        break;
      case "quote":
        state.quote = this.#sampleQuote();
        break;
      case "defeat":
        state.defeated = true;
        this.#draw();
        state.shown = false;
        break;
      default:
        this.#preview = freshPreview();
        this.#phaseAt = 0;
    }
    this.#draw();
  }

  /** The current choice (look plus overrides) becomes an own look in the library, then the profile's look. */
  static async #onCopy(this: Workshop) {
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
    this.#setDirty(true);
    await this.render();
  }

  /** "Apply to profile": writes the look and overrides into the boss profile, nothing else. */
  static async #onApply(this: Workshop) {
    const current = readProfile(this.actor.flags[MODULE_ID]?.profile);
    if (current.status === "newer") return ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    if (current.status !== "ok" || current.value.kind !== "boss") {
      return ui.notifications.warn("BB5E.Workshop.NotBoss", { localize: true });
    }
    // Written whole: a merge would keep removed overrides and entries.
    await this.actor.setFlag(
      MODULE_ID,
      "profile",
      _replace({
        ...current.value,
        look: this.#look,
        overrides: this.#overrides,
      }),
    );
    this.#setDirty(false);
  }
}

export function openWorkshop(actor: ActorDocument): void {
  const existing = foundry.applications.instances.get(`bb5e-workshop-${actor.id}`);
  void (existing ?? new Workshop(actor)).render({ force: true });
}
