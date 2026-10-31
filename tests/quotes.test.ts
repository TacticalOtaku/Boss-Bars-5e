// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstanceState } from "../src/core/instances";
import type { Quote } from "../src/core/quotes";
import { requestWrite } from "../src/foundry/authority";
import { startQuoteWatch } from "../src/foundry/quotes";
import { startStore } from "../src/foundry/store";
import { createBossStack } from "../src/ui/boss-stack";

const SCENE = "Scene00000000001";
const TOKEN = "Token00000000001";
const ACTOR = "Actor00000000001";
const INSTANCE = "Inst000000000001";
const MODULE = "boss-bars-5e";

function collection<T>(entries: [string, T][]) {
  const map = new Map(entries);
  return Object.assign(map, {
    some: (fn: (value: T) => boolean) => [...map.values()].some(fn),
    find: (fn: (value: T) => boolean) => [...map.values()].find(fn),
    filter: (fn: (value: T) => boolean) => [...map.values()].filter(fn),
  });
}

function world(hidden = false) {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const emit = (hook: string, ...args: unknown[]) => handlers.get(hook)?.forEach((fn) => fn(...args));
  const quote: Quote = {
    id: "arrival",
    trigger: { type: "appear" },
    texts: ["Behold {name}!"],
    order: "cycle",
    cooldown: 0,
    once: true,
    duration: 3,
  };
  const actor = {
    id: ACTOR,
    name: "Lich",
    img: "",
    statuses: new Set(),
    appliedEffects: [],
    system: { attributes: { hp: { value: 100, max: 100 } } },
    flags: { [MODULE]: { profile: { dataVersion: 2, kind: "boss", displayMode: "token", quotes: [quote] } } },
  };
  const token = { id: TOKEN, actorId: ACTOR, actor, baseActor: actor, name: "Lich", hidden, actorLink: true };
  const scene = {
    id: SCENE,
    flags: { [MODULE]: { instances: { dataVersion: 3, items: [] } as InstanceState } },
    tokens: collection([[TOKEN, token]]),
    async setFlag(scope: string, key: string, value: InstanceState) {
      if (scope !== MODULE || key !== "instances") throw new Error("Unexpected flag write");
      scene.flags[MODULE].instances = structuredClone(value);
      emit("updateScene", scene);
    },
  };
  const user = { isGM: true, isActiveGM: true };
  vi.stubGlobal("game", {
    user,
    scenes: collection([[SCENE, scene]]),
    actors: collection([[ACTOR, actor]]),
    combats: collection([]),
    settings: { get: () => undefined },
    i18n: { localize: (key: string) => key },
  });
  vi.stubGlobal("canvas", { scene });
  vi.stubGlobal("CONFIG", { specialStatusEffects: { DEFEATED: "dead" } });
  vi.stubGlobal("Hooks", {
    on(hook: string, fn: (...args: unknown[]) => void) {
      handlers.set(hook, [...(handlers.get(hook) ?? []), fn]);
    },
    call: () => true,
  });
  let overlay = document.createElement("div");
  document.body.append(overlay);
  const stackOptions = {
    labels: { collapse: "Collapse", expand: "Expand", defeated: "Defeated", phase: "Phase {n}" },
    onCollapse: () => undefined,
    reducedMotion: () => true,
    now: () => game.time?.serverTime ?? Date.now(),
  };
  const stack = createBossStack(overlay, stackOptions);
  const hud = startStore((views, layout, scale) => stack.update(views.bosses, layout.bosses, scale));
  startQuoteWatch(hud);
  return {
    scene,
    token,
    actor,
    quote,
    user,
    hud,
    emit,
    line: () => overlay.querySelector<HTMLElement>(".bb5e-boss__quote"),
    async viewAsPlayer() {
      user.isGM = user.isActiveGM = false;
      overlay = document.createElement("div");
      document.body.append(overlay);
      const playerStack = createBossStack(overlay, stackOptions);
      const playerHud = startStore((views, layout, scale) =>
        playerStack.update(views.bosses, layout.bosses, scale),
      );
      playerHud.refresh();
      await settle();
    },
    show() {
      scene.flags[MODULE].instances.items.push({ id: INSTANCE, kind: "boss", tokenId: TOKEN, order: 1 });
      emit("updateScene", scene);
    },
  };
}

