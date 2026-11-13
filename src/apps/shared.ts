import { DEFAULT_LAYOUT } from "../core/layout";
import { BUILTIN_IDS } from "../core/look/builtin";
import { CLASSIC_STYLE, type LookStyle } from "../core/look/compile";
import type { PortraitFocus } from "../core/profile";
import type { Rank } from "../core/ranks";
import { isVideoPath, type BossBarView, type EliteCardView, type PhaseView } from "../core/view";
import { createBossStack } from "../ui/boss-stack";
import { reducedMotion } from "../ui/dom";
import { createEliteColumn } from "../ui/elite-column";

/** Asks before closing a window with unsaved edits. */
async function confirmDiscard(): Promise<boolean> {
  const discard = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("BB5E.Unsaved.Title") },
    content: `<p>${game.i18n.localize("BB5E.Unsaved.Body")}</p>`,
  });
  return discard === true;
}

/** Places a hosted editor's element directly in its Hub slot instead of document.body. */
export function mountHosted(slot: HTMLElement, element: HTMLElement): void {
  if (element.parentElement !== slot) slot.replaceChildren(element);
}

/** Tracks unsaved edits, syncs `.bb5e-footer__dirty`, and guards close behind one confirmation prompt. */
export class DirtyGuard {
  #dirty = false;
  #confirming = false;

  get dirty(): boolean {
    return this.#dirty;
  }

  set(dirty: boolean, element?: HTMLElement | null): void {
    this.#dirty = dirty;
    const badge = element?.querySelector<HTMLElement>(".bb5e-footer__dirty");
    if (badge) badge.hidden = !dirty;
  }

  /** Returns true when close should stay open (already confirming or user chose not to discard). */
  async keepOpen(options: Record<string, unknown>, dirty = this.#dirty): Promise<boolean> {
    if (!dirty || options.force) return false;
    if (this.#confirming) return true;
    this.#confirming = true;
    const discard = await confirmDiscard();
    this.#confirming = false;
    return !discard;
  }
}

/** Downloads JSON-formatted settings or library data using Foundry's file exporter. */
export function downloadJson(data: unknown, filename: string): void {
  foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "application/json", filename);
}

/** Opens a JSON file picker and passes the selected file text to `onText`. */
export function pickJsonText(onText: (text: string) => unknown): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void foundry.utils.readTextFromFile(file).then((text) => onText(text));
  });
  input.click();
}

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
  card: {
    label: string;
    img: string;
    focus?: PortraitFocus;
    rank: Rank;
    look?: LookStyle;
    fraction?: number;
    defeated?: boolean;
  },
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
    portrait: { src: card.img, video: isVideoPath(card.img), focus: card.focus },
    fraction: card.fraction ?? 0.66,
    defeated: card.defeated ?? false,
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
  focus?: PortraitFocus;
  quote?: BossBarView["quote"];
}

export const freshPreview = (): PreviewState => ({ fraction: 0.74, defeated: false, shown: true });

/** The play buttons under a preview: each plays the look's own effect through the HUD renderer. */
export const PREVIEW_STEPS = ["appear", "damage", "heal", "phase", "defeat"] as const;
export type PreviewStep = (typeof PREVIEW_STEPS)[number];

const STEP_LABELS: Record<PreviewStep, string> = {
  appear: "BB5E.Preview.Appear",
  damage: "BB5E.Preview.Damage",
  heal: "BB5E.Preview.Heal",
  phase: "BB5E.Preview.Phase",
  defeat: "BB5E.Preview.Defeat",
};

/** The play buttons for a template: `{ step, label }`. */
export const previewSteps = () =>
  PREVIEW_STEPS.map((step) => ({ step, label: game.i18n.localize(STEP_LABELS[step]) }));

let samplePhase = 1;

/**
 * Plays one step on a preview; `draw` renders the state. "Appear" replays the entry from a fresh bar, defeat plays
 * the exit and brings the bar back after its banner, a phase step moves to a sample next phase.
 */
export function playPreview(state: PreviewState, step: PreviewStep, draw: () => void): void {
  switch (step) {
    case "appear":
      Object.assign(state, freshPreview(), { shown: false });
      draw();
      state.shown = true;
      break;
    case "damage":
      state.fraction = state.fraction > 0.35 ? state.fraction - 0.3 : 0.08;
      break;
    case "heal":
      state.fraction = Math.min(1, state.fraction + 0.25);
      break;
    case "phase": {
      samplePhase = (samplePhase % 4) + 1;
      const numeral = ["I", "II", "III", "IV"][samplePhase - 1] ?? "II";
      state.phase = {
        key: `sample-${samplePhase}-${Date.now()}`,
        label: game.i18n.format("BB5E.Phase.Default", { n: numeral }),
        numeral,
      };
      break;
    }
    case "defeat":
      state.defeated = true;
      draw();
      state.shown = false;
      setTimeout(() => {
        Object.assign(state, freshPreview());
        draw();
      }, 2600);
      break;
  }
  draw();
}

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
      reducedMotion,
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
    portrait: { src: state.img || SAMPLE_IMG, video: isVideoPath(state.img ?? ""), focus: state.focus },
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
