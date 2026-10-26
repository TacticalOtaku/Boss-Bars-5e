import { MODULE_ID } from "../constants";
import { aggregate } from "../core/aggregate";
import { readInstances } from "../core/instances";
import {
  leadMusic,
  musicActive,
  readSnapshot,
  rememberFade,
  sameSource,
  emptySnapshot,
  type MusicCandidate,
  type MusicSnapshot,
  type MusicSource,
  type TrackRef,
} from "../core/music";
import { formPending, musicOf } from "../core/phases";
import { logger } from "../logger";
import { subjectOf, type BossHud } from "./store";

/** Foundry 14 PLAYLIST_MODES (common/constants.mjs). */
const MODES = { DISABLED: -1, SIMULTANEOUS: 2 } as const;

const refOf = (sound: PlaylistSoundDocument): TrackRef => ({
  playlistId: sound.parent.id,
  soundId: sound.id,
});
const soundOf = (ref: TrackRef) => game.playlists.get(ref.playlistId)?.sounds.get(ref.soundId);
const inSource = (source: MusicSource | null, sound: PlaylistSoundDocument) =>
  source !== null &&
  sound.parent.id === source.playlistId &&
  (source.type === "playlist" || sound.id === source.soundId);

/**
 * Bosses with music on the scene the players stand on (decision 9): shown, not hidden (decision 4), not defeated
 * (decision 5; a form next in line is no defeat).
 */
function candidates(): MusicCandidate[] {
  const scene = game.scenes.active;
  const read = readInstances(scene?.flags[MODULE_ID]?.instances);
  if (!scene || read.status !== "ok") return [];
  return read.value.items.flatMap((item): MusicCandidate[] => {
    const subject = subjectOf(scene, item);
    if (subject?.profile.kind !== "boss") return [];
    const { profile } = subject;
    const source = musicOf(profile, item.phase);
    const total = aggregate(subject.tokens, true);
    if (!source || !total || total.hidden) return [];
    if (total.defeated && !formPending(profile.phases, item.phase)) return [];
    return [
      {
        instanceId: item.id,
        order: item.order,
        size: profile.size,
        priority: profile.musicPriority,
        fade: profile.musicFade,
        source,
      },
    ];
  });
}

/** The tracks a source starts: the track, or what Playlist#playAll would start in the playlist's mode. */
function soundsToStart(source: MusicSource): PlaylistSoundDocument[] {
  const playlist = game.playlists.get(source.playlistId);
  if (!playlist) return [];
  if (source.type === "sound") {
    const sound = playlist.sounds.get(source.soundId);
    return sound ? [sound] : [];
  }
  if (playlist.mode === MODES.DISABLED) return [];
  if (playlist.mode === MODES.SIMULTANEOUS) return playlist.sounds.contents;
  const first = playlist.sounds.get(playlist.playbackOrder[0] ?? "");
  return first ? [first] : [];
}

type Change = { _id: string; fade?: number | null; playing?: boolean; pausedTime?: number | null };

/** One update per playlist, as Foundry's own Playlist#playSound does; the playlist plays while a track of it does. */
async function updateTracks(changes: Map<PlaylistSoundDocument, Change>): Promise<void> {
  const byPlaylist = new Map<PlaylistDocument, Change[]>();
  for (const [sound, change] of changes) {
    byPlaylist.set(sound.parent, [...(byPlaylist.get(sound.parent) ?? []), change]);
  }
  for (const [playlist, sounds] of byPlaylist) {
    const playing = playlist.sounds.some((sound) => changes.get(sound)?.playing ?? sound.playing);
    await playlist.update({ playing, sounds });
  }
}

const save = (snapshot: MusicSnapshot) => game.settings.set(MODULE_ID, "music", snapshot);

/**
 * Puts the original `fade` back on every track a transition changed (the ticket's trap). It waits for the
 * transition to end: a `fade` change re-syncs the tracks and would cut a running fade short.
 */
