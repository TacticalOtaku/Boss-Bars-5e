import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMusicWatch } from "../src/foundry/music";

const SCENE = "Scene00000000001";
const TOKEN = "Token00000000001";
const ACTOR = "Actor00000000001";
const INSTANCE = "Inst000000000001";
const TAVERN = "Playlist00000001";
const BATTLE = "Playlist00000002";

/** Map plus the Collection helpers the code uses. */
function collection<T>(entries: [string, T][]) {
  const map = new Map(entries);
  return Object.assign(map, {
    some: (fn: (value: T) => boolean) => [...map.values()].some(fn),
    filter: (fn: (value: T) => boolean) => [...map.values()].filter(fn),
    get contents() {
      return [...map.values()];
    },
  });
}

interface Sound {
  id: string;
  parent: Playlist;
  playing: boolean;
  fade: number | null;
  pausedTime: number | null;
  sound: { currentTime: number } | null;
}
interface Playlist {
  id: string;
  mode: number;
  playbackOrder: string[];
  sounds: ReturnType<typeof collection<Sound>>;
  update(change: { playing: boolean; sounds: (Partial<Sound> & { _id: string })[] }): Promise<void>;
}

/** A playlist whose update applies the track changes the way Foundry stores them. */
function playlist(id: string, soundId: string, sound: Partial<Sound>): Playlist {
  const list: Playlist = {
    id,
    mode: 0,
    playbackOrder: [soundId],
    sounds: collection<Sound>([]),
    update: async ({ sounds }) => {
      for (const { _id, ...change } of sounds) Object.assign(list.sounds.get(_id) ?? {}, change);
    },
  };
  const track = {
    id: soundId,
    parent: list,
    playing: false,
    fade: null,
    pausedTime: null,
    sound: null,
    ...sound,
  };
  list.sounds.set(soundId, track);
  return list;
}

let instances: unknown[];
let settings: Record<string, unknown>;
let recompute: () => void;
let tavern: Sound;
let battle: Sound;

/** Runs the queued music steps and the fade restore after them. */
const settle = () => vi.advanceTimersByTimeAsync(5_000);

beforeEach(() => {
  vi.useFakeTimers();
  settings = {};
  instances = [];
  const tavernList = playlist(TAVERN, "Sound00000000001", {
    playing: true,
    fade: 0,
    sound: { currentTime: 42 },
  });
  const battleList = playlist(BATTLE, "Sound00000000002", { fade: 500 });
  tavern = tavernList.sounds.get("Sound00000000001") as Sound;
  battle = battleList.sounds.get("Sound00000000002") as Sound;
  const actor = {
    id: ACTOR,
    name: "Lich",
    img: "",
    flags: {
      "boss-bars-5e": {
        profile: {
          dataVersion: 2,
          kind: "boss",
          displayMode: "token",
          music: { type: "playlist", playlistId: BATTLE },
          musicFade: 2000,
        },
      },
    },
  };
  const token = { id: TOKEN, actorId: ACTOR, baseActor: actor, name: "Lich", hidden: false, actorLink: true };
  const scene = {
    id: SCENE,
    flags: {
      "boss-bars-5e": {
        get instances() {
          return { dataVersion: 3, items: instances };
        },
      },
    },
    tokens: collection([[TOKEN, token]]),
  };
  vi.stubGlobal("game", {
    user: { isGM: true, isActiveGM: true },
    scenes: Object.assign(collection([[SCENE, scene]]), { active: scene }),
    actors: collection([[ACTOR, actor]]),
    combats: collection([]),
    playlists: collection<Playlist>([
      [TAVERN, tavernList],
      [BATTLE, battleList],
    ]),
    settings: {
      get: (_scope: string, key: string) => settings[key],
      set: async (_scope: string, key: string, value: unknown) => {
        settings[key] = value;
      },
    },
  });
  startMusicWatch({
    refresh: () => undefined,
    subscribe: (listener) => {
      recompute = listener;
      return () => undefined;
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("boss music", () => {
  it("swaps the table's music for the boss's and puts it back, place and fades included", async () => {
    instances = [{ id: INSTANCE, kind: "boss", tokenId: TOKEN, order: 1 }];
    recompute();
    await settle();
    expect(tavern).toMatchObject({ playing: false, fade: 0 });
    expect(battle).toMatchObject({ playing: true, fade: 500 });

    instances = [];
    recompute();
    await settle();
    expect(battle).toMatchObject({ playing: false, fade: 500 });
    expect(tavern).toMatchObject({ playing: true, pausedTime: 42, fade: 0 });
    expect(settings.music).toMatchObject({ source: null, started: [], paused: [], fades: [] });
  });

  it("fades with the profile's length while the switch runs", async () => {
    instances = [{ id: INSTANCE, kind: "boss", tokenId: TOKEN, order: 1 }];
    recompute();
    await vi.advanceTimersByTimeAsync(0);
    expect(tavern.fade).toBe(2000);
    expect(battle.fade).toBe(2000);
  });

  it("leaves the music alone while no boss with music is shown", async () => {
    recompute();
    await settle();
    expect(tavern).toMatchObject({ playing: true, fade: 0 });
    expect(battle.playing).toBe(false);
  });
});
