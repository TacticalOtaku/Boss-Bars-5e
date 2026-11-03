// @vitest-environment happy-dom
import { readFileSync, readdirSync } from "node:fs";
import Handlebars from "handlebars";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProfile } from "../src/core/profile";
import { MODULE_ID } from "../src/constants";
import type { hostProfileEditor as HostProfileEditor } from "../src/apps/profile-editor";

const handlebars = Handlebars.create();
handlebars.registerHelper("localize", (key: string) => key);
for (const file of readdirSync("templates").filter((file) => file.endsWith(".hbs"))) {
  handlebars.registerPartial(
    `modules/${MODULE_ID}/templates/${file}`,
    readFileSync(`templates/${file}`, "utf8"),
  );
}

/** Foundry's external flat form representation, including checkbox and numeric conversions. */
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
            : field.tagName === "RANGE-PICKER"
              ? Number(field.getAttribute("value"))
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

type Action = (this: ApplicationStub, event: Event, target: HTMLElement) => Promise<unknown>;
class ApplicationStub {
  static DEFAULT_OPTIONS: {
    form: {
      handler: (
        this: ApplicationStub,
        event: Event,
        form: HTMLFormElement,
        data: FormDataExtended,
      ) => Promise<unknown>;
    };
    actions: Record<string, Action>;
  };
  static PARTS: Record<string, { template: string }>;
  element = document.createElement("form");
  rendered = false;
  activeTab = "main";
  async _prepareContext(_options: Record<string, unknown>): Promise<Record<string, unknown>> {
    void _options;
    return {};
  }
  async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    void context;
    void options;
  }
  async _insertElement(element: HTMLElement) {
    document.body.append(element);
  }
  async render(options: Record<string, unknown> = {}) {
    const context = await this._prepareContext(options);
    const parts = (this.constructor as typeof ApplicationStub).PARTS;
    const selected = options.parts as string[] | undefined;
    for (const [id, part] of Object.entries(parts)) {
      if (id === "tabs" || (selected && !selected.includes(id))) continue;
      const path = part.template.replace(`modules/${MODULE_ID}/`, "");
      const holder = document.createElement("template");
      holder.innerHTML = handlebars.compile(readFileSync(path, "utf8"))({ ...context, partId: id });
      const section = holder.content.firstElementChild!;
      // happy-dom does not initialize selects parsed in a template like the browser does.
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
    await this._insertElement(this.element);
    await this._onRender(context, { ...options, isFirstRender: !this.rendered });
    this.rendered = true;
    return this;
  }
  changeTab(tab: string, _group: string) {
    void _group;
    this.activeTab = tab;
  }
  async close(_options: Record<string, unknown> = {}) {
    void _options;
    this.element.remove();
    this.rendered = false;
    return this;
  }
}
const music = {
  type: "sound",
  playlistId: "Playlist00000001",
  soundId: "Sound00000000001",
  playlistName: "Home playlist",
  soundName: "Home track",
};
const rawProfile = () => ({
  ...defaultProfile("boss"),
  rank: "home-rank",
  music,
  futureProfile: { version: 5 },
  miniBars: [
    {
      id: "charges",
      label: "Charges",
      view: "bar",
      players: true,
      source: { type: "item", itemId: "Item000000000001" },
    },
  ],
  phases: [
    { id: "start", label: "", trigger: { type: "start" }, enter: {} },
    {
      id: "form",
      label: "Form",
      trigger: { type: "form", actorId: "Actor00000000001" },
      enter: { music, overrides: { frame: "home-frame" } },
      futurePhase: 42,
    },
    {
      id: "other",
      label: "Other",
      trigger: { type: "manual" },
      enter: { music: { ...music, soundId: "Sound00000000002", soundName: "Other track" } },
    },
  ],
});
let actor: {
  id: string;
  name: string;
  type: string;
  img: string;
  items: { id: string; name: string; hasLimitedUses: boolean }[];
  flags: Record<string, { profile: unknown }>;
  setFlag: ReturnType<typeof vi.fn>;
};
let notifications: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
let confirm: ReturnType<typeof vi.fn>;
let editor: ApplicationStub;
let hostProfileEditor: typeof HostProfileEditor;
const field = (name: string) =>
  editor.element.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
