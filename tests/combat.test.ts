import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writes = vi.hoisted(() => vi.fn<(action: unknown) => Promise<void>>(async () => undefined));
vi.mock("../src/foundry/authority", () => ({ requestWrite: writes }));

const { startCombatWatch } = await import("../src/foundry/combat");

const SCENE = "Scene00000000001";
const TOKEN = "Token00000000001";
const ACTOR = "Actor00000000001";
const INSTANCE = "Inst000000000001";

/** Map plus the Collection helpers the code uses. */
function collection<T>(entries: [string, T][]) {
  const map = new Map(entries);
  return Object.assign(map, {
    some: (fn: (value: T) => boolean) => [...map.values()].some(fn),
    filter: (fn: (value: T) => boolean) => [...map.values()].filter(fn),
  });
}

const combatOf = (id: string, started: boolean) => ({
  id,
  started,
  round: started ? 1 : 0,
  combatants: collection([[`C${id}`, { sceneId: SCENE, tokenId: TOKEN, defeated: false }]]),
});

const handlers = new Map<string, (...args: unknown[]) => void>();
let combats: ReturnType<typeof collection<ReturnType<typeof combatOf>>>;

beforeEach(() => {
  vi.useFakeTimers();
  writes.mockClear();
  handlers.clear();
  const actor = {
    id: ACTOR,
    name: "Lich",
    img: "",
    flags: {
      "boss-bars-5e": {
        profile: {
          dataVersion: 2,
          kind: "elite",
          playerName: "",
          portrait: null,
          displayMode: "token",
          rank: "veteran",
          autoShow: { hideOnCombatEnd: true, hideOnDefeat: false, delay: 30 },
        },
      },
    },
  };
  const token = { id: TOKEN, actorId: ACTOR, baseActor: actor, name: "Lich", hidden: false, actorLink: true };
  const scene = {
    id: SCENE,
    flags: {
      "boss-bars-5e": {
        instances: { dataVersion: 3, items: [{ id: INSTANCE, kind: "elite", tokenId: TOKEN, order: 1 }] },
      },
    },
    tokens: collection([[TOKEN, token]]),
  };
  combats = collection<ReturnType<typeof combatOf>>([]);
  vi.stubGlobal("game", {
    user: { isGM: true, isActiveGM: true },
    scenes: collection([[SCENE, scene]]),
    actors: collection([[ACTOR, actor]]),
    combats,
  });
  vi.stubGlobal("Hooks", { on: (hook: string, fn: (...args: unknown[]) => void) => handlers.set(hook, fn) });
  startCombatWatch({ refresh: () => undefined, subscribe: () => () => undefined });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("hide at the end of combat", () => {
  it("hides the bar once the profile's delay runs out", () => {
    handlers.get("deleteCombat")?.(combatOf("Combat0000000001", true));
    vi.advanceTimersByTime(29_000);
    expect(writes).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(writes).toHaveBeenCalledWith({ type: "hide", sceneId: SCENE, instanceId: INSTANCE });
  });

  it("keeps the bar when the boss is already in the next started fight", () => {
    handlers.get("deleteCombat")?.(combatOf("Combat0000000001", true));
    const next = combatOf("Combat0000000002", true);
    combats.set(next.id, next);
    vi.advanceTimersByTime(30_000);
    expect(writes).not.toHaveBeenCalled();
  });

  it("still hides when the next combat holding the boss has not started", () => {
    handlers.get("deleteCombat")?.(combatOf("Combat0000000001", true));
    const prepared = combatOf("Combat0000000002", false);
    combats.set(prepared.id, prepared);
    vi.advanceTimersByTime(30_000);
    expect(writes).toHaveBeenCalledOnce();
  });
});
