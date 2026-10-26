import { isDocumentId, isRecord, migrate, type ReadResult } from "./schema";

/** A boss's music (spec §8): one track, or a whole playlist played in its own mode. */
export type MusicSource =
  { type: "sound"; playlistId: string; soundId: string } | { type: "playlist"; playlistId: string };

export const MUSIC_LIMITS = { priorityMax: 100, fadeMax: 10_000, fadeDefault: 2000 } as const;

export function readMusicSource(raw: unknown): MusicSource | null {
  if (!isRecord(raw) || !isDocumentId(raw.playlistId)) return null;
  if (raw.type === "playlist") return { type: "playlist", playlistId: raw.playlistId };
  return raw.type === "sound" && isDocumentId(raw.soundId)
    ? { type: "sound", playlistId: raw.playlistId, soundId: raw.soundId }
    : null;
}

export const sameSource = (a: MusicSource | null, b: MusicSource | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.type === b.type &&
    a.playlistId === b.playlistId &&
    (a.type === "playlist" || (b.type === "sound" && a.soundId === b.soundId)));

/** A shown boss of the active scene that has music right now. */
export interface MusicCandidate {
  instanceId: string;
  order: number;
  size: number;
  priority: number;
  /** Transition length, ms. */
  fade: number;
  source: MusicSource;
}

/** The leading boss's music: highest priority, then the larger bar, then the one shown first (spec §8). */
export function leadMusic(candidates: readonly MusicCandidate[]): MusicCandidate | null {
  return (
    [...candidates].sort((a, b) => b.priority - a.priority || b.size - a.size || a.order - b.order)[0] ?? null
  );
}

export interface TrackRef {
  playlistId: string;
  soundId: string;
}

/**
 * What the module changed in the world's music, kept in a hidden world setting so a reload finishes the job:
 * tracks it stopped (with the place to resume from), tracks it started, the source playing, and the original
 * `fade` of every track it changed for a transition.
 */
export interface MusicSnapshot {
  dataVersion: number;
  source: MusicSource | null;
  /** The transition length of the source playing, for its fade-out at the end. */
  fade: number;
  started: TrackRef[];
  paused: (TrackRef & { time: number })[];
  fades: (TrackRef & { fade: number | null })[];
}

export const MUSIC_VERSION = 1;

export const emptySnapshot = (): MusicSnapshot => ({
  dataVersion: MUSIC_VERSION,
  source: null,
  fade: MUSIC_LIMITS.fadeDefault,
  started: [],
  paused: [],
  fades: [],
});

const trackRef = (raw: unknown): TrackRef | null =>
  isRecord(raw) && isDocumentId(raw.playlistId) && isDocumentId(raw.soundId)
    ? { playlistId: raw.playlistId, soundId: raw.soundId }
    : null;

const list = (raw: unknown) => (Array.isArray(raw) ? raw : []);

/** Nothing stored = nothing changed. Bad entries are dropped; newer data is left alone. */
export function readSnapshot(raw: unknown): ReadResult<MusicSnapshot> {
  if (!isRecord(raw) || raw.dataVersion === undefined) return { status: "ok", value: emptySnapshot() };
  const migrated = migrate(raw, MUSIC_VERSION, {});
  if (migrated.status !== "ok") return migrated;
  const value = migrated.value;
  return {
    status: "ok",
    value: {
      dataVersion: MUSIC_VERSION,
      source: readMusicSource(value.source),
      fade:
        typeof value.fade === "number" && value.fade >= 0
          ? Math.min(MUSIC_LIMITS.fadeMax, value.fade)
          : MUSIC_LIMITS.fadeDefault,
      started: list(value.started).flatMap((each) => trackRef(each) ?? []),
      paused: list(value.paused).flatMap((each) => {
        const ref = trackRef(each);
        const time = isRecord(each) && typeof each.time === "number" && each.time >= 0 ? each.time : 0;
        return ref ? [{ ...ref, time }] : [];
      }),
      fades: list(value.fades).flatMap((each) => {
        const ref = trackRef(each);
        const fade = isRecord(each) && typeof each.fade === "number" && each.fade >= 0 ? each.fade : null;
        return ref ? [{ ...ref, fade }] : [];
      }),
    },
  };
}

/** Whether the module is in charge of the music: something of its own plays or waits to resume. */
export const musicActive = (snapshot: MusicSnapshot) =>
  snapshot.source !== null || snapshot.started.length > 0 || snapshot.paused.length > 0;

/** Records a track's original `fade` once: a second transition must not save its own temporary value. */
export function rememberFade(snapshot: MusicSnapshot, track: TrackRef, fade: number | null): MusicSnapshot {
  const known = snapshot.fades.some(
    (each) => each.playlistId === track.playlistId && each.soundId === track.soundId,
  );
  return known ? snapshot : { ...snapshot, fades: [...snapshot.fades, { ...track, fade }] };
}
