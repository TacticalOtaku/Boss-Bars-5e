import { effectStrength } from "./effects";

export type VfxKind = "damage" | "heal" | "phase" | "defeat" | "appear";

/** What happened to a bar, stamped with the time it happened (ms); the renderer turns it into a running effect. */
export interface VfxEvent {
  kind: VfxKind;
  at: number;
  /** Share of the bar lost or gained; 0 for the others. */
  share: number;
  /** Where on the bar (0–1): the fill's edge after the change. */
  x: number;
  /** Past the look's big-hit threshold: shards and a crack, played longer. */
  big?: boolean;
  /** The look's "scale by damage": false plays every hit and heal at full strength. */
  scale?: boolean;
}

/** One running effect: `t` is its progress 0–1, `strength` 0–1. */
export interface VfxState {
  kind: VfxKind;
  t: number;
  strength: number;
  x: number;
  /** The share of the bar the change took or gave. */
  share: number;
  big: boolean;
  /** False with reduced motion: light and colour only, no shake, sweep or particles. */
  motion: boolean;
}

/** Effect slots of the bar shader: a longer series keeps its newest hits. */
export const VFX_SLOTS = 8;

/** Lengths in ms; a big hit has its own. */
const DURATION: Record<VfxKind | "bigDamage", number> = {
  damage: 700,
  bigDamage: 1100,
  heal: 900,
  phase: 1600,
  defeat: 2000,
  appear: 1200,
};

/** HP changes scale with their share (a third of the bar is full strength) unless the look says not to. */
const strengthOf = (event: VfxEvent) =>
  event.kind === "damage" || event.kind === "heal" ? effectStrength(event.share, event.scale ?? true) : 1;

/** The effects running at `now`, oldest first; finished ones are left out. */
export function vfxAt(events: readonly VfxEvent[], now: number, options: { reduced: boolean }): VfxState[] {
  const running = [...events]
    .sort((a, b) => a.at - b.at)
    .flatMap((event) => {
      const big = event.kind === "damage" && Boolean(event.big);
      const t = (now - event.at) / DURATION[big ? "bigDamage" : event.kind];
      if (t < 0 || t >= 1) return [];
      const motion = !options.reduced;
      return [
        {
          kind: event.kind,
          t,
          strength: strengthOf(event),
          x: event.x,
          share: event.share,
          big: big && motion,
          motion,
        },
      ];
    });
  return running.slice(-VFX_SLOTS);
}

/**
 * Milliseconds between frames (decision 4): 60 fps while an effect runs or a fill catches up, 30 for idle boss
 * bars (their fills keep moving), 15 when only cards are shown; reduced motion: null — draw only on a change.
 */
export function vfxFrameInterval(state: { busy: boolean; bosses: boolean; reduced: boolean }): number | null {
  if (state.reduced) return null;
  if (state.busy) return 1000 / 60;
  return state.bosses ? 1000 / 30 : 1000 / 15;
}
