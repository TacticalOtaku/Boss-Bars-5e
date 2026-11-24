import { MODULE_ID } from "../constants";
import { ANCHORS, type Block } from "../core/layout";
import { CENTRED_FOCUS, type PortraitFocus } from "../core/profile";

/** prefers-reduced-motion or Foundry's performance-low: only opacity changes are animated. */
export const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.body.classList.contains("performance-low");

export function part(tag: string, className: string, parent?: HTMLElement): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  parent?.append(el);
  return el;
}

/**
 * Image or looping muted video, replaced only when the source or its kind changes, framed at the focus:
 * `object-position` pans across covered axes and `scale` zooms around the same `(x%, y%)` origin so the media
 * always covers the frame without empty borders while leaving effect `transform`s alone.
 */
export function setPortrait(
  container: HTMLElement,
  { src, video, focus = CENTRED_FOCUS }: { src: string; video: boolean; focus?: PortraitFocus },
): void {
  let media = container.firstElementChild as HTMLElement | null;
  if (!media || media.getAttribute("src") !== src || (media.tagName === "VIDEO") !== video) {
    media = document.createElement(video ? "video" : "img");
    if (media instanceof HTMLVideoElement) {
      Object.assign(media, { muted: true, loop: true, autoplay: true, playsInline: true });
    } else {
      (media as HTMLImageElement).alt = "";
    }
    media.setAttribute("src", src);
    container.replaceChildren(media);
  }
  const clampPct = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 50));
  const x = clampPct(focus.x);
  const y = clampPct(focus.y);
  const scale = Math.max(1, Number.isFinite(focus.zoom) ? focus.zoom / 100 : 1);
  media.style.objectPosition = `${x}% ${y}%`;
  media.style.transformOrigin = `${x}% ${y}%`;
  media.style.translate = "";
  media.style.scale = String(scale);
}

export function formatNumbers(numbers: { value: number; max: number; temp: number }): string {
  return `${numbers.value} / ${numbers.max}${numbers.temp ? ` +${numbers.temp}` : ""}`;
}

/** Places a HUD block by its anchor, percentage offset, UI scale and growth direction. */
export function positionBlock(el: HTMLElement, block: Block, uiScale: number): void {
  const [fx, fy] = ANCHORS[block.anchor];
  el.style.setProperty("--bb5e-fx", String(fx));
  el.style.setProperty("--bb5e-fy", String(fy));
  el.style.setProperty("--bb5e-dx", String(block.dx));
  el.style.setProperty("--bb5e-dy", String(block.dy));
  el.style.setProperty("--bb5e-ui-scale", String(uiScale));
  el.dataset.dir = block.dir;
}

/** The HUD root over the whole Foundry interface. Reuses an existing root, so mounting twice is harmless. */
export function mountOverlay(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>(`:scope > #${MODULE_ID}`);
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = MODULE_ID;
  overlay.className = "bb5e-overlay";
  host.append(overlay);
  return overlay;
}
