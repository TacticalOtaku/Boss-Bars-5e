import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_SOURCES } from "../../src/core/look/builtin";
import { defaultProfile, profileErrors } from "../../src/core/profile";
import {
  inputOf,
  keepChoice,
  ProfileEditSession,
  type ProfileEditChoices,
} from "../../src/core/profile-session";

const PLAYLIST = "Playlist00000001";
const SOUND = "Sound00000000001";

/**
 * A boss form as Foundry hands it over: FormDataExtended values (numbers or null from number fields, booleans from
 * checkboxes, strings elsewhere), expanded by `foundry.utils.expandObject` into index-keyed rows.
 */
const form = {
  kind: "boss",
  displayMode: "actor",
  playerName: " The Lich ",
  title: "Lord of Bones",
  portrait: "",
  portraitFocus: { x: 40, y: 15, zoom: 150 },
  size: 120,
  rank: "",
  autoShow: { onCombatStart: true, hideOnCombatEnd: false, hideOnDefeat: true, delay: 5 },
  hiddenIds: { dead: true, prone: false },
  hiddenNames: "Bless\n\n Haste ",
  statuses: {
    custom: { 0: { id: "shield1", name: " Bone Shield ", img: "icons/svg/shield.svg", description: "" } },
  },
  miniBars: {
    0: { id: "legact1", label: "Actions", view: "pips", players: true, source: { type: "legact" } },
    1: {
      id: "souls01",
      label: "Souls",
      view: "bar",
      players: false,
      source: { type: "counter", counterMax: 7 },
    },
    2: {
      id: "path001",
      label: "Ki",
      view: "bar",
      players: true,
      source: { type: "path", path: "system.ki", max: "10" },
    },
  },
  phases: {
    0: { id: "phase01", label: "", newer: "" },
    1: {
      id: "phase02",
      label: "Unbound",
      newer: "",
      trigger: "hp",
      below: 50,
      actorId: "",
      enter: {
        playerName: "",
        title: " Unbound ",
        portrait: "",
        music: `sound:${PLAYLIST}:${SOUND}`,
        overrides: { frame: "abyss", fill: "" },
      },
    },
  },
  fillMode: "refill",
  playerTicks: false,
  quotes: {
    0: {
      id: "quote01",
      newer: "",
      trigger: "below",
      percent: 30,
      texts: "Kneel!\n\nYou will fall.",
      order: "cycle",
      cooldown: 2,
      once: false,
      duration: 8,
    },
    1: {
      id: "",
      newer: "",
      trigger: "turn",
      texts: "My turn.",
      order: "random",
      cooldown: 0,
      once: true,
      duration: null,
    },
  },
  music: `playlist:${PLAYLIST}`,
  musicPriority: 10,
  musicFade: 1.5,
};

describe("inputOf", () => {
  const input = inputOf(form, () => "newQuoteId00001");

  it("reads every tab of a boss form into a valid profile", () => {
    expect(profileErrors(input)).toEqual({});
    expect(input).toMatchObject({
      kind: "boss",
      displayMode: "actor",
      playerName: " The Lich ",
      portraitFocus: { x: 40, y: 15, zoom: 150 },
      size: 120,
      autoShow: { onCombatStart: true, hideOnCombatEnd: false, hideOnDefeat: true, delay: 5 },
      statuses: {
        hidden: ["dead", "Bless", "Haste"],
        custom: [{ id: "shield1", name: "Bone Shield", img: "icons/svg/shield.svg", description: "" }],
      },
      miniBars: [
        { id: "legact1", view: "pips", players: true, source: { type: "legact" } },
        { id: "souls01", players: false, source: { type: "counter", max: 7 } },
        { id: "path001", source: { type: "path", path: "system.ki", max: 10 } },
      ],
      phases: [
        { id: "phase01", trigger: { type: "start" }, enter: {} },
        {
          id: "phase02",
          label: "Unbound",
          trigger: { type: "hp", below: 50 },
          enter: {
            title: "Unbound",
            music: { type: "sound", playlistId: PLAYLIST, soundId: SOUND },
            overrides: { frame: "abyss" },
          },
        },
      ],
      fillMode: "refill",
      playerTicks: false,
      music: { type: "playlist", playlistId: PLAYLIST },
      musicPriority: 10,
      musicFade: 1500,
    });
  });

  it("keeps a quote's own duration and leaves an empty one automatic", () => {
    expect(input.quotes).toEqual([
      {
        id: "quote01",
        trigger: { type: "below", percent: 30 },
        texts: ["Kneel!", "You will fall."],
        order: "cycle",
        cooldown: 2,
        once: false,
        duration: 8,
      },
      {
        id: "newQuoteId00001",
        trigger: { type: "turn" },
        texts: ["My turn."],
        order: "random",
        cooldown: 0,
        once: true,
        duration: null,
      },
    ]);
  });
});

