import { describe, expect, it } from "vitest";
import {
  emptySnapshot,
  leadMusic,
  musicActive,
  readMusicSource,
  readSnapshot,
  rememberFade,
  sameSource,
  resolveMusic,
  suggestMusic,
  type MusicCandidate,
} from "../../src/core/music";
import { musicOf } from "../../src/core/phases";
import { readProfile, type BossProfile } from "../../src/core/profile";

const P = "Playlist00000001";
const S1 = "Sound00000000001";
const S2 = "Sound00000000002";
const track = (soundId: string) => ({ type: "sound" as const, playlistId: P, soundId });

describe("music sources", () => {
  it("reads a track or a whole playlist and compares them", () => {
    expect(readMusicSource({ type: "sound", playlistId: P, soundId: S1 })).toEqual(track(S1));
    expect(readMusicSource({ type: "playlist", playlistId: P, soundId: "x" })).toEqual({
      type: "playlist",
      playlistId: P,
    });
    expect(readMusicSource({ type: "sound", playlistId: P })).toBeNull();
    expect(readMusicSource("x")).toBeNull();
    expect(sameSource(track(S1), track(S1))).toBe(true);
    expect(sameSource(track(S1), track(S2))).toBe(false);
    expect(sameSource({ type: "playlist", playlistId: P }, track(S1))).toBe(false);
    expect(sameSource(null, null)).toBe(true);
  });
});

describe("leadMusic", () => {
  const candidate = (instanceId: string, extra: Partial<MusicCandidate>): MusicCandidate => ({
    instanceId,
    order: 1,
    size: 100,
    priority: 0,
    fade: 2000,
    source: track(S1),
    ...extra,
  });

  it("picks the highest priority, then the larger bar, then the one shown first", () => {
    expect(leadMusic([candidate("a", { priority: 1 }), candidate("b", { priority: 5 })])?.instanceId).toBe(
      "b",
    );
    expect(leadMusic([candidate("a", { size: 80 }), candidate("b", { size: 120 })])?.instanceId).toBe("b");
    expect(leadMusic([candidate("a", { order: 3 }), candidate("b", { order: 2 })])?.instanceId).toBe("b");
    expect(leadMusic([])).toBeNull();
  });
});

describe("musicOf", () => {
  const base = readProfile({ dataVersion: 2, kind: "boss", music: track(S1), phases: [{ id: "p1" }] });
  const boss = (base.status === "ok" ? base.value : null) as BossProfile;
  const phased: BossProfile = {
    ...boss,
    phases: [
      { id: "p1", label: "", trigger: { type: "start" }, enter: {} },
      { id: "p2", label: "", trigger: { type: "hp", below: 50 }, enter: { music: track(S2) } },
      { id: "p3", label: "", trigger: { type: "manual" }, enter: {} },
      { id: "p4", label: "", trigger: { type: "form", actorId: "FormActor0000001" }, enter: {} },
    ],
  };

  it("plays the profile's music until a phase brings its own, which then stays", () => {
    expect(musicOf(phased, undefined)).toEqual(track(S1));
    expect(musicOf(phased, { id: "p2", mark: 40 })).toEqual(track(S2));
    expect(musicOf(phased, { id: "p3", mark: 40 })).toEqual(track(S2));
  });

  it("reads music, priority and transition from the profile, clamped", () => {
    const read = readProfile({ dataVersion: 2, kind: "boss", musicPriority: 250, musicFade: -5 });
    expect(read.status === "ok" && read.value).toMatchObject({
      music: null,
      musicPriority: 100,
      musicFade: 0,
    });
  });
});

