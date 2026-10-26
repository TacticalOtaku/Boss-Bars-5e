import type { Category } from "./look/schema";
import type { MusicSource } from "./music";
import type { BossProfile, Phase, PhaseEnter } from "./profile";

/** A boss instance's phase (spec §6): the current phase and the highest % HP since it began. */
export interface PhaseState {
  id: string;
  /** 0–100. */
  mark: number;
  /** A form phase whose actor has no token on the scene yet; only the GM sees it. */
  waiting?: boolean;
}

/** What the engine decided: the new state, and the form actor to move onto when a form phase begins. */
export interface PhaseStep {
  state: PhaseState;
  formActorId?: string;
}

/** The current phase's index; a missing or unknown id is the first phase. */
export function phaseIndex(phases: readonly Phase[], state: PhaseState | undefined): number {
  const index = state ? phases.findIndex((phase) => phase.id === state.id) : -1;
  return Math.max(0, index);
}

const formOf = (phase: Phase | undefined) => (phase?.trigger.type === "form" ? phase.trigger.actorId : null);

/**
 * The phase after an HP change, or null when nothing changes (then nothing is written). Thresholds only go
 * forward: threshold T is passed when HP < T and T ≤ the mark, and one hit passing several lands on the last one.
 * At 0 HP a form next in line (after the thresholds of the same hit) begins; any other 0 HP is a defeat and the
 * phase stays. A waiting form and a manual phase next in line stop the automatic steps. Healing above the mark
 * raises it.
 */
export function nextPhase(
  phases: readonly Phase[],
  state: PhaseState | undefined,
  fraction: number | null,
): PhaseStep | null {
  if (!phases.length || fraction === null || state?.waiting) return null;
  const current = phaseIndex(phases, state);
  const hp = fraction * 100;
  const mark = Math.max(state?.mark ?? 100, hp);
  let index = current;
  for (;;) {
    const trigger = phases[index + 1]?.trigger;
    if (trigger?.type !== "hp" || !(hp < trigger.below && trigger.below <= mark)) break;
    index++;
  }
  const form = hp === 0 ? formOf(phases[index + 1]) : null;
  if (form) return { state: { id: phases[index + 1]?.id ?? "", mark: 100 }, formActorId: form };
  if (hp === 0 || index === current) {
    const id = phases[current]?.id ?? "";
    return state?.id === id && state.mark === mark ? null : { state: { id, mark } };
  }
  return { state: { id: phases[index]?.id ?? "", mark: hp } };
}

/** The GM picks a phase: it begins at the current HP (picking is not healing); a form moves the bar. */
export function pickPhase(phases: readonly Phase[], id: string, fraction: number | null): PhaseStep | null {
  const phase = phases.find((each) => each.id === id);
  if (!phase) return null;
  const form = formOf(phase);
  return form
    ? { state: { id, mark: 100 }, formActorId: form }
    : { state: { id, mark: (fraction ?? 1) * 100 } };
}

/** 0 HP is no defeat while a form is next in line or waits for its token (decision 8). */
export function formPending(phases: readonly Phase[], state: PhaseState | undefined): boolean {
  return Boolean(state?.waiting) || formOf(phases[phaseIndex(phases, state) + 1]) !== null;
}

/** The phase everyone is shown: a waiting form stays hidden behind the phase before it (only the GM knows). */
export function shownIndex(phases: readonly Phase[], state: PhaseState | undefined): number {
  const index = phaseIndex(phases, state);
  return state?.waiting ? Math.max(0, index - 1) : index;
}

/** Entry changes add up from the first phase to the given one, in list order (decision 3). */
export function phaseChanges(phases: readonly Phase[], index: number): PhaseEnter {
  const changes: PhaseEnter = {};
  let overrides: Partial<Record<Category, string>> = {};
  for (const phase of phases.slice(0, index + 1)) {
    const { overrides: own, ...rest } = phase.enter;
    Object.assign(changes, rest);
    if (own) overrides = { ...overrides, ...own };
  }
  return Object.keys(overrides).length ? { ...changes, overrides } : changes;
}

/** The boss's music now: the last phase music up to the shown phase, else the profile's (decision 6 of stage 8). */
export function musicOf(profile: BossProfile, state: PhaseState | undefined): MusicSource | null {
  return phaseChanges(profile.phases, shownIndex(profile.phases, state)).music ?? profile.music;
}

/** Phases of the HP pool around the index: from the start or a form to the next form. */
function poolOf(phases: readonly Phase[], index: number): readonly Phase[] {
  let start = index;
  while (start > 0 && phases[start]?.trigger.type !== "form") start--;
  let end = index + 1;
  while (end < phases.length && phases[end]?.trigger.type !== "form") end++;
  return phases.slice(start, end);
}

const threshold = (phase: Phase | undefined) => (phase?.trigger.type === "hp" ? phase.trigger.below : null);

/** Threshold ticks of the current HP pool, as shares of the bar (the "segments" fill). */
export function phaseTicks(phases: readonly Phase[], index: number): number[] {
  return poolOf(phases, index).flatMap((phase) => {
    const below = threshold(phase);
    return below === null ? [] : [below / 100];
  });
}

/** The "refill" fill: HP between the current phase's threshold (or the top) and the next one (or 0). */
export function refillFraction(phases: readonly Phase[], index: number, fraction: number): number {
  const pool = poolOf(phases, index);
  const at = pool.indexOf(phases[index] as Phase);
  let top = 100;
  for (let i = at; i >= 0; i--) {
    const below = threshold(pool[i]);
    if (below !== null) {
      top = below;
      break;
    }
  }
  const bottom = threshold(phases[index + 1]) ?? 0;
  if (top <= bottom) return fraction > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, (fraction * 100 - bottom) / (top - bottom)));
}

/** "II", "III"…: the default phase label's number. */
export function romanNumeral(value: number): string {
  const numerals: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rest = value;
  let result = "";
  for (const [size, numeral] of numerals) {
    while (rest >= size) {
      result += numeral;
      rest -= size;
    }
  }
  return result;
}

/** A boss profile with phases: what the HUD and the GM's engine need. */
export const hasPhases = (profile: { kind: string; phases?: Phase[] }): profile is BossProfile =>
  profile.kind === "boss" && Boolean(profile.phases?.length);
