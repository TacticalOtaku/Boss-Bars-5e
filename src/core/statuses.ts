import type { CustomStatus } from "./profile";

/** One applied Active Effect of a token's actor, as the integration reads it. */
export interface EffectInput {
  id: string;
  name: string;
  img: string;
  /** HTML from the effect; shown as text. */
  description: string;
  statuses: string[];
  /** `showIcon`: 0 never, 1 conditional (only temporary effects), 2 always — as on Foundry 14 token icons. */
  showIcon: number;
  /** dnd5e `isTemporary`: false for a player when dnd5e conceals Bloodied. */
  temporary: boolean;
  /** DAE's copy of a dependent condition (`flags.dae.autoCreated`). */
  autoCreated: boolean;
  /** DAE stack count (`flags.dae.stacks`); 0 or 1 shows no badge. */
  stacks: number;
  /** Foundry's remaining-time label; "" for a lasting effect. */
  duration: string;
}

export interface StatusView {
  id: string;
  name: string;
  img: string;
  stacks: number;
  /** Plain text: name, remaining time, description. */
  tooltip: string;
}

/** Midi QOL's bookkeeping statuses: never shown (spec §3). */
const MIDI_STATUSES = new Set(["reaction", "bonusaction", "flanking", "flanked"]);
const SHOW_ALWAYS = 2;
const SHOW_CONDITIONAL = 1;
const TOOLTIP_TEXT = 300;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Effect descriptions are HTML with Foundry enrichers; the tooltip shows their text only. */
export function plainText(html: string): string {
  return html
    .replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, (_, label: string | undefined) => label ?? "")
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|[a-z]+);/gi, (entity: string, code: string) =>
      code.startsWith("#")
        ? String.fromCodePoint(Number(code.slice(1)))
        : (ENTITIES[code.toLowerCase()] ?? entity),
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOOLTIP_TEXT);
}

/** "Poison (3)" from a DAE stack is hidden by the name "Poison" too. */
const baseName = (name: string) => name.replace(/\s*\(\d+\)$/, "");

/** Which parts the status style puts in the tooltip. */
export interface TooltipParts {
  name: boolean;
  description: boolean;
  duration: boolean;
}
const ALL_PARTS: TooltipParts = { name: true, description: true, duration: true };

const tooltipOf = (name: string, duration: string, description: string, parts: TooltipParts) =>
  [parts.name ? name : "", parts.duration ? duration : "", parts.description ? plainText(description) : ""]
    .filter(Boolean)
    .join("\n") || name;

/**
 * Status icons of one bar or card: the effects Foundry would draw on the tokens (merged over ×N tokens by name and
 * image), minus Midi's and DAE's bookkeeping and what the profile hides, then the enabled custom statuses.
 * Cut at `limit`; the rest is counted for "+N".
 */
export function buildStatuses(
  effectsByToken: EffectInput[][],
  hidden: string[],
  custom: CustomStatus[],
  limit: number,
  parts: TooltipParts = ALL_PARTS,
): { statuses: StatusView[]; overflow: number } {
  const hiddenSet = new Set(hidden.map((entry) => entry.trim().toLowerCase()));
  const merged = new Map<string, StatusView>();
  for (const effect of effectsByToken.flat()) {
    const shown =
      effect.showIcon === SHOW_ALWAYS || (effect.showIcon === SHOW_CONDITIONAL && effect.temporary);
    if (!shown || effect.autoCreated || effect.statuses.some((status) => MIDI_STATUSES.has(status))) continue;
    const name = effect.name.trim();
    if (
      effect.statuses.some((status) => hiddenSet.has(status.toLowerCase())) ||
      hiddenSet.has(name.toLowerCase()) ||
      hiddenSet.has(baseName(name).toLowerCase())
    ) {
      continue;
    }
    const key = `${name}\n${effect.img}`;
    const existing = merged.get(key);
    if (existing) {
      existing.stacks = Math.max(existing.stacks, effect.stacks);
      continue;
    }
    merged.set(key, {
      id: effect.id,
      name,
      img: effect.img,
      stacks: effect.stacks,
      tooltip: tooltipOf(name, effect.duration, effect.description, parts),
    });
  }
  const all = [
    ...merged.values(),
    ...custom.map((status) => ({
      id: `custom-${status.id}`,
      name: status.name,
      img: status.img,
      stacks: 0,
      tooltip: tooltipOf(status.name, "", status.description, parts),
    })),
  ];
  return { statuses: all.slice(0, limit), overflow: Math.max(0, all.length - limit) };
}
