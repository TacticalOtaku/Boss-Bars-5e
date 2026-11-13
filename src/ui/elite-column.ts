import type { HudEffect } from "../core/actions";
import type { Block } from "../core/layout";
import type { EliteCardView, HudViews } from "../core/view";
import { formatNumbers, part, positionBlock, setPortrait } from "./dom";
import { enterFrames, leaveDuration, leaveFrames } from "./effects";
import { createStatusRow, renderMiniBars, renderStatuses } from "./extras";
import { createKeyedList, type KeyedItem } from "./keyed-list";
import { applyLook } from "./look";
import { createMeterSurface, type MeterSurface } from "./meter-surface";

interface Card extends KeyedItem {
  surface: MeterSurface;
  icon: HTMLElement;
  info: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  numbers: HTMLElement;
  rank: HTMLElement;
  miniBars: HTMLElement;
  statuses: HTMLElement;
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
    const surface = createMeterSurface({
      root: el,
      parent: info,
      classPrefix: "bb5e-elite",
      portrait: icon,
      name,
      vfxPlacement: "prependRoot",
      vfxWanted: (look) => look.attrs.cfill === "horizontal",
      vfxOptions: { card: el, icon },
      respectCardDirection: true,
      reducedMotion: options.reducedMotion,
    });
    const miniBars = part("div", "bb5e-minibars bb5e-elite__minibars", info);
    const statuses = createStatusRow("bb5e-elite__statuses", info);
    const rank = part("div", "bb5e-elite__rank", info);
    return {
      el,
      surface,
      icon,
      info,
      name,
      count,
      numbers,
      rank,
      miniBars,
      statuses,
      leaving: null,
    };
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
    card.surface.update({
      label: view.label,
      look,
      fraction: view.fraction,
      shield: view.shield,
      defeated: view.defeated,
      visible: parts.fill,
      accent: view.rank.color,
      accentTop: look.attrs.icon !== "left",
      iconFrame: look.attrs.icon !== "tile",
    });
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
      shown.item.surface.playQuarter(effect, shown.view.look);
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
