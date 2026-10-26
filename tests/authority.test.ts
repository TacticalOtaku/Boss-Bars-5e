import { beforeEach, describe, expect, it, vi } from "vitest";
import { pruneScenes, registerAuthority, requestWrite } from "../src/foundry/authority";

const SCENE = "Scene00000000001";
const TOKEN = "Token00000000001";
const TOKEN2 = "Token00000000003";
const GONE = "Token00000000002";
const ACTOR = "Actor00000000001";
const flags = (displayMode: string) => ({
  "boss-bars-5e": {
    profile: { dataVersion: 2, kind: "elite", playerName: "", portrait: null, displayMode, rank: "veteran" },
  },
});

/** Map plus the Collection helpers the code uses. */
function collection<T>(entries: [string, T][]) {
  const map = new Map(entries);
  return Object.assign(map, {
    some: (fn: (value: T) => boolean) => [...map.values()].some(fn),
    filter: (fn: (value: T) => boolean) => [...map.values()].filter(fn),
  });
}

function makeScene(instances: unknown, displayMode = "token") {
  const actor: { id: string; flags: FlagBag } = { id: ACTOR, flags: flags(displayMode) };
  const token = (id: string) => [id, { id, actorId: ACTOR, baseActor: actor }] as [string, object];
  const scene = {
    id: SCENE,
    flags: { "boss-bars-5e": { instances } } as FlagBag,
    tokens: collection([token(TOKEN), token(TOKEN2)]),
    actor,
    setFlag: vi.fn(async (_scope: string, _key: string, value: unknown) => {
      scene.flags["boss-bars-5e"] = { instances: value };
    }),
  };
  return scene;
}

let scene: ReturnType<typeof makeScene>;
const queries: Record<string, (data: unknown, context: { user: { isGM: boolean } }) => Promise<unknown>> = {};
const activeGM = { isGM: true, query: vi.fn() };
let nextId = 0;
/** A module's pre-hook answer: false cancels. */
const hookCall = vi.fn<(hook: string, info: { id?: string }) => boolean>(() => true);

function stubWorld(user: { isGM: boolean; isActiveGM: boolean }, gm: object | null = activeGM) {
  vi.stubGlobal("game", {
    user,
    users: { activeGM: gm },
    scenes: new Map([[SCENE, scene]]),
    actors: new Map([[ACTOR, scene.actor]]),
  });
  vi.stubGlobal("CONFIG", { queries });
  vi.stubGlobal("foundry", { utils: { randomID: () => `Inst00000000000${++nextId}` } });
  vi.stubGlobal("Hooks", { call: hookCall });
}

type Item = { kind: string; tokenId?: string; actorId?: string };
const items = () => (scene.flags["boss-bars-5e"]?.instances as { items: Item[] }).items;

beforeEach(() => {
  scene = makeScene(undefined);
  activeGM.query.mockReset();
  hookCall.mockReset();
  hookCall.mockReturnValue(true);
  vi.stubGlobal("CONFIG", { queries });
  registerAuthority();
});

describe("requestWrite", () => {
  it("lets the active GM write directly, with the profile's kind", async () => {
    stubWorld({ isGM: true, isActiveGM: true });
    await requestWrite({ type: "show", sceneId: SCENE, tokenId: TOKEN });
    expect(items()).toMatchObject([{ kind: "elite", tokenId: TOKEN }]);
    expect(activeGM.query).not.toHaveBeenCalled();
  });

  it("binds to the actor in the one-per-actor mode and replaces a bar bound the other way", async () => {
    scene = makeScene(
      { dataVersion: 2, items: [{ id: "old", kind: "elite", tokenId: TOKEN2, order: 1 }] },
      "actor",
    );
    stubWorld({ isGM: true, isActiveGM: true });
    await requestWrite({ type: "show", sceneId: SCENE, tokenId: TOKEN });
    expect(items()).toEqual([expect.objectContaining({ kind: "elite", actorId: ACTOR })]);
    await requestWrite({ type: "show", sceneId: SCENE, tokenId: TOKEN2 });
    expect(items()).toHaveLength(1);
  });

  it("sends another GM's action to the active GM", async () => {
    stubWorld({ isGM: true, isActiveGM: false });
    const action = { type: "hideAll", sceneId: SCENE } as const;
    await requestWrite(action);
    expect(activeGM.query).toHaveBeenCalledWith("boss-bars-5e.write", action, { timeout: 10_000 });
    expect(scene.setFlag).not.toHaveBeenCalled();
  });

  it("refuses players and a world without a GM", async () => {
    stubWorld({ isGM: false, isActiveGM: false });
    await expect(requestWrite({ type: "hideAll", sceneId: SCENE })).rejects.toThrow("BB5E.Error.NotGM");
    stubWorld({ isGM: true, isActiveGM: false }, null);
    await expect(requestWrite({ type: "hideAll", sceneId: SCENE })).rejects.toThrow("BB5E.Error.NoGM");
  });

  it("refuses showing a token without a profile and never rewrites newer data", async () => {
    stubWorld({ isGM: true, isActiveGM: true });
    await expect(requestWrite({ type: "show", sceneId: SCENE, tokenId: GONE })).rejects.toThrow("NoProfile");
    scene = makeScene({ dataVersion: 7, items: [] });
    stubWorld({ isGM: true, isActiveGM: true });
    await expect(requestWrite({ type: "hideAll", sceneId: SCENE })).rejects.toThrow("NewerData");
    expect(scene.setFlag).not.toHaveBeenCalled();
  });
});

