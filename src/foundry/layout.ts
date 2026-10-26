import { MODULE_ID } from "../constants";
import {
  DEFAULT_LAYOUT,
  effectiveLayout,
  LAYOUT_VERSION,
  readLayout,
  readOverride,
  type Layout,
  type LayoutOverride,
  type Rect,
} from "../core/layout";
import type { ReadResult } from "../core/schema";

/** The world layout as stored (the old "players may collapse" setting seeds it until the first save). */
export function storedLayout(): ReadResult<Layout> {
  const legacy = game.settings.get(MODULE_ID, "playersMayCollapse") !== false;
  return readLayout(game.settings.get(MODULE_ID, "layout"), legacy);
}

export function worldLayout(): Layout {
  const read = storedLayout();
  return read.status === "ok" ? read.value : DEFAULT_LAYOUT;
}

export function sceneOverride(scene: SceneDocument | null | undefined): LayoutOverride {
  return readOverride(scene?.flags[MODULE_ID]?.layout);
}

/** The GM's unsaved layout while the layout mode is open; it replaces the stored one on that GM's screen only. */
let draft: Layout | null = null;

export function setLayoutDraft(layout: Layout | null): void {
  draft = layout;
}

export function currentLayout(scene: SceneDocument | null | undefined): Layout {
  return draft ?? effectiveLayout(worldLayout(), sceneOverride(scene));
}

/** Any GM writes the layout directly: it is a world setting and a scene flag, not an instance (spec §2). */
export async function saveWorldLayout(layout: Layout): Promise<void> {
  await game.settings.set(MODULE_ID, "layout", { dataVersion: LAYOUT_VERSION, ...layout });
}

/**
 * An empty override removes the flag; otherwise the flag is replaced whole in one write, so reset blocks really go
 * away and no client sees the world layout in between.
 */
export async function saveSceneOverride(scene: SceneDocument, override: LayoutOverride): Promise<void> {
  if (!override.bosses && !override.elites) await scene.unsetFlag(MODULE_ID, "layout");
  else await scene.setFlag(MODULE_ID, "layout", _replace({ dataVersion: LAYOUT_VERSION, ...override }));
}

export interface Zone {
  id: string;
  rect: Rect;
  /** Shown only at times (notifications, dnd5e calendar): drawn dashed. */
  soft: boolean;
}

/**
 * Foundry UI the blocks should not cover, measured live in #interface coordinates. Containers such as
 * #scene-controls and #scene-navigation span the whole column, so their visible items are measured instead.
 */
const ZONES: { id: string; selector: string; soft?: boolean }[] = [
  { id: "controls", selector: "#scene-controls li" },
  { id: "navigation", selector: "#scene-navigation li" },
  { id: "players", selector: "#players li" },
  { id: "hotbar", selector: "#hotbar" },
  { id: "sidebar", selector: "#sidebar-tabs, #sidebar-content.expanded" },
  { id: "notifications", selector: "#notifications li", soft: true },
  { id: "calendar", selector: "#calendar-hud", soft: true },
  // Carousel Combat Tracker (combat-tracker-dock) prepends #combat-dock to #ui-top.
  { id: "carousel", selector: "#combat-dock:not(.hidden)" },
];

export function measureZones(host: HTMLElement): Zone[] {
  const origin = host.getBoundingClientRect();
  return ZONES.flatMap(({ id, selector, soft = false }) => {
    const rects = [...document.querySelectorAll(selector)]
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) return [];
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return [
      { id, soft, rect: { x: left - origin.left, y: top - origin.top, w: right - left, h: bottom - top } },
    ];
  });
}
