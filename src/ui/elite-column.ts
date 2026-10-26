import type { HudEffect } from "../core/actions";
import { hpChange, isLow } from "../core/look/effects";
import type { Block } from "../core/layout";
import type { EliteCardView, HudViews } from "../core/view";
import { positionBlock } from "./blocks";
import { formatNumbers, part, setPortrait } from "./dom";
import { enterFrames, leaveDuration, leaveFrames, playHpChange } from "./effects";
import { createStatusRow, renderMiniBars, renderStatuses } from "./extras";
import { createKeyedList, type KeyedItem } from "./keyed-list";
import { applyHpColor, applyLook } from "./look";
import { vfxRenderer, type VfxHandle } from "./vfx/renderer";

interface Card extends KeyedItem {
  /** The card's plate and meter drawn by the shared WebGL2 renderer (ADR 0003); null on the CSS look. */
  vfx: { handle: VfxHandle; canvas: HTMLCanvasElement } | null;
  icon: HTMLElement;
  info: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  numbers: HTMLElement;
  meter: HTMLElement;
  fill: HTMLElement;
  shield: HTMLElement;
  flash: HTMLElement;
  crack: HTMLElement;
  wave: HTMLElement;
  rank: HTMLElement;
  miniBars: HTMLElement;
  statuses: HTMLElement;
  shown: number | null;
}

export interface ColumnOptions {
  reducedMotion(): boolean;
  /** Player-side collapse of the whole column; absent in editor previews. */
  collapse?: {
    labels: { title: string; collapse: string; expand: string };
    onToggle(collapsed: boolean): void;
  };
}

/**
 * The elite column: each card drawn in its rank's look (icon always; name, fill and statuses as the rank allows),
 * "+N" for the rest.
 */
