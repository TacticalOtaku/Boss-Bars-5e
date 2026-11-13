import type { HudEffect } from "../core/actions";
import { isLow } from "../core/look/effects";
import { ash, type Particle } from "../core/look/particles";
import type { Block } from "../core/layout";
import type { VfxEvent } from "../core/look/vfx";
import { QUOTE_LIMITS } from "../core/quotes";
import type { BossBarView } from "../core/view";
import { formatNumbers, part, positionBlock, setPortrait } from "./dom";
import { enterFrames, leaveDuration, leaveFrames, playPhaseChange, showQuote, typeName } from "./effects";
import { createStatusRow, renderMiniBars, renderStatuses } from "./extras";
import { createKeyedList, type KeyedItem } from "./keyed-list";
import { applyLook } from "./look";
import { createMeterSurface, type MeterSurface } from "./meter-surface";
import { vfxRenderer, type VfxHandle } from "./vfx/renderer";

export interface StackOptions {
  /** Runtime only: each boss gets a movement wrapper; editor previews retain their existing DOM. */
  movable?: boolean;
  /** Runtime HUDs share Foundry's synchronized clock with the GM that wrote the speech. */
  now?(): number;
  /** `defeated`: the defeat banner's text when the look gives none; `phase`: "Phase {n}". */
  labels: { collapse: string; expand: string; defeated: string; phase: string };
  onCollapse(id: string, collapsed: boolean): void;
  /** prefers-reduced-motion or Foundry's performance-low: only opacity changes are animated. */
  reducedMotion(): boolean;
  /** The HUD's particle layer; editor previews have none. */
  particles?: { emit(born: Particle[]): void };
}

interface Bar extends KeyedItem {
  root: HTMLElement;
  portrait: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  title: HTMLElement;
  phase: HTMLElement;
  collapse: HTMLButtonElement;
  surface: MeterSurface;
  ticks: HTMLElement;
  numbers: HTMLElement;
  miniBars: HTMLElement;
  statuses: HTMLElement;
  banner: HTMLElement;
  phaseBanner: HTMLElement;
  quote: HTMLElement;
  quoteKey: string | null;
  quoteTimer: ReturnType<typeof setTimeout> | undefined;
  /** The portrait's frame and light, drawn over the picture by the same renderer. */
  portraitVfx: { handle: VfxHandle; canvas: HTMLCanvasElement } | null;
  /** undefined until the first render: a bar shown already defeated plays no defeat. */
  wasDefeated: boolean | undefined;
  view: BossBarView | null;
  /** undefined until the first render: the first phase seen plays no effect. */
  phaseKey: string | null | undefined;
}

/** How long `playEffect("defeat")` shows the defeat banner, ms. */
const DEFEAT_BANNER_MS = 2000;

