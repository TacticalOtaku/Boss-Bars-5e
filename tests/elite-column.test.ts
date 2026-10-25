// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT } from "../src/core/layout";
import type { EliteCardView } from "../src/core/view";
import { createEliteColumn } from "../src/ui/elite-column";

const card = (id: string, extra: Partial<EliteCardView> = {}): EliteCardView => ({
  id,
  label: `Orc ${id}`,
  portrait: { src: "orc.webp", video: false },
  fraction: 0.5,
  defeated: false,
  muted: false,
  rank: { name: "Veteran", color: "#b0b8c8", size: 34 },
  parts: { name: true, fill: true },
  ...extra,
});

const BLOCK = DEFAULT_LAYOUT.elites;
const state = (eliteOverflow: number, column = { canCollapse: false, collapsed: false, total: 0 }) => ({
  eliteOverflow,
  column,
});
let host: HTMLElement;
const cards = () => [...host.querySelectorAll<HTMLElement>(".bb5e-elite")];

beforeEach(() => {
  document.body.innerHTML = '<div id="boss-bars-5e"></div>';
  host = document.getElementById("boss-bars-5e")!;
});

describe("createEliteColumn", () => {
  it("shows the parts the rank allows, rank colour and size, texts as text", () => {
    createEliteColumn(host, { reducedMotion: () => true }).update(
      [card("a", { label: "<b>Orc</b>" })],
      state(0),
      BLOCK,
      1,
    );
    const el = cards()[0]!;
    expect(el.querySelector(".bb5e-elite__name")?.textContent).toBe("<b>Orc</b>");
    expect(el.querySelector("b")).toBeNull();
    expect(el.style.getPropertyValue("--bb5e-rank-color")).toBe("#b0b8c8");
    expect(el.style.getPropertyValue("--bb5e-icon")).toBe("2.125");
    expect(el.querySelector<HTMLElement>(".bb5e-elite__fill")?.style.transform).toBe("scaleX(0.5)");
    expect(el.querySelector<HTMLElement>(".bb5e-elite__numbers")?.hidden).toBe(true);
  });

  it("reduces an icon-only rank to the icon, with the GM's numbers in the tooltip", () => {
    const parts = { name: false, fill: false };
    const column = createEliteColumn(host, { reducedMotion: () => true });
    column.update([card("a", { parts })], state(0), BLOCK, 1);
    expect(cards()[0]?.classList.contains("bb5e-elite--icon-only")).toBe(true);
    expect(cards()[0]?.querySelector<HTMLElement>(".bb5e-elite__info")?.hidden).toBe(true);
    expect(cards()[0]?.dataset.tooltipText).toBeUndefined();
    expect(cards()[0]?.getAttribute("aria-label")).toBe("Orc a, Veteran");
    column.update([card("a", { parts, numbers: { value: 5, max: 10, temp: 0 } })], state(0), BLOCK, 1);
    expect(cards()[0]?.dataset.tooltipText).toBe("Orc a: 5 / 10");
  });

  it("follows the given order and shows the overflow", () => {
    const column = createEliteColumn(host, { reducedMotion: () => true });
    column.update([card("b"), card("a", { count: 2 })], state(3), BLOCK, 0.8);
    expect(cards().map((el) => el.dataset.instanceId)).toEqual(["b", "a"]);
    expect(cards()[1]?.querySelector(".bb5e-elite__count")?.textContent).toBe("×2");
    const more = host.querySelector<HTMLElement>(".bb5e-column__more")!;
    expect([more.hidden, more.textContent]).toEqual([false, "+3"]);
    column.update([card("b")], state(0), BLOCK, 0.8);
    expect(more.hidden).toBe(true);
  });

  it("lets a player collapse the column into a chip, and positions the block", () => {
    let toggled: boolean | null = null;
    const column = createEliteColumn(host, {
      reducedMotion: () => true,
      collapse: {
        labels: { title: "Elites", collapse: "Collapse", expand: "Expand" },
        onToggle: (collapsed) => (toggled = collapsed),
      },
    });
    column.update(
      [card("a")],
      state(0, { canCollapse: true, collapsed: false, total: 1 }),
      { ...BLOCK, dir: "up" },
      1,
    );
    const toggle = host.querySelector<HTMLButtonElement>(".bb5e-column__toggle")!;
    expect([toggle.hidden, toggle.getAttribute("aria-expanded")]).toEqual([false, "true"]);
    expect(column.element.dataset.dir).toBe("up");
    expect(column.element.style.getPropertyValue("--bb5e-dx")).toBe("104");
    toggle.click();
    expect(toggled).toBe(true);
    column.update([card("a")], state(2, { canCollapse: true, collapsed: true, total: 3 }), BLOCK, 1);
    expect(toggle.textContent).toBe("Elites · 3 ▸");
    expect(host.querySelector<HTMLElement>(".bb5e-column__more")?.hidden).toBe(true);
  });
});