export function createEliteColumn(host: HTMLElement, options: ColumnOptions) {
  const column = part("div", "bb5e-column", host);
  const toggle = part("button", "bb5e-column__toggle", column) as HTMLButtonElement;
  toggle.type = "button";
  toggle.hidden = true;
  let collapsed = false;
  toggle.addEventListener("click", () => options.collapse?.onToggle(!collapsed));
  const cards = part("div", "bb5e-column__cards", column);
  const more = part("div", "bb5e-column__more", column);
  more.hidden = true;

  function createCard(): Card {
    const el = part("div", "bb5e-elite");
    // The avatar holds the icon and, in the ring layout, the HP ring around it.
    const avatar = part("div", "bb5e-elite__avatar", el);
    const icon = part("div", "bb5e-elite__icon bb5e-face", avatar);
    const info = part("div", "bb5e-elite__info", el);
    const head = part("div", "bb5e-elite__head", info);
    const name = part("span", "bb5e-elite__name", head);
    const count = part("span", "bb5e-elite__count", head);
    const numbers = part("span", "bb5e-elite__numbers", head);
    const meter = part("div", "bb5e-elite__meter", info);
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    const fill = part("div", "bb5e-elite__fill", meter);
    const shield = part("div", "bb5e-elite__shield", meter);
    const flash = part("div", "bb5e-fx bb5e-fx--flash", meter);
    const crack = part("div", "bb5e-fx bb5e-fx--crack", meter);
    const wave = part("div", "bb5e-fx bb5e-fx--wave", meter);
    const miniBars = part("div", "bb5e-minibars bb5e-elite__minibars", info);
    const statuses = createStatusRow("bb5e-elite__statuses", info);
    const rank = part("div", "bb5e-elite__rank", info);
    return {
      el,
      icon,
      info,
      name,
      count,
      numbers,
      meter,
      fill,
      shield,
      flash,
      crack,
      wave,
      rank,
      miniBars,
      statuses,
      shown: null,
      leaving: null,
      vfx: null,
    };
  }

  /**
   * Cards of the horizontal layouts get their plate (and meter, when the rank shows it) from the shared renderer;
   * vertical and ring fills keep the CSS look. The CSS look hides only while the canvas draws.
   */
  function updateVfx(card: Card, view: EliteCardView, shown: number, low: boolean) {
    const wanted = view.look.attrs.cfill === "horizontal";
    if (!wanted) {
      if (!card.vfx) return;
      card.vfx.handle.detach();
      card.vfx.canvas.remove();
      card.el.classList.remove("bb5e-vfx");
      card.vfx = null;
      return;
    }
    if (!card.vfx) {
      const renderer = vfxRenderer(options.reducedMotion);
      if (!renderer) return;
      const canvas = document.createElement("canvas");
      canvas.className = "bb5e-elite__vfx";
      canvas.setAttribute("aria-hidden", "true");
      card.el.prepend(canvas);
      const handle = renderer.attach(
        canvas,
        card.meter,
        (live) => card.el.classList.toggle("bb5e-vfx", live),
        { card: card.el, icon: card.icon },
      );
      card.vfx = { handle, canvas };
    }
    card.vfx.handle.setMaterial(view.look.material, view.look.key);
    card.vfx.handle.setState({
      fill: shown,
      shield: view.defeated ? 0 : view.shield,
      ticks: [],
      low,
      defeated: view.defeated,
      accent: view.rank.color,
      accentTop: view.look.attrs.icon !== "left",
      iconFrame: view.look.attrs.icon !== "tile",
    });
  }

  function updateCard(card: Card, view: EliteCardView) {
    const { el } = card;
    const { parts, look } = view;
    applyLook(el, look);
    el.classList.toggle("bb5e-elite--fill", parts.fill);
    const iconOnly = !parts.name && !parts.fill && !view.statuses.length;
    el.classList.toggle("bb5e-elite--icon-only", iconOnly);
    el.classList.toggle("bb5e-elite--defeated", view.defeated);
    el.classList.toggle("bb5e-elite--muted", view.muted);
    el.style.setProperty("--bb5e-rank-color", view.rank.color);
    el.style.setProperty("--bb5e-icon", String(view.rank.size / 16));
    // Icon-only cards still need a name for assistive tech; GM numbers go to the tooltip there.
    el.setAttribute("aria-label", `${view.label}${view.count ? ` ×${view.count}` : ""}, ${view.rank.name}`);
    const hint = iconOnly && view.numbers ? `${view.label}: ${formatNumbers(view.numbers)}` : "";
    el.classList.toggle("bb5e-elite--hint", Boolean(hint));
    if (hint) el.dataset.tooltipText = hint;
    else delete el.dataset.tooltipText;
    setPortrait(card.icon, view.portrait);
    card.info.hidden = iconOnly;
    card.name.hidden = !parts.name;
    card.name.textContent = view.label;
    card.count.hidden = !view.count;
    card.count.textContent = view.count ? `×${view.count}` : "";
    card.numbers.hidden = !view.numbers || !parts.name;
    card.numbers.textContent = view.numbers ? formatNumbers(view.numbers) : "";
    card.meter.hidden = !parts.fill;
    card.meter.setAttribute("aria-label", view.label);
    const shown = view.defeated ? 0 : (view.fraction ?? 0);
    if (view.fraction === null) card.meter.removeAttribute("aria-valuenow");
    else card.meter.setAttribute("aria-valuenow", String(Math.round(shown * 100)));
    // A vertical fill (layout C tiles) grows upwards; the ring reads --bb5e-f.
    card.fill.style.transform = look.attrs.cfill === "vertical" ? `scaleY(${shown})` : `scaleX(${shown})`;
    el.style.setProperty("--bb5e-f", String(shown));
    applyHpColor(card.fill, look, shown);
    const low = parts.fill && !view.defeated && isLow(shown, look.effects.lowThreshold);
    updateVfx(card, view, shown, low);
    if (card.shown !== shown) {
      const change = hpChange(card.shown, shown, look.effects.bigThreshold);
      if (change && card.vfx) {
        card.vfx.handle.event({ kind: change.kind, share: change.share, x: shown, big: false });
      }
      playHpChange(
        change,
        look,
        {
          root: el,
          portrait: card.icon,
          flash: card.flash,
          crack: card.crack,
          wave: card.wave,
          name: card.name,
        },
        options.reducedMotion(),
      );
      card.shown = shown;
    }
    const lowMode = look.effects.lowFlicker ? "flicker" : look.effects.lowPulse ? "pulse" : "";
    if (parts.fill && lowMode && !view.defeated && isLow(shown, look.effects.lowThreshold))
      el.dataset.low = lowMode;
    else delete el.dataset.low;
    card.shield.hidden = !view.shield || view.defeated;
    card.shield.style.setProperty("--bb5e-at", String(shown));
    card.shield.style.setProperty("--bb5e-shield", String(view.shield));
    renderMiniBars(card.miniBars, view.miniBars);
    renderStatuses(card.statuses, view.statuses, view.statusOverflow);
    card.rank.textContent = view.rank.name;
  }

  // Cards have no room for the defeat banner: a banner look fades them instead.
  const list = createKeyedList(cards, createCard, updateCard, options.reducedMotion, {
    enter: (view, reduced) => ({
      frames: enterFrames(view.look, reduced),
      duration: view.look.motion.duration,
    }),
    leave: (view, reduced) => ({
      frames: leaveFrames(view.look, view.defeated, reduced),
      duration: leaveDuration(view.look, view.defeated),
    }),
  });
  return {
    element: column,
    /** `api.playEffect` on a shown card: damage or healing of a quarter of the card, nothing else changes. */
    play(id: string, effect: HudEffect) {
      const shown = list.get(id);
      if (!shown || (effect !== "damage" && effect !== "heal")) return;
      const { item: card, view } = shown;
      const fill = card.shown ?? 0;
      const [from, to] = effect === "damage" ? [fill + 0.25, fill] : [fill - 0.25, fill];
      card.vfx?.handle.event({ kind: effect, share: 0.25, x: fill, big: false });
      playHpChange(
        hpChange(from, to, view.look.effects.bigThreshold),
        view.look,
        {
          root: card.el,
          portrait: card.icon,
          flash: card.flash,
          crack: card.crack,
          wave: card.wave,
          name: card.name,
        },
        options.reducedMotion(),
      );
    },
    update(
      views: EliteCardView[],
      state: Pick<HudViews, "eliteOverflow" | "column">,
      block: Block,
      uiScale: number,
    ) {
      positionBlock(column, block, uiScale);
      const { canCollapse, total } = state.column;
      collapsed = state.column.collapsed;
      // The toggle is a player control; with nothing to show it would be an empty chip.
      const labels = options.collapse?.labels;
      toggle.hidden = !canCollapse || !labels || !total;
      if (labels) {
        toggle.textContent = collapsed ? `${labels.title} · ${total} ▸` : "▾";
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute("aria-label", collapsed ? labels.expand : labels.collapse);
      }
      column.classList.toggle("bb5e-column--collapsed", collapsed);
      list.update(collapsed ? [] : views);
      const overflow = collapsed ? 0 : state.eliteOverflow;
      more.hidden = !overflow;
      more.textContent = overflow ? `+${overflow}` : "";
    },
  };
}
