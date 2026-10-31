import { aggregate, type Aggregate, type TokenState } from "./aggregate";
import { hpFraction, type HpData } from "./hp";
import type { Instance } from "./instances";
import { numberLabels } from "./labels";
import { CLASSIC_RESOLVED } from "./look/builtin";
import type { ResolvedLook } from "./look/resolve";
import { lookStyle, type LookStyle } from "./look/style";
import { buildMiniBars, type MiniBarView } from "./minibars";
import { formPending, phaseChanges, phaseTicks, refillFraction, romanNumeral, shownIndex } from "./phases";
import type { Phase, PhaseEnter, PortraitFocus, Profile } from "./profile";
import { rankOf, type Rank } from "./ranks";
import { buildStatuses, type StatusView } from "./statuses";

/** One shown instance with everything the store read for it. */
export interface SubjectInput {
  instance: Instance;
  profile: Profile;
  /** Fallback label: the token's name (one per token) or the actor's name (one per actor). */
  name: string;
  actorImg: string;
  /** The boss profile's or the elite rank's look; missing — "Classic RPG". */
  look?: ResolvedLook;
  /** The bound token, or all the actor's tokens on the scene. */
  tokens: TokenState[];
}

/** Key of the whole elite column in the per-scene collapsed set. */
export const ELITE_COLUMN_ID = "elites";

export interface Viewer {
  isGM: boolean;
  collapsed: ReadonlySet<string>;
  /** Players may collapse boss bars / the elite column (layout blocks). */
  mayCollapse: boolean;
  mayCollapseElites: boolean;
}

interface CommonView {
  id: string;
  label: string;
  /** No focus — centred at full size. */
  portrait: { src: string; video: boolean; focus?: PortraitFocus };
  fraction: number | null;
  defeated: boolean;
  muted: boolean;
  /** ×N, only in the one-per-actor mode. */
  count?: number;
  /** GM only: a player's view never carries HP numbers. */
  numbers?: { value: number; max: number; temp: number };
  /** Temp HP shield after the fill: temp / effectiveMax, 0 when there is none or the fill preset turns it off. */
  shield: number;
  look: LookStyle;
  statuses: StatusView[];
  /** Status icons beyond the limit ("+N"). */
  statusOverflow: number;
  miniBars: MiniBarView[];
}

/** One style per resolved look object: subjects sharing a look share the style (and its key). */
const styles = new WeakMap<ResolvedLook, LookStyle>();
function styleOf(look: ResolvedLook): LookStyle {
  let style = styles.get(look);
  if (!style) {
    style = lookStyle(look);
    styles.set(look, style);
  }
  return style;
}

/** The phase everyone sees; the list of phases and a waiting form stay with the GM. */
export interface PhaseView {
  /** Changes when the phase changes: the renderer plays the phase effect on it. */
  key: string;
  label: string;
  /** "II", "III"… for the default label; null when the phase has its own label or is the first one. */
  numeral: string | null;
}

export interface BossBarView extends CommonView {
  title: string;
  /** The quote on screen: shown while `until` (ms, synchronized server time) is ahead. */
  quote: { key: string; text: string; until: number } | null;
  phase: PhaseView | null;
  /** Threshold ticks as shares of the bar ("segments" fill); empty for players when the profile hides them. */
  ticks: number[];
  size: number;
  collapsed: boolean;
  canCollapse: boolean;
}

export interface EliteCardView extends CommonView {
  rank: { name: string; color: string; size: number };
  parts: { name: boolean; fill: boolean };
}

export interface HudViews {
  bosses: BossBarView[];
  elites: EliteCardView[];
  /** Cards beyond the visible limit ("+N"). */
  eliteOverflow: number;
  /** The player-side state of the elite column; total counts every card, shown or beyond the limit. */
  column: { canCollapse: boolean; collapsed: boolean; total: number };
}

