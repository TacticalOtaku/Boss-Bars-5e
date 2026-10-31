// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Placement } from "../src/core/layout";
import { startHudDrag } from "../src/ui/hud-drag";

let host: HTMLElement;
let overlay: HTMLElement;
let a: HTMLElement;
let b: HTMLElement;
let column: HTMLElement;
let width: number;
let hostScale: number;
const stored = new Map<string, Placement>();
let controller: ReturnType<typeof startHudDrag>;
let commits: number;
let saveResult: boolean;
let errors: number;
let saveWait: Promise<void> | null;

function geometry(el: HTMLElement, x: number, y: number, w = 200, h = 60) {
  el.getBoundingClientRect = () => {
    const match = el.style.transform.match(/translate\(([-.\d]+)px, ([-.\d]+)px\)/);
    return new DOMRect(
      (x + Number(match?.[1] ?? 0)) * hostScale,
      (y + Number(match?.[2] ?? 0)) * hostScale,
      w * hostScale,
      h * hostScale,
    );
  };
}
function boot() {
  const result = startHudDrag({
    host,
    overlay,
    uiScale: () => 1,
    hint: "Drag; arrows move, Home resets",
    positionOf: (scene, id) => stored.get(`${scene}:${id}`) ?? null,
    save: async (scene, id, position) => {
      commits++;
      await saveWait;
      if (!saveResult) return false;
      if (position) stored.set(`${scene}:${id}`, position);
      else stored.delete(`${scene}:${id}`);
      return true;
    },
    onError: () => {
      errors++;
    },
  });
  result.update("scene-a", [
    { id: "a", element: a, label: "Boss A" },
    { id: "b", element: b, label: "Boss B" },
    { id: "elites", element: column, label: "Elites" },
  ]);
  return result;
}
function pointer(target: EventTarget, type: string, x: number, y: number, button = 0) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      isPrimary: true,
      button,
      clientX: x,
      clientY: y,
    }),
  );
}
function drag(el: HTMLElement, x: number, y: number) {
  pointer(el, "pointerdown", 120, 110);
  pointer(window, "pointermove", x, y);
  pointer(window, "pointerup", x, y);
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  document.body.innerHTML =
    '<div id="host"><div id="overlay"><div id="a"><button>Collapse</button></div><div id="b"></div><div id="column"><div class="card">Elite A</div><div class="card">Elite B</div></div></div></div>';
  host = document.getElementById("host")!;
  overlay = document.getElementById("overlay")!;
  a = document.getElementById("a")!;
  b = document.getElementById("b")!;
  column = document.getElementById("column")!;
  width = 1000;
  hostScale = 1;
  Object.defineProperties(host, { clientWidth: { get: () => width }, clientHeight: { get: () => 700 } });
  host.getBoundingClientRect = () => new DOMRect(0, 0, width * hostScale, 700 * hostScale);
  geometry(a, 100, 100);
  geometry(b, 100, 170);
  geometry(column, 20, 300, 100, 180);
  stored.clear();
  commits = 0;
  saveResult = true;
  errors = 0;
  saveWait = null;
  controller = boot();
});
afterEach(() => controller.stop());