/** Every field name the profile templates render, with `{{…}}` parts as wildcards. */
const templateFields = readdirSync("templates")
  .filter((file) => file.startsWith("profile-"))
  .flatMap((file) => [...readFileSync(join("templates", file), "utf8").matchAll(/name="([^"]+)"/g)])
  .map(
    ([, name]) => new RegExp(`^${(name ?? "").replace(/\./g, "\\.").replace(/\{\{[^}]+\}\}/g, "[^.]+")}$`),
  );

function paths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Object.keys(value).length === 0) return [prefix];
  return Object.entries(value).flatMap(([key, each]) => paths(each, prefix ? `${prefix}.${key}` : key));
}

describe("the profile form", () => {
  it("renders every field the parser reads", () => {
    const missing = paths(form).filter((path) => !templateFields.some((field) => field.test(path)));
    expect(missing).toEqual([]);
  });
});

describe("keepChoice", () => {
  const ranks = [
    { id: "captain", name: "Captain" },
    { id: "guard", name: "Guard" },
  ];

  it("picks the saved option", () => {
    expect(keepChoice(ranks, "guard", "Not found")).toEqual([
      { id: "captain", name: "Captain", selected: false },
      { id: "guard", name: "Guard", selected: true },
    ]);
  });

  it("keeps a saved id this world lacks, picked, so a save writes it back", () => {
    expect(keepChoice(ranks, "elite-rank-from-home", "Not found")).toEqual([
      { id: "elite-rank-from-home", name: "Not found", selected: true },
      { id: "captain", name: "Captain", selected: false },
      { id: "guard", name: "Guard", selected: false },
    ]);
  });

  it("adds nothing when nothing is saved", () => {
    expect(keepChoice(ranks, "", "Not found")).toEqual([
      { id: "captain", name: "Captain", selected: false },
      { id: "guard", name: "Guard", selected: false },
    ]);
  });
});

const music = {
  type: "sound" as const,
  playlistId: "Playlist00000001",
  soundId: "Sound00000000001",
  playlistName: "Home playlist",
  soundName: "Home track",
};
const choices: ProfileEditChoices = {
  ranks: [{ id: "current", name: "Current rank" }],
  actors: [{ id: "Actor00000000002", name: "Current actor" }],
  items: [{ id: "Item000000000002", name: "Current item" }],
  presets: [{ id: "classic", name: "Classic", category: "frame" }],
  playlists: [],
};
const stored = () => ({
  ...defaultProfile("boss"),
  rank: "home-rank",
  music,
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
    },
  ],
});
function formInput() {
  return inputOf(
    {
      kind: "boss",
      displayMode: "token",
      playerName: "Edited name",
      title: "",
      portrait: "",
      size: 100,
      rank: "home-rank",
      autoShow: { delay: 3 },
      music: "sound:Playlist00000001:Sound00000000001",
      musicPriority: 0,
      musicFade: 2,
      miniBars: {
        0: {
          id: "charges",
          label: "Charges",
          view: "bar",
          players: true,
          source: { type: "item", itemId: "Item000000000001" },
        },
      },
      phases: {
        0: { id: "start" },
        1: {
          id: "form",
          label: "Form",
          trigger: "form",
          actorId: "Actor00000000001",
          enter: { music: "sound:Playlist00000001:Sound00000000001", overrides: { frame: "home-frame" } },
        },
      },
    },
    () => "new-id",
  );
}

