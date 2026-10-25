import { hpChange, isLow } from "../core/look/effects";
import type { Block } from "../core/layout";
import type { BossBarView } from "../core/view";
import { positionBlock } from "./blocks";
import { formatNumbers, part, setPortrait } from "./dom";
import { enterFrames, leaveDuration, leaveFrames, playHpChange, typeName } from "./effects";
import { createStatusRow, renderMiniBars, renderStatuses } from "./extras";
import { createKeyedList, type KeyedItem } from "./keyed-list";
import { applyHpColor, applyLook } from "./look";

export interface StackOptions {
  /** `defeated`: the defeat banner's text when the look gives none. */
  labels: { collapse: string; expand: string; defeated: string };
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
  shield: HTMLElement;
  numbers: HTMLElement;
  flash: HTMLElement;
  crack: HTMLElement;
  wave: HTMLElement;
  miniBars: HTMLElement;
  statuses: HTMLElement;
  banner: HTMLElement;
  view: BossBarView | null;
  shown: number | null;
}

/** The boss stack: one DOM bar per view, drawn in its look. All texts go in as text, never as HTML. */
export function createBossStack(overlay: HTMLElement, options: StackOptions) {
  const stack = part("div", "bb5e-stack", overlay);

  function createBar(): Bar {
    const el = part("section", "bb5e-boss");
    // The avatar holds the portrait and, in the ring layout, the HP ring around it.
    const avatar = part("div", "bb5e-boss__avatar", el);
    part("div", "bb5e-boss__ring", avatar);
    const portrait = part("div", "bb5e-boss__portrait bb5e-face", avatar);
    const body = part("div", "bb5e-boss__body", el);
    const head = part("div", "bb5e-boss__head", body);
    const name = part("span", "bb5e-boss__name", head);
    const count = part("span", "bb5e-boss__count", head);
    const title = part("span", "bb5e-boss__title", head);
    const collapse = part("button", "bb5e-boss__collapse", head) as HTMLButtonElement;
    collapse.type = "button";
    collapse.textContent = "▾";
    // The frame does not clip: corner decorations and the low-HP glow sit on it, the meter inside clips the fill.
    const frame = part("div", "bb5e-boss__frame", body);
    const meter = part("div", "bb5e-boss__meter", frame);
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    const trail = part("div", "bb5e-boss__trail", meter);
    const fill = part("div", "bb5e-boss__fill", meter);
    const shield = part("div", "bb5e-boss__shield", meter);
    const flash = part("div", "bb5e-fx bb5e-fx--flash", meter);
    const crack = part("div", "bb5e-fx bb5e-fx--crack", meter);
    const wave = part("div", "bb5e-fx bb5e-fx--wave", meter);
    // On the frame, not in the clipping meter: a thin bar shows them above itself.
    const numbers = part("span", "bb5e-boss__numbers", frame);
    const extras = part("div", "bb5e-boss__extras", body);
    const miniBars = part("div", "bb5e-minibars bb5e-boss__minibars", extras);
    const statuses = createStatusRow("bb5e-boss__statuses", extras);
    const banner = part("div", "bb5e-banner", el);
    banner.hidden = true;
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
      shield,
      numbers,
      flash,
      crack,
      wave,
      miniBars,
      statuses,
      banner,
      view: null,
      shown: null,
      leaving: null,
    };
    collapse.addEventListener("click", () => {
      if (bar.view) options.onCollapse(bar.view.id, !bar.view.collapsed);
    });
    return bar;
  }

  /**
   * The fill follows at once; the trail lingers on damage and catches up (the look's delay and speed), on healing it
   * jumps. A look that does not accumulate restarts the trail from the last fill on each hit of a series.
   */
  function setFill(bar: Bar, view: BossBarView, shown: number) {
    const previous = bar.shown;
    // One HP change fires several hooks; re-rendering the same fill must not cut a running trail short.
    if (shown === previous) return;
    bar.shown = shown;
    const jump = (fraction: number) => {
      bar.trail.style.transition = "none";
      bar.trail.style.transform = `scaleX(${fraction})`;
      bar.el.style.setProperty("--bb5e-t", String(fraction));
      void bar.trail.offsetWidth;
      bar.trail.style.transition = "";
    };
    if (previous === null || shown >= previous) jump(shown);
    else if (!view.look.effects.trailAccumulate) jump(previous);
    bar.fill.style.transform = `scaleX(${shown})`;
    bar.el.style.setProperty("--bb5e-f", String(shown));
    if (previous !== null && shown < previous) {
      bar.trail.style.transform = `scaleX(${shown})`;
      bar.el.style.setProperty("--bb5e-t", String(shown));
    }
    playHpChange(
      hpChange(previous, shown, view.look.effects.bigThreshold),
      view.look,
      {
        root: bar.el,
        portrait: bar.portrait,
        flash: bar.flash,
        crack: bar.crack,
        wave: bar.wave,
        name: bar.name,
      },
      options.reducedMotion(),
    );
  }

  function updateBar(bar: Bar, view: BossBarView) {
    bar.view = view;
    const { el } = bar;
    const { look } = view;
    applyLook(el, look);
    // Shown again while leaving: the defeat banner of the cancelled exit goes.
    bar.banner.hidden = true;
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
    const shown = view.defeated ? 0 : (view.fraction ?? 0);
    if (view.fraction === null) bar.meter.removeAttribute("aria-valuenow");
    else bar.meter.setAttribute("aria-valuenow", String(Math.round(shown * 100)));
    applyHpColor(bar.fill, look, shown);
    setFill(bar, view, shown);
    const low = !view.defeated && isLow(shown, look.effects.lowThreshold);
    const lowMode = look.effects.lowFlicker ? "flicker" : look.effects.lowPulse ? "pulse" : "";
    if (low && lowMode) el.dataset.low = lowMode;
    else delete el.dataset.low;
    bar.numbers.hidden = !view.numbers;
    bar.numbers.textContent = view.numbers ? formatNumbers(view.numbers) : "";
    // The temp HP shield sits right after the fill; the meter clips what reaches past its end.
    bar.shield.hidden = !view.shield || view.defeated;
    bar.shield.style.setProperty("--bb5e-at", String(shown));
    bar.shield.style.setProperty("--bb5e-shield", String(view.shield));
    renderMiniBars(bar.miniBars, view.miniBars);
    renderStatuses(bar.statuses, view.statuses, view.statusOverflow);
  }

  const list = createKeyedList(stack, createBar, updateBar, options.reducedMotion, {
    enter(view, reduced, bar) {
      typeName(bar.name, view.look, reduced);
      return { frames: enterFrames(view.look, reduced), duration: view.look.motion.duration };
    },
    leave(view, reduced) {
      return {
        frames: leaveFrames(view.look, view.defeated, reduced),
        duration: leaveDuration(view.look, view.defeated),
      };
    },
    onLeave(bar, view) {
      if (!view.defeated || view.look.motion.defeat !== "banner") return;
      bar.banner.textContent = view.look.motion.bannerText || options.labels.defeated;
      bar.banner.hidden = false;
    },
  });
  return {
    element: stack,
    update(views: BossBarView[], block: Block, uiScale: number) {
      positionBlock(stack, block, uiScale);
      list.update(views);
    },
  };
}
