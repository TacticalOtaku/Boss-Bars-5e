import { beforeEach, describe, expect, it, vi } from "vitest";
import { pruneScenes, registerAuthority, requestWrite } from "../src/foundry/authority";

const SCENE = "Scene00000000001";
const TOKEN = "Token00000000001";
const GONE = "Token00000000002";
const profile = { dataVersion: 1, kind: "boss", playerName: "", title: "", portrait: null, size: 100 };

function makeScene(instances: unknown) {
  const scene = {
    id: SCENE,
    flags: { "boss-bars-5e": { instances } } as FlagBag,
    tokens: new Map([[TOKEN, { id: TOKEN, baseActor: { flags: { "boss-bars-5e": { profile } } } }]]),
    setFlag: vi.fn(async (_scope: string, _key: string, value: unknown) => {
      scene.flags["boss-bars-5e"] = { instances: value };
    }),
  };
  return scene;
}

let scene: ReturnType<typeof makeScene>;
const queries: Record<string, (data: unknown, context: { user: { isGM: boolean } }) => Promise<unknown>> = {};
const activeGM = { isGM: true, query: vi.fn() };

function stubWorld(user: { isGM: boolean; isActiveGM: boolean }, gm: object | null = activeGM) {
  vi.stubGlobal("game", { user, users: { activeGM: gm }, scenes: new Map([[SCENE, scene]]) });
  vi.stubGlobal("CONFIG", { queries });
  vi.stubGlobal("foundry", { utils: { randomID: () => "Inst000000000001" } });
}

const items = () => (scene.flags["boss-bars-5e"]?.instances as { items: { tokenId: string }[] }).items;

beforeEach(() => {
  scene = makeScene(undefined);
  activeGM.query.mockReset();
  vi.stubGlobal("CONFIG", { queries });
  registerAuthority();
});

describe("requestWrite", () => {
  it("lets the active GM write directly", async () => {
    stubWorld({ isGM: true, isActiveGM: true });
    await requestWrite({ type: "show", sceneId: SCENE, tokenId: TOKEN });
    expect(items().map((i) => i.tokenId)).toEqual([TOKEN]);
    expect(activeGM.query).not.toHaveBeenCalled();
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
  it("drops bars of deleted tokens, only on the active GM", async () => {
    scene = makeScene({
      dataVersion: 1,
      items: [
        { id: "a", kind: "boss", tokenId: TOKEN, order: 1 },
        { id: "b", kind: "boss", tokenId: GONE, order: 2 },
      ],
    });
    stubWorld({ isGM: true, isActiveGM: false });
    pruneScenes([scene as unknown as SceneDocument]);
    await vi.waitFor(() => expect(scene.setFlag).not.toHaveBeenCalled());
    stubWorld({ isGM: true, isActiveGM: true });
    pruneScenes([scene as unknown as SceneDocument]);
    await vi.waitFor(() => expect(items().map((i) => i.tokenId)).toEqual([TOKEN]));
  });
});
