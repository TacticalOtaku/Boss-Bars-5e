import type { HudEffect } from "../core/actions";
import { hpChange, isLow, type HpChange } from "../core/look/effects";
import { ash, sparks, type Particle } from "../core/look/particles";
import type { Block } from "../core/layout";
import { QUOTE_LIMITS } from "../core/quotes";
import type { BossBarView } from "../core/view";
import { positionBlock } from "./blocks";
import { formatNumbers, part, setPortrait } from "./dom";
import {
  enterFrames,
  leaveDuration,
  leaveFrames,
  playHpChange,
  playPhaseChange,
  showQuote,
  typeName,
} from "./effects";
import { createStatusRow, renderMiniBars, renderStatuses } from "./extras";
import { createKeyedList, type KeyedItem } from "./keyed-list";
import { applyHpColor, applyLook } from "./look";
import type { VfxEvent } from "../core/look/vfx";
import { vfxRenderer, type VfxHandle } from "./vfx/renderer";

export interface StackOptions {
  /** `defeated`: the defeat banner's text when the look gives none; `phase`: "Phase {n}". */
  labels: { collapse: string; expand: string; defeated: string; phase: string };
  onCollapse(id: string, collapsed: boolean): void;
  /** prefers-reduced-motion or Foundry's performance-low: only opacity changes are animated. */
  reducedMotion(): boolean;
  /** The HUD's particle layer; editor previews have none. */
  particles?: { emit(born: Particle[]): void };
}

interface Bar extends KeyedItem {
  portrait: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  title: HTMLElement;
  phase: HTMLElement;
  collapse: HTMLButtonElement;
  meter: HTMLElement;
  fill: HTMLElement;
  trail: HTMLElement;
  shield: HTMLElement;
  ticks: HTMLElement;
  numbers: HTMLElement;
  flash: HTMLElement;
  crack: HTMLElement;
  wave: HTMLElement;
  miniBars: HTMLElement;
  statuses: HTMLElement;
  banner: HTMLElement;
  phaseBanner: HTMLElement;
  quote: HTMLElement;
  quoteKey: string | null;
  quoteTimer: ReturnType<typeof setTimeout> | undefined;
  /** The bar's body drawn by the shared WebGL2 renderer around the meter (ADR 0003); null on the CSS look. */
  vfx: { handle: VfxHandle; canvas: HTMLCanvasElement } | null;
  /** The portrait's frame and light, drawn over the picture by the same renderer. */
  portraitVfx: { handle: VfxHandle; canvas: HTMLCanvasElement } | null;
  /** undefined until the first render: a bar shown already defeated plays no defeat. */
  wasDefeated: boolean | undefined;
  view: BossBarView | null;
  shown: number | null;
  /** undefined until the first render: the first phase seen plays no effect. */
  phaseKey: string | null | undefined;
}

/** How long `playEffect("defeat")` shows the defeat banner, ms. */
const DEFEAT_BANNER_MS = 2000;

