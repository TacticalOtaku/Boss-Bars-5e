// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockKey, Placement } from "../src/core/layout";
import { startLayoutMode } from "../src/ui/layout-mode";

let host: HTMLElement;
let overlay: HTMLElement;
let blocks: Record<BlockKey, HTMLElement>;
const placements: Record<BlockKey, Placement> = {
  bosses: { anchor: "tc", dx: 0, dy: 16 },
  elites: { anchor: "ml", dx: 104, dy: 0 },
};

let running: { stop(): void } | null = null;

function start() {
  const onMove = vi.fn((key: BlockKey, placement: Placement) => (placements[key] = placement));
  const onExit = vi.fn();
  const mode = startLayoutMode({
    host,
    overlay,
    blocks,
    labels: { bosses: "Boss stack", elites: "Elite column" },
    uiScale: () => 1,
    zones: () => [{ id: "hotbar", label: "Hotbar", rect: { x: 0, y: 0, w: 10, h: 10 }, soft: false }],
    placementOf: (key) => placements[key],
    onMove,
    onSelect: () => undefined,
    onExit,
    onReport: () => undefined,
  });
  running = mode;
  return { mode, onMove, onExit };
}

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));

beforeEach(() => {
  document.body.innerHTML =
    '<div id="interface"><div id="boss-bars-5e"><div class="bb5e-stack"></div><div class="bb5e-column"></div></div></div>' +
    '<input id="field" type="number">';
  host = document.getElementById("interface")!;
  overlay = document.getElementById("boss-bars-5e")!;
  blocks = { bosses: overlay.querySelector(".bb5e-stack")!, elites: overlay.querySelector(".bb5e-column")! };
  placements.bosses = { anchor: "tc", dx: 0, dy: 16 };
});

// The mode listens on document: stop it after each test so handlers do not pile up.
afterEach(() => {
  running?.stop();
  running = null;
});

describe("startLayoutMode", () => {
  it("frames the blocks and names them for assistive tech", () => {
    start();
    expect(overlay.classList.contains("bb5e-layout-mode")).toBe(true);
    expect(blocks.bosses.dataset.label).toBe("Boss stack");
    expect(blocks.elites.getAttribute("aria-label")).toBe("Elite column");
    expect(blocks.bosses.tabIndex).toBe(0);
  });

  it("nudges the selected block with the arrows, 10 px with Shift", () => {
    const { onMove } = start();
    press("ArrowDown");
    press("ArrowLeft", { shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith("bosses", { anchor: "tc", dx: -10, dy: 17 });
  });

  it("leaves keys typed into the panel's fields alone and exits on Escape", () => {
    const { onMove, onExit } = start();
    press("ArrowUp", {}, document.getElementById("field")!);
    expect(onMove).not.toHaveBeenCalled();
    press("Escape");
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("removes every trace when stopped", () => {
    const { mode, onMove } = start();
    mode.stop();
    press("ArrowDown");
    expect(onMove).not.toHaveBeenCalled();
    expect(overlay.classList.contains("bb5e-layout-mode")).toBe(false);
    expect(overlay.querySelector(".bb5e-zones, .bb5e-guide")).toBeNull();
    expect(blocks.bosses.hasAttribute("tabindex")).toBe(false);
    expect(blocks.bosses.dataset.label).toBeUndefined();
  });
});
