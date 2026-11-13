// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID } from "../src/constants";
import { DEFAULT_LAYOUT } from "../src/core/layout";
import { defaultProfile } from "../src/core/profile";
import { createApi, listenEffects } from "../src/foundry/api";
import { registerEntryPoints } from "../src/foundry/entry-points";
import type { FoundryEnv } from "../src/foundry/env";
import { startHookEvents } from "../src/foundry/hooks";
import { collapsedIds, currentRanks, registerSettings, setCollapsed } from "../src/foundry/settings";
import { startStore, type WorldSnapshot } from "../src/foundry/store";

const SCENE = "Scene00000000001";
const ACTOR = "Actor00000000001";
const TOKEN_A = "Token00000000001";
const TOKEN_B = "Token00000000002";
const INSTANCE = "Inst000000000001";
const GM_USER = "User000000000001";
const PLAYER_USER = "User000000000002";

function collection<T>(entries: [string, T][] = []) {
  const map = new Map(entries);
  return Object.assign(map, {
    some: (fn: (value: T) => boolean) => [...map.values()].some(fn),
    filter: (fn: (value: T) => boolean) => [...map.values()].filter(fn),
    find: (fn: (value: T) => boolean) => [...map.values()].find(fn),
  });
}

function bossProfile(extra: Record<string, unknown> = {}) {
  return {
    ...defaultProfile("boss"),
    phases: [
      { id: "start", label: "Awakening", trigger: { type: "start" }, enter: {} },
      { id: "phase-2", label: "Fury", trigger: { type: "hp", hp: 50 }, enter: {} },
    ],
    quotes: [{ id: "quote-1", trigger: { type: "manual" }, texts: ["Perish!"] }],
    ...extra,
  };
}

function makeActor(id: string, profile: unknown, hp = { value: 60, max: 100 }) {
  return {
    id,
    documentName: "Actor",
    name: "Strahd",
    img: "strahd.webp",
    type: "npc",
    isToken: false,
    flags: { [MODULE_ID]: { profile } },
    system: { attributes: { hp }, traits: { size: "med" } },
    statuses: new Set<string>(),
    appliedEffects: [],
    effects: collection(),
    items: collection(),
  };
}

function makeToken(
  id: string,
  scene: Record<string, unknown>,
  actor: ReturnType<typeof makeActor>,
  hidden = false,
) {
  return {
    id,
    documentName: "Token",
    name: actor.name,
    actorId: actor.id,
    actorLink: true,
    hidden,
    parent: scene,
    baseActor: actor,
    actor,
    texture: { src: actor.img },
    disposition: -1,
    hasPlayerOwner: false,
  };
}

function makeScene(
  id: string,
  items: Record<string, unknown>[] = [],
  tokens: [string, ReturnType<typeof makeToken>][] = [],
) {
  const scene: Record<string, unknown> = {
    id,
    active: true,
    flags: { [MODULE_ID]: items.length ? { instances: { dataVersion: 3, items } } : {} },
    tokens: collection(tokens),
    setFlag: vi.fn(async (_namespace: string, key: string, value: unknown) => {
      (scene.flags as Record<string, Record<string, unknown>>)[MODULE_ID]![key] = value;
    }),
  };
  return scene;
}

