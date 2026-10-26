import { DEFAULT_LAYOUT } from "../core/layout";
import { BUILTIN_IDS, BUILTIN_LOOKS, BUILTIN_PRESETS, CLASSIC, CLASSIC_STYLE } from "../core/look/builtin";
import { resolveLook, type LookSources } from "../core/look/resolve";
import type { Category, Library } from "../core/look/schema";
import { lookStyle, type LookStyle } from "../core/look/style";
import type { Rank } from "../core/ranks";
import { isVideoPath, type BossBarView, type EliteCardView, type PhaseView } from "../core/view";
import { createBossStack } from "../ui/boss-stack";
import { createEliteColumn } from "../ui/elite-column";

/** Asks before closing a window with unsaved edits. */
export async function confirmDiscard(): Promise<boolean> {
  const discard = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("BB5E.Unsaved.Title") },
    content: `<p>${game.i18n.localize("BB5E.Unsaved.Body")}</p>`,
  });
  return discard === true;
}

/** Built-ins plus a (draft) library: what editors resolve looks from. */
export const sourcesOf = (library: Library | null): LookSources => ({
  looks: [...BUILTIN_LOOKS, ...(library?.looks ?? [])],
  presets: [...BUILTIN_PRESETS, ...(library?.presets ?? [])],
});

/** The style of a look id with overrides, from the given sources. */
export const styleFor = (
  sources: LookSources,
  lookId: string | null,
  overrides: Partial<Record<Category, string>> = {},
): LookStyle => lookStyle(resolveLook(lookId, overrides, sources, CLASSIC));

/** Built-in names are i18n keys; the GM's are plain text. */
export const displayName = (item: { name: string; id: string }) =>
  BUILTIN_IDS.has(item.id) ? game.i18n.localize(item.name) : item.name;

/** Core Foundry images for the sample bars and statuses. */
const SAMPLE_IMG = "icons/svg/mystery-man.svg";

const PREVIEW_COLUMN = { canCollapse: false, collapsed: false, total: 1 };
const cards = new WeakMap<HTMLElement, ReturnType<typeof createEliteColumn>>();
const bars = new WeakMap<HTMLElement, ReturnType<typeof createBossStack>>();

/**
 * An elite card drawn by the HUD's own renderer inside an editor (spec §11). One column per host element, so typing
 * updates the card in place; a re-render brings a new host and a new column.
 */
export function previewCard(
  host: HTMLElement,
  card: { label: string; img: string; rank: Rank; look?: LookStyle },
): void {
  let column = cards.get(host);
  if (!column) {
    host.replaceChildren();
    column = createEliteColumn(host, { reducedMotion: () => true });
    cards.set(host, column);
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
    shield: card.look?.shield === false ? 0 : 0.1,
    statuses: card.rank.parts.statuses ? sampleStatuses() : [],
    statusOverflow: 0,
    miniBars: [],
    look: card.look ?? CLASSIC_STYLE,
  };
  column.update([view], { eliteOverflow: 0, column: PREVIEW_COLUMN }, DEFAULT_LAYOUT.elites, 1);
}

const sampleStatuses = () => [
  { id: "a", name: "Poisoned", img: "icons/svg/poison.svg", stacks: 0, tooltip: "Poisoned" },
  { id: "b", name: "Bless", img: "icons/svg/angel.svg", stacks: 2, tooltip: "Bless" },
];

/** What the test console changes on a preview; never written to an actor. */
export interface PreviewState {
  fraction: number;
  defeated: boolean;
  /** false: the bar has left (defeat or reset replays the exit and entry). */
  shown: boolean;
  /** A phase of the profile: its label, ticks and entry changes; a new key plays the phase change. */
  phase?: PhaseView | null;
  ticks?: number[];
  title?: string;
  img?: string;
  quote?: BossBarView["quote"];
}

export const freshPreview = (): PreviewState => ({ fraction: 0.74, defeated: false, shown: true });

/**
 * A boss bar drawn by the HUD renderer in an editor, with sample mini-bars and statuses. Effects play: the preview
 * keeps its bar between updates, so a lower fraction is damage and a higher one is healing.
 */
export function previewBoss(host: HTMLElement, look: LookStyle, state: PreviewState, label: string): void {
  let stack = bars.get(host);
  if (!stack) {
    host.replaceChildren();
    stack = createBossStack(host, {
      labels: {
        collapse: "",
        expand: "",
        defeated: game.i18n.localize("BB5E.Bar.Defeated"),
        phase: game.i18n.localize("BB5E.Phase.Default"),
      },
      onCollapse: () => undefined,
      reducedMotion: () =>
        matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.body.classList.contains("performance-low"),
    });
    bars.set(host, stack);
  }
  const view: BossBarView = {
    id: "preview",
    label,
    title: state.title ?? game.i18n.localize("BB5E.Look.SampleTitle"),
    phase: state.phase ?? null,
    ticks: state.ticks ?? [],
    quote: state.quote ?? null,
    portrait: { src: state.img || SAMPLE_IMG, video: isVideoPath(state.img ?? "") },
    size: 100,
    fraction: state.fraction,
    defeated: state.defeated,
    muted: false,
    collapsed: false,
    canCollapse: false,
    numbers: { value: Math.round(state.fraction * 300), max: 300, temp: 24 },
    shield: look.shield ? 0.08 : 0,
    statuses: sampleStatuses().slice(0, Math.max(0, look.statuses.max)),
    statusOverflow: 0,
    miniBars: [
      {
        id: "leg",
        label: game.i18n.localize("BB5E.MiniBars.SourceLegact"),
        fraction: 2 / 3,
        pips: { filled: 2, total: 3 },
      },
      { id: "res", label: game.i18n.localize("BB5E.MiniBars.SourceCounter"), fraction: 0.6, pips: null },
    ],
    look,
  };
  stack.update(state.shown ? [view] : [], { ...DEFAULT_LAYOUT.bosses }, 1);
}
