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
  phase: null,
  ticks: [],
  quote: null,
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
    labels: { collapse: "Collapse", expand: "Expand", defeated: "Defeated", phase: "Phase {n}" },
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

describe("boss bar phases", () => {
  const phase = (key: string, label = "", numeral: string | null = null) => ({ key, label, numeral });

  it("labels the phase by name or number and hides an empty label", () => {
    const stack = make();
    stack.update([view("a", { phase: phase("p1") })], BLOCK, 1);
    const label = overlay.querySelector<HTMLElement>(".bb5e-boss__phase")!;
    expect(label.hidden).toBe(true);
    stack.update([view("a", { phase: phase("p2", "", "II") })], BLOCK, 1);
    expect([label.hidden, label.textContent]).toEqual([false, "Phase II"]);
    stack.update([view("a", { phase: phase("p3", "Пепел") })], BLOCK, 1);
    expect(label.textContent).toBe("Пепел");
  });

  it("draws the threshold ticks and reuses them", () => {
    const stack = make();
    stack.update([view("a", { ticks: [0.66, 0.33] })], BLOCK, 1);
    const ticks = [...overlay.querySelectorAll<HTMLElement>(".bb5e-boss__tick")];
    expect(ticks.map((tick) => tick.style.getPropertyValue("--bb5e-at"))).toEqual(["0.66", "0.33"]);
    stack.update([view("a", { ticks: [0.66] })], BLOCK, 1);
    expect([...overlay.querySelectorAll(".bb5e-boss__tick")]).toEqual([ticks[0]]);
  });

  it("plays the phase effect on a phase change only, with no healing effect for the jump", () => {
    const animate = vi.spyOn(Element.prototype, "animate");
    const stack = make();
    stack.update([view("a", { phase: phase("p1"), fraction: 0.2 })], BLOCK, 1);
    const flash = overlay.querySelector(".bb5e-fx--flash")!;
    const wave = overlay.querySelector(".bb5e-fx--wave")!;
    animate.mockClear();
    stack.update([view("a", { phase: phase("p1"), fraction: 0.2 })], BLOCK, 1);
    expect(animate).not.toHaveBeenCalled();
    stack.update([view("a", { phase: phase("p2", "Ярость"), fraction: 1 })], BLOCK, 1);
    const targets = animate.mock.contexts;
    expect(targets).toContain(flash);
    expect(targets).not.toContain(wave);
    expect(overlay.querySelector<HTMLElement>(".bb5e-banner--phase")?.textContent).toBe("Ярость");
    animate.mockRestore();
  });
});

describe("boss bar quotes", () => {
  it("shows a new quote for what is left of its time and leaves a seen one alone", () => {
    // Without Web Animations the line hides right when its time is up.
    const animate = Element.prototype.animate;
    Object.defineProperty(Element.prototype, "animate", { value: undefined, configurable: true });
    vi.useFakeTimers();
    const stack = make();
    const quote = { key: "q1", text: "<b>Пепел</b>", until: Date.now() + 2000 };
    stack.update([view("a", { quote })], BLOCK, 1);
    const line = overlay.querySelector<HTMLElement>(".bb5e-boss__quote")!;
    expect([line.hidden, line.textContent, line.querySelector("b")]).toEqual([false, "<b>Пепел</b>", null]);
    line.textContent = "untouched";
    stack.update([view("a", { quote })], BLOCK, 1);
    expect(line.textContent).toBe("untouched");
    vi.advanceTimersByTime(2500);
    expect(line.hidden).toBe(true);
    stack.update([view("a", { quote: { key: "old", text: "x", until: Date.now() - 1 } })], BLOCK, 1);
    expect(line.hidden).toBe(true);
    vi.useRealTimers();
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
  });
});

describe("live fills without WebGL2", () => {
  it("keep the CSS fill: no canvas, no live mode", () => {
    const stack = make();
    const look = { ...CLASSIC_STYLE, key: "ice", attrs: { ...CLASSIC_STYLE.attrs, fill: "ice" } };
    stack.update([view("a", { look })], BLOCK, 1);
    const meter = overlay.querySelector(".bb5e-boss__meter")!;
    expect(meter.querySelector("canvas")).toBeNull();
    expect(meter.classList.contains("bb5e-live")).toBe(false);
  });
});

describe("boss bar particles", () => {
  it("throws sparks on damage only, when the look has them", () => {
    const emit = vi.fn();
    const stack = createBossStack(overlay, {
      labels: { collapse: "C", expand: "E", defeated: "D", phase: "P {n}" },
      onCollapse,
      reducedMotion: () => true,
      particles: { emit },
    });
    stack.update([view("a", { fraction: 0.8 })], BLOCK, 1);
    stack.update([view("a", { fraction: 0.5 })], BLOCK, 1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]?.[0]).toMatchObject({
      kind: "spark",
      color: CLASSIC_STYLE.effects.sparkColor,
    });
    stack.update([view("a", { fraction: 0.9 })], BLOCK, 1);
    const off = { ...CLASSIC_STYLE, key: "off", effects: { ...CLASSIC_STYLE.effects, sparks: false } };
    stack.update([view("a", { fraction: 0.2, look: off })], BLOCK, 1);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

describe("individually movable runtime bosses", () => {
  it("uses separate movement wrappers and animates the inner bar without changing editor previews", () => {
    const stack = createBossStack(overlay, {
      labels: { collapse: "Collapse", expand: "Expand", defeated: "Defeated", phase: "Phase {n}" },
      onCollapse,
      reducedMotion: () => true,
      movable: true,
    });
    stack.update([view("a"), view("b")], BLOCK, 1);
    const targets = stack.targets();
    expect(targets.map((target) => target.id)).toEqual(["a", "b"]);
    expect(targets[0]!.element).not.toBe(targets[1]!.element);
    const inner = targets[0]!.element.querySelector<HTMLElement>(".bb5e-boss")!;
    expect(inner).not.toBeNull();
    expect(targets[0]!.element.getAnimations()).toHaveLength(0);
    expect(inner.getAnimations().length).toBeGreaterThan(0);
    targets[0]!.element.style.transform = "translate(50px, 20px)";
    stack.update([view("a", { fraction: 0.2 }), view("b")], BLOCK, 1);
    expect(stack.targets()[0]!.element.style.transform).toBe("translate(50px, 20px)");
    expect(stack.targets()[1]!.element.style.transform).toBe("");
    stack.update([view("b")], BLOCK, 1);
    expect(stack.targets().map((target) => target.id)).toEqual(["b"]);
  });
});
