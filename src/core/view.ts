import { hpFraction, type HpData } from "./hp";
import type { Instance } from "./instances";
import type { BossProfile } from "./profile";

export interface BossViewInput {
  instance: Instance;
  profile: BossProfile;
  tokenName: string;
  tokenHidden: boolean;
  actorImg: string;
  hp: HpData | null;
  dead: boolean;
  combatantDefeated: boolean;
}

export interface Viewer {
  isGM: boolean;
  collapsed: ReadonlySet<string>;
  mayCollapse: boolean;
}

/** Everything a bar shows. A player's view never carries HP numbers. */
export interface BossBarView {
  id: string;
  label: string;
  title: string;
  portrait: { src: string; video: boolean };
  size: number;
  fraction: number | null;
  defeated: boolean;
  muted: boolean;
  collapsed: boolean;
  canCollapse: boolean;
  numbers?: { value: number; max: number; temp: number };
}

const VIDEO = /\.(webm|mp4|m4v|ogv)(\?|#|$)/i;

/** null — this viewer must not see the bar (a player and a hidden token). */
export function buildBossView(input: BossViewInput, viewer: Viewer): BossBarView | null {
  if (input.tokenHidden && !viewer.isGM) return null;
  const { instance, profile, hp } = input;
  const fraction = hp ? hpFraction(hp) : null;
  const src = profile.portrait ?? input.actorImg;
  const canCollapse = !viewer.isGM && viewer.mayCollapse;
  const view: BossBarView = {
    id: instance.id,
    label: profile.playerName || input.tokenName,
    title: profile.title,
    portrait: { src, video: VIDEO.test(src) },
    size: profile.size,
    fraction,
    defeated: fraction === 0 || input.dead || input.combatantDefeated,
    muted: input.tokenHidden,
    collapsed: canCollapse && viewer.collapsed.has(instance.id),
    canCollapse,
  };
  if (viewer.isGM && hp && fraction !== null)
    view.numbers = { value: hp.value, max: hp.effectiveMax, temp: hp.temp };
  return view;
}