const VIDEO = /\.(webm|mp4|m4v|ogv)(\?|#|$)/i;
export const isVideoPath = (src: string) => VIDEO.test(src);

const numbersOf = (hp: HpData | null, isGM: boolean) =>
  isGM && hp && hpFraction(hp) !== null
    ? { numbers: { value: hp.value, max: hp.effectiveMax, temp: hp.temp } }
    : {};

const phasesOf = (subject: SubjectInput): readonly Phase[] =>
  subject.profile.kind === "boss" ? subject.profile.phases : [];

/** What the phases up to the shown one changed (name, title, portrait, look categories). */
export function phaseEnterOf(subject: SubjectInput): PhaseEnter {
  const phases = phasesOf(subject);
  return phases.length ? phaseChanges(phases, shownIndex(phases, subject.instance.phase)) : {};
}

/**
 * Defeat as the bar, the hooks, auto-hide, quotes and music all read it: every counted token is down (0 HP, the
 * defeated status or the tracker) and no form is next in line or waiting (decision 8).
 */
export const defeatedOf = (subject: SubjectInput, total: Aggregate | null) =>
  Boolean(total?.defeated) && !formPending(phasesOf(subject), subject.instance.phase);

/** The phase label everyone sees: its own label, or "Phase II" by number from the second phase on. */
export function phaseViewOf(phases: readonly Phase[], index: number): PhaseView | null {
  const phase = phases[index];
  if (!phase) return null;
  return {
    key: phase.id,
    label: phase.label,
    numeral: phase.label || index === 0 ? null : romanNumeral(index + 1),
  };
}

const shieldOf = (hp: HpData | null) =>
  hp && hp.temp > 0 && hp.effectiveMax > 0 ? Math.min(1, hp.temp / hp.effectiveMax) : 0;

/**
 * Bars and cards for one viewer: hidden tokens left out for players, equal names numbered the same way for
 * everyone, elites sorted by rank then show order and cut at `eliteLimit`. `peaks` keeps temp HP peaks of
 * mini-bars between calls.
 */
const baseLabel = (subject: SubjectInput) =>
  phaseEnterOf(subject).playerName || subject.profile.playerName || subject.name;

/** Bar and card labels, equal names numbered the same way for everyone (also `{name}` in quotes). */
export function playerLabels(subjects: SubjectInput[]): Map<string, string> {
  return numberLabels(
    subjects.map((subject) => ({
      id: subject.instance.id,
      label: baseLabel(subject),
      hidden: subject.tokens.every((token) => token.hidden),
      order: subject.instance.order,
    })),
  );
}

export function buildViews(
  subjects: SubjectInput[],
  ranks: Rank[],
  viewer: Viewer,
  eliteLimit: number,
  peaks = new Map<string, number>(),
): HudViews {
  const labels = playerLabels(subjects);
  const bosses: BossBarView[] = [];
  const elites: { view: EliteCardView; rank: number; order: number }[] = [];
  for (const subject of [...subjects].sort((a, b) => a.instance.order - b.instance.order)) {
    const total = aggregate(subject.tokens, viewer.isGM);
    if (!total) continue;
    const { instance, profile } = subject;
    const enter = phaseEnterOf(subject);
    const src = enter.portrait || (profile.portrait ?? subject.actorImg);
    const isBoss = profile.kind === "boss";
    const phases = phasesOf(subject);
    const phaseAt = shownIndex(phases, instance.phase);
    const fraction = total.hp ? hpFraction(total.hp) : null;
    const look = styleOf(subject.look ?? CLASSIC_RESOLVED);
    const statusLimit = isBoss ? look.statuses.max : look.statuses.maxCard;
    const rank = isBoss ? null : rankOf(ranks, profile.rank);
    const custom = isBoss
      ? profile.statuses.custom.filter((status) => instance.customStatuses?.includes(status.id))
      : [];
    const { statuses, overflow } =
      (isBoss || rank?.rank.parts.statuses) && statusLimit > 0
        ? buildStatuses(
            total.tokens.map((token) => token.effects ?? []),
            profile.statuses.hidden,
            custom,
            statusLimit,
            look.statuses.tip,
          )
        : { statuses: [], overflow: 0 };
    const miniBars =
      isBoss || rank?.rank.parts.fill
        ? buildMiniBars(profile.miniBars, total.tokens, instance.counters, viewer.isGM, peaks, instance.id)
        : [];
    const common: CommonView = {
      id: instance.id,
      label: labels.get(instance.id) ?? baseLabel(subject),
      portrait: {
        src,
        video: isVideoPath(src),
        ...(profile.portraitFocus ? { focus: profile.portraitFocus } : {}),
      },
      fraction:
        fraction !== null && profile.kind === "boss" && profile.fillMode === "refill" && phases.length
          ? refillFraction(phases, phaseAt, fraction)
          : fraction,
      defeated: defeatedOf(subject, total),
      muted: total.hidden,
      ...(profile.displayMode === "actor" && instance.actorId ? { count: total.count } : {}),
      ...numbersOf(total.hp, viewer.isGM),
      shield: look.shield ? shieldOf(total.hp) : 0,
      look,
      statuses,
      statusOverflow: overflow,
      miniBars,
    };
    if (profile.kind === "boss") {
      const canCollapse = !viewer.isGM && viewer.mayCollapse;
      const ticks = profile.fillMode === "segments" && (viewer.isGM || profile.playerTicks);
      bosses.push({
        ...common,
        title: enter.title || profile.title,
        quote: instance.quote
          ? {
              key: instance.quote.key,
              text: instance.quote.text,
              until: instance.quote.at + instance.quote.duration * 1000,
            }
          : null,
        phase: phaseViewOf(phases, phaseAt),
        ticks: ticks ? phaseTicks(phases, phaseAt) : [],
        size: profile.size,
        collapsed: canCollapse && viewer.collapsed.has(instance.id),
        canCollapse,
      });
    } else if (rank) {
      const { parts } = rank.rank;
      elites.push({
        view: {
          ...common,
          rank: { name: rank.rank.name, color: rank.rank.color, size: rank.rank.size },
          parts: { name: parts.name, fill: parts.fill },
        },
        rank: rank.index,
        order: instance.order,
      });
    }
  }
  elites.sort((a, b) => a.rank - b.rank || a.order - b.order);
  const canCollapse = !viewer.isGM && viewer.mayCollapseElites;
  return {
    bosses,
    elites: elites.slice(0, eliteLimit).map((entry) => entry.view),
    eliteOverflow: Math.max(0, elites.length - eliteLimit),
    column: {
      canCollapse,
      collapsed: canCollapse && viewer.collapsed.has(ELITE_COLUMN_ID),
      total: elites.length,
    },
  };
}
