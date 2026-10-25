import { aggregate, type TokenState } from "./aggregate";
import { hpFraction, type HpData } from "./hp";
import type { Instance } from "./instances";
import { numberLabels } from "./labels";
import type { Profile } from "./profile";
import { rankOf, type Rank } from "./ranks";

/** One shown instance with everything the store read for it. */
export interface SubjectInput {
  instance: Instance;
  profile: Profile;
  /** Fallback label: the token's name (one per token) or the actor's name (one per actor). */
  name: string;
  actorImg: string;
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

/**
 * Bars and cards for one viewer: hidden tokens left out for players, equal names numbered the same way for
 * everyone, elites sorted by rank then show order and cut at `eliteLimit`.
 */
export function buildViews(
  subjects: SubjectInput[],
  ranks: Rank[],
  viewer: Viewer,
  eliteLimit: number,
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
    const common: CommonView = {
      id: instance.id,
      label: labels.get(instance.id) ?? baseLabel(subject),
      portrait: { src, video: isVideoPath(src) },
      fraction: total.hp ? hpFraction(total.hp) : null,
      defeated: total.defeated,
      muted: total.hidden,
      ...(profile.displayMode === "actor" && instance.actorId ? { count: total.count } : {}),
      ...numbersOf(total.hp, viewer.isGM),
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
    } else {
      const { rank, index } = rankOf(ranks, profile.rank);
      elites.push({
        view: {
          ...common,
          rank: { name: rank.name, color: rank.color, size: rank.size },
          parts: { name: rank.parts.name, fill: rank.parts.fill },
        },
        rank: index,
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