function edit(name: string, value: string) {
  const element = field(name);
  if (element instanceof HTMLInputElement && element.type === "radio") element.checked = true;
  else element.value = value;
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
async function action(name: string, index = 0, delta = 0) {
  const target = editor.element.querySelector<HTMLButtonElement>(
    `[data-action="${name}"]${name.startsWith("move") || name.startsWith("remove") ? `[data-index="${index}"]` : ""}${name.startsWith("move") ? `[data-delta="${delta}"]` : ""}`,
  )!;
  await (editor.constructor as typeof ApplicationStub).DEFAULT_OPTIONS.actions[name]!.call(
    editor,
    new Event("click"),
    target,
  );
}
async function submit() {
  await (editor.constructor as typeof ApplicationStub).DEFAULT_OPTIONS.form.handler.call(
    editor,
    new Event("submit"),
    editor.element,
    new FormDataExtended(editor.element),
  );
}
async function open(raw: unknown = rawProfile()) {
  actor.flags[MODULE_ID]!.profile = raw;
  const slot = document.createElement("div");
  document.body.append(slot);
  editor = hostProfileEditor(slot, actor as unknown as ActorDocument) as unknown as ApplicationStub;
  await editor.render();
}
beforeEach(async () => {
  notifications = { warn: vi.fn(), error: vi.fn() };
  confirm = vi.fn().mockResolvedValue(false);
  vi.stubGlobal("foundry", {
    applications: {
      api: {
        ApplicationV2: ApplicationStub,
        HandlebarsApplicationMixin: (base: typeof ApplicationStub) => base,
        DialogV2: { confirm },
      },
      ux: { FormDataExtended },
    },
    utils: { expandObject, randomID: () => "new-row-id" },
  });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    actors: { filter: () => [{ id: "Actor00000000002", name: "Other NPC" }] },
    playlists: { contents: [] },
    settings: { get: () => ({}) },
  });
  vi.stubGlobal("CONFIG", { statusEffects: [] });
  vi.stubGlobal("ui", { notifications });
  vi.stubGlobal("_replace", (value: unknown) => value);
  actor = {
    id: "Actor00000000003",
    name: "Boss",
    type: "npc",
    img: "",
    items: [{ id: "Item000000000002", name: "Other item", hasLimitedUses: true }],
    flags: { [MODULE_ID]: { profile: rawProfile() } },
    setFlag: vi.fn(async (namespace: string, key: string, value: unknown) => {
      if (namespace !== MODULE_ID || key !== "profile") throw new Error("wrong flag");
      actor.flags[MODULE_ID]!.profile = value;
    }),
  };
  ({ hostProfileEditor } = await import("../src/apps/profile-editor"));
});
afterEach(async () => {
  if (editor) await editor.close({ force: true });
  document.body.replaceChildren();
});