/** The boss stack: one DOM bar per view, drawn in its look. All texts go in as text, never as HTML. */
export function createBossStack(overlay: HTMLElement, options: StackOptions) {
  const stack = part("div", "bb5e-stack", overlay);
  let shownViews: BossBarView[] = [];

  function createBar(): Bar {
    const root = part("section", "bb5e-boss");
    const el = options.movable ? part("div", "bb5e-boss-slot") : root;
    if (el !== root) el.append(root);
    const avatar = part("div", "bb5e-boss__avatar", root);
    const portrait = part("div", "bb5e-boss__portrait bb5e-face", avatar);
    const body = part("div", "bb5e-boss__body", root);
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
    let forwardVfx: ((event: Omit<VfxEvent, "at">) => void) | null = null;
    const surface = createMeterSurface({
      root,
      parent: frame,
      classPrefix: "bb5e-boss",
      withTrail: true,
      portrait,
      name,
      vfxPlacement: "beforeMeter",
      vfxOptions: { text: [name, title] },
      allowBigCrack: true,
      reducedMotion: options.reducedMotion,
      ...(options.particles ? { particles: options.particles } : {}),
      onVfxEvent: (event) => forwardVfx?.(event),
    });
    const ticks = part("div", "bb5e-boss__ticks", surface.meter);
    ticks.setAttribute("aria-hidden", "true");
    surface.flash.before(ticks);
    // On the frame, not in the clipping meter: a thin bar shows them above itself.
    const numbers = part("span", "bb5e-boss__numbers", frame);
    const extras = part("div", "bb5e-boss__extras", body);
    const miniBars = part("div", "bb5e-minibars bb5e-boss__minibars", extras);
    const statuses = createStatusRow("bb5e-boss__statuses", extras);
    const banner = part("div", "bb5e-banner", root);
    banner.hidden = true;
    const phaseBanner = part("div", "bb5e-banner bb5e-banner--phase", root);
    phaseBanner.hidden = true;
    // The quote is read out by screen readers when it appears.
    const quote = part("p", "bb5e-boss__quote", root);
    quote.setAttribute("aria-live", "polite");
    quote.hidden = true;
    const bar: Bar = {
      el,
      root,
      motionElement: root,
      portrait,
      name,
      count,
      title,
      phase,
      collapse,
      surface,
      ticks,
      numbers,
      miniBars,
      statuses,
      banner,
      phaseBanner,
      quote,
      quoteKey: null,
      quoteTimer: undefined,
      portraitVfx: null,
      wasDefeated: undefined,
      view: null,
      phaseKey: undefined,
      leaving: null,
    };
    forwardVfx = (event) => bar.portraitVfx?.handle.event(event);
    collapse.addEventListener("click", () => {
      if (bar.view) options.onCollapse(bar.view.id, !bar.view.collapsed);
    });
    return bar;
  }

  /**
   * A new quote shows for what is left of its time; one seen before is left alone, so repeated renders and other
   * HP hooks never restart it. Runtime HUDs use the same synchronized clock as the authority.
   */
  function updateQuote(bar: Bar, quote: BossBarView["quote"]) {
    if (!quote || quote.key === bar.quoteKey) return;
    bar.quoteKey = quote.key;
    const left = Math.min(quote.until - (options.now?.() ?? Date.now()), QUOTE_LIMITS.durationMax * 1000);
    if (left <= 0) return;
    clearTimeout(bar.quoteTimer);
    bar.quoteTimer = showQuote(bar.quote, quote.text, left, options.reducedMotion());
  }

  /**
   * The portrait's frame and light, drawn over the picture by the same renderer; the CSS frame stays on until the
   * canvas draws (`bb5e-pvfx`). Without WebGL2 or after a lost context the CSS frame shows (ADR 0003).
   */
  function updatePortraitVfx(bar: Bar, view: BossBarView, shown: number, low: boolean) {
    const renderer = vfxRenderer();
    if (!renderer) return;
    if (!bar.portraitVfx) {
      const canvas = document.createElement("canvas");
      canvas.className = "bb5e-boss__pvfx";
      canvas.setAttribute("aria-hidden", "true");
      bar.portrait.after(canvas);
      const handle = renderer.attach(
        canvas,
        bar.portrait,
        (live) => bar.root.classList.toggle("bb5e-pvfx", live),
        { portrait: true },
      );
      bar.portraitVfx = { handle, canvas };
    }
    bar.portraitVfx.handle.setMaterial(view.look.material, view.look.key);
    bar.portraitVfx.handle.setState({
      fill: shown,
      shield: 0,
      ticks: [],
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
    const { root: el, surface } = bar;
    el.dataset.instanceId = view.id;
    const { look } = view;
    const previousKey = bar.phaseKey;
    bar.phaseKey = view.phase?.key ?? null;
    const phaseChanged = previousKey !== undefined && bar.phaseKey !== null && previousKey !== bar.phaseKey;
    // The old palette, read before the new phase's look replaces it.
    const palette =
      phaseChanged && look.motion.phasePalette ? getComputedStyle(surface.fill).background : null;
    applyLook(el, look);
    // Shown again while leaving: the defeat banner of the cancelled exit goes. The banner of `playEffect` runs its
    // own fade and stays through updates.
    if (!bar.banner.getAnimations?.().length) bar.banner.hidden = true;
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
    const shown = surface.update({
      label: view.label,
      look,
      fraction: view.fraction,
      shield: view.shield,
      defeated: view.defeated,
      quiet: phaseChanged,
      ticks: view.ticks,
    });
    const low = !view.defeated && isLow(shown, look.effects.lowThreshold);
    updatePortraitVfx(bar, view, shown, low);
    if (phaseChanged) surface.emit({ kind: "phase", share: 0, x: 0.5 });
    if (view.defeated && bar.wasDefeated === false) surface.emit({ kind: "defeat", share: 0, x: 0.5 });
    bar.wasDefeated = view.defeated;
    renderTicks(bar, view.ticks);
    updateQuote(bar, view.quote);
    if (phaseChanged) {
      playPhaseChange(
        look,
        {
          meter: surface.meter,
          fill: surface.fill,
          flash: surface.flash,
          crack: surface.crack,
          banner: bar.phaseBanner,
        },
        shown,
        phaseText,
        palette,
        options.reducedMotion(),
      );
    }
    bar.numbers.hidden = !view.numbers;
    bar.numbers.textContent = view.numbers ? formatNumbers(view.numbers) : "";
    renderMiniBars(bar.miniBars, view.miniBars);
    renderStatuses(bar.statuses, view.statuses, view.statusOverflow);
  }

  const list = createKeyedList(stack, createBar, updateBar, options.reducedMotion, {
    enter(view, reduced, bar) {
      typeName(bar.name, view.look, reduced);
      bar.surface.emit({ kind: "appear", share: 0, x: 0 });
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
        options.particles.emit(ash(bar.root.getBoundingClientRect(), view.look.fill.colors));
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
    const { surface } = bar;
    const fill = surface.shown ?? 0;
    const reduced = options.reducedMotion();
    // Damage and healing reach the renderer through surface.playQuarter; the others are told here.
    if (effect === "phase" || effect === "defeat") surface.emit({ kind: effect, share: 0, x: 0.5 });
    if (effect === "damage" || effect === "heal") {
      surface.playQuarter(effect, look);
    } else if (effect === "phase") {
      const targets = {
        meter: surface.meter,
        fill: surface.fill,
        flash: surface.flash,
        crack: surface.crack,
        banner: bar.phaseBanner,
      };
      playPhaseChange(look, targets, fill, bar.phase.textContent ?? "", null, reduced);
    } else {
      if (look.motion.defeat === "dissolve" && options.particles) {
        options.particles.emit(ash(bar.root.getBoundingClientRect(), look.fill.colors));
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
    targets() {
      return options.movable
        ? shownViews.flatMap((view) => {
            const shown = list.get(view.id);
            return shown ? [{ id: view.id, element: shown.item.el, label: view.label }] : [];
          })
        : [];
    },
    update(views: BossBarView[], block: Block, uiScale: number) {
      shownViews = views;
      positionBlock(stack, block, uiScale);
      list.update(views);
    },
  };
}
