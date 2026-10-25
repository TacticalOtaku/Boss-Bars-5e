// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BossBarView } from "../src/core/view";
import { createBossStack } from "../src/ui/boss-stack";

const view = (id: string, extra: Partial<BossBarView> = {}): BossBarView => ({
  id,
  label: `Boss ${id}`,
  title: "",
  portrait: { src: "boss.webp", video: false },
  size: 100,
  fraction: 0.5,
  defeated: false,
  muted: false,
  collapsed: false,
  canCollapse: false,
  ...extra,
});

let overlay: HTMLElement;
const onCollapse = vi.fn();
const make = () =>
  createBossStack(overlay, {
    labels: { collapse: "Collapse", expand: "Expand" },
    onCollapse,
    reducedMotion: () => true,
  });
const bars = () => [...overlay.querySelectorAll<HTMLElement>(".bb5e-boss")];

beforeEach(() => {
  document.body.innerHTML = '<div id="boss-bars-5e"></div>';
  overlay = document.getElementById("boss-bars-5e")!;
  onCollapse.mockReset();
});

describe("createBossStack", () => {
  it("shows ×N only for a bar bound to an actor", () => {
    const stack = make();
    stack.update([view("a", { count: 3 })], 1);
    const count = overlay.querySelector<HTMLElement>(".bb5e-boss__count")!;
    expect([count.hidden, count.textContent]).toEqual([false, "×3"]);
    stack.update([view("a")], 1);
    expect(count.hidden).toBe(true);
  });

  it("renders texts as text and keeps HP numbers out of a player's bar", () => {
    make().update([view("a", { label: "<img src=x onerror=alert(1)>", title: "Пожиратель" })], 1);
    const bar = bars()[0]!;
    expect(bar.querySelector(".bb5e-boss__name")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(bar.querySelectorAll("img[onerror]")).toHaveLength(0);
    expect(bar.querySelector(".bb5e-boss__numbers")?.textContent).toBe("");
    expect(bar.querySelector(".bb5e-boss__meter")?.getAttribute("aria-valuenow")).toBe("50");
    expect(bar.querySelector<HTMLElement>(".bb5e-boss__fill")?.style.transform).toBe("scaleX(0.5)");
  });

  it("leaves a running trail alone when the same fill is rendered again", async () => {
    const stack = make();
    stack.update([view("a", { fraction: 1 })], 1);
    stack.update([view("a", { fraction: 0.4 })], 1);
    const trail = overlay.querySelector<HTMLElement>(".bb5e-boss__trail")!;
    const changes: string[] = [];
    new MutationObserver((records) => records.forEach((r) => changes.push(String(r.attributeName)))).observe(
      trail,
      {
        attributes: true,
      },
    );
    stack.update([view("a", { fraction: 0.4 })], 1);
    await Promise.resolve();
    expect(changes).toEqual([]);
    expect(trail.style.transform).toBe("scaleX(0.4)");
  });

  it("shows numbers to the GM and an empty fill when defeated", () => {
    make().update([view("a", { numbers: { value: 30, max: 60, temp: 4 }, defeated: true })], 1);
    const bar = bars()[0]!;
    expect(bar.querySelector(".bb5e-boss__numbers")?.textContent).toBe("30 / 60 +4");
    expect(bar.classList.contains("bb5e-boss--defeated")).toBe(true);
    expect(bar.querySelector<HTMLElement>(".bb5e-boss__fill")?.style.transform).toBe("scaleX(0)");
  });

  it("keeps the stack in show order; a hidden bar leaves after the shown ones and can come back", () => {
    const stack = make();
    stack.update([view("a"), view("b")], 1.25);
    stack.update([view("b"), view("c")], 1.25);
    expect(bars().map((bar) => bar.dataset.instanceId)).toEqual(["b", "c", "a"]);
    stack.update([view("a"), view("b"), view("c")], 1.25);
    expect(bars().map((bar) => bar.dataset.instanceId)).toEqual(["a", "b", "c"]);
    expect(overlay.querySelector<HTMLElement>(".bb5e-stack")?.style.getPropertyValue("--bb5e-ui-scale")).toBe(
      "1.25",
    );
  });

  it("removes a hidden bar at once where Web Animations are missing", () => {
    const animate = Element.prototype.animate;
    Object.defineProperty(Element.prototype, "animate", { value: undefined, configurable: true });
    try {
      const stack = make();
      stack.update([view("a"), view("b")], 1);
      stack.update([view("b")], 1);
      expect(bars().map((bar) => bar.dataset.instanceId)).toEqual(["b"]);
    } finally {
      Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
    }
  });

  it("swaps the portrait between image and video", () => {
    const stack = make();
    stack.update([view("a")], 1);
    stack.update([view("a", { portrait: { src: "boss.webm", video: true } })], 1);
    expect(overlay.querySelector(".bb5e-boss__portrait video")?.getAttribute("src")).toBe("boss.webm");
    expect(overlay.querySelector(".bb5e-boss__portrait img")).toBeNull();
  });

  it("offers collapsing only when allowed and reports the new state", () => {
    const stack = make();
    stack.update([view("a")], 1);
    expect(overlay.querySelector<HTMLButtonElement>(".bb5e-boss__collapse")?.hidden).toBe(true);
    stack.update([view("a", { canCollapse: true, collapsed: true })], 1);
    const button = overlay.querySelector<HTMLButtonElement>(".bb5e-boss__collapse")!;
    expect(button.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Expand");
    button.click();
    expect(onCollapse).toHaveBeenCalledWith("a", false);
  });
});
