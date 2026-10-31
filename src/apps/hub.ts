import { MODULE_ID } from "../constants";
import { profileRows } from "../core/hub";
import { readSettingsFile, settingsFile, SETTING_KEYS } from "../core/settings-file";
import { currentLibrary } from "../foundry/library";
import { currentRanks } from "../foundry/settings";
import { sceneItems, type BossHud } from "../foundry/store";
import { hostActiveBosses } from "./active-bosses";
import { hostLibrary } from "./library";
import { hostProfileEditor } from "./profile-editor";
import { hostRanksEditor } from "./ranks-editor";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const TEMPLATES = `modules/${MODULE_ID}/templates`;
const loc = (key: string) => game.i18n.localize(key);

export type HubSection = "scene" | "profiles" | "ranks" | "library";

/** What the hub needs from the running module: the HUD for "On the scene", and the layout mode. */
export interface HubHost {
  hud: BossHud;
  openLayout(): void;
}

/** Sections in the navigation's order; labels are literal keys. */
const SECTIONS = [
  { id: "scene", icon: "fa-solid fa-chess-board", label: "BB5E.Hub.Scene" },
  { id: "profiles", icon: "fa-solid fa-skull", label: "BB5E.Hub.Profiles" },
  { id: "ranks", icon: "fa-solid fa-ranking-star", label: "BB5E.Hub.Ranks" },
  { id: "library", icon: "fa-solid fa-palette", label: "BB5E.Hub.Library" },
] as const;

const isSection = (value: unknown): value is HubSection => SECTIONS.some((each) => each.id === value);

/**
 * A section window is alive while it shows or re-renders: Foundry marks every re-render RENDERING, so `rendered`
 * alone would remount a section caught mid-render and lose its drafts. One that closed itself (a removed profile)
 * is not.
 */
const alive = (child: ApplicationV2Instance) =>
  child.rendered || child.state === ApplicationV2.RENDER_STATES.RENDERING;

/**
 * "Boss Bars" (stage 13): one window for everything a GM sets up. The navigation and the profile list are its own
 * parts; the section itself is one of the GM windows, drawn without a frame into the slot part, which is never
 * re-rendered. Leaving a section with unsaved edits asks first (the section's own close does).
 */