function makeEnv(options: { isGM?: boolean; isActiveGM?: boolean } = {}) {
  const isGM = options.isGM ?? true;
  const isActiveGM = options.isActiveGM ?? isGM;
  const hookHandlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
  const hookCalls: { hook: string; args: unknown[] }[] = [];
  const socketHandlers = new Map<string, ((raw: unknown, senderId: string) => void)[]>();
  const socketEmits: { event: string; data: unknown }[] = [];
  const registeredSettings = new Map<string, Record<string, unknown>>();
  const registeredMenus = new Map<string, Record<string, unknown>>();
  const settingsData = new Map<string, unknown>();
  const notifications = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const instances = new Map<string, ApplicationV2Instance>();

  class ApplicationV2Stub {
    async render() {
      return this;
    }
  }

  const actors = collection<ReturnType<typeof makeActor>>();
  const scenes = collection<Record<string, unknown>>();
  const users = collection([
    [GM_USER, { id: GM_USER, isGM: true, isActiveGM, query: vi.fn() }],
    [PLAYER_USER, { id: PLAYER_USER, isGM: false, isActiveGM: false, query: vi.fn() }],
  ]);

  let nextId = 1;
  const env = {
    game: {
      modules: new Map(),
      user: isGM ? users.get(GM_USER)! : users.get(PLAYER_USER)!,
      users,
      scenes,
      actors,
      combats: collection(),
      playlists: { contents: [], get: () => undefined },
      time: { serverTime: 1234 },
      i18n: {
        localize: (key: string) => `L:${key}`,
        format: (key: string) => `F:${key}`,
      },
      socket: {
        on: (event: string, cb: (raw: unknown, senderId: string) => void) => {
          const list = socketHandlers.get(event) ?? [];
          list.push(cb);
          socketHandlers.set(event, list);
        },
        emit: (event: string, data: unknown) => socketEmits.push({ event, data }),
      },
      settings: {
        register: (_mod: string, key: string, cfg: Record<string, unknown>) => {
          registeredSettings.set(key, cfg);
          if (!settingsData.has(key) && "default" in cfg) settingsData.set(key, cfg.default);
        },
        registerMenu: (_mod: string, key: string, cfg: Record<string, unknown>) => {
          registeredMenus.set(key, cfg);
        },
        get: (_mod: string, key: string) => settingsData.get(key),
        set: vi.fn(async (_mod: string, key: string, value: unknown) => {
          settingsData.set(key, value);
        }),
      },
    },
    canvas: { scene: null as unknown as SceneDocument | null },
    Hooks: {
      once: vi.fn(() => 0),
      on: (hook: string, cb: (...args: unknown[]) => unknown) => {
        const list = hookHandlers.get(hook) ?? [];
        list.push(cb);
        hookHandlers.set(hook, list);
        return list.length;
      },
      off: vi.fn(),
      call: (hook: string, ...args: unknown[]) => {
        hookCalls.push({ hook, args });
        for (const fn of hookHandlers.get(hook) ?? []) {
          if (fn(...args) === false) return false;
        }
        return true;
      },
      callAll: (hook: string, ...args: unknown[]) => {
        hookCalls.push({ hook, args });
        for (const fn of hookHandlers.get(hook) ?? []) fn(...args);
        return true;
      },
    },
    foundry: {
      applications: {
        api: { ApplicationV2: ApplicationV2Stub },
        instances,
      },
      utils: {
        isNewerVersion: () => false,
        randomID: () => `Inst${String(nextId++).padStart(12, "0")}`,
      },
    },
    ui: { notifications },
    CONFIG: { statusEffects: [], specialStatusEffects: { DEFEATED: "dead" } },
  } as unknown as FoundryEnv;

  return {
    env,
    hookHandlers,
    hookCalls,
    socketHandlers,
    socketEmits,
    registeredSettings,
    registeredMenus,
    settingsData,
    notifications,
    instances,
    actors,
    scenes,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings over FoundryEnv", () => {
  it("registers all module settings/menus, prunes collapsed ids, and falls back on newer ranks", async () => {
    const { env, registeredSettings, registeredMenus, settingsData } = makeEnv();
    const onChange = vi.fn();
    const openRanks = vi.fn();
    const openLibrary = vi.fn();

    registerSettings(onChange, openRanks, openLibrary, env);
    expect([...registeredSettings.keys()]).toEqual([
      "collapsed",
      "playersMayCollapse",
      "clientLayout",
      "layout",
      "library",
      "music",
      "ranks",
    ]);
    expect([...registeredMenus.keys()]).toEqual(["ranksMenu", "libraryMenu"]);

    (registeredSettings.get("library")!.onChange as () => void)();
    expect(onChange).toHaveBeenCalledTimes(1);

    const RanksMenu = registeredMenus.get("ranksMenu")!.type as new () => ApplicationV2Instance;
    const LibraryMenu = registeredMenus.get("libraryMenu")!.type as new () => ApplicationV2Instance;
    await new RanksMenu().render();
    await new LibraryMenu().render();
    expect(openRanks).toHaveBeenCalledOnce();
    expect(openLibrary).toHaveBeenCalledOnce();

    settingsData.set("collapsed", { [SCENE]: ["bar-a", "stale"] });
    await setCollapsed(SCENE, "bar-b", true, ["bar-a", "bar-b"], env);
    expect([...collapsedIds(SCENE, env)]).toEqual(["bar-a", "bar-b"]);
    await setCollapsed(SCENE, "bar-a", false, ["bar-a", "bar-b"], env);
    expect([...collapsedIds(SCENE, env)]).toEqual(["bar-b"]);

    settingsData.set("ranks", { dataVersion: 999, items: [] });
    expect(currentRanks(env).length).toBeGreaterThan(0);
    expect(currentRanks(env)[0]!.name).toContain("L:BB5E.Ranks.Default.");
  });
});