/** The boss stack: one DOM bar per view, drawn in its look. All texts go in as text, never as HTML. */
export function createBossStack(overlay: HTMLElement, options: StackOptions) {
  const stack = part("div", "bb5e-stack", overlay);

  function createBar(): Bar {
    const el = part("section", "bb5e-boss");
    const avatar = part("div", "bb5e-boss__avatar", el);
    const portrait = part("div", "bb5e-boss__portrait bb5e-face", avatar);
    const body = part("div", "bb5e-boss__body", el);
    const head = part("div", "bb5e-boss__head", body);
    const name = part("span", "bb5e-boss__name", head);
    const count = part("span", "bb5e-boss__count", head);
    const title = part("span", "bb5e-boss__title", head);
    const phase = part("span", "bb5e-boss__phase", head);
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
    const ticks = part("div", "bb5e-boss__ticks", meter);
    ticks.setAttribute("aria-hidden", "true");
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
    const phaseBanner = part("div", "bb5e-banner bb5e-banner--phase", el);
    phaseBanner.hidden = true;
    // The quote is read out by screen readers when it appears.
    const quote = part("p", "bb5e-boss__quote", el);
    quote.setAttribute("aria-live", "polite");
    quote.hidden = true;
    const bar: Bar = {
      el,
      portrait,
      name,
      count,
      title,
      phase,
      collapse,
      meter,
      fill,
      trail,
      shield,
      ticks,
      numbers,
      flash,
      crack,
      wave,
      miniBars,
      statuses,
      banner,
      phaseBanner,
      quote,
      quoteKey: null,
      quoteTimer: undefined,
      vfx: null,
      portraitVfx: null,
      wasDefeated: undefined,
      view: null,
      shown: null,
      phaseKey: undefined,
      leaving: null,
    };
    collapse.addEventListener("click", () => {
      if (bar.view) options.onCollapse(bar.view.id, !bar.view.collapsed);
    });
    return bar;
  }

  /**
   * The fill follows at once; the trail lingers on damage and catches up (the look's delay and speed), on healing it
   * jumps. A look that does not accumulate restarts the trail from the last fill on each hit of a series. On a
   * phase change (`quiet`) everything jumps and no HP effect plays: a form's full HP or a refill is no healing.
   */
  function setFill(bar: Bar, view: BossBarView, shown: number, quiet: boolean) {
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
    if (previous === null || shown >= previous || quiet) jump(shown);
    else if (!view.look.effects.trailAccumulate) jump(previous);
    bar.fill.style.transform = `scaleX(${shown})`;
    bar.el.style.setProperty("--bb5e-f", String(shown));
    if (previous !== null && shown < previous) {
      bar.trail.style.transform = `scaleX(${shown})`;
      bar.el.style.setProperty("--bb5e-t", String(shown));
    }
    if (!quiet) playHp(bar, view, hpChange(previous, shown, view.look.effects.bigThreshold), shown);
  }

  /** An effect for the renderer: the bar body and the portrait play it together. */
  function emit(bar: Bar, event: Omit<VfxEvent, "at">) {
    bar.vfx?.handle.event(event);
    bar.portraitVfx?.handle.event(event);
  }

  /** HP effects of a change: sparks from the fill's edge on damage, then the look's flash, shake, crack, wave. */
  function playHp(bar: Bar, view: BossBarView, change: HpChange, shown: number) {
    if (change) {
      emit(bar, {
        kind: change.kind,
        share: change.share,
        x: shown,
        big: change.kind === "damage" && change.big && view.look.effects.bigCrack,
        scale: view.look.effects.scaleByDamage,
      });
    }
    if (change?.kind === "damage" && view.look.effects.sparks && options.particles && !bar.vfx) {
      const rect = bar.meter.getBoundingClientRect();
      const at = { x: rect.left + rect.width * shown, y: rect.top + rect.height / 2 };
      options.particles.emit(sparks(at, change.share, view.look.effects.sparkColor));
    }
    playHpChange(
      change,
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

  /**
   * A new quote shows for what is left of its time; one seen before is left alone, so repeated renders and other
   * HP hooks never restart it. shortcut: the end time is the active GM's clock, a skewed client clock shortens or
   * stretches it (capped at the quote's maximum); sync clocks if that ever matters.
   */
  function updateQuote(bar: Bar, quote: BossBarView["quote"]) {
    if (!quote || quote.key === bar.quoteKey) return;
    bar.quoteKey = quote.key;
    const left = Math.min(quote.until - Date.now(), QUOTE_LIMITS.durationMax * 1000);
    if (left <= 0) return;
    clearTimeout(bar.quoteTimer);
    bar.quoteTimer = showQuote(bar.quote, quote.text, left, options.reducedMotion());
  }

  /**
   * The bar's body (frame, material, light, effects) is drawn by the shared WebGL2 renderer into a canvas larger than
   * the meter; the CSS look hides only while the canvas draws (`bb5e-vfx`). Without WebGL2 or after a lost context
   * the CSS look shows (ADR 0003).
   */
  function updateVfx(bar: Bar, view: BossBarView, shown: number, low: boolean) {
    const renderer = vfxRenderer(options.reducedMotion);
    if (!renderer) return;
    if (!bar.vfx) {
      const canvas = document.createElement("canvas");
      canvas.className = "bb5e-boss__vfx";
      canvas.setAttribute("aria-hidden", "true");
      bar.meter.before(canvas);
      const handle = renderer.attach(canvas, bar.meter, (live) => bar.el.classList.toggle("bb5e-vfx", live), {
        text: [bar.name, bar.title],
      });
      bar.vfx = { handle, canvas };
    }
    if (!bar.portraitVfx) {
      const canvas = document.createElement("canvas");
      canvas.className = "bb5e-boss__pvfx";
      canvas.setAttribute("aria-hidden", "true");
      bar.portrait.after(canvas);
      const handle = renderer.attach(
        canvas,
        bar.portrait,
        (live) => bar.el.classList.toggle("bb5e-pvfx", live),
        {
          portrait: true,
        },
      );
      bar.portraitVfx = { handle, canvas };
    }
    const state = {
      fill: shown,
      shield: 0,
      ticks: [],
      low,
      defeated: view.defeated,
    };
    bar.portraitVfx.handle.setMaterial(view.look.material, view.look.key);
    bar.portraitVfx.handle.setState(state);
    bar.vfx.handle.setMaterial(view.look.material, view.look.key);
    bar.vfx.handle.setState({
      fill: shown,
      shield: view.defeated ? 0 : view.shield,
      ticks: view.ticks,
      low,
      defeated: view.defeated,
    });
  }

  /** Threshold ticks; elements are reused, so an unchanged render touches nothing. */
  function renderTicks(bar: Bar, ticks: number[]) {
    const { children } = bar.ticks;
    while (children.length > ticks.length) children[children.length - 1]?.remove();
    while (children.length < ticks.length) part("i", "bb5e-boss__tick", bar.ticks);
    ticks.forEach((at, index) => (children[index] as HTMLElement).style.setProperty("--bb5e-at", String(at)));
  }

  function updateBar(bar: Bar, view: BossBarView) {
    bar.view = view;
    const { el } = bar;
    const { look } = view;
    const previousKey = bar.phaseKey;
    bar.phaseKey = view.phase?.key ?? null;
    const phaseChanged = previousKey !== undefined && bar.phaseKey !== null && previousKey !== bar.phaseKey;
    // The old palette, read before the new phase's look replaces it.
    const palette = phaseChanged && look.motion.phasePalette ? getComputedStyle(bar.fill).background : null;
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
    const phaseText = view.phase
      ? view.phase.label ||
        (view.phase.numeral ? options.labels.phase.replace("{n}", view.phase.numeral) : "")
      : "";
    bar.phase.textContent = phaseText;
    bar.phase.hidden = !phaseText;
    bar.collapse.hidden = !view.canCollapse;
    bar.collapse.setAttribute("aria-expanded", String(!view.collapsed));
    bar.collapse.setAttribute("aria-label", view.collapsed ? options.labels.expand : options.labels.collapse);
    bar.meter.setAttribute("aria-label", view.label);
    const shown = view.defeated ? 0 : (view.fraction ?? 0);
    if (view.fraction === null) bar.meter.removeAttribute("aria-valuenow");
    else bar.meter.setAttribute("aria-valuenow", String(Math.round(shown * 100)));
    applyHpColor(bar.fill, look, shown);
    setFill(bar, view, shown, phaseChanged);
    updateVfx(bar, view, shown, !view.defeated && isLow(shown, look.effects.lowThreshold));
    if (phaseChanged) emit(bar, { kind: "phase", share: 0, x: 0.5 });
    if (view.defeated && bar.wasDefeated === false) emit(bar, { kind: "defeat", share: 0, x: 0.5 });
    bar.wasDefeated = view.defeated;
    renderTicks(bar, view.ticks);
    updateQuote(bar, view.quote);
    if (phaseChanged) {
      playPhaseChange(
        look,
        { meter: bar.meter, fill: bar.fill, flash: bar.flash, crack: bar.crack, banner: bar.phaseBanner },
        shown,
        phaseText,
        palette,
        options.reducedMotion(),
      );
    }
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
      emit(bar, { kind: "appear", share: 0, x: 0 });
      return { frames: enterFrames(view.look, reduced), duration: view.look.motion.duration };
    },
    leave(view, reduced) {
      return {
        frames: leaveFrames(view.look, view.defeated, reduced),
        duration: leaveDuration(view.look, view.defeated),
      };
    },
    onLeave(bar, view) {
      // "Dissolve": the bar crumbles into ash in its own colours.
      if (view.defeated && view.look.motion.defeat === "dissolve" && options.particles) {
        options.particles.emit(ash(bar.el.getBoundingClientRect(), view.look.fill.colors));
      }
      if (!view.defeated || view.look.motion.defeat !== "banner") return;
      bar.banner.textContent = view.look.motion.bannerText || options.labels.defeated;
      bar.banner.hidden = false;
    },
  });
  /** `api.playEffect`: the look's effects on a shown bar, as if it happened; nothing else changes. */
  function play(id: string, effect: HudEffect) {
    const shown = list.get(id);
    if (!shown) return;
    const { item: bar, view } = shown;
    const { look } = view;
    const fill = bar.shown ?? 0;
    const reduced = options.reducedMotion();
    // Damage and healing reach the renderer through playHp; the others are told here.
    if (effect === "phase" || effect === "defeat") emit(bar, { kind: effect, share: 0, x: 0.5 });
    if (effect === "damage" || effect === "heal") {
      // A quarter of the bar, from where the fill is.
      const [from, to] = effect === "damage" ? [fill + 0.25, fill] : [fill - 0.25, fill];
      playHp(bar, view, hpChange(from, to, look.effects.bigThreshold), fill);
    } else if (effect === "phase") {
      const targets = {
        meter: bar.meter,
        fill: bar.fill,
        flash: bar.flash,
        crack: bar.crack,
        banner: bar.phaseBanner,
      };
      playPhaseChange(look, targets, fill, bar.phase.textContent ?? "", null, reduced);
    } else {
      if (look.motion.defeat === "dissolve" && options.particles) {
        options.particles.emit(ash(bar.el.getBoundingClientRect(), look.fill.colors));
      }
      bar.banner.textContent = look.motion.bannerText || options.labels.defeated;
      bar.banner.hidden = false;
      const fade = bar.banner.animate?.(
        [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
        DEFEAT_BANNER_MS,
      );
      if (fade) fade.onfinish = () => (bar.banner.hidden = true);
      else bar.banner.hidden = true;
    }
  }

  return {
    element: stack,
    play,
    update(views: BossBarView[], block: Block, uiScale: number) {
      positionBlock(stack, block, uiScale);
      list.update(views);
    },
  };
}