class Hub extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "bb5e-hub",
    classes: ["bb5e-app", "bb5e-hub"],
    window: {
      title: "BB5E.Hub.Title",
      icon: "fa-solid fa-skull-crossbones",
      resizable: true,
      // The ⋮ menu: the world's Boss Bars settings as one file, to carry them to another world.
      controls: [
        { icon: "fa-solid fa-file-export", label: "BB5E.SettingsFile.Export", action: "exportSettings" },
        { icon: "fa-solid fa-file-import", label: "BB5E.SettingsFile.Import", action: "importSettings" },
      ],
    },
    position: { width: 1120, height: 780 },
    actions: {
      section: Hub.#onSection,
      profile: Hub.#onProfile,
      addProfile: Hub.#onAdd,
      exportSettings: Hub.#onExportSettings,
      importSettings: Hub.#onImportSettings,
    },
  };

  static PARTS = {
    nav: { template: `${TEMPLATES}/hub-nav.hbs` },
    list: { template: `${TEMPLATES}/hub-list.hbs`, templates: [`${TEMPLATES}/hub-row.hbs`] },
    slot: { template: `${TEMPLATES}/hub-slot.hbs` },
  };

  #section: HubSection = "scene";
  #actorId: string | null = null;
  #query = "";
  #child: ApplicationV2Instance | null = null;
  #mounted = "";
  #hooks: [string, number][] = [];
  #unsubscribe: (() => void) | null = null;
  /** Section switches run one after another: a second click waits for the first to finish. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(readonly host: HubHost) {
    super();
  }

  /** Shows a section (for profiles, an actor's profile, or the last one shown). */
  show(section: HubSection, actor?: ActorDocument | null): Promise<void> {
    const next = this.#queue.then(() => this.#show(section, actor));
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #show(section: HubSection, actor?: ActorDocument | null) {
    const actorId = section === "profiles" ? (actor?.id ?? this.#actorId) : this.#actorId;
    if (this.rendered && section === this.#section && actorId === this.#actorId) return this.bringToFront();
    if (!(await this.#release())) return;
    this.#section = section;
    this.#actorId = actorId;
    await this.render(this.rendered ? { parts: ["nav", "list"] } : { force: true });
  }

  override async _prepareContext(options: Record<string, unknown>) {
    const actors = game.actors
      .filter((actor) => actor.flags[MODULE_ID]?.profile !== undefined)
      .map((actor) => ({
        id: actor.id,
        name: actor.name,
        img: actor.img,
        profile: actor.flags[MODULE_ID]?.profile,
      }));
    const all = profileRows(actors, "");
    const rows = this.#section === "profiles" ? profileRows(actors, this.#query) : null;
    // Who is on the viewed scene: the roster marks them, the navigation counts them.
    const scene = canvas?.scene ?? null;
    const items = sceneItems(scene);
    const onStage = new Set(
      items.map(
        (item) =>
          item.source ??
          item.actorId ??
          (item.tokenId ? scene?.tokens.get(item.tokenId)?.actorId : undefined),
      ),
    );
    const library = currentLibrary();
    const counts: Record<HubSection, number> = {
      scene: items.length,
      profiles: all.bosses.length + all.elites.length,
      ranks: currentRanks().length,
      library: (library?.looks.length ?? 0) + (library?.presets.length ?? 0),
    };
    const mark = (row: { id: string }) => ({
      ...row,
      selected: row.id === this.#actorId,
      onStage: onStage.has(row.id),
    });
    return {
      ...(await super._prepareContext(options)),
      sections: SECTIONS.map((each) => ({
        ...each,
        label: loc(each.label),
        active: each.id === this.#section,
        count: counts[each.id],
      })),
      profiles: rows && {
        bosses: rows.bosses.map(mark),
        elites: rows.elites.map(mark),
        newer: rows.newer,
        query: this.#query,
        empty: !rows.bosses.length && !rows.elites.length && !rows.newer.length,
      },
    };
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    this.element.dataset.section = this.#section;
    if (options.isFirstRender) this.#listen();
    await this.#mount();
  }

  override async _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onFirstRender(context, options);
    // Profiles come and go from actor sheets, the token HUD and the API: the list follows.
    const refresh = () => {
      if (this.#child && !alive(this.#child)) this.#actorId = null;
      if (this.#section === "profiles") void this.render({ parts: ["list"] });
    };
    this.#hooks = ["createActor", "updateActor", "deleteActor"].map((hook) => [
      hook,
      Hooks.on(hook, refresh),
    ]);
    // Bars shown or hidden: the counts and the roster's stage marks follow.
    this.#unsubscribe = this.host.hud.subscribe(
      () => void this.render({ parts: this.#section === "profiles" ? ["nav", "list"] : ["nav"] }),
    );
  }

  override _onClose(options: Record<string, unknown>) {
    super._onClose(options);
    for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
    this.#hooks = [];
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  /** The section closes first: unsaved edits ask, and a "keep editing" keeps the hub open. */
  override async close(options: Record<string, unknown> = {}) {
    if (!(await this.#release())) return this;
    return super.close(options);
  }

  #listen() {
    this.element.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.name !== "hubSearch") return;
      this.#query = target.value;
      void this.render({ parts: ["list"] }).then(() => {
        const search = this.element.querySelector<HTMLInputElement>('[name="hubSearch"]');
        search?.focus();
        search?.setSelectionRange(search.value.length, search.value.length);
      });
    });
    // An actor dropped from the sidebar opens its profile (a new one if it has none).
    this.element.addEventListener("dragover", (event) => {
      if ((event.target as HTMLElement).closest(".bb5e-hub__list")) event.preventDefault();
    });
    this.element.addEventListener("drop", (event) => {
      if (!(event.target as HTMLElement).closest(".bb5e-hub__list")) return;
      event.preventDefault();
      void this.#onDrop(event.dataTransfer?.getData("text/plain") ?? "");
    });
  }

  async #onDrop(raw: string) {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const uuid = (data as { type?: unknown; uuid?: unknown }).uuid;
    if ((data as { type?: unknown }).type !== "Actor" || typeof uuid !== "string") return;
    const actor = (await foundry.utils.fromUuid(uuid)) as (ActorDocument & { pack?: string | null }) | null;
    if (!actor || actor.pack) return ui.notifications.warn("BB5E.Hub.WorldActorsOnly", { localize: true });
    await this.show("profiles", actor);
  }

  /** Mounts the section's window into the slot, once per section (and profile). */
  async #mount() {
    const key = `${this.#section}:${this.#section === "profiles" ? (this.#actorId ?? "") : ""}`;
    if (key === this.#mounted && (!this.#child || alive(this.#child))) return;
    const slot = this.element.querySelector<HTMLElement>(".bb5e-hub__slot");
    if (!slot) return;
    this.#mounted = key;
    slot.replaceChildren();
    let child: ApplicationV2Instance | null = null;
    switch (this.#section) {
      case "scene":
        child = hostActiveBosses(slot, this.host.hud, { openLayout: this.host.openLayout });
        break;
      case "profiles": {
        const actor = this.#actorId ? game.actors.get(this.#actorId) : undefined;
        child = actor ? hostProfileEditor(slot, actor) : null;
        if (!child) {
          const hint = document.createElement("p");
          hint.className = "bb5e-hub__empty";
          hint.textContent = loc("BB5E.Hub.PickProfile");
          slot.append(hint);
        }
        break;
      }
      case "ranks":
        child = hostRanksEditor(slot);
        break;
      case "library":
        child = hostLibrary(slot);
        break;
    }
    this.#child = child;
    if (child) await child.render({ force: true });
  }

  /** Closes the shown section; false when its unsaved edits were kept. */
  async #release(): Promise<boolean> {
    const child = this.#child;
    if (child && alive(child)) {
      await child.close({ animate: false });
      if (alive(child)) return false;
    }
    this.#child = null;
    this.#mounted = "";
    return true;
  }

  static async #onSection(this: Hub, _event: Event, target: HTMLElement) {
    const section = target.dataset.section;
    if (isSection(section)) await this.show(section);
  }

  static async #onProfile(this: Hub, _event: Event, target: HTMLElement) {
    const actor = game.actors.get(target.dataset.actorId ?? "");
    if (actor) await this.show("profiles", actor);
  }

  static #onExportSettings() {
    const settings = Object.fromEntries(SETTING_KEYS.map((key) => [key, game.settings.get(MODULE_ID, key)]));
    const json = JSON.stringify(settingsFile(settings), null, 2);
    foundry.utils.saveDataToFile(json, "application/json", "boss-bars-5e-settings.json");
  }

  static #onImportSettings(this: Hub) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void this.#importSettings(file);
    });
    input.click();
  }

  /**
   * A settings file replaces the world's ranks, own looks and layout, after the GM confirms; a bad file changes
   * nothing. The open section closes first and opens again on the imported data: its draft would save over it.
   */
  async #importSettings(file: File) {
    const read = readSettingsFile(await foundry.utils.readTextFromFile(file));
    if ("error" in read) return ui.notifications.error(read.error, { localize: true });
    const confirmed = await DialogV2.confirm({
      window: { title: loc("BB5E.SettingsFile.Import") },
      content: `<p>${loc("BB5E.SettingsFile.Confirm")}</p>`,
    });
    if (!confirmed || !(await this.#release())) return;
    for (const [key, value] of Object.entries(read.settings)) await game.settings.set(MODULE_ID, key, value);
    ui.notifications.info("BB5E.SettingsFile.Imported", { localize: true });
    // As #show: the slot part stays, so the section mounted again on the new data is not wiped.
    await this.render({ parts: ["nav", "list"] });
  }

  /** "Selected token": its world actor's profile, made on the first save. */
  static async #onAdd(this: Hub) {
    const token = canvas?.tokens?.controlled[0]?.document;
    const actor = token?.baseActor;
    if (!actor) return ui.notifications.warn("BB5E.Hub.NoToken", { localize: true });
    await this.show("profiles", actor);
  }
}

/** Opens the hub on a section (and an actor's profile), or switches the open one there. */
export function openHub(host: HubHost, section: HubSection, actor?: ActorDocument | null): void {
  const existing = foundry.applications.instances.get("bb5e-hub") as Hub | undefined;
  void (existing ?? new Hub(host)).show(section, actor);
}