describe("ProfileEditSession", () => {
  it("keeps every missing reference selected across an unrelated edit and draft rerender", () => {
    const raw = stored();
    const session = new ProfileEditSession(raw);
    const input = formInput();
    session.setDraft(input);
    const view = session.view(raw, choices);
    expect(view.ranks[0]).toMatchObject({ id: "home-rank", selected: true, missing: true });
    expect(view.miniBars[0]?.items[0]).toMatchObject({
      id: "Item000000000001",
      selected: true,
      missing: true,
    });
    expect(view.phases[1]?.actors[0]).toMatchObject({
      id: "Actor00000000001",
      selected: true,
      missing: true,
    });
    expect(view.phases[1]?.overrides.find((row) => row.category === "frame")?.options[0]).toMatchObject({
      id: "home-frame",
      selected: true,
      missing: true,
    });
    expect(view.music.groups[0]?.options[0]).toMatchObject({
      selected: true,
      label: "Home playlist — Home track",
    });
    expect(view.phases[1]?.music.groups[0]?.options[0]).toMatchObject({
      selected: true,
      label: "Home playlist — Home track",
    });
    expect(session.commit(raw, input, choices)).toMatchObject({
      status: "ok",
      value: {
        playerName: "Edited name",
        rank: "home-rank",
        music,
        phases: [{ id: "start" }, { id: "form", enter: { music, overrides: { frame: "home-frame" } } }],
      },
    });
    expect(session.hasDraft).toBe(false);
    expect(raw).toEqual(stored());
  });

  it("matches phase music and unknown phase fields by ID after reorder and drops removed rows", () => {
    const raw = stored();
    raw.phases.push({
      id: "other",
      label: "Other",
      trigger: { type: "form", actorId: "Actor00000000001" },
      enter: {
        music: { ...music, soundId: "Sound00000000002", soundName: "Other track" },
        overrides: { frame: "home-frame" },
      },
    });
    Object.assign(raw.phases[1]!, { futurePhase: { enabled: true } });
    const session = new ProfileEditSession(raw);
    const input = formInput();
    const other = {
      ...input.phases[1]!,
      id: "other",
      enter: { music: { ...music, soundId: "Sound00000000002", soundName: undefined } },
    };
    input.phases = [input.phases[0]!, other, input.phases[1]!];
    const result = session.commit(raw, input, choices);
    expect(result).toMatchObject({
      status: "ok",
      value: {
        phases: [
          { id: "start" },
          { id: "other", enter: { music: { soundName: "Other track" } } },
          { id: "form", futurePhase: { enabled: true }, enter: { music: { soundName: "Home track" } } },
        ],
      },
    });
    input.phases.splice(2, 1);
    input.miniBars = [];
    const removed = session.commit(raw, input, choices);
    expect(removed).toMatchObject({
      status: "ok",
      value: { miniBars: [], phases: [{ id: "start" }, { id: "other" }] },
    });
  });

  it("preserves inactive kind fields, unknown data and look state through boss/elite switches", () => {
    const raw = {
      ...stored(),
      futureProfile: { version: 5 },
      look: "home-look",
      overrides: { fill: "home-fill" },
    };
    Object.assign(raw.phases[1]!, { futurePhase: 42 });
    const session = new ProfileEditSession(raw);
    const input = formInput();
    input.kind = "elite";
    input.title = "Inactive unsaved title";
    input.phases = [];
    input.music = null;
    const elite = session.commit(raw, input, choices);
    expect(elite).toMatchObject({
      status: "ok",
      value: {
        kind: "elite",
        futureProfile: { version: 5 },
        look: "home-look",
        overrides: { fill: "home-fill" },
        music,
        phases: [{ id: "start" }, { id: "form", futurePhase: 42 }],
      },
    });
    if (elite.status !== "ok") throw new Error("elite save failed");
    const draft = formInput();
    session.setDraft(draft);
    const view = session.view(elite.value, choices);
    expect(view.values.music).toEqual(music);
    expect(view.values.phases[1]?.enter.music).toEqual(music);
    session.pickLook("new-look", draft);
    session.setOverride("frame", "new-frame");
    const boss = session.commit(elite.value, draft, choices);
    expect(boss).toMatchObject({
      status: "ok",
      value: {
        kind: "boss",
        rank: "home-rank",
        futureProfile: { version: 5 },
        look: "new-look",
        overrides: { frame: "new-frame" },
        music,
        phases: [{ id: "start" }, { id: "form", futurePhase: 42, enter: { music } }],
      },
    });
  });

  it("uses unsaved look and category overrides for quote, phase and look tab previews", () => {
    const raw = { ...stored(), look: null, overrides: {} };
    const session = new ProfileEditSession(raw);
    const input = formInput();
    input.quotes = [
      {
        id: "q1",
        trigger: { type: "appear" },
        texts: ["Hello {name}"],
        order: "random",
        cooldown: 0,
        once: false,
        duration: null,
      },
    ];
    session.pickLook("neon", input);
    session.setOverride("fill", "frost-fill");

    const quoteFrame = session.quotePreview(
      input,
      BUILTIN_SOURCES,
      0,
      { name: "Boss", img: "boss.webp", sampleAttacker: "Hero" },
      1000,
    );
    expect(quoteFrame?.style.attrs.bar).toBe("thick");
    expect(quoteFrame?.style.attrs.fill).toBe("ice");

    const frames = session.phaseTransition(input, BUILTIN_SOURCES, 1, { name: "Boss", img: "boss.webp" });
    expect(frames?.[0].style.attrs.fill).toBe("ice");
    expect(frames?.[1].style.attrs.fill).toBe("ice");

    const savedFrame = session.phaseFrame(input, BUILTIN_SOURCES, 0, { name: "Boss", img: "boss.webp" });
    expect(savedFrame.style.attrs.portrait).toBe("notch");
  });

  it("keeps optional music and preset clears absent on rerender and full replacement", () => {
    const raw = stored();
    const session = new ProfileEditSession(raw);
    const input = formInput();
    input.music = null;
    input.phases[1]!.enter = {};
    session.setDraft(input);
    const view = session.view(raw, choices);
    expect(view.music.groups).toEqual([]);
    expect(view.phases[1]?.music.groups).toEqual([]);
    expect(view.phases[1]?.overrides.every((row) => row.options.every((option) => !option.selected))).toBe(
      true,
    );
    const result = session.commit(raw, input, choices);
    expect(result).toMatchObject({
      status: "ok",
      value: { music: null, phases: [{ id: "start" }, { id: "form", enter: {} }] },
    });
    if (result.status !== "ok" || result.value.kind !== "boss") throw new Error("boss save failed");
    expect(result.value.phases[1]?.enter).toEqual({});
  });

  it("reports empty required actor, item and rank fields instead of discarding their rows", () => {
    const raw = stored();
    const session = new ProfileEditSession(raw);
    const input = formInput();
    input.phases[1]!.trigger = { type: "form", actorId: "" };
    input.miniBars[0]!.source = { type: "item", itemId: "" };
    const result = session.commit(raw, input, choices);
    expect(result).toEqual({
      status: "errors",
      errors: {
        "phases.1.actorId": "BB5E.Error.NoFormActor",
        "miniBars.0.source.itemId": "BB5E.Error.NoItem",
      },
    });
    session.setDraft(input);
    const view = session.view(raw, choices);
    expect(view.values.phases).toHaveLength(2);
    expect(view.values.phases[1]?.trigger).toEqual({ type: "form", actorId: "" });
    expect(view.values.miniBars[0]?.source).toEqual({ type: "item", itemId: "" });
    input.kind = "elite";
    input.rank = "";
    expect(session.commit(raw, input, choices)).toMatchObject({
      status: "errors",
      errors: { rank: "BB5E.Error.NoRank" },
    });
  });

  it("starts absent profiles from defaults but refuses invalid and newer stored data", () => {
    const session = new ProfileEditSession(undefined);
    const input = formInput();
    expect(session.view(undefined, choices).values).toMatchObject({
      kind: "boss",
      size: 100,
      rank: "current",
    });
    expect(session.commit(undefined, input, choices)).toMatchObject({
      status: "ok",
      value: { kind: "boss", playerName: "Edited name" },
    });
    expect(session.commit({ kind: "unknown" }, input, choices)).toEqual({ status: "invalid" });
    expect(session.commit({ ...stored(), dataVersion: 999 }, input, choices)).toEqual({
      status: "newer",
    });
  });

  it("projects a name-resolved music selection and saves the current IDs and names", () => {
    const current = {
      ...choices,
      playlists: [
        {
          id: "Playlist00000002",
          name: "Home playlist",
          sounds: [{ id: "Sound00000000002", name: "Home track" }],
        },
      ],
    };
    const raw = stored();
    const session = new ProfileEditSession(raw);
    const view = session.view(raw, current);
    expect(view.music.groups[0]?.options[1]).toMatchObject({
      value: "sound:Playlist00000002:Sound00000000002",
      selected: true,
    });
    const input = formInput();
    input.music = { type: "sound", playlistId: "Playlist00000002", soundId: "Sound00000000002" };
    expect(session.commit(raw, input, current)).toMatchObject({
      status: "ok",
      value: {
        music: {
          playlistId: "Playlist00000002",
          soundId: "Sound00000000002",
          playlistName: "Home playlist",
          soundName: "Home track",
        },
      },
    });
  });

  it("reads a retained inactive look through the profile schema before restoring it", () => {
    const raw = {
      ...stored(),
      kind: "elite",
      look: 42,
      overrides: { frame: "home-frame", unknown: "unknown" },
    };
    const session = new ProfileEditSession(raw);
    expect(session.view(raw, choices).look).toEqual({
      look: null,
      overrides: { frame: "home-frame" },
    });
  });

  it.each([
    { name: "null lists", phases: null, music: "bad-music", quotes: null, projectedPhases: [] },
    {
      name: "malformed rows",
      phases: [null, { id: "usable", trigger: null, enter: null }],
      music: { type: "sound", playlistId: "bad", soundId: [] },
      quotes: "bad-quotes",
      projectedPhases: [{ id: "usable", label: "", trigger: { type: "start" }, enter: {} }],
    },
    { name: "unknown music", phases: [], music: { unknown: true }, quotes: [], projectedPhases: [] },
    { name: "non-list phases", phases: { unexpected: true }, music: 42, quotes: {}, projectedPhases: [] },
  ])(
    "projects $name safely while preserving raw inactive boss fields on an elite save",
    ({ phases, music: inactiveMusic, quotes, projectedPhases }) => {
      const raw = { ...stored(), kind: "elite", phases, music: inactiveMusic, quotes };
      const session = new ProfileEditSession(raw);
      const view = session.view(raw, choices);
      expect(view.values.kind).toBe("elite");
      expect(view.values.phases).toEqual(projectedPhases);
      expect(view.values.music).toBeNull();
      expect(view.music.groups).toEqual([]);
      expect(view.values.quotes).toEqual([]);
      const input = formInput();
      input.kind = "elite";
      expect(session.commit(raw, input, choices)).toMatchObject({
        status: "ok",
        value: { kind: "elite", phases, music: inactiveMusic, quotes },
      });
    },
  );
});
