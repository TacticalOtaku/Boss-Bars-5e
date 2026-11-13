// @vitest-environment happy-dom
import { readFileSync, readdirSync } from "node:fs";
import Handlebars from "handlebars";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID } from "../src/constants";
import { defaultProfile } from "../src/core/profile";
import type { hostLibrary as HostLibrary } from "../src/apps/library";
import type { hostRanksEditor as HostRanksEditor } from "../src/apps/ranks-editor";
import type { openHub as OpenHub } from "../src/apps/hub";
import type { openLayoutPanel as OpenLayoutPanel } from "../src/apps/layout-panel";

const handlebars = Handlebars.create();
handlebars.registerHelper("localize", (key: string) => key);
for (const file of readdirSync("templates").filter((name) => name.endsWith(".hbs"))) {
  handlebars.registerPartial(
    `modules/${MODULE_ID}/templates/${file}`,
    readFileSync(`templates/${file}`, "utf8"),
  );
}

class FormDataExtended {
  object: Record<string, unknown> = {};
  constructor(form: HTMLFormElement) {
    for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "[name]",
    )) {
      if (field.disabled || (field instanceof HTMLInputElement && field.type === "radio" && !field.checked))
        continue;
      this.object[field.getAttribute("name")!] =
        field instanceof HTMLInputElement && field.type === "checkbox"
          ? field.checked
          : field instanceof HTMLInputElement && (field.type === "number" || field.type === "range")
            ? field.value === ""
              ? null
              : Number(field.value)
            : (field.value ?? field.getAttribute("value") ?? "");
    }
  }
}

function expandObject(flat: Record<string, unknown>) {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let row = root;
    for (const part of parts.slice(0, -1)) row = (row[part] ??= {}) as Record<string, unknown>;
    row[parts.at(-1)!] = value;
  }
  return root;
}

const instances = new Map<string, ApplicationStub>();

class ApplicationStub {
  static DEFAULT_OPTIONS: {
    id?: string;
    tag?: string;
    classes?: string[];
    form?: {
      handler?: (
        this: ApplicationStub,
        event: Event,
        form: HTMLFormElement,
        data: FormDataExtended,
      ) => unknown;
    };
    actions?: Record<string, (this: ApplicationStub, event: Event, target: HTMLElement) => unknown>;
  } = {};
  static PARTS: Record<string, { template: string }> = {};
  element: HTMLElement;
  rendered = false;
  state = 0;

  constructor(options: { id?: string } = {}) {
    const ctor = this.constructor as typeof ApplicationStub;
    this.element = document.createElement(ctor.DEFAULT_OPTIONS?.tag ?? "div");
    this.element.id = options.id ?? ctor.DEFAULT_OPTIONS?.id ?? "";
  }

  bringToFront() {}
  changeTab(_tab: string, _group: string) {
    void _tab;
    void _group;
  }
  async _prepareContext(_options: Record<string, unknown>): Promise<Record<string, unknown>> {
    void _options;
    return {};
  }
  async _preRender(_context: Record<string, unknown>, _options: Record<string, unknown>) {
    void _context;
    void _options;
  }
  async _onFirstRender(_context: Record<string, unknown>, _options: Record<string, unknown>) {
    void _context;
    void _options;
  }
  async _onRender(_context: Record<string, unknown>, _options: Record<string, unknown>) {
    void _context;
    void _options;
  }
  _onClose(_options: Record<string, unknown>) {
    void _options;
  }
  async _insertElement(element: HTMLElement) {
    document.body.append(element);
  }

  async render(options: Record<string, unknown> = {}) {
    const isFirstRender = !this.rendered;
    const context = await this._prepareContext(options);
    await this._preRender(context, options);
    const parts = (this.constructor as typeof ApplicationStub).PARTS;
    const selected = options.parts as string[] | undefined;
    for (const [id, part] of Object.entries(parts)) {
      if (id === "tabs" || (selected && !selected.includes(id))) continue;
      const path = part.template.replace(`modules/${MODULE_ID}/`, "");
      const holder = document.createElement("template");
      holder.innerHTML = handlebars.compile(readFileSync(path, "utf8"))({ ...context, partId: id });
      const section = holder.content.firstElementChild!;
      for (const select of section.querySelectorAll("select")) {
        select.value =
          select.querySelector<HTMLOptionElement>("option[selected]")?.value ??
          select.options[0]?.value ??
          "";
      }
      section.setAttribute("data-part", id);
      const old = this.element.querySelector(`[data-part="${id}"]`);
      if (old) old.replaceWith(section);
      else this.element.append(section);
    }
    if (isFirstRender) await this._insertElement(this.element);
    this.rendered = true;
    if (this.element.id) instances.set(this.element.id, this);
    const renderOpts = { ...options, isFirstRender };
    if (isFirstRender) await this._onFirstRender(context, renderOpts);
    await this._onRender(context, renderOpts);
    return this;
  }

  async close(options: Record<string, unknown> = {}) {
    this._onClose(options);
    if (this.element.id) instances.delete(this.element.id);
    this.element.remove();
    this.rendered = false;
    return this;
  }
}

