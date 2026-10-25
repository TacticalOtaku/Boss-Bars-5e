import { ANCHORS, type Block } from "../core/layout";

/**
 * Puts a layout block on the screen. CSS does the arithmetic (anchor share + offset × uiScale, shifted back by the
 * block's own size), so resizes, the camera dock and uiScale need no measuring.
 */
export function positionBlock(el: HTMLElement, block: Block, uiScale: number): void {
  const [fx, fy] = ANCHORS[block.anchor];
  el.style.setProperty("--bb5e-fx", String(fx));
  el.style.setProperty("--bb5e-fy", String(fy));
  el.style.setProperty("--bb5e-dx", String(block.dx));
  el.style.setProperty("--bb5e-dy", String(block.dy));
  el.style.setProperty("--bb5e-ui-scale", String(uiScale));
  el.dataset.dir = block.dir;
}
