// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT } from "../src/core/layout";
import { CLASSIC_STYLE } from "../src/core/look/builtin";
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
  shield: 0,
  statuses: [],
  statusOverflow: 0,
  miniBars: [],
  look: CLASSIC_STYLE,
  ...extra,
});

const BLOCK = DEFAULT_LAYOUT.bosses;
let overlay: HTMLElement;
const onCollapse = vi.fn();
const make = () =>
  createBossStack(overlay, {
    labels: { collapse: "Collapse", expand: "Expand", defeated: "Defeated" },
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
    stack.update([view("a", { count: 3 })], BLOCK, 1);
    const count = overlay.querySelector<HTMLElement>(".bb5e-boss__count")!;
    expect([count.hidden, count.textContent]).toEqual([false, "×3"]);
    stack.update([view("a")], BLOCK, 1);
    expect(count.hidden).toBe(true);
  });

  it("renders texts as text and keeps HP numbers out of a player's bar", () => {
    make().update([view("a", { label: "<img src=x onerror=alert(1)>", title: "Пожиратель" })], BLOCK, 1);
    const bar = bars()[0]!;
    expect(bar.querySelector(".bb5e-boss__name")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(bar.querySelectorAll("img[onerror]")).toHaveLength(0);
    expect(bar.querySelector(".bb5e-boss__numbers")?.textContent).toBe("");
    expect(bar.querySelector(".bb5e-boss__meter")?.getAttribute("aria-valuenow")).toBe("50");
    expect(bar.querySelector<HTMLElement>(".bb5e-boss__fill")?.style.transform).toBe("scaleX(0.5)");
  });

  it("leaves a running trail alone when the same fill is rendered again", async () => {
    const stack = make();
    stack.update([view("a", { fraction: 1 })], BLOCK, 1);
    stack.update([view("a", { fraction: 0.4 })], BLOCK, 1);
    const trail = overlay.querySelector<HTMLElement>(".bb5e-boss__trail")!;
    const changes: string[] = [];
    new MutationObserver((records) => records.forEach((r) => changes.push(String(r.attributeName)))).observe(
      trail,
      {
        attributes: true,
      },
    );
    stack.update([view("a", { fraction: 0.4 })], BLOCK, 1);
    await Promise.resolve();
    expect(changes).toEqual([]);
    expect(trail.style.transform).toBe("scaleX(0.4)");
  });

  it("shows numbers to the GM and an empty fill when defeated", () => {
    make().update([view("a", { numbers: { value: 30, max: 60, temp: 4 }, defeated: true })], BLOCK, 1);
    const bar = bars()[0]!;
    expect(bar.querySelector(".bb5e-boss__numbers")?.textContent).toBe("30 / 60 +4");
    expect(bar.classList.contains("bb5e-boss--defeated")).toBe(true);
    expect(bar.querySelector<HTMLElement>(".bb5e-boss__fill")?.style.transform).toBe("scaleX(0)");
  });

  it("keeps the stack in show order; a hidden bar leaves after the shown ones and can come back", () => {
    const stack = make();
    stack.update([view("a"), view("b")], BLOCK, 1.25);
    stack.update([view("b"), view("c")], BLOCK, 1.25);
    expect(bars().map((bar) => bar.dataset.instanceId)).toEqual(["b", "c", "a"]);
    stack.update([view("a"), view("b"), view("c")], BLOCK, 1.25);
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
      stack.update([view("a"), view("b")], BLOCK, 1);
      stack.update([view("b")], BLOCK, 1);
      expect(bars().map((bar) => bar.dataset.instanceId)).toEqual(["b"]);
    } finally {
      Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
    }
  });

  it("swaps the portrait between image and video", () => {
    const stack = make();
    stack.update([view("a")], BLOCK, 1);
    stack.update([view("a", { portrait: { src: "boss.webm", video: true } })], BLOCK, 1);
    expect(overlay.querySelector(".bb5e-boss__portrait video")?.getAttribute("src")).toBe("boss.webm");
    expect(overlay.querySelector(".bb5e-boss__portrait img")).toBeNull();
  });

  it("offers collapsing only when allowed and reports the new state", () => {
    const stack = make();
    stack.update([view("a")], BLOCK, 1);
    expect(overlay.querySelector<HTMLButtonElement>(".bb5e-boss__collapse")?.hidden).toBe(true);
    stack.update([view("a", { canCollapse: true, collapsed: true })], BLOCK, 1);
    const button = overlay.querySelector<HTMLButtonElement>(".bb5e-boss__collapse")!;
    expect(button.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Expand");
    button.click();
    expect(onCollapse).toHaveBeenCalledWith("a", false);
  });
});