let settingsStore: Map<string, unknown>;
let settingsSet: ReturnType<typeof vi.fn>;
let hookHandlers: Map<string, ((...args: unknown[]) => void)[]>;
let confirmMock: ReturnType<typeof vi.fn>;
let saveDataToFileMock: ReturnType<typeof vi.fn>;
let readTextFromFileMock: ReturnType<typeof vi.fn>;
let notifications: {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

let openHub: typeof OpenHub;
let hostRanksEditor: typeof HostRanksEditor;
let hostLibrary: typeof HostLibrary;
let openLayoutPanel: typeof OpenLayoutPanel;

function collection<T>(entries: [string, T][] = []) {
  const map = new Map(entries);
  return Object.assign(map, {
    some: (fn: (value: T) => boolean) => [...map.values()].some(fn),
    filter: (fn: (value: T) => boolean) => [...map.values()].filter(fn),
    find: (fn: (value: T) => boolean) => [...map.values()].find(fn),
  });
}

beforeEach(async () => {
  vi.resetModules();
  instances.clear();
  settingsStore = new Map();
  hookHandlers = new Map();
  confirmMock = vi.fn().mockResolvedValue(false);
  saveDataToFileMock = vi.fn();
  readTextFromFileMock = vi.fn().mockResolvedValue("");
  notifications = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  settingsSet = vi.fn(async (_mod: string, key: string, value: unknown) => {
    settingsStore.set(key, value);
  });

  let nextId = 1;
  const actor = {
    id: "Actor00000000001",
    name: "Strahd",
    img: "strahd.webp",
    type: "npc",
    isToken: false,
    flags: { [MODULE_ID]: { profile: defaultProfile("boss") } },
    items: [],
  };
  const scene = {
    id: "Scene00000000001",
    flags: { [MODULE_ID]: {} },
    tokens: collection(),
  };

  vi.stubGlobal("foundry", {
    applications: {
      api: {
        ApplicationV2: ApplicationStub,
        HandlebarsApplicationMixin: (base: typeof ApplicationStub) => base,
        DialogV2: { confirm: confirmMock },
      },
      ux: { FormDataExtended },
      instances,
    },
    utils: {
      expandObject,
      randomID: () => `Rand${String(nextId++).padStart(12, "0")}`,
      escapeHTML: (value: string) => value,
      saveDataToFile: saveDataToFileMock,
      readTextFromFile: readTextFromFileMock,
      isNewerVersion: () => false,
    },
  });

  vi.stubGlobal("game", {
    user: { isGM: true, isActiveGM: true },
    actors: collection([[actor.id, actor]]),
    scenes: collection([[scene.id, scene]]),
    playlists: { contents: [] },
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    settings: {
      get: (_mod: string, key: string) => settingsStore.get(key) ?? {},
      set: settingsSet,
    },
  });
  vi.stubGlobal("canvas", { scene, tokens: { controlled: [] } });
  vi.stubGlobal("CONFIG", { statusEffects: [] });
  vi.stubGlobal("ui", { notifications });
  vi.stubGlobal("Hooks", {
    on: (hook: string, cb: (...args: unknown[]) => void) => {
      const list = hookHandlers.get(hook) ?? [];
      list.push(cb);
      hookHandlers.set(hook, list);
      return list.length;
    },
    off: vi.fn(),
  });

  ({ openHub } = await import("../src/apps/hub"));
  ({ hostRanksEditor } = await import("../src/apps/ranks-editor"));
  ({ hostLibrary } = await import("../src/apps/library"));
  ({ openLayoutPanel } = await import("../src/apps/layout-panel"));
});

afterEach(async () => {
  for (const app of [...instances.values()]) await app.close({ force: true });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RanksEditor live library refresh", () => {
  it("picks up newly saved looks on re-render without reconstructing the editor", async () => {
    const slot = document.createElement("div");
    document.body.append(slot);
    const editor = hostRanksEditor(slot) as unknown as ApplicationStub;
    await editor.render();

    const beforeIds = [
      ...editor.element.querySelectorAll<HTMLOptionElement>('[data-field="look"] option'),
    ].map((o) => o.value);
    expect(beforeIds).not.toContain("custom-crimson");

    settingsStore.set("library", {
      dataVersion: 1,
      looks: [
        {
          id: "custom-crimson",
          name: "Crimson Look",
          presets: {
            frame: "classic-frame",
            fill: "classic-fill",
            portrait: "classic-portrait",
            title: "classic-title",
            vfx: "classic-vfx",
          },
        },
      ],
      presets: [],
    });
    await editor.render();

    const afterIds = [
      ...editor.element.querySelectorAll<HTMLOptionElement>('[data-field="look"] option'),
    ].map((o) => o.value);
    expect(afterIds).toContain("custom-crimson");
  });
});

describe("Hub, DirtyGuard, LibraryApp, and LayoutPanel", () => {
  it("mounts sections into slot, guards unsaved closes via DOM connection check, and imports/exports settings", async () => {
    const hud = { refresh: vi.fn(), subscribe: () => () => undefined };
    const openLayout = vi.fn();
    openHub({ hud, openLayout }, "ranks");
    await vi.waitFor(() => expect(instances.get("bb5e-hub")?.rendered).toBe(true));

    const hub = instances.get("bb5e-hub")!;
    const ranksEl = hub.element.querySelector(".bb5e-hub__slot [data-part]")?.closest("form");
    expect(ranksEl?.id).toBe("bb5e-ranks");
    expect(ranksEl?.isConnected).toBe(true);

    // Edit rank name -> dirty badge shows -> closing hub asks confirmation once and respects cancel/confirm.
    const nameInput = ranksEl!.querySelector<HTMLInputElement>('[data-field="name"]')!;
    nameInput.value = "Overlord";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(ranksEl!.querySelector<HTMLElement>(".bb5e-footer__dirty")!.hidden).toBe(false);

    confirmMock.mockResolvedValueOnce(false);
    await hub.close();
    expect(confirmMock).toHaveBeenCalledOnce();
    expect(hub.rendered).toBe(true);

    // Simulate Foundry transient RENDERING state while element stays connected: updateActor leaves section intact.
    const child = instances.get("bb5e-ranks")!;
    child.rendered = false;
    hookHandlers.get("updateActor")?.forEach((fn) => fn());
    await Promise.resolve();
    expect(instances.get("bb5e-hub")?.rendered).toBe(true);

    // Export settings writes downloadable JSON via shared helper.
    const hubActions = (hub.constructor as typeof ApplicationStub).DEFAULT_OPTIONS.actions!;
    await hubActions.exportSettings!.call(hub, new Event("click"), hub.element);
    expect(saveDataToFileMock).toHaveBeenCalledWith(
      expect.stringContaining('"dataVersion"'),
      "application/json",
      "boss-bars-5e-settings.json",
    );

    // Discard edits and close cleanly.
    confirmMock.mockResolvedValueOnce(true);
    await hub.close();
    expect(hub.rendered).toBe(false);
  });

  it("supports LibraryApp copy, dirty guard, and saving to world settings", async () => {
    const slot = document.createElement("div");
    document.body.append(slot);
    const app = hostLibrary(slot) as unknown as ApplicationStub;
    await app.render();

    const copyBtn = app.element.querySelector<HTMLElement>('[data-action="copy"]')!;
    const opts = (app.constructor as typeof ApplicationStub).DEFAULT_OPTIONS;
    await opts.actions!.copy!.call(app, new Event("click"), copyBtn);
    expect(app.element.querySelector<HTMLElement>(".bb5e-footer__dirty")!.hidden).toBe(false);

    await opts.form!.handler!.call(
      app,
      new Event("submit"),
      app.element as HTMLFormElement,
      new FormDataExtended(app.element as HTMLFormElement),
    );
    expect(settingsSet).toHaveBeenCalledWith(
      MODULE_ID,
      "library",
      expect.objectContaining({
        looks: expect.arrayContaining([expect.objectContaining({ id: "Rand000000000001" })]),
      }),
    );
    expect(app.element.querySelector<HTMLElement>(".bb5e-footer__dirty")!.hidden).toBe(true);
  });

  it("tracks LayoutPanel draft edits and resets draft on discard", async () => {
    const hud = { refresh: vi.fn(), subscribe: () => () => undefined };
    openLayoutPanel({ hud });
    await vi.waitFor(() => expect(instances.get("bb5e-layout")?.rendered).toBe(true));
    const panel = instances.get("bb5e-layout")!;

    const maxInput = panel.element.querySelector<HTMLInputElement>('[data-field="max"]')!;
    maxInput.value = "5";
    maxInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(hud.refresh).toHaveBeenCalled();

    confirmMock.mockResolvedValueOnce(true);
    await panel.close();
    expect(panel.rendered).toBe(false);
    expect(hud.refresh).toHaveBeenCalledTimes(2);
  });

  it("imports settings JSON through pickJsonText in Hub", async () => {
    const hud = { refresh: vi.fn(), subscribe: () => () => undefined };
    openHub({ hud, openLayout: vi.fn() }, "scene");
    await vi.waitFor(() => expect(instances.get("bb5e-hub")?.rendered).toBe(true));

    const hub = instances.get("bb5e-hub")!;
    const hubActions = (hub.constructor as typeof ApplicationStub).DEFAULT_OPTIONS.actions!;
    let createdInput: HTMLInputElement | null = null;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "input") {
        createdInput = el as HTMLInputElement;
        vi.spyOn(createdInput, "click").mockImplementation(() => {
          Object.defineProperty(createdInput, "files", { value: [new File(["{}"], "settings.json")] });
          createdInput!.dispatchEvent(new Event("change"));
        });
      }
      return el;
    });

    readTextFromFileMock.mockResolvedValueOnce(
      JSON.stringify({ kind: "boss-bars-5e-settings", dataVersion: 1, settings: {} }),
    );
    confirmMock.mockResolvedValueOnce(true);
    await hubActions.importSettings!.call(hub, new Event("click"), hub.element);
    await vi.waitFor(() =>
      expect(notifications.info).toHaveBeenCalledWith("BB5E.SettingsFile.Imported", { localize: true }),
    );
    expect(createdInput).not.toBeNull();
  });
});
