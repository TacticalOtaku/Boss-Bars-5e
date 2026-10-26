import { MODULE_ID } from "../constants";
import { BUILTIN_IDS, BUILTIN_LOOKS, BUILTIN_PRESETS } from "../core/look/builtin";
import {
  CATEGORIES,
  isCategory,
  LIBRARY_VERSION,
  parseImport,
  PARAMS,
  readLibrary,
  readParams,
  type Category,
  type Library,
  type Look,
  type Param,
  type Preset,
} from "../core/look/schema";
import { isRecord } from "../core/schema";
import { logger } from "../logger";
import { CATEGORY_LABELS, FONT_LABELS, PARAM_LABELS, VALUE_LABELS } from "./look-labels";
import {
  confirmDiscard,
  displayName,
  freshPreview,
  previewBoss,
  playPreview,
  previewCard,
  previewSteps,
  type PreviewStep,
  sourcesOf,
  styleFor,
} from "./shared";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

type Section = "looks" | Category;
type Filter = "all" | "builtin" | "own";
type Item = Look | Preset;

/** Sample rank for card previews: every part shown. */
const SAMPLE_RANK = {
  id: "sample",
  name: "",
  color: "#c9a45c",
  parts: { name: true, fill: true, statuses: true },
  size: 34,
  look: null,
};

const loc = (key: string) => game.i18n.localize(key);

/** The form of one parameter, for the template (each type picks its own input). */
function fieldOf(category: Category, key: string, param: Param, value: unknown) {
  const base = { key, name: `params.${key}`, label: loc(PARAM_LABELS[`${category}.${key}`] ?? key) };
  switch (param.type) {
    case "enum":
      return {
        ...base,
        isEnum: true,
        options: param.values.map((each) => ({
          value: each,
          label: loc(VALUE_LABELS[each] ?? each),
          selected: each === value,
        })),
      };
    case "font":
      return {
        ...base,
        isEnum: true,
        options: Object.entries(FONT_LABELS).map(([id, label]) => ({
          value: id,
          label: loc(label),
          selected: id === value,
        })),
      };
    case "number":
      return { ...base, isNumber: true, value, min: param.min, max: param.max, step: param.step };
    case "bool":
      return { ...base, isBool: true, checked: value === true };
    case "color":
      return { ...base, isColor: true, value };
    case "colors":
      return {
        ...base,
        isText: true,
        value: (value as string[]).join(", "),
        hint: loc("BB5E.Library.ColorsHint"),
      };
    case "path":
      return { ...base, isPath: true, value, pickType: key === "fontFile" ? "font" : "image" };
    case "text":
      return { ...base, isText: true, value, max: param.max };
  }
}

/** Form values back to raw params; the colour list is typed as text. */
function paramsFromForm(category: Category, raw: unknown): Record<string, unknown> {
  const params = isRecord(raw) ? { ...raw } : {};
  for (const [key, param] of Object.entries(PARAMS[category] as Record<string, Param>)) {
    if (param.type === "colors" && typeof params[key] === "string") {
      params[key] = (params[key] as string)
        .split(/[\s,]+/)
        .map((each) => each.trim())
        .filter(Boolean);
    }
  }
  return params;
}

/**
 * "Looks and presets": the world library (spec §11). Built-ins are read-only and are copied to edit; edits are a
 * draft until saved. Each item shows a live boss bar and elite card drawn by the HUD renderer.
 */
class LibraryApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "bb5e-library",
    classes: ["bb5e-app", "bb5e-hosted", "standard-form"],
    tag: "form",
    window: { frame: false, positioned: false },
    form: { handler: LibraryApp.#onSave, closeOnSubmit: false, submitOnChange: false },
    actions: {
      section: LibraryApp.#onSection,
      select: LibraryApp.#onSelect,
      filter: LibraryApp.#onFilter,
      copy: LibraryApp.#onCopy,
      remove: LibraryApp.#onRemove,
      exportAll: LibraryApp.#onExportAll,
      exportItem: LibraryApp.#onExportItem,
      importFile: LibraryApp.#onImportClick,
      sheet: LibraryApp.#onSheet,
      play: LibraryApp.#onPlay,
    },
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/library.hbs` },
    footer: { template: `modules/${MODULE_ID}/templates/library-footer.hbs` },
  };

  #draft: Library;
  #section: Section = "looks";
  #selected: string | null = "classic";
  #filter: Filter = "all";
  #search = "";
  #sheet = false;
  /** The previews' state: the play buttons hit, heal, defeat and change phase on it. */
  #preview = freshPreview();
  #dirty = false;
  #confirming = false;

  constructor(
    readonly slot: HTMLElement,
    library: Library,
  ) {
    super();
    this.#draft = structuredClone(library);
  }

  /** Drawn inside the hub (stage 13): the element goes into the hub's slot, not the page. */
  override async _insertElement(element: HTMLElement) {
    if (element.parentElement !== this.slot) this.slot.replaceChildren(element);
  }

  #items(): Item[] {
    const all: Item[] =
      this.#section === "looks"
        ? [...BUILTIN_LOOKS, ...this.#draft.looks]
        : [...BUILTIN_PRESETS, ...this.#draft.presets].filter((each) => each.category === this.#section);
    const search = this.#search.trim().toLowerCase();
    return all.filter(
      (each) =>
        (this.#filter === "all" || (this.#filter === "builtin") === BUILTIN_IDS.has(each.id)) &&
        (!search || displayName(each).toLowerCase().includes(search)),
    );
  }

  #find(id: string | null): Item | undefined {
    if (id === null) return undefined;
    const pool: Item[] =
      this.#section === "looks"
        ? [...BUILTIN_LOOKS, ...this.#draft.looks]
        : [...BUILTIN_PRESETS, ...this.#draft.presets];
    return pool.find((each) => each.id === id);
  }

  override async _prepareContext(options: Record<string, unknown>) {
    const items = this.#items();
    const item = this.#find(this.#selected);
    const own = item ? !BUILTIN_IDS.has(item.id) : false;
    const sources = sourcesOf(this.#draft);
    let detail: Record<string, unknown> | null = null;
    if (item && "params" in item) {
      const params = PARAMS[item.category] as Record<string, Param>;
      detail = {
        own,
        name: displayName(item),
        category: loc(CATEGORY_LABELS[item.category]),
        fields: own
          ? Object.entries(params).map(([key, param]) =>
              fieldOf(item.category, key, param, (item.params as Record<string, unknown>)[key]),
            )
          : null,
      };
    } else if (item) {
      detail = {
        own,
        isLook: true,
        name: displayName(item),
        rows: CATEGORIES.map((category) => ({
          category,
          label: loc(CATEGORY_LABELS[category]),
          current: displayName(
            sources.presets.find((each) => each.id === item.presets[category]) ?? { id: "", name: "—" },
          ),
          options: sources.presets
            .filter((each) => each.category === category)
            .map((each) => ({
              id: each.id,
              name: displayName(each),
              selected: each.id === item.presets[category],
            })),
        })),
      };
    }
    return {
      ...(await super._prepareContext(options)),
      sections: [
        { id: "looks", label: loc("BB5E.Library.Looks"), active: this.#section === "looks" },
        ...CATEGORIES.map((category) => ({
          id: category,
          label: loc(CATEGORY_LABELS[category]),
          active: this.#section === category,
        })),
      ],
      filters: (["all", "builtin", "own"] as const).map((id) => ({
        id,
        label: loc({ all: "BB5E.Library.All", builtin: "BB5E.Library.BuiltIn", own: "BB5E.Library.Own" }[id]),
        active: this.#filter === id,
      })),
      search: this.#search,
      items: items.map((each) => ({
        id: each.id,
        name: displayName(each),
        builtIn: BUILTIN_IDS.has(each.id),
        selected: each.id === this.#selected,
      })),
      detail,
      steps: previewSteps(),
      sheet: this.#sheet,
      sheetItems: this.#sheet ? items.map((each) => ({ id: each.id, name: displayName(each) })) : [],
    };
  }

  /** The look a preview shows: a look as is, or Classic with the preset in its category. */
  #styleOf(item: Item) {
    const sources = sourcesOf(this.#draft);
    return "params" in item
      ? styleFor(sources, null, { [item.category]: item.id })
      : styleFor(sources, item.id);
  }

  #drawPreviews() {
    const item = this.#find(this.#selected);
    const boss = this.element.querySelector<HTMLElement>(".bb5e-library__boss");
    const card = this.element.querySelector<HTMLElement>(".bb5e-library__card");
    if (item && boss) previewBoss(boss, this.#styleOf(item), this.#preview, displayName(item));
    if (item && card) {
      previewCard(card, {
        label: displayName(item),
        img: "icons/svg/mystery-man.svg",
        rank: SAMPLE_RANK,
        look: this.#styleOf(item),
        fraction: this.#preview.fraction,
        defeated: this.#preview.defeated,
      });
    }
    for (const tile of this.element.querySelectorAll<HTMLElement>("[data-sheet-id]")) {
      const each = this.#find(tile.dataset.sheetId ?? null);
      if (each) previewBoss(tile, this.#styleOf(each), freshPreview(), displayName(each));
    }
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    this.#setDirty(this.#dirty);
    this.#drawPreviews();
    if (options.isFirstRender) {
      this.element.addEventListener("change", (event) => this.#onChange(event));
      this.element.addEventListener("input", (event) => {
        const target = event.target as HTMLInputElement;
        if (target.name !== "search") return;
        this.#search = target.value;
        void this.render({ parts: ["main"] }).then(() => {
          const search = this.element.querySelector<HTMLInputElement>('[name="search"]');
          search?.focus();
          search?.setSelectionRange(search.value.length, search.value.length);
        });
      });
    }
  }

  /** Edits of an own item go into the draft at once; the previews follow without a re-render. */
  #onChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.name === "search" || target.name === "importFile") return;
    const item = this.#find(this.#selected);
    if (!item || BUILTIN_IDS.has(item.id)) return;
    const form = new foundry.applications.ux.FormDataExtended(this.element as HTMLFormElement);
    const data = foundry.utils.expandObject(form.object);
    const name = typeof data.itemName === "string" ? data.itemName.trim().slice(0, 80) : "";
    if (name) item.name = name;
    if ("params" in item) {
      item.params = readParams(item.category, paramsFromForm(item.category, data.params)) as never;
    } else if (isRecord(data.presets)) {
      for (const [category, id] of Object.entries(data.presets)) {
        if (isCategory(category) && typeof id === "string") item.presets[category] = id;
      }
    }
    this.#setDirty(true);
    this.#drawPreviews();
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

  static async #onSection(this: LibraryApp, _event: Event, target: HTMLElement) {
    const section = target.dataset.section;
    if (section !== "looks" && !isCategory(section)) return;
    this.#section = section;
    this.#selected = this.#items()[0]?.id ?? null;
    this.#sheet = false;
    await this.render();
  }

  static async #onSelect(this: LibraryApp, _event: Event, target: HTMLElement) {
    this.#selected = target.dataset.id ?? null;
    this.#preview = freshPreview();
    await this.render();
  }

  static #onPlay(this: LibraryApp, _event: Event, target: HTMLElement) {
    playPreview(this.#preview, target.dataset.step as PreviewStep, () => this.#drawPreviews());
  }

  static async #onFilter(this: LibraryApp, _event: Event, target: HTMLElement) {
    const filter = target.dataset.filter;
    if (filter === "all" || filter === "builtin" || filter === "own") this.#filter = filter;
    await this.render();
  }

  static async #onSheet(this: LibraryApp) {
    this.#sheet = !this.#sheet;
    await this.render();
  }

  /** A copy of the selected item, built-in or own, becomes an own item in the draft. */
  static async #onCopy(this: LibraryApp) {
    const item = this.#find(this.#selected);
    if (!item) return;
    const name = game.i18n.format("BB5E.Library.CopyName", { name: displayName(item) }).slice(0, 80);
    const id = foundry.utils.randomID();
    if ("params" in item) {
      this.#draft.presets.push({ id, name, category: item.category, params: structuredClone(item.params) });
    } else {
      this.#draft.looks.push({ id, name, presets: { ...item.presets } });
    }
    this.#selected = id;
    this.#filter = "all";
    this.#setDirty(true);
    await this.render();
  }

  /** Removing a preset that own looks use asks first; those looks fall back to Classic for that category. */
  static async #onRemove(this: LibraryApp) {
    const item = this.#find(this.#selected);
    if (!item || BUILTIN_IDS.has(item.id)) return;
    const users =
      "params" in item ? this.#draft.looks.filter((look) => look.presets[item.category] === item.id) : [];
    const confirmed = await DialogV2.confirm({
      window: { title: loc("BB5E.Library.RemoveTitle") },
      content: `<p>${foundry.utils.escapeHTML(
        users.length
          ? game.i18n.format("BB5E.Library.RemoveUsed", {
              name: displayName(item),
              count: String(users.length),
            })
          : game.i18n.format("BB5E.Library.RemoveBody", { name: displayName(item) }),
      )}</p>`,
    });
    if (!confirmed) return;
    if ("params" in item) this.#draft.presets = this.#draft.presets.filter((each) => each.id !== item.id);
    else this.#draft.looks = this.#draft.looks.filter((each) => each.id !== item.id);
    this.#selected = this.#items()[0]?.id ?? null;
    this.#setDirty(true);
    await this.render();
  }

  #download(library: Pick<Library, "looks" | "presets">, file: string) {
    const json = JSON.stringify({ dataVersion: LIBRARY_VERSION, ...library }, null, 2);
    foundry.utils.saveDataToFile(json, "application/json", file);
  }

  static async #onExportAll(this: LibraryApp) {
    this.#download(this.#draft, "boss-bars-5e-library.json");
  }

  /** One own item; a look takes its own presets along so the file stands alone. */
  static async #onExportItem(this: LibraryApp) {
    const item = this.#find(this.#selected);
    if (!item || BUILTIN_IDS.has(item.id)) return;
    if ("params" in item)
      return this.#download({ looks: [], presets: [item] }, `boss-bars-5e-${item.id}.json`);
    const presets = this.#draft.presets.filter((each) => Object.values(item.presets).includes(each.id));
    this.#download({ looks: [item], presets }, `boss-bars-5e-${item.id}.json`);
  }

  static async #onImportClick(this: LibraryApp) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void this.#import(file);
    });
    input.click();
  }

  /** Imported entries are added; an id already in the draft is replaced (re-importing an export updates it). */
  async #import(file: File) {
    const result = parseImport(await foundry.utils.readTextFromFile(file), BUILTIN_IDS);
    if ("error" in result) return ui.notifications.error(result.error, { localize: true });
    const replace = <T extends { id: string }>(current: T[], added: T[]) => [
      ...current.filter((each) => !added.some((other) => other.id === each.id)),
      ...added,
    ];
    this.#draft.looks = replace(this.#draft.looks, result.looks);
    this.#draft.presets = replace(this.#draft.presets, result.presets);
    this.#setDirty(true);
    ui.notifications.info(
      game.i18n.format("BB5E.Library.Imported", {
        looks: String(result.looks.length),
        presets: String(result.presets.length),
      }),
    );
    await this.render();
  }

  /** Saving writes the world setting; a library written by a newer version is never overwritten. */
  static async #onSave(this: LibraryApp) {
    const stored = readLibrary(game.settings.get(MODULE_ID, "library"), BUILTIN_IDS);
    if (stored.status === "newer") return ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    try {
      await game.settings.set(MODULE_ID, "library", {
        dataVersion: LIBRARY_VERSION,
        looks: this.#draft.looks,
        presets: this.#draft.presets,
      });
    } catch (error) {
      logger.error("Library not saved", error);
      return ui.notifications.error("BB5E.Error.WriteFailed", { localize: true });
    }
    this.#setDirty(false);
  }
}

/** The hub's "Look library" section; null (with a warning) when a newer version wrote the library. */
export function hostLibrary(slot: HTMLElement): ApplicationV2Instance | null {
  const stored = readLibrary(game.settings.get(MODULE_ID, "library"), BUILTIN_IDS);
  if (stored.status === "newer") {
    ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    return null;
  }
  const library =
    stored.status === "ok" ? stored.value : { dataVersion: LIBRARY_VERSION, looks: [], presets: [] };
  return new LibraryApp(slot, library);
}
