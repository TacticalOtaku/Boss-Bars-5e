import { shownIndex } from "./phases";
import type { ProfileKind } from "./profile";
import { phaseViewOf, type HudViews, type PhaseView, type SubjectInput } from "./view";

/** One bar or card as `api.getActive` returns it: what this client's HUD shows (spec §13). */
export interface ActiveEntry {
  id: string;
  sceneId: string;
  kind: ProfileKind;
  tokenId: string | null;
  actorId: string | null;
  label: string;
  fraction: number | null;
  defeated: boolean;
  /** Bosses: the phase shown (the GM also gets its id and whether a form waits) and the quote on screen. */
  phase?: { label: string; id?: string; waiting?: boolean } | null;
  quote?: string | null;
  /** GM only from here on. */
  hp?: { value: number; max: number; temp: number };
  phases?: { id: string; label: string }[];
  quotes?: { id: string; trigger: string }[];
  counters?: { id: string; label: string; value: number; max: number }[];
  statuses?: { id: string; label: string; active: boolean }[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const each of Object.values(value)) deepFreeze(each);
    Object.freeze(value);
  }
  return value;
}

/**
 * Entries from the views this client built (all cards, no "+N" limit) and the subjects behind them: a player gets
 * only what the views carry, never HP numbers, the list of phases or a waiting form. `phaseLabel` turns a numeral
 * into "Phase II".
 */
export function activeEntries(
  subjects: readonly SubjectInput[],
  views: HudViews,
  sceneId: string,
  isGM: boolean,
  now: number,
  phaseLabel: (numeral: string) => string,
): ActiveEntry[] {
  const byId = new Map(subjects.map((subject) => [subject.instance.id, subject]));
  const label = (phase: PhaseView | null) =>
    phase ? phase.label || (phase.numeral ? phaseLabel(phase.numeral) : "") : "";
  return [...views.bosses, ...views.elites]
    .flatMap((view): ActiveEntry[] => {
      const subject = byId.get(view.id);
      if (!subject) return [];
      const { instance, profile } = subject;
      const entry: ActiveEntry = {
        id: instance.id,
        sceneId,
        kind: profile.kind,
        tokenId: instance.tokenId ?? null,
        actorId: instance.actorId ?? null,
        label: view.label,
        fraction: view.fraction,
        defeated: view.defeated,
      };
      if ("phase" in view) {
        entry.phase = view.phase ? { label: label(view.phase) } : null;
        entry.quote = view.quote && view.quote.until > now ? view.quote.text : null;
      }
      if (!isGM) return [entry];
      if (view.numbers) entry.hp = { ...view.numbers };
      entry.counters = profile.miniBars.flatMap((bar) =>
        bar.source.type === "counter"
          ? [
              {
                id: bar.id,
                label: bar.label,
                value: Math.min(bar.source.max, instance.counters?.[bar.id] ?? bar.source.max),
                max: bar.source.max,
              },
            ]
          : [],
      );
      if (profile.kind === "boss") {
        const { phases } = profile;
        if (entry.phase && phases.length) {
          entry.phase.id = phases[shownIndex(phases, instance.phase)]?.id ?? "";
          entry.phase.waiting = Boolean(instance.phase?.waiting);
        }
        entry.phases = phases.map((phase, index) => ({
          id: phase.id,
          label: label(phaseViewOf(phases, index)),
        }));
        entry.quotes = profile.quotes.map((quote) => ({ id: quote.id, trigger: quote.trigger.type }));
        entry.statuses = profile.statuses.custom.map((status) => ({
          id: status.id,
          label: status.name,
          active: Boolean(instance.customStatuses?.includes(status.id)),
        }));
      }
      return [entry];
    })
    .map(deepFreeze);
}
