export function part(tag: string, className: string, parent?: HTMLElement): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  parent?.append(el);
  return el;
}

/** Image or looping muted video; replaced only when the source or its kind changes. */
export function setPortrait(container: HTMLElement, { src, video }: { src: string; video: boolean }): void {
  const current = container.firstElementChild;
  if (current && current.getAttribute("src") === src && (current.tagName === "VIDEO") === video) return;
  const media = document.createElement(video ? "video" : "img");
  if (media instanceof HTMLVideoElement) {
    Object.assign(media, { muted: true, loop: true, autoplay: true, playsInline: true });
  } else {
    media.alt = "";
  }
  media.setAttribute("src", src);
  container.replaceChildren(media);
}

export function formatNumbers(numbers: { value: number; max: number; temp: number }): string {
  return `${numbers.value} / ${numbers.max}${numbers.temp ? ` +${numbers.temp}` : ""}`;
}
