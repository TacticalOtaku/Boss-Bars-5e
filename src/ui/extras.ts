import type { MiniBarView } from "../core/minibars";
import type { StatusView } from "../core/statuses";
import { part } from "./dom";

/**
 * Keeps one child per item, reusing children by position: re-rendering the same data touches nothing, so a hovered
 * status keeps its tooltip while hooks fire.
 */
function syncChildren<T>(
  container: HTMLElement,
  items: T[],
  create: () => HTMLElement,
  update: (el: HTMLElement, item: T) => void,
): void {
  const children = [...container.children] as HTMLElement[];
  items.forEach((item, index) => {
    let el = children[index];
    if (!el) {
      el = create();
      container.append(el);
    }
    update(el, item);
  });
  for (const extra of children.slice(items.length)) extra.remove();
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setAttr(el: HTMLElement, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function createStatus(): HTMLElement {
  const el = part("span", "bb5e-status");
  el.setAttribute("role", "img");
  el.dataset.tooltipClass = "bb5e-tooltip";
  part("img", "bb5e-status__icon", el).setAttribute("alt", "");
  part("span", "bb5e-status__stacks", el);
  return el;
}

function updateStatus(el: HTMLElement, status: StatusView): void {
  const [icon, stacks] = el.children as unknown as [HTMLImageElement, HTMLElement];
  if (status.img) setAttr(icon, "src", status.img);
  else icon.removeAttribute("src");
  icon.hidden = !status.img;
  // Foundry's tooltip sets data-tooltip-text as text, never as HTML.
  if (el.dataset.tooltipText !== status.tooltip) el.dataset.tooltipText = status.tooltip;
  setAttr(el, "aria-label", status.tooltip);
  stacks.hidden = status.stacks < 2;
  setText(stacks, status.stacks > 1 ? String(status.stacks) : "");
}

/** The status row: icons with a plain-text tooltip, a stack badge and "+N" for the rest. */
export function renderStatuses(row: HTMLElement, statuses: StatusView[], overflow: number): void {
  const icons = row.firstElementChild as HTMLElement;
  const more = row.lastElementChild as HTMLElement;
  syncChildren(icons, statuses, createStatus, updateStatus);
  more.hidden = !overflow;
  setText(more, overflow ? `+${overflow}` : "");
  row.hidden = !statuses.length;
}

export function createStatusRow(className: string, parent: HTMLElement): HTMLElement {
  const row = part("div", `bb5e-statuses ${className}`, parent);
  part("div", "bb5e-statuses__icons", row);
  part("span", "bb5e-statuses__more", row);
  row.hidden = true;
  return row;
}

function createMiniBar(): HTMLElement {
  const el = part("div", "bb5e-mini");
  el.setAttribute("role", "meter");
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", "100");
  part("span", "bb5e-mini__label", el);
  const track = part("div", "bb5e-mini__track", el);
  part("div", "bb5e-mini__fill", track);
  part("div", "bb5e-mini__pips", el);
  part("span", "bb5e-mini__numbers", el);
  return el;
}

function updateMiniBar(el: HTMLElement, bar: MiniBarView): void {
  const [label, track, pips, numbers] = el.children as unknown as [
    HTMLElement,
    HTMLElement,
    HTMLElement,
    HTMLElement,
  ];
  setAttr(el, "aria-label", bar.label);
  setAttr(el, "aria-valuenow", String(Math.round(bar.fraction * 100)));
  label.hidden = !bar.label;
  setText(label, bar.label);
  track.hidden = Boolean(bar.pips);
  (track.firstElementChild as HTMLElement).style.transform = `scaleX(${bar.fraction})`;
  pips.hidden = !bar.pips;
  const total = bar.pips?.total ?? 0;
  if (pips.childElementCount !== total) {
    pips.replaceChildren(...Array.from({ length: total }, () => part("span", "bb5e-mini__pip")));
  }
  [...pips.children].forEach((pip, index) =>
    pip.classList.toggle("bb5e-mini__pip--on", index < (bar.pips?.filled ?? 0)),
  );
  numbers.hidden = !bar.numbers;
  setText(numbers, bar.numbers ? `${bar.numbers.value} / ${bar.numbers.max}` : "");
}

/** Mini-bars under a bar or inside a card: a thin bar or pips, numbers for the GM. */
export function renderMiniBars(container: HTMLElement, bars: MiniBarView[]): void {
  syncChildren(container, bars, createMiniBar, updateMiniBar);
  container.hidden = !bars.length;
}