describe("hooks over FoundryEnv", () => {
  it("emits show, phaseChange (omitting id for players), quote, hide, and defeated transitions", () => {
    const { env, hookHandlers, hookCalls, actors, scenes } = makeEnv({ isGM: false });
    const actor = makeActor(ACTOR, bossProfile());
    actors.set(ACTOR, actor);
    const scene = makeScene(SCENE);
    const hiddenToken = makeToken(TOKEN_A, scene, actor, true);
    const visibleToken = makeToken(TOKEN_B, scene, actor, false);
    (scene.tokens as Map<string, ReturnType<typeof makeToken>>).set(TOKEN_A, hiddenToken);
    scenes.set(SCENE, scene);

    const subscribers: ((snapshot: WorldSnapshot, previous: WorldSnapshot | null) => void)[] = [];
    const hud = {
      refresh: vi.fn(),
      subscribe: (listener: (snapshot: WorldSnapshot, previous: WorldSnapshot | null) => void) => {
        subscribers.push(listener);
        return () => undefined;
      },
    };
    startHookEvents(hud, env);

    const updateScene = hookHandlers.get("updateScene")![0]!;

    // Hidden token: players hear nothing on show.
    (scene.flags as Record<string, Record<string, unknown>>)[MODULE_ID]!.instances = {
      dataVersion: 3,
      items: [{ id: INSTANCE, kind: "boss", tokenId: TOKEN_A, phase: { id: "start", mark: 100 }, order: 1 }],
    };
    updateScene(scene);
    expect(hookCalls).toEqual([]);

    // Visible token: emits show, then phaseChange (omitting id for players) + quote, then hide when removed.
    (scene.tokens as Map<string, ReturnType<typeof makeToken>>).set(TOKEN_B, visibleToken);
    (scene.flags as Record<string, Record<string, unknown>>)[MODULE_ID]!.instances = {
      dataVersion: 3,
      items: [
        { id: INSTANCE, kind: "boss", tokenId: TOKEN_A, phase: { id: "start", mark: 100 }, order: 1 },
        {
          id: "Inst000000000002",
          kind: "boss",
          tokenId: TOKEN_B,
          phase: { id: "start", mark: 100 },
          order: 2,
        },
      ],
    };
    updateScene(scene);
    (scene.flags as Record<string, Record<string, unknown>>)[MODULE_ID]!.instances = {
      dataVersion: 3,
      items: [
        { id: INSTANCE, kind: "boss", tokenId: TOKEN_A, phase: { id: "start", mark: 100 }, order: 1 },
        {
          id: "Inst000000000002",
          kind: "boss",
          tokenId: TOKEN_B,
          phase: { id: "phase-2", mark: 50 },
          quote: { key: "say-1", text: "Run!", priority: 1, at: 1000, duration: 5 },
          order: 2,
        },
      ],
    };
    updateScene(scene);
    (scene.tokens as Map<string, ReturnType<typeof makeToken>>).delete(TOKEN_B);
    (scene.flags as Record<string, Record<string, unknown>>)[MODULE_ID]!.instances = {
      dataVersion: 3,
      items: [{ id: INSTANCE, kind: "boss", tokenId: TOKEN_A, phase: { id: "start", mark: 100 }, order: 1 }],
    };
    updateScene(scene);
    expect(hookCalls.map((call) => call.hook)).toEqual([
      `${MODULE_ID}.show`,
      `${MODULE_ID}.phaseChange`,
      `${MODULE_ID}.quote`,
      `${MODULE_ID}.hide`,
    ]);
    expect(hookCalls[1]!.args[0]).toMatchObject({
      id: "Inst000000000002",
      phase: { label: "Fury" },
    });
    expect((hookCalls[1]!.args[0] as { phase: Record<string, unknown> }).phase).not.toHaveProperty("id");

    // WorldSnapshot defeated transition emits defeated once after baseline.
    const emitSnapshot = (defeated: boolean) => {
      const entry = {
        scene: scene as unknown as SceneDocument,
        subject: {
          instance: { id: "Inst000000000002", kind: "boss" as const, tokenId: TOKEN_B, order: 1 },
          name: "Strahd",
          actorImg: "strahd.webp",
          tokens: [],
          profile: bossProfile() as never,
          statuses: [],
        },
        total: {
          hp: { value: defeated ? 0 : 50, max: 100, temp: 0, effectiveMax: 100 },
          count: 1,
          tokens: [],
          hidden: false,
          defeated,
        },
        defeated,
      };
      for (const listener of subscribers) {
        listener(
          {
            isGM: false,
            isActiveGM: false,
            viewedSceneId: SCENE,
            activeSceneId: SCENE,
            layout: DEFAULT_LAYOUT,
            uiScale: 1,
            viewedViews: {
              bosses: [],
              elites: [],
              eliteOverflow: 0,
              column: { canCollapse: false, collapsed: false, total: 0 },
            },
            scenes: new Map(),
            allEntries: [entry],
            activeEntries: [entry],
          },
          null,
        );
      }
    };
    emitSnapshot(false);
    emitSnapshot(true);
    emitSnapshot(true);
    expect(hookCalls.filter((c) => c.hook === `${MODULE_ID}.defeated`)).toEqual([
      {
        hook: `${MODULE_ID}.defeated`,
        args: [{ id: "Inst000000000002", sceneId: SCENE, kind: "boss" }],
      },
    ]);
  });
});