describe("music snapshot", () => {
  it("reads nothing stored as empty, drops bad entries and refuses newer data", () => {
    expect(readSnapshot(undefined)).toEqual({ status: "ok", value: emptySnapshot() });
    const read = readSnapshot({
      dataVersion: 1,
      source: track(S1),
      started: [{ playlistId: P, soundId: S1 }, { playlistId: "x" }],
      paused: [
        { playlistId: P, soundId: S2, time: 12.5 },
        { playlistId: P, soundId: S2, time: -1 },
      ],
      fades: [
        { playlistId: P, soundId: S2, fade: 800 },
        { playlistId: P, soundId: S1 },
      ],
    });
    expect(read.status === "ok" && read.value).toEqual({
      dataVersion: 1,
      source: track(S1),
      fade: 2000,
      started: [{ playlistId: P, soundId: S1 }],
      paused: [
        { playlistId: P, soundId: S2, time: 12.5 },
        { playlistId: P, soundId: S2, time: 0 },
      ],
      fades: [
        { playlistId: P, soundId: S2, fade: 800 },
        { playlistId: P, soundId: S1, fade: null },
      ],
    });
    expect(readSnapshot({ dataVersion: 2 }).status).toBe("newer");
  });

  it("keeps the first original fade of a track and knows when the module is in charge", () => {
    const once = rememberFade(emptySnapshot(), { playlistId: P, soundId: S1 }, 500);
    expect(rememberFade(once, { playlistId: P, soundId: S1 }, 2000).fades).toEqual([
      { playlistId: P, soundId: S1, fade: 500 },
    ]);
    expect(musicActive(once)).toBe(false);
    expect(musicActive({ ...once, paused: [{ playlistId: P, soundId: S2, time: 0 }] })).toBe(true);
  });
});

describe("suggestMusic", () => {
  const option = (value: string, label: string, selected = false) => ({ value, label, selected });
  const battle = {
    name: "Battle",
    options: [
      option("playlist:P1", "Whole playlist"),
      option("sound:P1:S1", "Drums of War"),
      option("sound:P1:S2", "Ледяной трон", true),
    ],
  };
  const tavern = {
    name: "Таверна",
    options: [option("playlist:P2", "Whole playlist"), option("sound:P2:S3", "Lute")],
  };

  it("suggests nothing until something is typed", () => {
    expect(suggestMusic([battle, tavern], "  ")).toEqual([]);
  });

  it("suggests a whole playlist and all its tracks when its name matches, in any case", () => {
    expect(suggestMusic([battle, tavern], "таВЕР")).toEqual([
      { value: "playlist:P2", label: "Таверна — Whole playlist" },
      { value: "sound:P2:S3", label: "Таверна — Lute" },
    ]);
  });

  it("suggests only the matching tracks of other playlists, picked or not", () => {
    expect(suggestMusic([battle, tavern], "лед")).toEqual([
      { value: "sound:P1:S2", label: "Battle — Ледяной трон" },
    ]);
    expect(suggestMusic([battle, tavern], "lute")).toEqual([
      { value: "sound:P2:S3", label: "Таверна — Lute" },
    ]);
  });
});

describe("music in another world", () => {
  const P = "Playlist00000001";
  const S = "Sound00000000001";
  const local = [{ id: P, name: "Битва", sounds: [{ id: S, name: "Барабаны" }] }];
  // The same playlist after World Gate or a manual rebuild: same names, new ids.
  const moved = [
    { id: "Playlist0000000N", name: "Таверна", sounds: [] },
    { id: "Playlist0000000M", name: "Битва", sounds: [{ id: "Sound0000000000M", name: "Барабаны" }] },
  ];

  it("keeps the names of the playlist and the track in the profile", () => {
    const named = { type: "sound", playlistId: P, soundId: S, playlistName: "Битва", soundName: "Барабаны" };
    expect(readMusicSource(named)).toEqual(named);
  });

  it("finds the music by id and remembers its current names", () => {
    expect(resolveMusic({ type: "sound", playlistId: P, soundId: S }, local)).toEqual({
      type: "sound",
      playlistId: P,
      soundId: S,
      playlistName: "Битва",
      soundName: "Барабаны",
    });
  });

  it("finds it again by its names where the ids are new", () => {
    const saved = {
      type: "sound",
      playlistId: P,
      soundId: S,
      playlistName: "Битва",
      soundName: "Барабаны",
    } as const;
    expect(resolveMusic(saved, moved)).toEqual({
      ...saved,
      playlistId: "Playlist0000000M",
      soundId: "Sound0000000000M",
    });
    expect(resolveMusic({ type: "playlist", playlistId: P, playlistName: "Таверна" }, moved)).toEqual({
      type: "playlist",
      playlistId: "Playlist0000000N",
      playlistName: "Таверна",
    });
  });

  it("finds nothing when neither the ids nor the names are in the world", () => {
    expect(resolveMusic({ type: "sound", playlistId: P, soundId: S }, moved)).toBeNull();
    expect(
      resolveMusic({ type: "sound", playlistId: P, soundId: S, playlistName: "Битва" }, moved),
    ).toBeNull();
  });
});
