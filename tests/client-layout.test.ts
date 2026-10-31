import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT } from "../src/core/layout";
import { currentLayout } from "../src/foundry/layout";
import { clientPosition, saveClientPosition, saveClientPreferences } from "../src/foundry/client-layout";

let client: Record<string, unknown>;
let selected: string;
let writes: string[];
const scenes = () => ({ id: "scene-a", flags: {} }) as SceneDocument;

beforeEach(() => {
  selected = "alice";
  client = { alice: {}, bob: {} };
  writes = [];
  vi.stubGlobal("game", {
    settings: {
      get: (_module: string, key: string) => (key === "clientLayout" ? client[selected] : {}),
      set: async (_module: string, key: string, value: unknown) => {
        writes.push(key);
        client[selected] = structuredClone(value);
      },
    },
  });
});

describe("client HUD layout", () => {
  it("persists independent boss positions and the elite column for one client and scene", async () => {
    await Promise.all([
      saveClientPosition("scene-a", "boss-a", { anchor: "tl", dx: 20, dy: 30 }),
      saveClientPosition("scene-a", "boss-b", { anchor: "br", dx: -50, dy: -60 }),
      saveClientPosition("scene-a", "elites", { anchor: "ml", dx: 70, dy: 10 }),
    ]);
    expect(clientPosition("scene-a", "boss-a")).toEqual({ anchor: "tl", dx: 20, dy: 30 });
    expect(clientPosition("scene-a", "boss-b")).toEqual({ anchor: "br", dx: -50, dy: -60 });
    expect(clientPosition("scene-a", "elites")).toEqual({ anchor: "ml", dx: 70, dy: 10 });
    expect(clientPosition("scene-b", "boss-a")).toBeNull();
    selected = "bob";
    expect(clientPosition("scene-a", "boss-a")).toBeNull();
    expect(writes.every((key) => key === "clientLayout")).toBe(true);
  });

  it("reloads persisted data and resets one position without removing its neighbors", async () => {
    client.alice = {
      dataVersion: 1,
      scenes: {
        "scene-a": { "boss-a": { anchor: "tc", dx: 15, dy: 25 }, "boss-b": { anchor: "tl", dx: 10, dy: 20 } },
      },
    };
    expect(clientPosition("scene-a", "boss-a")).toEqual({ anchor: "tc", dx: 15, dy: 25 });
    await saveClientPosition("scene-a", "boss-a", null);
    expect(clientPosition("scene-a", "boss-a")).toBeNull();
    expect(clientPosition("scene-a", "boss-b")).toEqual({ anchor: "tl", dx: 10, dy: 20 });
  });

  it("uses client preferences without changing legacy world or scene settings", async () => {
    const preferences = { ...DEFAULT_LAYOUT, elites: { ...DEFAULT_LAYOUT.elites, max: 4 } };
    await saveClientPreferences(preferences);
    expect(currentLayout(scenes()).elites.max).toBe(4);
    selected = "bob";
    expect(currentLayout(scenes()).elites.max).toBe(12);
    expect(writes).toEqual(["clientLayout"]);
  });

  it.each([
    { dataVersion: 99, scenes: { future: true } },
    { dataVersion: "broken", scenes: {} },
    { dataVersion: 1, scenes: { "scene-a": { "boss-a": { anchor: "unknown", dx: 0, dy: 0 } } } },
  ])("leaves unreadable client data untouched: %j", async (raw) => {
    client.alice = structuredClone(raw);
    expect(await saveClientPosition("scene-a", "boss-a", { anchor: "tl", dx: 5, dy: 5 })).toBe(false);
    expect(await saveClientPreferences(DEFAULT_LAYOUT)).toBe(false);
    expect(client.alice).toEqual(raw);
    expect(writes).toEqual([]);
  });
});
