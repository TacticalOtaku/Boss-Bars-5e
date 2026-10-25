import type { Block } from "../core/layout";
import type { BossBarView } from "../core/view";
import { positionBlock } from "./blocks";
import { formatNumbers, part, setPortrait } from "./dom";
import { createKeyedList, type KeyedItem } from "./keyed-list";

export interface StackOptions {
  labels: { collapse: string; expand: string };
  onCollapse(id: string, collapsed: boolean): void;
  /** prefers-reduced-motion or Foundry's performance-low: only opacity changes are animated. */
  reducedMotion(): boolean;
}

interface Bar extends KeyedItem {
  portrait: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  title: HTMLElement;
  collapse: HTMLButtonElement;
  meter: HTMLElement;
  fill: HTMLElement;
  trail: HTMLElement;
  numbers: HTMLElement;
  view: BossBarView | null;
  shown: number | null;
}

/** The boss stack: one DOM bar per view. All texts go in as text, never as HTML. */
export function createBossStack(overlay: HTMLElement, options: StackOptions) {
  const stack = part("div", "bb5e-stack", overlay);

  function createBar(): Bar {
    const el = part("section", "bb5e-boss");
    const portrait = part("div", "bb5e-boss__portrait", el);
    const body = part("div", "bb5e-boss__body", el);
    const head = part("div", "bb5e-boss__head", body);
    const name = part("span", "bb5e-boss__name", head);
    const count = part("span", "bb5e-boss__count", head);
    const title = part("span", "bb5e-boss__title", head);
    const collapse = part("button", "bb5e-boss__collapse", head) as HTMLButtonElement;
    collapse.type = "button";
    collapse.textContent = "▾";
    const meter = part("div", "bb5e-boss__meter", body);
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    const trail = part("div", "bb5e-boss__trail", meter);
    const fill = part("div", "bb5e-boss__fill", meter);
    const numbers = part("span", "bb5e-boss__numbers", meter);
    const bar: Bar = {
      el,
      portrait,
      name,
      count,
      title,
      collapse,
      meter,
      fill,
      trail,
      numbers,
      view: null,
      shown: null,
      leaving: null,
    };
    collapse.addEventListener("click", () => {
      if (bar.view) options.onCollapse(bar.view.id, !bar.view.collapsed);
    });
    return bar;
  }

  /** The fill follows at once; the trail lingers on damage and catches up (CSS delay), on healing it jumps. */
  function setFill(bar: Bar, shown: number) {
    const previous = bar.shown;
    // One HP change fires several hooks; re-rendering the same fill must not cut a running trail short.
    if (shown === previous) return;
    bar.shown = shown;
    bar.fill.style.transform = `scaleX(${shown})`;
    if (previous === null || shown >= previous) {
      bar.trail.style.transition = "none";
      bar.trail.style.transform = `scaleX(${shown})`;
      void bar.trail.offsetWidth;
      bar.trail.style.transition = "";
    } else {
      bar.trail.style.transform = `scaleX(${shown})`;
    }
  }

  function updateBar(bar: Bar, view: BossBarView) {
    bar.view = view;
    const { el } = bar;
    el.classList.toggle("bb5e-boss--collapsed", view.collapsed);
    el.classList.toggle("bb5e-boss--defeated", view.defeated);
    el.classList.toggle("bb5e-boss--muted", view.muted);
    el.classList.toggle("bb5e-boss--unknown", view.fraction === null);
    el.style.setProperty("--bb5e-size", String(view.size / 100));
    setPortrait(bar.portrait, view.portrait);
    bar.name.textContent = view.label;
    bar.count.textContent = view.count ? `×${view.count}` : "";
    bar.count.hidden = !view.count;
    bar.title.textContent = view.title;
    bar.title.hidden = !view.title;
    bar.collapse.hidden = !view.canCollapse;
    bar.collapse.setAttribute("aria-expanded", String(!view.collapsed));
    bar.collapse.setAttribute("aria-label", view.collapsed ? options.labels.expand : options.labels.collapse);
    bar.meter.setAttribute("aria-label", view.label);
    if (view.fraction === null) bar.meter.removeAttribute("aria-valuenow");
    else
      bar.meter.setAttribute("aria-valuenow", String(Math.round((view.defeated ? 0 : view.fraction) * 100)));
    setFill(bar, view.defeated ? 0 : (view.fraction ?? 0));
    bar.numbers.hidden = !view.numbers;
    bar.numbers.textContent = view.numbers ? formatNumbers(view.numbers) : "";
  }

  const list = createKeyedList(stack, createBar, updateBar, options.reducedMotion);
  return {
    element: stack,
    update(views: BossBarView[], block: Block, uiScale: number) {
      positionBlock(stack, block, uiScale);
      list.update(views);
    },
  };
}