describe("hosted profile editor", () => {
  it("refuses invalid stored data without writing or discarding the edited form", async () => {
    await open();
    edit("playerName", "Unsaved name");
    actor.flags[MODULE_ID]!.profile = { kind: "unreadable", dataVersion: 2 };
    await submit();
    expect(actor.setFlag).not.toHaveBeenCalled();
    expect(field("playerName").value).toBe("Unsaved name");
    expect(notifications.error).toHaveBeenCalledWith("BB5E.Error.WriteFailed", { localize: true });
    await editor.close();
    expect(confirm).toHaveBeenCalledOnce();
    expect(editor.rendered).toBe(true);
  });
  it("preserves a stored boss look when an elite profile switches back to boss", async () => {
    await open({ ...rawProfile(), kind: "elite", look: "home-look", overrides: { frame: "home-frame" } });
    const boss = editor.element.querySelector<HTMLInputElement>('[name="kind"][value="boss"]')!;
    boss.checked = true;
    boss.dispatchEvent(new Event("change", { bubbles: true }));
    await action("addBar");
    await submit();
    expect(actor.flags[MODULE_ID]!.profile).toMatchObject({
      kind: "boss",
      rank: "home-rank",
      look: "home-look",
      overrides: { frame: "home-frame" },
      music,
      phases: [{ id: "start" }, { id: "form", futurePhase: 42, enter: { music } }, { id: "other" }],
    });
  });

  it("renders missing selections, keeps edits through row rerenders and reorder, and writes a whole lossless profile", async () => {
    await open();
    expect(field("rank").value).toBe("home-rank");
    expect(field("miniBars.0.source.itemId").value).toBe("Item000000000001");
    expect(field("phases.1.actorId").value).toBe("Actor00000000001");
    expect(field("phases.1.enter.overrides.frame").value).toBe("home-frame");
    expect(field("music").value).toBe("sound:Playlist00000001:Sound00000000001");
    expect(field("phases.1.enter.music").value).toBe("sound:Playlist00000001:Sound00000000001");
    edit("playerName", "<Edited boss>");
    edit("title", "Unbound");
    await action("addBar");
    await action("movePhase", 2, -1);
    expect(field("playerName").value).toBe("<Edited boss>");
    expect(field("phases.1.id").value).toBe("other");
    expect(field("phases.1.enter.music").textContent).toContain("Other track");
    expect(field("phases.2.id").value).toBe("form");
    expect(field("phases.2.enter.music").textContent).toContain("Home track");
    expect(field("phases.2.actorId").value).toBe("Actor00000000001");
    expect(field("phases.2.enter.overrides.frame").value).toBe("home-frame");
    expect(editor.element.querySelector("edited")).toBeNull();
    expect(editor.element.querySelector<HTMLElement>(".bb5e-footer__dirty")?.hidden).toBe(false);
    await submit();
    expect(actor.setFlag).toHaveBeenCalledOnce();
    expect(actor.flags[MODULE_ID]!.profile).toMatchObject({
      playerName: "<Edited boss>",
      title: "Unbound",
      rank: "home-rank",
      futureProfile: { version: 5 },
      music,
      miniBars: [
        { id: "charges", source: { type: "item", itemId: "Item000000000001" } },
        { id: "new-row-id", source: { type: "temp" } },
      ],
      phases: [
        { id: "start" },
        { id: "other", enter: { music: { soundName: "Other track" } } },
        {
          id: "form",
          futurePhase: 42,
          trigger: { type: "form", actorId: "Actor00000000001" },
          enter: { music, overrides: { frame: "home-frame" } },
        },
      ],
    });
    expect(editor.element.querySelector<HTMLElement>(".bb5e-footer__dirty")?.hidden).toBe(true);
    await editor.close();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps optional clears removed through rerender and save and removes deleted rows", async () => {
    await open();
    edit("music", "");
    edit("phases.1.enter.music", "");
    edit("phases.1.enter.overrides.frame", "");
    await action("removePhase", 2);
    await action("removeBar", 0);
    expect(field("music").value).toBe("");
    expect(field("phases.1.enter.music").value).toBe("");
    expect(field("phases.1.enter.overrides.frame").value).toBe("");
    await submit();
    expect(actor.setFlag).toHaveBeenCalledOnce();
    expect(actor.flags[MODULE_ID]!.profile).toMatchObject({
      music: null,
      miniBars: [],
      phases: [
        { id: "start", enter: {} },
        { id: "form", futurePhase: 42, enter: {} },
      ],
    });
    const saved = actor.flags[MODULE_ID]!.profile as { phases: { enter: unknown }[] };
    expect(saved.phases[1]?.enter).toEqual({});
  });

  it("keeps empty required fields and errors in the edited form without writing", async () => {
    await open();
    edit("playerName", "Unsaved validation draft");
    edit("phases.1.actorId", "");
    edit("miniBars.0.source.itemId", "");
    await submit();
    expect(actor.setFlag).not.toHaveBeenCalled();
    expect(field("playerName").value).toBe("Unsaved validation draft");
    expect(field("phases.1.actorId").value).toBe("");
    expect(field("miniBars.0.source.itemId").value).toBe("");
    expect(field("phases.1.actorId").getAttribute("aria-invalid")).toBe("");
    expect(
      editor.element.querySelector<HTMLElement>('[data-error-for="phases.1.actorId"]')?.textContent,
    ).toBe("BB5E.Error.NoFormActor");
    expect(
      editor.element.querySelector<HTMLElement>('[data-error-for="miniBars.0.source.itemId"]')?.hidden,
    ).toBe(false);
    const elite = editor.element.querySelector<HTMLInputElement>('[name="kind"][value="elite"]')!;
    elite.checked = true;
    elite.dispatchEvent(new Event("change", { bubbles: true }));
    edit("rank", "");
    await submit();
    expect(actor.setFlag).not.toHaveBeenCalled();
    expect(editor.element.querySelector<HTMLElement>('[data-error-for="rank"]')?.textContent).toBe(
      "BB5E.Error.NoRank",
    );
    expect(editor.activeTab).toBe("main");
    await editor.close();
    expect(confirm).toHaveBeenCalledOnce();
    expect(editor.rendered).toBe(true);
  });

  it("refuses newly stored newer data and retains the draft and dirty confirmation", async () => {
    await open();
    edit("playerName", "Newer draft");
    await action("addBar");
    actor.flags[MODULE_ID]!.profile = { ...rawProfile(), dataVersion: 999 };
    await submit();
    expect(actor.setFlag).not.toHaveBeenCalled();
    expect(field("playerName").value).toBe("Newer draft");
    expect(notifications.warn).toHaveBeenCalledWith("BB5E.Error.NewerData", { localize: true });
    await editor.close();
    expect(confirm).toHaveBeenCalledOnce();
    expect(editor.rendered).toBe(true);
  });
  it("keeps explicit look clears and an unsaved look selection through a row rerender", async () => {
    await open({ ...rawProfile(), look: "home-look", overrides: { frame: "home-frame" } });
    edit("overrides.frame", "");
    const pick =
      editor.element.querySelector<HTMLButtonElement>('[data-action="pickLook"][data-id="abyss"]') ??
      editor.element.querySelectorAll<HTMLButtonElement>('[data-action="pickLook"]')[1]!;
    const picked = pick.dataset.id!;
    await (editor.constructor as typeof ApplicationStub).DEFAULT_OPTIONS.actions.pickLook!.call(
      editor,
      new Event("click"),
      pick,
    );
    expect(
      editor.element
        .querySelector(`[data-action="pickLook"][data-id="${picked}"]`)
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    await action("addBar");
    await submit();
    expect(actor.flags[MODULE_ID]!.profile).toMatchObject({ look: picked, overrides: {} });
    expect((actor.flags[MODULE_ID]!.profile as { overrides: unknown }).overrides).toEqual({});
    // Picking the first (classic) look represents the explicit null/default selection.
    await action("pickLook");
    await submit();
    expect(actor.flags[MODULE_ID]!.profile).toMatchObject({ look: null, overrides: {} });
  });

  it("creates an absent profile and uses the current stored unknown fields at submission", async () => {
    await open(null);
    edit("playerName", "New boss");
    await submit();
    expect(actor.flags[MODULE_ID]!.profile).toMatchObject({
      kind: "boss",
      playerName: "New boss",
      phases: [],
      miniBars: [],
    });
    edit("title", "Current title");
    actor.flags[MODULE_ID]!.profile = {
      ...(actor.flags[MODULE_ID]!.profile as object),
      currentUnknown: { kept: true },
    };
    await submit();
    expect(actor.flags[MODULE_ID]!.profile).toMatchObject({
      title: "Current title",
      currentUnknown: { kept: true },
    });
  });
  it.each([
    { name: "unknown inactive music", phases: [], music: { unknown: true }, quotes: [] },
    { name: "null inactive lists", phases: null, music: "bad-music", quotes: null },
    {
      name: "malformed inactive rows",
      phases: [null, { id: "usable", trigger: null, enter: null }],
      music: { type: "sound", playlistId: "bad", soundId: [] },
      quotes: "bad-quotes",
    },
  ])(
    "opens and saves an elite with $name without rewriting its inactive fields",
    async ({ phases, music: inactiveMusic, quotes }) => {
      await open({ ...rawProfile(), kind: "elite", phases, music: inactiveMusic, quotes });
      expect(field("music").value).toBe("");
      expect(field("music").querySelector('option[value*="undefined"]')).toBeNull();
      edit("playerName", "Edited elite");
      await action("addBar");
      await submit();
      expect(actor.setFlag).toHaveBeenCalledOnce();
      expect(actor.flags[MODULE_ID]!.profile).toMatchObject({
        kind: "elite",
        playerName: "Edited elite",
        phases,
        music: inactiveMusic,
        quotes,
      });
      const boss = editor.element.querySelector<HTMLInputElement>('[name="kind"][value="boss"]')!;
      boss.checked = true;
      boss.dispatchEvent(new Event("change", { bubbles: true }));
      await submit();
      expect(actor.flags[MODULE_ID]!.profile).toMatchObject({ kind: "boss", music: null, quotes: [] });
    },
  );
});
