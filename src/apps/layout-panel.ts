import { MODULE_ID } from "../constants";
import { LAYOUT_LIMITS, LAYOUT_VERSION, readLayout, type BlockKey, type Layout } from "../core/layout";
import { isRecord } from "../core/schema";
import { saveClientPreferences } from "../foundry/client-layout";
import { currentLayout, setLayoutDraft } from "../foundry/layout";
import type { BossHud } from "../foundry/store";
import { confirmDiscard } from "./shared";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TEMPLATES = `modules/${MODULE_ID}/templates`;
const KEYS: BlockKey[] = ["bosses", "elites"];
const BLOCK_LABELS = { bosses: "BB5E.Layout.Block.Bosses", elites: "BB5E.Layout.Block.Elites" };
const DIR_LABELS = { down: "BB5E.Layout.Dir.Down", up: "BB5E.Layout.Dir.Up", row: "BB5E.Layout.Dir.Row" };
const t = (key: string) => game.i18n.localize(key);

/** Retained as the public layoutMode API's local preferences/reset surface. */
export interface LayoutHost {
  host: HTMLElement;
  overlay: HTMLElement;
  blocks: Record<BlockKey, HTMLElement>;
  hud: BossHud;
  uiScale(): number;
}

/** Positions are always directly draggable; opening this window never starts a separate HUD mode. */
class LayoutPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "bb5e-layout",
    classes: ["bb5e-app"],
    window: { title: "BB5E.Layout.Title", icon: "fa-solid fa-up-down-left-right" },
    position: { width: 420, height: "auto", top: 70, left: 340 },
    actions: { save: LayoutPanel.#onSave, cancel: LayoutPanel.#onCancel },
  };
  static PARTS = {
    main: { template: `${TEMPLATES}/layout-main.hbs` },
    footer: { template: `${TEMPLATES}/layout-footer.hbs` },
  };
  readonly #host: LayoutHost;
  readonly #scene = canvas?.scene ?? null;
  #layout: Layout = structuredClone(currentLayout(this.#scene));
  #resetPositions = false;
  #dirty = false;
  #confirming = false;

  constructor(host: LayoutHost) {
    super();
    this.#host = host;
  }

  override async _prepareContext(options: Record<string, unknown>) {
    return {
      ...(await super._prepareContext(options)),
      hasScene: Boolean(this.#scene),
      resetPositions: this.#resetPositions,
      limits: LAYOUT_LIMITS,
      blocks: KEYS.map((key) => ({
        key,
        label: t(BLOCK_LABELS[key]),
        isElites: key === "elites",
        collapse: this.#layout[key].collapse,
        max: key === "elites" ? this.#layout.elites.max : 0,
        dirs: (key === "bosses" ? ["down", "up", "row"] : ["down", "up"]).map((dir) => ({
          value: dir,
          label: t(DIR_LABELS[dir as keyof typeof DIR_LABELS]),
          selected: dir === this.#layout[key].dir,
        })),
      })),
    };
  }

  override async _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onFirstRender(context, options);
    this.element.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement;
      if (input instanceof HTMLInputElement && input.name === "resetPositions") {
        this.#resetPositions = input.checked;
      } else {
        const key = input.closest<HTMLElement>("[data-block]")?.dataset.block as BlockKey | undefined;
        const field = input.dataset.field;
        if (!key || !field) return;
        const value =
          input instanceof HTMLInputElement && input.type === "checkbox"
            ? input.checked
            : input.type === "number"
              ? Number(input.value)
              : input.value;
        const raw = structuredClone(this.#layout);
        Object.assign(raw[key], { [field]: value });
        const read = readLayout({ dataVersion: 1, ...raw }, true);
        if (read.status !== "ok") return;
        this.#layout = read.value;
        setLayoutDraft(this.#layout);
        this.#host.hud.refresh();
      }
      this.#dirty = true;
    });
  }

  override async close(options: Record<string, unknown> = {}) {
    if (this.#dirty && !options.force) {
      if (this.#confirming) return this;
      this.#confirming = true;
      const discard = await confirmDiscard();
      this.#confirming = false;
      if (!discard) return this;
    }
    setLayoutDraft(null);
    this.#host.hud.refresh();
    return super.close(options);
  }

  static async #onSave(this: LayoutPanel) {
    try {
      const saved = await saveClientPreferences(
        this.#layout,
        this.#resetPositions ? this.#scene?.id : undefined,
      );
      if (!saved) {
        ui.notifications.error("BB5E.Layout.SaveFailed", { localize: true });
        return;
      }
      this.#dirty = false;
      await this.close();
    } catch {
      ui.notifications.error("BB5E.Layout.SaveFailed", { localize: true });
    }
  }
  static async #onCancel(this: LayoutPanel) {
    await this.close();
  }
}

/** Written by a newer module version: read as the default, so a save from here would replace it. */
const newer = (raw: unknown) => isRecord(raw) && Number(raw.dataVersion) > LAYOUT_VERSION;

export function openLayoutPanel(host: LayoutHost): void {
  if (newer(game.settings.get(MODULE_ID, "layout")) || newer(canvas?.scene?.flags[MODULE_ID]?.layout)) {
    ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    return;
  }
  const existing = foundry.applications.instances.get("bb5e-layout");
  void (existing ?? new LayoutPanel(host)).render({ force: true });
}