describe("boss bar extras", () => {
  const status = (name: string, extra = {}) => ({
    id: name,
    name,
    img: `${name}.webp`,
    stacks: 0,
    tooltip: `${name}\n<b>x</b>`,
    ...extra,
  });
  const extras = {
    shield: 0.25,
    statuses: [status("Bless"), status("Poison", { stacks: 3 })],
    statusOverflow: 2,
    miniBars: [
      { id: "leg", label: "Legendary", fraction: 2 / 3, pips: { filled: 2, total: 3 } },
      { id: "ac", label: "Armour", fraction: 0.5, pips: null, numbers: { value: 5, max: 10 } },
    ],
  };

  it("draws the shield after the fill, pips, bars and statuses with text-only tooltips", () => {
    make().update([view("a", extras)], BLOCK, 1);
    const shield = overlay.querySelector<HTMLElement>(".bb5e-boss__shield")!;
    expect([
      shield.hidden,
      shield.style.getPropertyValue("--bb5e-at"),
      shield.style.getPropertyValue("--bb5e-shield"),
    ]).toEqual([false, "0.5", "0.25"]);
    const minis = [...overlay.querySelectorAll<HTMLElement>(".bb5e-mini")];
    expect(minis[0]!.querySelectorAll(".bb5e-mini__pip--on")).toHaveLength(2);
    expect(minis[0]!.querySelectorAll(".bb5e-mini__pip")).toHaveLength(3);
    expect(minis[1]!.querySelector(".bb5e-mini__numbers")!.textContent).toBe("5 / 10");
    const icons = [...overlay.querySelectorAll<HTMLElement>(".bb5e-status")];
    expect(icons.map((icon) => icon.dataset.tooltipText)).toEqual(["Bless\n<b>x</b>", "Poison\n<b>x</b>"]);
    expect(overlay.querySelector("b")).toBeNull();
    expect(icons[1]!.querySelector(".bb5e-status__stacks")!.textContent).toBe("3");
    expect(overlay.querySelector(".bb5e-statuses__more")!.textContent).toBe("+2");
  });

  it("keeps the same status elements on a repeated render and hides empty parts", () => {
    const stack = make();
    stack.update([view("a", extras)], BLOCK, 1);
    const first = overlay.querySelector(".bb5e-status");
    stack.update([view("a", extras)], BLOCK, 1);
    expect(overlay.querySelector(".bb5e-status")).toBe(first);
    stack.update([view("a")], BLOCK, 1);
    expect(overlay.querySelector<HTMLElement>(".bb5e-boss__shield")!.hidden).toBe(true);
    expect(overlay.querySelector<HTMLElement>(".bb5e-statuses")!.hidden).toBe(true);
    expect(overlay.querySelector<HTMLElement>(".bb5e-minibars")!.hidden).toBe(true);
  });
});

describe("look paths", () => {
  it("makes FilePicker paths in look variables absolute against the page, not the stylesheet", () => {
    const look = {
      ...CLASSIC_STYLE,
      key: "with-texture",
      vars: { ...CLASSIC_STYLE.vars, "--bb5e-fill": 'url("worlds/w/tex.webp") center / cover, #000' },
    };
    make().update([view("a", { look })], BLOCK, 1);
    const value = bars()[0]!.style.getPropertyValue("--bb5e-fill");
    expect(value).toBe(`url("${new URL("worlds/w/tex.webp", document.baseURI).href}") center / cover, #000`);
  });
});