// Drain the store microtask and the serialized authority write, including the resulting scene refresh.
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(10_000);
  document.body.innerHTML = "";
});
afterEach(() => vi.useRealTimers());

describe("quote delivery from the active GM to the player HUD", () => {
  it("uses synchronized server time when the player's computer clock is ahead", async () => {
    const w = world();
    vi.stubGlobal("game", { ...game, time: { serverTime: 10_000 } });
    w.hud.refresh();
    await settle();
    w.show();
    await settle();
    vi.setSystemTime(70_000);
    await w.viewAsPlayer();
    expect(w.line()?.textContent).toBe("Behold Lich!");
    expect(w.line()?.hidden).toBe(false);
  });

  it("timestamps speech with server time even when the GM's clock differs", async () => {
    const w = world();
    vi.stubGlobal("game", { ...game, time: { serverTime: 5_000 } });
    w.show();
    await settle();
    await requestWrite({ type: "say", sceneId: SCENE, instanceId: INSTANCE, text: "Listen." });
    expect(w.scene.flags[MODULE].instances.items[0]?.quote?.at).toBe(5_000);
  });

  it("shows a newly added boss's appearance quote on the player HUD", async () => {
    const w = world();
    w.hud.refresh();
    await settle();
    w.show();
    await settle();
    await w.viewAsPlayer();
    expect(w.line()?.textContent).toBe("Behold Lich!");
    expect(w.line()?.hidden).toBe(false);
  });

  it("shows manual speech on the player HUD", async () => {
    const w = world();
    w.show();
    await settle();
    await requestWrite({ type: "say", sceneId: SCENE, instanceId: INSTANCE, text: "You cannot win." });
    await w.viewAsPlayer();
    expect(w.line()?.textContent).toBe("You cannot win.");
    expect(w.line()?.hidden).toBe(false);
  });

  it("speaks when a hit deals exactly the configured percentage of maximum HP", async () => {
    const w = world();
    w.quote.trigger = { type: "damage", percent: 20 };
    w.quote.texts = ["That hurt."];
    w.show();
    await settle();
    w.actor.system.attributes.hp.value = 80;
    w.emit("updateActor", w.actor);
    await settle();
    await w.viewAsPlayer();
    expect(w.line()?.textContent).toBe("That hurt.");
    expect(w.line()?.hidden).toBe(false);
  });

  it("speaks the appearance quote when a previously hidden boss is revealed to players", async () => {
    const w = world(true);
    w.hud.refresh();
    await settle();
    w.show();
    await settle();
    vi.advanceTimersByTime(10_000);
    w.token.hidden = false;
    w.emit("updateToken", w.token);
    await settle();
    await w.viewAsPlayer();
    expect(w.scene.flags[MODULE].instances.items[0]?.quote?.at).toBe(20_000);
    expect(w.line()?.hidden).toBe(false);
  });
  it.each([
    { hp: 79, speaks: true },
    { hp: 80.0001, speaks: false },
  ])("checks the 20% damage boundary at $hp HP", async ({ hp, speaks }) => {
    const w = world();
    w.quote.trigger = { type: "damage", percent: 20 };
    w.quote.texts = ["That hurt."];
    w.show();
    await settle();
    w.actor.system.attributes.hp.value = hp;
    w.emit("updateActor", w.actor);
    await settle();
    await w.viewAsPlayer();
    expect(w.line()?.hidden).toBe(!speaks);
  });

  it("does not repeat arrival when the same boss is hidden and revealed again", async () => {
    const w = world(true);
    w.quote.once = false;
    w.hud.refresh();
    await settle();
    w.show();
    await settle();
    expect(w.scene.flags[MODULE].instances.items[0]?.quote).toBeUndefined();
    w.token.hidden = false;
    w.emit("updateToken", w.token);
    await settle();
    const first = w.scene.flags[MODULE].instances.items[0]?.quote;
    expect(first?.text).toBe("Behold Lich!");
    w.token.hidden = true;
    w.emit("updateToken", w.token);
    await settle();
    vi.advanceTimersByTime(10_000);
    w.token.hidden = false;
    w.emit("updateToken", w.token);
    await settle();
    expect(w.scene.flags[MODULE].instances.items[0]?.quote).toEqual(first);
  });

  it("does not replay an already visible boss's arrival on load", async () => {
    const w = world();
    w.show();
    await settle();
    expect(w.scene.flags[MODULE].instances.items[0]?.quote).toBeUndefined();
  });
});