async function restoreFades(): Promise<void> {
  const read = readSnapshot(game.settings.get(MODULE_ID, "music"));
  if (read.status !== "ok" || !read.value.fades.length) return;
  const changes = new Map<PlaylistSoundDocument, Change>();
  for (const entry of read.value.fades) {
    const sound = soundOf(entry);
    if (sound && sound.fade !== entry.fade) changes.set(sound, { _id: sound.id, fade: entry.fade });
  }
  await save({ ...read.value, fades: [] });
  await updateTracks(changes);
}

/**
 * Brings the world's music in line with the leading boss (spec §8). Begin: whatever plays fades out and is
 * remembered with its place; the boss's music fades in. Switch: the module's own tracks that still play fade out,
 * the new ones fade in. End: the module's tracks fade out, the remembered ones that still wait resume from their
 * place. A transition fades with a temporary `fade` (the profile's length), originals kept in the snapshot first.
 */
async function sync(schedule: (ms: number) => void): Promise<void> {
  const read = readSnapshot(game.settings.get(MODULE_ID, "music"));
  if (read.status !== "ok") return;
  let snapshot = read.value;
  const lead = leadMusic(candidates());
  if (lead ? sameSource(lead.source, snapshot.source) : !musicActive(snapshot)) return;
  const ms = lead?.fade ?? snapshot.fade;
  const changes = new Map<PlaylistSoundDocument, Change>();
  const fadeOut = (sound: PlaylistSoundDocument) => {
    snapshot = rememberFade(snapshot, refOf(sound), sound.fade);
    changes.set(sound, { _id: sound.id, fade: ms, playing: false, pausedTime: null });
  };
  const fadeIn = (sound: PlaylistSoundDocument, time: number | null) => {
    snapshot = rememberFade(snapshot, refOf(sound), sound.fade);
    changes.set(sound, { _id: sound.id, fade: ms, playing: true, pausedTime: time });
  };
  if (!musicActive(snapshot)) {
    // Begin: everything playing stops with its place remembered (a pause would cut it without fading).
    const paused: MusicSnapshot["paused"] = [];
    for (const playlist of game.playlists.values()) {
      for (const sound of playlist.sounds.values()) {
        if (!sound.playing || inSource(lead?.source ?? null, sound)) continue;
        paused.push({ ...refOf(sound), time: sound.sound?.currentTime ?? sound.pausedTime ?? 0 });
        fadeOut(sound);
      }
    }
    snapshot = { ...snapshot, paused };
  } else {
    // Only the module's own tracks, and only if they still play: the GM may have stopped them.
    for (const ref of snapshot.started) {
      const sound = soundOf(ref);
      if (sound?.playing && !inSource(lead?.source ?? null, sound)) fadeOut(sound);
    }
  }
  if (lead) {
    const start = soundsToStart(lead.source);
    for (const sound of start) if (!sound.playing) fadeIn(sound, null);
    snapshot = { ...snapshot, source: lead.source, fade: lead.fade, started: start.map(refOf) };
  } else {
    // End: what still waits on the module's stop resumes; what the GM started meanwhile is left alone.
    for (const entry of snapshot.paused) {
      const sound = soundOf(entry);
      if (sound && !sound.playing) fadeIn(sound, entry.time || null);
    }
    snapshot = { ...emptySnapshot(), fades: snapshot.fades };
  }
  await save(snapshot);
  await updateTracks(changes);
  schedule(ms);
}

/**
 * Boss music on the active GM: after each recompute (a shown, hidden or defeated boss, a phase, a new active scene)
 * the music follows the leading boss. Steps run one at a time; after a load, fades a crash left are put back first.
 */
export function startMusicWatch(hud: BossHud): void {
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue = (task: () => Promise<void>) => {
    chain = chain.then(task).catch((error: unknown) => logger.error("Music change failed", error));
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => queue(restoreFades), ms + 300);
  };
  if (game.user.isActiveGM) queue(restoreFades);
  hud.subscribe(() => {
    if (game.user.isActiveGM) queue(() => sync(schedule));
  });
}
