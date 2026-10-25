import type { EliteCardView } from "../core/view";
import { formatNumbers, part, setPortrait } from "./dom";
import { createKeyedList, type KeyedItem } from "./keyed-list";

interface Card extends KeyedItem {
  icon: HTMLElement;
  info: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  numbers: HTMLElement;
  meter: HTMLElement;
  fill: HTMLElement;
  rank: HTMLElement;
}

/** The elite column (layout A rows): icon always, name and thin fill as the rank allows, "+N" for the rest. */
export function createEliteColumn(host: HTMLElement, reducedMotion: () => boolean) {
  const column = part("div", "bb5e-column", host);
  const cards = part("div", "bb5e-column__cards", column);
  const more = part("div", "bb5e-column__more", column);
  more.hidden = true;

  function createCard(): Card {
    const el = part("div", "bb5e-elite");
    const icon = part("div", "bb5e-elite__icon", el);
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
    const rank = part("div", "bb5e-elite__rank", info);
    return { el, icon, info, name, count, numbers, meter, fill, rank, leaving: null };
  }

  function updateCard(card: Card, view: EliteCardView) {
    const { el } = card;
    const { parts } = view;
    const iconOnly = !parts.name && !parts.fill;
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
    card.fill.style.transform = `scaleX(${shown})`;
    card.rank.textContent = view.rank.name;
  }

  const list = createKeyedList(cards, createCard, updateCard, reducedMotion);
  return {
    update(views: EliteCardView[], overflow: number, uiScale: number) {
      column.style.setProperty("--bb5e-ui-scale", String(uiScale));
      list.update(views);
      more.hidden = !overflow;
      more.textContent = overflow ? `+${overflow}` : "";
    },
  };
}