describe("entry points over FoundryEnv", () => {
  it("wires GM HUD button, actor sheet control, and scene control while hiding UI from players", async () => {
    const gm = makeEnv({ isGM: true });
    const openProfile = vi.fn();
    const openPanel = vi.fn();
    registerEntryPoints({ openProfile, openPanel }, gm.env);

    const noProfileActor = makeActor("Actor00000000002", null);
    const scene = makeScene(SCENE);
    const token = makeToken(TOKEN_A, scene, noProfileActor);
    (scene.tokens as Map<string, ReturnType<typeof makeToken>>).set(TOKEN_A, token);
    gm.scenes.set(SCENE, scene);

    const hudEl = document.createElement("div");
    hudEl.innerHTML = '<div class="col right"></div>';
    const hudApp = { document: token, render: vi.fn() };
    gm.hookHandlers.get("renderTokenHUD")![0]!(hudApp, hudEl);

    const button = hudEl.querySelector<HTMLButtonElement>(".bb5e-hud-button")!;
    expect(button).toBeTruthy();
    button.click();
    expect(openProfile).toHaveBeenCalledWith(noProfileActor);
    button.dispatchEvent(new MouseEvent("contextmenu", { cancelable: true }));
    expect(openProfile).toHaveBeenCalledTimes(2);

    const controls: Record<string, unknown>[] = [];
    gm.hookHandlers.get("getHeaderControlsActorSheetV2")![0]!(
      { document: { ...noProfileActor, type: "character" } },
      controls,
    );
    expect(controls).toHaveLength(1);
    (controls[0]!.onClick as () => void)();
    expect(openProfile).toHaveBeenCalledTimes(3);

    const sceneControls = { tokens: { tools: {} as Record<string, Record<string, unknown>> } };
    gm.hookHandlers.get("getSceneControlButtons")![0]!(sceneControls);
    expect(sceneControls.tokens.tools.bb5eActiveBosses!.visible).toBe(true);
    (sceneControls.tokens.tools.bb5eActiveBosses!.onChange as () => void)();
    expect(openPanel).toHaveBeenCalledOnce();

    // Players see neither the button, actor control, nor visible scene tool.
    const player = makeEnv({ isGM: false });
    registerEntryPoints({ openProfile, openPanel }, player.env);
    const playerEl = document.createElement("div");
    playerEl.innerHTML = '<div class="col right"></div>';
    player.hookHandlers.get("renderTokenHUD")![0]!(hudApp, playerEl);
    expect(playerEl.querySelector(".bb5e-hud-button")).toBeNull();
    const pControls: Record<string, unknown>[] = [];
    player.hookHandlers.get("getHeaderControlsActorSheetV2")![0]!(
      { document: { ...noProfileActor, type: "npc" } },
      pControls,
    );
    expect(pControls).toHaveLength(0);
    const pSceneControls = { tokens: { tools: {} as Record<string, Record<string, unknown>> } };
    player.hookHandlers.get("getSceneControlButtons")![0]!(pSceneControls);
    expect(pSceneControls.tokens.tools.bb5eActiveBosses!.visible).toBe(false);
  });
});

