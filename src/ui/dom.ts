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
 * Image or looping muted video, replaced only when the source or its kind changes, framed at the focus: the zoomed
 * picture moves so that its focus point lands in the frame's centre, at any zoom; an edge moved inside the frame
 * shows the frame's empty colour. The `translate` and `scale` properties leave effect transforms alone.
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
  const scale = focus.zoom / 100;
  // The point lands at at × zoom after scaling from the top left corner: shift it to 50%.
  const shift = (at: number) => 50 - at * scale;
  media.style.objectPosition = `${focus.x}% ${focus.y}%`;
  media.style.transformOrigin = "0 0";
  media.style.translate = `${shift(focus.x)}% ${shift(focus.y)}%`;
  media.style.scale = String(scale);
}

export function formatNumbers(numbers: { value: number; max: number; temp: number }): string {
  return `${numbers.value} / ${numbers.max}${numbers.temp ? ` +${numbers.temp}` : ""}`;
}