describe("pre-hooks", () => {
  it("asks preShow before a new bar and lets a module cancel it", async () => {
    stubWorld({ isGM: true, isActiveGM: true });
    hookCall.mockReturnValue(false);
    await expect(requestWrite({ type: "show", sceneId: SCENE, tokenId: TOKEN })).rejects.toThrow("Cancelled");
    expect(hookCall).toHaveBeenCalledWith("boss-bars-5e.preShow", {
      sceneId: SCENE,
      tokenId: TOKEN,
      actorId: ACTOR,
      kind: "elite",
    });
    expect(scene.setFlag).not.toHaveBeenCalled();
  });

  it("asks preHide for each bar: hide is refused, hideAll keeps the bars a module holds", async () => {
    scene = makeScene({
      dataVersion: 3,
      items: [
        { id: "a", kind: "boss", tokenId: TOKEN, order: 1 },
        { id: "b", kind: "boss", tokenId: TOKEN2, order: 2 },
      ],
    });
    stubWorld({ isGM: true, isActiveGM: true });
    hookCall.mockImplementation((_hook, info) => info.id !== "a");
    await expect(requestWrite({ type: "hide", sceneId: SCENE, instanceId: "a" })).rejects.toThrow(
      "Cancelled",
    );
    await requestWrite({ type: "hideAll", sceneId: SCENE });
    expect(items()).toEqual([expect.objectContaining({ id: "a" })]);
  });
});

describe("query handler", () => {
  const handler = () => queries["boss-bars-5e.write"]!;

  it("checks sender and payload again on the active GM", async () => {
    stubWorld({ isGM: true, isActiveGM: true });
    await expect(handler()({ type: "hideAll", sceneId: SCENE }, { user: { isGM: false } })).rejects.toThrow(
      "NotGM",
    );
    await expect(handler()({ type: "show", sceneId: SCENE }, { user: { isGM: true } })).rejects.toThrow(
      "Invalid",
    );
    await handler()({ type: "show", sceneId: SCENE, tokenId: TOKEN }, { user: { isGM: true } });
    expect(items()).toHaveLength(1);
  });

  it("is refused by a GM that is not the active one", async () => {
    stubWorld({ isGM: true, isActiveGM: false });
    await expect(handler()({ type: "hideAll", sceneId: SCENE }, { user: { isGM: true } })).rejects.toThrow(
      "NotActiveGM",
    );
  });
});

describe("pruneScenes", () => {
  it("drops bars of deleted tokens and actors without tokens, rebinds to the profile, only on the active GM", async () => {
    scene = makeScene({
      dataVersion: 1,
      items: [
        { id: "a", kind: "boss", tokenId: TOKEN, order: 1 },
        { id: "b", kind: "boss", tokenId: GONE, order: 2 },
        { id: "c", kind: "elite", actorId: ACTOR, order: 3 },
        { id: "d", kind: "elite", actorId: "Actor00000000009", order: 4 },
      ],
    });
    stubWorld({ isGM: true, isActiveGM: false });
    pruneScenes([scene as unknown as SceneDocument]);
    await vi.waitFor(() => expect(scene.setFlag).not.toHaveBeenCalled());
    stubWorld({ isGM: true, isActiveGM: true });
    pruneScenes([scene as unknown as SceneDocument]);
    await vi.waitFor(() => expect(items().map((i) => i.tokenId ?? i.actorId)).toEqual([TOKEN, TOKEN2]));
  });
});

describe("counters and custom statuses", () => {
  const INSTANCE = "Inst000000000001";
  beforeEach(() => {
    scene = makeScene({ dataVersion: 2, items: [{ id: INSTANCE, kind: "boss", tokenId: TOKEN, order: 1 }] });
    scene.actor.flags["boss-bars-5e"] = {
      profile: {
        dataVersion: 2,
        kind: "boss",
        displayMode: "token",
        miniBars: [
          { id: "armour", source: { type: "counter", max: 4 } },
          { id: "leg", source: { type: "legact" } },
        ],
        statuses: { custom: [{ id: "rage", name: "Rage" }] },
      },
    };
    stubWorld({ isGM: true, isActiveGM: true });
  });
  const item = () => (items()[0] ?? {}) as { counters?: object; customStatuses?: string[] };

  it("sets a counter clamped to the profile's maximum", async () => {
    await requestWrite({
      type: "setCounter",
      sceneId: SCENE,
      instanceId: INSTANCE,
      barId: "armour",
      value: 9,
    });
    expect(item().counters).toEqual({ armour: 4 });
  });

  it("refuses counters that are not counter mini-bars of the profile", async () => {
    for (const barId of ["leg", "nope"]) {
      await expect(
        requestWrite({ type: "setCounter", sceneId: SCENE, instanceId: INSTANCE, barId, value: 1 }),
      ).rejects.toThrow("NoCounter");
    }
  });

  it("toggles only the profile's own custom statuses", async () => {
    await requestWrite({
      type: "toggleStatus",
      sceneId: SCENE,
      instanceId: INSTANCE,
      statusId: "rage",
      active: true,
    });
    expect(item().customStatuses).toEqual(["rage"]);
    await expect(
      requestWrite({
        type: "toggleStatus",
        sceneId: SCENE,
        instanceId: INSTANCE,
        statusId: "fake",
        active: true,
      }),
    ).rejects.toThrow("NoSuchStatus");
  });
});
