import { describe, expect, it } from "vitest";
import {
  emptySnapshot,
  leadMusic,
  musicActive,
  readMusicSource,
  readSnapshot,
  rememberFade,
  sameSource,
  searchMusic,
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

describe("searchMusic", () => {
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

  it("lists everything while the search is empty", () => {
    expect(searchMusic([battle, tavern], "  ")).toEqual([battle, tavern]);
  });

  it("keeps a whole playlist whose name matches, in any case", () => {
    expect(searchMusic([battle, tavern], "таВЕР")).toEqual([
      { ...battle, options: [battle.options[2]] },
      tavern,
    ]);
  });

  it("keeps only the matching tracks of the other playlists, and always the picked one", () => {
    expect(searchMusic([battle, tavern], "drum")).toEqual(
      [battle].map((group) => ({
        ...group,
        options: [group.options[1], group.options[2]],
      })),
    );
    expect(searchMusic([battle, tavern], "lute")).toEqual([
      { ...battle, options: [battle.options[2]] },
      { ...tavern, options: [tavern.options[1]] },
    ]);
  });
});
