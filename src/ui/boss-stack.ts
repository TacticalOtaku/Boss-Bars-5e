import type { BossBarView } from "../core/view";

export interface StackOptions {
  labels: { collapse: string; expand: string };
  onCollapse(id: string, collapsed: boolean): void;
  /** prefers-reduced-motion or Foundry's performance-low: only opacity changes are animated. */
  reducedMotion(): boolean;
}

interface Bar {
  el: HTMLElement;
  portrait: HTMLElement;
  name: HTMLElement;
  title: HTMLElement;
  collapse: HTMLButtonElement;
  meter: HTMLElement;
  fill: HTMLElement;
  trail: HTMLElement;
  numbers: HTMLElement;
  view: BossBarView | null;
  shown: number | null;
  leaving: Animation | null;
}

const ENTER_MS = 300;
const LEAVE_MS = 250;

function part(tag: string, className: string, parent?: HTMLElement): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  parent?.append(el);
  return el;
}

/** The boss stack: one keyed DOM bar per view, no framework. All texts go in as text, never as HTML. */
export function createBossStack(overlay: HTMLElement, options: StackOptions) {
  const stack = part("div", "bb5e-stack", overlay);
  const bars = new Map<string, Bar>();

  function createBar(): Bar {
    const el = part("section", "bb5e-boss");
    const portrait = part("div", "bb5e-boss__portrait", el);
    const body = part("div", "bb5e-boss__body", el);
    const head = part("div", "bb5e-boss__head", body);
    const name = part("span", "bb5e-boss__name", head);
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

  function setPortrait(bar: Bar, { src, video }: BossBarView["portrait"]) {
    const current = bar.portrait.firstElementChild as HTMLImageElement | HTMLVideoElement | null;
    if (current && current.getAttribute("src") === src && (current.tagName === "VIDEO") === video) return;
    const media = document.createElement(video ? "video" : "img");
    if (media instanceof HTMLVideoElement)
      Object.assign(media, { muted: true, loop: true, autoplay: true, playsInline: true });
    else media.alt = "";
    media.setAttribute("src", src);
    bar.portrait.replaceChildren(media);
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
    el.dataset.instanceId = view.id;
    el.classList.toggle("bb5e-boss--collapsed", view.collapsed);
    el.classList.toggle("bb5e-boss--defeated", view.defeated);
    el.classList.toggle("bb5e-boss--muted", view.muted);
    el.classList.toggle("bb5e-boss--unknown", view.fraction === null);
    el.style.setProperty("--bb5e-size", String(view.size / 100));
    setPortrait(bar, view.portrait);
    bar.name.textContent = view.label;
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
    const numbers = view.numbers;
    bar.numbers.hidden = !numbers;
    bar.numbers.textContent = numbers
      ? `${numbers.value} / ${numbers.max}${numbers.temp ? ` +${numbers.temp}` : ""}`
      : "";
  }

  function motion(from: Keyframe, to: Keyframe): Keyframe[] {
    return options.reducedMotion() ? [{ opacity: from.opacity }, { opacity: to.opacity }] : [from, to];
  }

  function leave(id: string, bar: Bar) {
    const animation = bar.el.animate?.(
      motion({ opacity: 1 }, { opacity: 0, transform: "translateY(-0.5em)" }),
      {
        duration: LEAVE_MS,
        easing: "ease-in",
        fill: "forwards",
      },
    );
    if (!animation) {
      bar.el.remove();
      bars.delete(id);
      return;
    }
    bar.leaving = animation;
    // cancel() on re-show rejects `finished`; that is expected, not an error.
    animation.finished?.catch(() => undefined);
    animation.onfinish = () => {
      if (bar.leaving !== animation) return;
      bar.el.remove();
      bars.delete(id);
    };
  }

  return {
    update(views: BossBarView[], uiScale: number) {
      stack.style.setProperty("--bb5e-ui-scale", String(uiScale));
      const ids = new Set(views.map((view) => view.id));
      for (const [id, bar] of bars) if (!ids.has(id) && !bar.leaving) leave(id, bar);
      let previous: HTMLElement | null = null;
      for (const view of views) {
        let bar = bars.get(view.id);
        if (!bar) {
          bar = createBar();
          bars.set(view.id, bar);
          bar.el.animate?.(motion({ opacity: 0, transform: "translateY(-0.5em)" }, { opacity: 1 }), {
            duration: ENTER_MS,
            easing: "ease-out",
          });
        } else if (bar.leaving) {
          // Shown again while leaving: drop the exit so it does not stay half transparent.
          bar.leaving.cancel();
          bar.leaving = null;
        }
        updateBar(bar, view);
        const next: ChildNode | null = previous ? previous.nextSibling : stack.firstChild;
        if (next !== bar.el) stack.insertBefore(bar.el, next);
        previous = bar.el;
      }
    },
  };
}
