import { MODULE_ID } from "../constants";
import {
  effectiveLayout,
  LAYOUT_LIMITS,
  moveToScreen,
  offscreen,
  overlapping,
  placeRect,
  type Anchor,
  type BlockKey,
  type Direction,
  type Layout,
  type LayoutOverride,
  type Rect,
  type Size,
} from "../core/layout";
import { PLAYER_SCREENS } from "../core/screens";
import {
  measureZones,
  saveSceneOverride,
  saveWorldLayout,
  sceneOverride,
  setLayoutDraft,
  worldLayout,
} from "../foundry/layout";
import type { BossHud } from "../foundry/store";
import { startLayoutMode, type LayoutMode, type LayoutReport } from "../ui/layout-mode";
import { confirmDiscard } from "./shared";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TEMPLATES = `modules/${MODULE_ID}/templates`;
const KEYS: BlockKey[] = ["bosses", "elites"];

const BLOCK_LABELS: Record<BlockKey, string> = {
  bosses: "BB5E.Layout.Block.Bosses",
  elites: "BB5E.Layout.Block.Elites",
};
const ZONE_LABELS: Record<string, string> = {
  controls: "BB5E.Layout.Zone.Controls",
  navigation: "BB5E.Layout.Zone.Navigation",
  players: "BB5E.Layout.Zone.Players",
  hotbar: "BB5E.Layout.Zone.Hotbar",
  sidebar: "BB5E.Layout.Zone.Sidebar",
  notifications: "BB5E.Layout.Zone.Notifications",
  calendar: "BB5E.Layout.Zone.Calendar",
  carousel: "BB5E.Layout.Zone.Carousel",
};
const DIRECTIONS: Record<Direction, string> = {
  down: "BB5E.Layout.Dir.Down",
  up: "BB5E.Layout.Dir.Up",
  row: "BB5E.Layout.Dir.Row",
};
const ARROWS: Record<Anchor, string> = {
  tl: "↖",
  tc: "↑",
  tr: "↗",
  ml: "←",
  mc: "•",
  mr: "→",
  bl: "↙",
  bc: "↓",
  br: "↘",
};
const MAP_SIZE = { w: 372, h: 220 };

/** What the panel needs from the running HUD. */
export interface LayoutHost {
  host: HTMLElement;
  overlay: HTMLElement;
  blocks: Record<BlockKey, HTMLElement>;
  hud: BossHud;
  uiScale(): number;
}

const t = (key: string) => game.i18n.localize(key);

