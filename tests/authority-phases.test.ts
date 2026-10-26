import { beforeEach, describe, expect, it, vi } from "vitest";
import { pruneScenes, requestWrite, syncPhases } from "../src/foundry/authority";

const SCENE = "Scene00000000001";
const BOSS = "BossActor0000001";
const FORM = "FormActor0000001";
const T_BOSS = "TokenBoss0000001";
const T_FAR = "TokenForm0000001";
const T_NEAR = "TokenForm0000002";
const T_OTHER = "TokenOther000001";
const INSTANCE = "Inst000000000001";

const collection = <T extends { id: string }>(values: T[]) => {
  const map = new Map(values.map((value) => [value.id, value]));
  return Object.assign(map, {
    contents: values,
    some: (fn: (value: T) => boolean) => [...map.values()].some(fn),
    filter: (fn: (value: T) => boolean) => [...map.values()].filter(fn),
    find: (fn: (value: T) => boolean) => [...map.values()].find(fn),
  });
};

const hpActor = (id: string, value: number, flags: FlagBag = {}) => ({
  id,
  name: id,
  img: `${id}.webp`,
  flags,
  system: { attributes: { hp: { value, max: 100 } } },
  statuses: new Set<string>(),
  appliedEffects: [],
});
type TestActor = ReturnType<typeof hpActor>;

const phases = [
  { id: "p1", trigger: { type: "start" } },
  { id: "p2", trigger: { type: "hp", below: 50 } },
  { id: "p3", trigger: { type: "form", actorId: FORM } },
];

let boss: TestActor;
let form: TestActor;
let scene: {
  id: string;
  flags: FlagBag;
  tokens: ReturnType<typeof collection<TokenDocument>>;
  setFlag: ReturnType<typeof vi.fn>;
};
const warn = vi.fn();

function token(id: string, actor: TestActor, x: number): TokenDocument {
  return {
    id,
    name: `${id} name`,
    hidden: false,
    actorId: actor.id,
    actorLink: true,
    x,
    y: 0,
    actor: actor as unknown as ActorDocument,
    baseActor: actor as unknown as ActorDocument,
    parent: null,
  };
}

function setup(bossHp: number, formTokens: TokenDocument[] | null, instance: object = {}) {
  boss = hpActor(BOSS, bossHp, {
    "boss-bars-5e": {
      profile: { dataVersion: 2, kind: "boss", displayMode: "token", playerName: "Ksar", phases },
    },
  });
  form = hpActor(FORM, 100);
  const tokens = [token(T_BOSS, boss, 500), ...(formTokens ?? [])];
  scene = {
    id: SCENE,
    flags: {
      "boss-bars-5e": {
        instances: {
          dataVersion: 3,
          items: [{ id: INSTANCE, kind: "boss", tokenId: T_BOSS, order: 1, ...instance }],
        },
      },
    },
    tokens: collection(tokens),
    setFlag: vi.fn(async (_scope: string, _key: string, value: unknown) => {
      scene.flags["boss-bars-5e"] = { instances: value };
    }),
  };
  vi.stubGlobal("game", {
    user: { isGM: true, isActiveGM: true },
    users: { activeGM: null },
    scenes: collection([scene]),
    actors: collection([boss, form]),
    combats: collection([]),
    i18n: { format: (key: string, data: Record<string, string>) => `${key} ${data.name}` },
  });
  vi.stubGlobal("CONFIG", { queries: {}, specialStatusEffects: { DEFEATED: "dead" } });
  vi.stubGlobal("ui", { notifications: { warn, error: vi.fn() } });
  vi.stubGlobal("foundry", { utils: { randomID: () => "NewInst000000001" } });
}

type Item = { id: string; tokenId?: string; actorId?: string; source?: string; phase?: object };
const items = () => (scene.flags["boss-bars-5e"]?.instances as { items: Item[] }).items;
/** syncPhases queues its write; one macrotask lets the queue run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => warn.mockReset());

describe("phase engine on the active GM", () => {
  it("passes a threshold once, however often it runs", async () => {
    setup(40, null, { phase: { id: "p1", mark: 100 } });
    syncPhases([scene as unknown as SceneDocument]);
    syncPhases([scene as unknown as SceneDocument]);
    await settle();
    expect(items()[0]?.phase).toEqual({ id: "p2", mark: 40 });
    expect(scene.setFlag).toHaveBeenCalledTimes(1);
  });

  it("moves the bar onto the nearest form token at 0 HP, keeping the boss's profile", async () => {
    setup(0, [token(T_FAR, form, 2000), token(T_NEAR, form, 600)], { phase: { id: "p2", mark: 40 } });
    syncPhases([scene as unknown as SceneDocument]);
    await settle();
    expect(items()).toEqual([
      expect.objectContaining({
        id: INSTANCE,
        tokenId: T_NEAR,
        source: BOSS,
        phase: { id: "p3", mark: 100 },
      }),
    ]);
  });

  it("waits without a form token, tells the GM once and binds the selected token later", async () => {
    setup(0, null, { phase: { id: "p2", mark: 40 } });
    syncPhases([scene as unknown as SceneDocument]);
    await settle();
    syncPhases([scene as unknown as SceneDocument]);
    await settle();
    expect(items()[0]).toMatchObject({ tokenId: T_BOSS, source: BOSS, phase: { id: "p3", waiting: true } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("BB5E.Phase.FormWaiting Ksar");

    const other = token(T_OTHER, form, 0);
    scene.tokens.set(T_OTHER, other);
    await requestWrite({ type: "bindToken", sceneId: SCENE, instanceId: INSTANCE, tokenId: T_OTHER });
    expect(items()[0]).toMatchObject({ tokenId: T_OTHER, source: BOSS, phase: { id: "p3", mark: 100 } });
    expect(items()[0]?.phase).not.toHaveProperty("waiting");
  });

  it("keeps a waiting form's bar when the fallen token is deleted", async () => {
    setup(0, null, { source: BOSS, phase: { id: "p3", mark: 100, waiting: true } });
    scene.tokens.delete(T_BOSS);
    pruneScenes([scene as unknown as SceneDocument]);
    await settle();
    expect(items()).toHaveLength(1);
  });

  it("refuses binding a token when no form waits", async () => {
    setup(80, [token(T_NEAR, form, 0)], { phase: { id: "p1", mark: 100 } });
    await expect(
      requestWrite({ type: "bindToken", sceneId: SCENE, instanceId: INSTANCE, tokenId: T_NEAR }),
    ).rejects.toThrow("Invalid");
  });
});

describe("show and manual phases", () => {
  it("shows a wounded boss straight in its phase", async () => {
    setup(30, null);
    scene.flags["boss-bars-5e"] = { instances: { dataVersion: 3, items: [] } };
    await requestWrite({ type: "show", sceneId: SCENE, tokenId: T_BOSS });
    expect(items()[0]?.phase).toEqual({ id: "p2", mark: 30 });
  });

  it("picks a phase at the current HP and refuses unknown ones", async () => {
    setup(70, null, { phase: { id: "p1", mark: 100 } });
    await requestWrite({ type: "setPhase", sceneId: SCENE, instanceId: INSTANCE, phaseId: "p2" });
    expect(items()[0]?.phase).toEqual({ id: "p2", mark: 70 });
    await expect(
      requestWrite({ type: "setPhase", sceneId: SCENE, instanceId: INSTANCE, phaseId: "nope" }),
    ).rejects.toThrow("Invalid");
  });
});
