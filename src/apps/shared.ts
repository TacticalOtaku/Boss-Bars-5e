import { DEFAULT_LAYOUT } from "../core/layout";
import type { Rank } from "../core/ranks";
import { isVideoPath, type EliteCardView } from "../core/view";
import { createEliteColumn } from "../ui/elite-column";

/** Asks before closing a window with unsaved edits. */
export async function confirmDiscard(): Promise<boolean> {
  const discard = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("BB5E.Unsaved.Title") },
    content: `<p>${game.i18n.localize("BB5E.Unsaved.Body")}</p>`,
  });
  return discard === true;
}

const PREVIEW_COLUMN = { canCollapse: false, collapsed: false, total: 1 };
const previews = new WeakMap<HTMLElement, ReturnType<typeof createEliteColumn>>();

/**
 * An elite card drawn by the HUD's own renderer inside an editor (spec §11). One column per host element, so typing
 * updates the card in place; a re-render brings a new host and a new column.
 */
export function previewCard(host: HTMLElement, card: { label: string; img: string; rank: Rank }): void {
  let column = previews.get(host);
  if (!column) {
    host.replaceChildren();
    column = createEliteColumn(host, { reducedMotion: () => true });
    previews.set(host, column);
  }
  const view: EliteCardView = {
    id: "preview",
    label: card.label,
    portrait: { src: card.img, video: isVideoPath(card.img) },
    fraction: 0.66,
    defeated: false,
    muted: false,
    rank: { name: card.rank.name, color: card.rank.color, size: card.rank.size },
    parts: { name: card.rank.parts.name, fill: card.rank.parts.fill },
  };
  column.update([view], { eliteOverflow: 0, column: PREVIEW_COLUMN }, DEFAULT_LAYOUT.elites, 1);
}