describe("public api and effect socket over FoundryEnv", () => {
  it("validates GM calls, resolves phases/quotes/actor mode, and filters socket effects", async () => {
    const gm = makeEnv({ isGM: true });
    const host = {
      play: vi.fn(),
      openEditor: vi.fn(async () => undefined),
      openPanel: vi.fn(async () => undefined),
      openLayout: vi.fn(async () => undefined),
    };
    const api = createApi(host, gm.env);
    listenEffects(host, gm.env);

    const actor = makeActor(ACTOR, bossProfile({ displayMode: "actor" }));
    gm.actors.set(ACTOR, actor);
    const scene = makeScene(SCENE);
    const t1 = makeToken(TOKEN_A, scene, actor);
    const t2 = makeToken(TOKEN_B, scene, actor);
    (scene.tokens as Map<string, ReturnType<typeof makeToken>>).set(TOKEN_A, t1);
    (scene.tokens as Map<string, ReturnType<typeof makeToken>>).set(TOKEN_B, t2);
    gm.scenes.set(SCENE, scene);
    (gm.env.canvas as { scene: unknown }).scene = scene;

    // Showing an actor-linked profile with two tokens creates only one bar.
    await api.show(actor as unknown as ActorDocument);
    const storedAfterShow = (scene.flags as Record<string, { instances?: { items: { id: string }[] } }>)[
      MODULE_ID
    ]!.instances!.items;
    expect(storedAfterShow).toHaveLength(1);
    const barId = storedAfterShow[0]!.id;

    // 1-based phase lookup & quote lookup
    await api.setPhase(barId, 2);
    await api.say(barId, "quote-1");
    const updated = (scene.flags as Record<string, { instances?: { items: Record<string, unknown>[] } }>)[
      MODULE_ID
    ]!.instances!.items[0]!;
    expect(updated.phase).toMatchObject({ id: "phase-2" });
    expect(updated.quote).toMatchObject({ text: "Perish!" });
    await expect(api.setPhase(barId, 99)).rejects.toMatchObject({ code: "BB5E.Error.NoSuchPhase" });

    // getActive returns frozen snapshot; playEffect broadcasts valid effect
    const active = api.getActive();
    expect(Object.isFrozen(active)).toBe(true);
    expect(active).toHaveLength(1);
    await api.playEffect(barId, "damage");
    expect(gm.socketEmits).toHaveLength(1);
    expect(host.play).toHaveBeenCalledWith({
      type: "effect",
      sceneId: SCENE,
      instanceId: barId,
      effect: "damage",
    });

    // layoutMode opens when absent and closes when present
    expect(await api.layoutMode()).toBe(true);
    expect(host.openLayout).toHaveBeenCalledOnce();
    const fakePanel = { close: vi.fn(async () => undefined) } as unknown as ApplicationV2Instance;
    gm.instances.set("bb5e-layout", fakePanel);
    expect(await api.layoutMode()).toBe(false);
    expect(fakePanel.close).toHaveBeenCalledOnce();

    // Socket listener ignores non-GM or malformed messages, plays valid GM effects
    const onSocket = gm.socketHandlers.get(`module.${MODULE_ID}`)![0]!;
    onSocket({ type: "effect", sceneId: SCENE, instanceId: barId, effect: "heal" }, PLAYER_USER);
    onSocket({ bad: true }, GM_USER);
    expect(host.play).toHaveBeenCalledTimes(1);
    onSocket({ type: "effect", sceneId: SCENE, instanceId: barId, effect: "heal" }, GM_USER);
    expect(host.play).toHaveBeenCalledTimes(2);

    // Non-GM client is refused by guard; getActive respects hidden tokens
    const player = makeEnv({ isGM: false });
    const playerApi = createApi(host, player.env);
    await expect(playerApi.openPanel()).rejects.toMatchObject({ code: "BB5E.Error.NotGM" });
    t1.hidden = true;
    t2.hidden = true;
    player.actors.set(ACTOR, actor);
    player.scenes.set(SCENE, scene);
    expect(playerApi.getActive(SCENE)).toEqual([]);

    // Sanity check live store works smoothly with fake env
    const hud = startStore(vi.fn(), gm.env);
    hud.refresh();
    await Promise.resolve();
  });
});
