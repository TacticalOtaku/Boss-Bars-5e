import { aggregate, type TokenState } from "./aggregate";
import { hpFraction, type HpData } from "./hp";
import type { Instance } from "./instances";
import { numberLabels } from "./labels";
import { CLASSIC_RESOLVED } from "./look/builtin";
import type { ResolvedLook } from "./look/resolve";
import { lookStyle, type LookStyle } from "./look/style";
import { buildMiniBars, type MiniBarView } from "./minibars";
import type { Profile } from "./profile";
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
  portrait: { src: string; video: boolean };
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

export interface BossBarView extends CommonView {
  title: string;
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

const shieldOf = (hp: HpData | null) =>
  hp && hp.temp > 0 && hp.effectiveMax > 0 ? Math.min(1, hp.temp / hp.effectiveMax) : 0;

/**
 * Bars and cards for one viewer: hidden tokens left out for players, equal names numbered the same way for
 * everyone, elites sorted by rank then show order and cut at `eliteLimit`. `peaks` keeps temp HP peaks of
 * mini-bars between calls.
 */
export function buildViews(
  subjects: SubjectInput[],
  ranks: Rank[],
  viewer: Viewer,
  eliteLimit: number,
  peaks = new Map<string, number>(),
): HudViews {
  const baseLabel = (subject: SubjectInput) => subject.profile.playerName || subject.name;
  const labels = numberLabels(
    subjects.map((subject) => ({
      id: subject.instance.id,
      label: baseLabel(subject),
      hidden: subject.tokens.every((token) => token.hidden),
      order: subject.instance.order,
    })),
  );
  const bosses: BossBarView[] = [];
  const elites: { view: EliteCardView; rank: number; order: number }[] = [];
  for (const subject of [...subjects].sort((a, b) => a.instance.order - b.instance.order)) {
    const total = aggregate(subject.tokens, viewer.isGM);
    if (!total) continue;
    const { instance, profile } = subject;
    const src = profile.portrait ?? subject.actorImg;
    const isBoss = profile.kind === "boss";
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
      portrait: { src, video: isVideoPath(src) },
      fraction: total.hp ? hpFraction(total.hp) : null,
      defeated: total.defeated,
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
      bosses.push({
        ...common,
        title: profile.title,
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