/** "Layout": the floating panel of the layout mode. Edits are a draft until "Save" (decision 3). */
class LayoutPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "bb5e-layout",
    classes: ["bb5e-app"],
    window: { title: "BB5E.Layout.Title", icon: "fa-solid fa-up-down-left-right" },
    position: { width: 420, height: "auto", top: 70, left: 340 },
    actions: { resetBlock: LayoutPanel.#onReset, save: LayoutPanel.#onSave, cancel: LayoutPanel.#onCancel },
  };

  static PARTS = {
    main: { template: `${TEMPLATES}/layout-main.hbs` },
    preview: { template: `${TEMPLATES}/layout-preview.hbs` },
    footer: { template: `${TEMPLATES}/layout-footer.hbs` },
  };

  readonly #host: LayoutHost;
  readonly #scene = canvas?.scene ?? null;
  readonly #savedWorld = worldLayout();
  readonly #savedScene = sceneOverride(this.#scene);
  #world: Layout = structuredClone(this.#savedWorld);
  #override: LayoutOverride = structuredClone(this.#savedScene);
  #layer: "world" | "scene" = "world";
  #selected: BlockKey = "bosses";
  /** -1: the GM's own screen (live measures); otherwise an index of PLAYER_SCREENS. */
  #preview = -1;
  #report: LayoutReport | null = null;
  #mode: LayoutMode | null = null;
  #dirty = false;
  #confirming = false;

  constructor(host: LayoutHost) {
    super();
    this.#host = host;
  }

  #effective(): Layout {
    return effectiveLayout(this.#world, this.#override);
  }

  /** The block as the active layer holds it. */
  #block<K extends BlockKey>(key: K): Layout[K] {
    return (
      (this.#layer === "scene" ? (this.#override[key] as Layout[K] | undefined) : undefined) ??
      this.#world[key]
    );
  }

  /** On the scene layer the first edit copies the world block: an override is always a whole block. */
  #edit(key: BlockKey, patch: Partial<Layout["elites"]>) {
    if (this.#layer === "scene") {
      this.#override[key] ??= structuredClone(this.#world[key]) as Layout["elites"];
      Object.assign(this.#override[key], patch);
    } else {
      Object.assign(this.#world[key], patch);
    }
    this.#dirty = true;
    this.#apply();
  }

  #apply() {
    setLayoutDraft(this.#effective());
    this.#host.hud.refresh();
    this.#mode?.refresh();
  }

  override async _prepareContext(options: Record<string, unknown>) {
    return {
      ...(await super._prepareContext(options)),
      worldLayer: this.#layer === "world",
      hasScene: Boolean(this.#scene),
      blocks: KEYS.map((key) => {
        const block = this.#block(key);
        return {
          key,
          label: t(BLOCK_LABELS[key]),
          selected: key === this.#selected,
          isElites: key === "elites",
          overridden: this.#layer === "scene" && Boolean(this.#override[key]),
          anchorLabel: `${ARROWS[block.anchor]} ${block.anchor}`,
          dx: block.dx,
          dy: block.dy,
          max: key === "elites" ? (block as Layout["elites"]).max : 0,
          collapse: block.collapse,
          dirs: (key === "bosses" ? (["down", "up", "row"] as const) : (["down", "up"] as const)).map(
            (dir) => ({
              value: dir,
              label: t(DIRECTIONS[dir]),
              selected: dir === block.dir,
            }),
          ),
        };
      }),
      limits: LAYOUT_LIMITS,
      screens: [
        { value: -1, label: t("BB5E.Layout.MyScreen"), selected: this.#preview === -1 },
        ...PLAYER_SCREENS.map((screen, index) => ({
          value: index,
          label: `${screen.width}×${screen.height}`,
          selected: this.#preview === index,
        })),
      ],
      ...this.#map(),
    };
  }

  /** The mini-map of the chosen screen: Foundry zones, blocks, and what they cover there. */
  #map() {
    const report = this.#report;
    if (!report) return { map: null, warnings: [] };
    const preset = PLAYER_SCREENS[this.#preview];
    const screen: Size = preset ? { w: preset.width, h: preset.height } : report.screen;
    const layout = this.#effective();
    const zones = report.zones.map((zone) => ({
      ...zone,
      rect: preset ? moveToScreen(zone.rect, report.screen, screen) : zone.rect,
    }));
    const hard = zones.filter((zone) => !zone.soft);
    const k = Math.min(MAP_SIZE.w / screen.w, MAP_SIZE.h / screen.h);
    const scaled = (rect: Rect) => ({ x: rect.x * k, y: rect.y * k, w: rect.w * k, h: rect.h * k });
    const warnings: string[] = [];
    const blocks = KEYS.map((key) => {
      const measured = report.blocks[key].rect;
      const rect = preset ? placeRect(layout[key], measured, screen, this.#host.uiScale()) : measured;
      const covered = overlapping(rect, hard).map((zone) => t(ZONE_LABELS[zone.id] ?? zone.id));
      const outside = offscreen(rect, screen);
      const label = t(BLOCK_LABELS[key]);
      if (covered.length) warnings.push(`${label}: ${t("BB5E.Layout.Covers")} ${covered.join(", ")}`);
      if (outside) warnings.push(`${label}: ${t("BB5E.Layout.Offscreen")}`);
      return { ...scaled(rect), label, warn: covered.length > 0 || outside };
    });
    return {
      map: {
        w: Math.round(screen.w * k),
        h: Math.round(screen.h * k),
        zones: zones.map((zone) => ({
          ...scaled(zone.rect),
          soft: zone.soft,
          label: t(ZONE_LABELS[zone.id] ?? zone.id),
        })),
        blocks,
      },
      warnings,
    };
  }

  override async _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onFirstRender(context, options);
    const { host, overlay, blocks } = this.#host;
    this.#mode = startLayoutMode({
      host,
      overlay,
      blocks,
      labels: { bosses: t(BLOCK_LABELS.bosses), elites: t(BLOCK_LABELS.elites) },
      uiScale: () => this.#host.uiScale(),
      zones: () => measureZones(host).map((zone) => ({ ...zone, label: t(ZONE_LABELS[zone.id] ?? zone.id) })),
      placementOf: (key) => this.#effective()[key],
      onMove: (key, placement) => {
        this.#edit(key, placement);
        this.#showPlacement(key);
      },
      onSelect: (key) => {
        this.#selected = key;
        for (const el of this.element.querySelectorAll<HTMLElement>("[data-block]")) {
          el.classList.toggle("bb5e-layout__block--selected", el.dataset.block === key);
        }
      },
      onExit: () => void this.close(),
      onReport: (report) => {
        this.#report = report;
        void this.render({ parts: ["preview"] });
      },
    });
    this.element.addEventListener("change", (event) => this.#onChange(event));
    this.#apply();
  }

  /** Drag and arrows update the fields in place, so focus and typing in the panel survive. */
  #showPlacement(key: BlockKey) {
    const block = this.#block(key);
    const fieldset = this.element.querySelector(`[data-block="${key}"]`);
    const set = (field: string, value: number) => {
      const input = fieldset?.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
      if (input) input.value = String(value);
    };
    set("dx", block.dx);
    set("dy", block.dy);
    const anchor = fieldset?.querySelector("[data-anchor]");
    if (anchor) anchor.textContent = `${ARROWS[block.anchor]} ${block.anchor}`;
  }

  #onChange(event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.name === "layer") {
      this.#layer = target.value === "scene" ? "scene" : "world";
      void this.render({ parts: ["main"] });
      return;
    }
    if (target.dataset.preview !== undefined) {
      this.#preview = Number(target.value);
      void this.render({ parts: ["preview"] });
      return;
    }
    const key = target.closest<HTMLElement>("[data-block]")?.dataset.block as BlockKey | undefined;
    const field = target.dataset.field;
    if (!key || !field) return;
    const value =
      target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target.type === "number"
          ? Number(target.value)
          : target.value;
    this.#edit(key, { [field]: value });
    // The scene layer may just have created an override: show its reset button.
    if (this.#layer === "scene") void this.render({ parts: ["main"] });
  }

  override async close(options: Record<string, unknown> = {}) {
    if (this.#dirty && !options.force) {
      if (this.#confirming) return this;
      this.#confirming = true;
      const discard = await confirmDiscard();
      this.#confirming = false;
      if (!discard) return this;
    }
    this.#mode?.stop();
    this.#mode = null;
    setLayoutDraft(null);
    this.#host.hud.refresh();
    return super.close(options);
  }

  static async #onReset(this: LayoutPanel, _event: Event, target: HTMLElement) {
    const key = target.dataset.block as BlockKey | undefined;
    if (!key) return;
    this.#override = Object.fromEntries(
      Object.entries(this.#override).filter(([each]) => each !== key),
    ) as LayoutOverride;
    this.#dirty = true;
    this.#apply();
    await this.render({ parts: ["main"] });
  }

  /** Writes only what changed: the world setting, the scene flag, or both. */
  static async #onSave(this: LayoutPanel) {
    if (JSON.stringify(this.#world) !== JSON.stringify(this.#savedWorld)) await saveWorldLayout(this.#world);
    if (this.#scene && JSON.stringify(this.#override) !== JSON.stringify(this.#savedScene)) {
      await saveSceneOverride(this.#scene, this.#override);
    }
    this.#dirty = false;
    await this.close();
  }

  static async #onCancel(this: LayoutPanel) {
    await this.close();
  }
}

export function openLayoutPanel(host: LayoutHost): void {
  const existing = foundry.applications.instances.get("bb5e-layout");
  void (existing ?? new LayoutPanel(host)).render({ force: true });
}
