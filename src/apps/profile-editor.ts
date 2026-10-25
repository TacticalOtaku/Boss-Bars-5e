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
  type ProfileInput,
  type ProfileKind,
} from "../core/profile";
import { isRecord } from "../core/schema";
import { rankOf } from "../core/ranks";
import { currentRanks } from "../foundry/settings";
import { BUILTIN_LOOKS } from "../core/look/builtin";
import { currentLibrary, lookFor } from "../foundry/library";
import { confirmDiscard, displayName, previewCard } from "./shared";

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

/** Tab of each field-name prefix, to bring the first invalid field into view. */
const TAB_OF: [RegExp, string][] = [
  [/^miniBars/, "miniBars"],
  [/^statuses/, "statuses"],
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
  };
}

/** Boss or elite profile: "Main", "Mini-bars", "Statuses", "Auto-show". It always edits the world actor. */
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
    },
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${TEMPLATES}/profile-main.hbs` },
    miniBars: { template: `${TEMPLATES}/profile-minibars.hbs` },
    statuses: { template: `${TEMPLATES}/profile-statuses.hbs` },
    autoShow: { template: `${TEMPLATES}/profile-autoshow.hbs` },
    footer: { template: `${TEMPLATES}/editor-footer.hbs` },
  };

  static TABS = {
    sheet: {
      tabs: [
        { id: "main", icon: "fa-solid fa-id-card", label: "BB5E.Profile.Tab.Main" },
        { id: "miniBars", icon: "fa-solid fa-bars-progress", label: "BB5E.Profile.Tab.MiniBars" },
        { id: "statuses", icon: "fa-solid fa-circle-half-stroke", label: "BB5E.Profile.Tab.Statuses" },
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
  static #edit(change: (input: ProfileInput, index: number) => void) {
    return async function (this: ProfileEditor, _event: Event, target: HTMLElement) {
      const input = this.#formInput();
      change(input, Number(target.dataset.index));
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
    };
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    this.#setDirty(this.#dirty);
    this.#syncKind();
    this.#syncSources();
    // Re-rendering replaces the parts, so listening on the form root survives every render.
    if (options.isFirstRender) {
      this.element.addEventListener("input", () => this.#setDirty(true));
      this.element.addEventListener("change", (event) => {
        this.#setDirty(true);
        const target = event.target as HTMLInputElement;
        if (target.name === "kind") this.#syncKind();
        else if (target.name.endsWith(".source.type")) this.#onSourceChange(target);
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
      input.kind === "boss" ? { title: input.title.trim(), size: input.size } : { rank: input.rank };
    await this.actor.setFlag(MODULE_ID, "profile", {
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
    });
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
