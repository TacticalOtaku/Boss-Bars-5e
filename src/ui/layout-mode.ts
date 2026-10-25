import {
  offscreen,
  overlapping,
  snap,
  toAnchor,
  type BlockKey,
  type Placement,
  type Rect,
  type Size,
} from "../core/layout";
import { part } from "./dom";

export interface LayoutZone {
  id: string;
  label: string;
  rect: Rect;
  soft: boolean;
}

export interface BlockReport {
  rect: Rect;
  /** Labels of the hard zones it covers (soft zones only warn on the mini-map). */
  overlaps: string[];
  offscreen: boolean;
}

export interface LayoutReport {
  screen: Size;
  zones: LayoutZone[];
  blocks: Record<BlockKey, BlockReport>;
}

export interface LayoutModeOptions {
  /** #interface: the screen the anchors refer to. */
  host: HTMLElement;
  overlay: HTMLElement;
  blocks: Record<BlockKey, HTMLElement>;
  labels: Record<BlockKey, string>;
  uiScale(): number;
  zones(): LayoutZone[];
  placementOf(key: BlockKey): Placement;
  onMove(key: BlockKey, placement: Placement): void;
  onSelect(key: BlockKey): void;
  onExit(): void;
  onReport(report: LayoutReport): void;
}

const KEYS: BlockKey[] = ["bosses", "elites"];

function relativeRect(el: HTMLElement, host: HTMLElement): Rect {
  const box = el.getBoundingClientRect();
  const origin = host.getBoundingClientRect();
  return { x: box.left - origin.left, y: box.top - origin.top, w: box.width, h: box.height };
}

/**
 * The layout mode on the GM's own screen: blocks get a frame and take the pointer, drag snaps to the centre and
 * edges and re-anchors by screen thirds, Foundry's UI is drawn as zones and covered zones are reported.
 */
export function startLayoutMode(options: LayoutModeOptions) {
  const { host, overlay, blocks } = options;
  overlay.classList.add("bb5e-layout-mode");
  const zonesLayer = part("div", "bb5e-zones", overlay);
  const guideV = part("div", "bb5e-guide bb5e-guide--v", overlay);
  const guideH = part("div", "bb5e-guide bb5e-guide--h", overlay);
  let selected: BlockKey = "bosses";
  let frame = 0;

  for (const key of KEYS) {
    const el = blocks[key];
    el.dataset.label = options.labels[key];
    el.tabIndex = 0;
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", options.labels[key]);
  }

  const screen = (): Size => {
    const box = host.getBoundingClientRect();
    return { w: box.width, h: box.height };
  };

  function report() {
    frame = 0;
    const zones = options.zones();
    const size = screen();
    zonesLayer.replaceChildren(
      ...zones.map((zone) => {
        const el = part("div", `bb5e-zone${zone.soft ? " bb5e-zone--soft" : ""}`);
        Object.assign(el.style, {
          left: `${zone.rect.x}px`,
          top: `${zone.rect.y}px`,
          width: `${zone.rect.w}px`,
          height: `${zone.rect.h}px`,
        });
        el.textContent = zone.label;
        return el;
      }),
    );
    const hard = zones.filter((zone) => !zone.soft);
    const result = {} as Record<BlockKey, BlockReport>;
    for (const key of KEYS) {
      const rect = relativeRect(blocks[key], host);
      const overlaps = overlapping(rect, hard).map((zone) => zone.label);
      const outside = offscreen(rect, size);
      blocks[key].classList.toggle("bb5e-block--warn", overlaps.length > 0 || outside);
      blocks[key].classList.toggle("bb5e-block--selected", key === selected);
      result[key] = { rect, overlaps, offscreen: outside };
    }
    options.onReport({ screen: size, zones, blocks: result });
  }

  /** Measures after the browser has applied the latest positions. */
  function refresh() {
    if (!frame) frame = requestAnimationFrame(report);
  }

  function select(key: BlockKey) {
    selected = key;
    options.onSelect(key);
    refresh();
  }

  let drag: { key: BlockKey; start: Rect; x: number; y: number; pointer: number } | null = null;

  function onPointerDown(event: PointerEvent) {
    const key = KEYS.find((each) => blocks[each].contains(event.target as Node));
    if (!key || event.button !== 0) return;
    // Buttons inside a block (collapse) stay usable; dragging starts anywhere else.
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    select(key);
    try {
      blocks[key].setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer (automation, another module) has nothing to capture; dragging still works.
    }
    drag = {
      key,
      start: relativeRect(blocks[key], host),
      x: event.clientX,
      y: event.clientY,
      pointer: event.pointerId,
    };
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const moved = {
      ...drag.start,
      x: drag.start.x + event.clientX - drag.x,
      y: drag.start.y + event.clientY - drag.y,
    };
    const snapped = snap(moved, screen());
    guideV.classList.toggle("bb5e-guide--on", snapped.guides.vertical);
    guideH.classList.toggle("bb5e-guide--on", snapped.guides.horizontal);
    options.onMove(drag.key, toAnchor(snapped.rect, screen(), options.uiScale()));
    refresh();
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag = null;
    guideV.classList.remove("bb5e-guide--on");
    guideH.classList.remove("bb5e-guide--on");
    refresh();
  }

  const STEPS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  /** Arrows nudge the selected block (Shift: 10 px), Escape leaves; typing in the panel's fields is left alone. */
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, select, textarea, [contenteditable]")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      options.onExit();
      return;
    }
    const step = STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const factor = event.shiftKey ? 10 : 1;
    const placement = options.placementOf(selected);
    options.onMove(selected, {
      ...placement,
      dx: placement.dx + step[0] * factor,
      dy: placement.dy + step[1] * factor,
    });
    refresh();
  }

  const onFocus = (event: FocusEvent) => {
    const key = KEYS.find((each) => blocks[each] === event.target);
    if (key) select(key);
  };

  overlay.addEventListener("pointerdown", onPointerDown);
  overlay.addEventListener("pointermove", onPointerMove);
  overlay.addEventListener("pointerup", onPointerUp);
  overlay.addEventListener("pointercancel", onPointerUp);
  overlay.addEventListener("focusin", onFocus);
  // Capture: Foundry's own keyboard handling (token moves, Escape) must not see these keys.
  document.addEventListener("keydown", onKeyDown, true);
  // #interface changes size without a resize event (camera dock), so it is observed directly.
  const observer = new ResizeObserver(refresh);
  observer.observe(host);
  for (const key of KEYS) observer.observe(blocks[key]);
  refresh();

  return {
    refresh,
    select,
    stop() {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("pointermove", onPointerMove);
      overlay.removeEventListener("pointerup", onPointerUp);
      overlay.removeEventListener("pointercancel", onPointerUp);
      overlay.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.classList.remove("bb5e-layout-mode");
      zonesLayer.remove();
      guideV.remove();
      guideH.remove();
      for (const key of KEYS) {
        const el = blocks[key];
        el.classList.remove("bb5e-block--warn", "bb5e-block--selected");
        el.removeAttribute("tabindex");
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
        delete el.dataset.label;
      }
    },
  };
}

export type LayoutMode = ReturnType<typeof startLayoutMode>;