describe("direct client HUD movement", () => {
  it("moves one boss after a threshold and persists only a completed drag", async () => {
    pointer(a, "pointerdown", 120, 110);
    pointer(window, "pointermove", 122, 112);
    expect(a.getBoundingClientRect().left).toBe(100);
    pointer(window, "pointermove", 220, 160);
    expect(a.getBoundingClientRect().left).toBe(200);
    expect(a.getBoundingClientRect().top).toBe(150);
    expect(b.getBoundingClientRect().left).toBe(100);
    expect(commits).toBe(0);
    pointer(window, "pointerup", 220, 160);
    await settle();
    expect(stored.get("scene-a:a")).toEqual({ anchor: "tl", dx: 200, dy: 150 });
  });

  it("uses logical screen coordinates under a transformed host", async () => {
    hostScale = 0.5;
    controller.refresh();
    pointer(a, "pointerdown", 60, 55);
    pointer(window, "pointermove", 110, 80);
    pointer(window, "pointerup", 110, 80);
    await settle();
    expect(a.getBoundingClientRect().left).toBe(100);
    expect(a.getBoundingClientRect().top).toBe(75);
    expect(stored.get("scene-a:a")).toEqual({ anchor: "tl", dx: 200, dy: 150 });
  });

  it("moves the elite column as one unit and restores positions when reloaded", async () => {
    drag(column.querySelector(".card")!, 180, 140);
    await settle();
    expect(column.getBoundingClientRect().left).toBe(80);
    expect(column.querySelectorAll(".card")).toHaveLength(2);
    controller.stop();
    controller = boot();
    expect(column.getBoundingClientRect().left).toBe(80);
    expect(a.getBoundingClientRect().left).toBe(100);
    controller.update("scene-b", [{ id: "elites", element: column, label: "Elites" }]);
    expect(column.getBoundingClientRect().left).toBe(20);
  });

  it.each(["pointercancel", "lostpointercapture", "Escape"])(
    "cancels %s without storing the preview",
    async (cancel) => {
      pointer(a, "pointerdown", 120, 110);
      pointer(window, "pointermove", 220, 160);
      if (cancel === "Escape")
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      else pointer(cancel === "lostpointercapture" ? a : window, cancel, 220, 160);
      pointer(window, "pointerup", 220, 160);
      await settle();
      expect(a.getBoundingClientRect().left).toBe(100);
      expect(commits).toBe(0);
    },
  );

  it("leaves buttons, simple clicks and right-button gestures usable", () => {
    let clicked = 0;
    const button = a.querySelector("button")!;
    button.addEventListener("click", () => clicked++);
    drag(button, 250, 250);
    button.click();
    pointer(a, "pointerdown", 120, 110, 2);
    pointer(window, "pointermove", 250, 250, 2);
    pointer(window, "pointerup", 250, 250, 2);
    pointer(a, "pointerdown", 120, 110);
    pointer(window, "pointerup", 120, 110);
    expect(clicked).toBe(1);
    expect(a.getBoundingClientRect().left).toBe(100);
    expect(commits).toBe(0);
  });

  it("keeps a dragged boss visible after resizing, and offers focused keyboard movement and reset", async () => {
    drag(a, 1020, 110);
    await settle();
    expect(a.getBoundingClientRect().left).toBe(800);
    width = 500;
    controller.refresh();
    expect(a.getBoundingClientRect().left).toBe(300);
    a.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true }),
    );
    await settle();
    expect(a.getBoundingClientRect().left).toBe(290);
    a.querySelector("button")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(a.getBoundingClientRect().left).toBe(290);
    a.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    await settle();
    expect(a.getBoundingClientRect().left).toBe(100);
    expect(stored.has("scene-a:a")).toBe(false);
  });

  it("reverts a failed save without losing the last persisted position", async () => {
    saveResult = false;
    drag(a, 220, 160);
    expect(a.getBoundingClientRect().left).toBe(200);
    await settle();
    expect(a.getBoundingClientRect().left).toBe(100);
    expect(errors).toBe(1);
    expect(stored.has("scene-a:a")).toBe(false);
  });

  it("keeps a pending completed move through HUD rerenders and saves it to the original scene", async () => {
    let finish!: () => void;
    saveWait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    drag(a, 220, 160);
    controller.update("scene-a", [{ id: "a", element: a, label: "Boss A" }]);
    expect(a.getBoundingClientRect().left).toBe(200);
    controller.update("scene-b", [{ id: "a", element: a, label: "Boss A" }]);
    expect(a.getBoundingClientRect().left).toBe(100);
    finish();
    await settle();
    expect(stored.get("scene-a:a")).toEqual({ anchor: "tl", dx: 200, dy: 150 });
    expect(stored.has("scene-b:a")).toBe(false);
    expect(a.getBoundingClientRect().left).toBe(100);
  });

  it("cancels a gesture when its scene or target disappears", () => {
    pointer(a, "pointerdown", 120, 110);
    pointer(window, "pointermove", 220, 160);
    controller.update("scene-b", [{ id: "a", element: a, label: "Boss A" }]);
    pointer(window, "pointerup", 220, 160);
    expect(a.getBoundingClientRect().left).toBe(100);
    expect(commits).toBe(0);
    pointer(a, "pointerdown", 120, 110);
    pointer(window, "pointermove", 220, 160);
    controller.update("scene-b", []);
    pointer(window, "pointerup", 220, 160);
    expect(commits).toBe(0);
    expect(a.hasAttribute("tabindex")).toBe(false);
    expect(a.inert).toBe(true);
  });

  it("keeps an exiting target at its dragged position while disabling interaction", async () => {
    drag(a, 220, 160);
    await settle();
    controller.update("scene-a", [{ id: "b", element: b, label: "Boss B" }]);
    expect(a.getBoundingClientRect().left).toBe(200);
    expect(a.getBoundingClientRect().top).toBe(150);
    expect(a.hasAttribute("tabindex")).toBe(false);
    drag(a, 320, 260);
    expect(commits).toBe(1);
    controller.update("scene-a", [{ id: "a", element: a, label: "Boss A" }]);
    expect(a.getBoundingClientRect().left).toBe(200);
    expect(a.tabIndex).toBe(0);
    expect(a.inert).toBe(false);
  });

  it("reapplies saved positions when an asynchronous exit changes the containing stack origin", async () => {
    controller.stop();
    let notify!: (element: Element) => void;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        readonly observed = new Set<Element>();
        constructor(callback: ResizeObserverCallback) {
          notify = (element: Element) => {
            if (this.observed.has(element)) callback([], this as unknown as ResizeObserver);
          };
        }
        observe(element: Element) {
          this.observed.add(element);
        }
        unobserve(element: Element) {
          this.observed.delete(element);
        }
        disconnect() {
          this.observed.clear();
        }
      },
    );
    controller = boot();
    drag(a, 220, 160);
    await settle();
    // A larger sibling finishes its exit: centered parent moves, but A's own dimensions do not change.
    geometry(a, 180, 100);
    notify(overlay);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(a.getBoundingClientRect().left).toBe(200);
  });

  it("cleans up an in-progress gesture, observers and keyboard ownership on stop", () => {
    pointer(a, "pointerdown", 120, 110);
    pointer(window, "pointermove", 220, 160);
    controller.stop();
    pointer(window, "pointerup", 220, 160);
    a.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(commits).toBe(0);
    expect(a.getAttribute("tabindex")).toBeNull();
    expect(a.style.transform).toBe("");
  });
});
