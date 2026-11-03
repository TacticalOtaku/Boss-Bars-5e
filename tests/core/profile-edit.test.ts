import { describe, expect, it } from "vitest";
import { profileEditView, prepareProfileEdit, type ProfileEditChoices } from "../../src/core/profile-edit";
import { inputOf } from "../../src/core/profile-form";
import { defaultProfile } from "../../src/core/profile";

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
const look = { look: null, overrides: {} };

describe("profile editing round trip", () => {
  it("keeps every missing reference selected across an unrelated edit and draft rerender", () => {
    const raw = stored();
    const input = formInput();
    const view = profileEditView(raw, input, choices);
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
    expect(prepareProfileEdit(raw, input, choices, look)).toMatchObject({
      status: "ok",
      value: {
        playerName: "Edited name",
        rank: "home-rank",
        music,
        phases: [{ id: "start" }, { id: "form", enter: { music, overrides: { frame: "home-frame" } } }],
      },
    });
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
    const input = formInput();
    const other = {
      ...input.phases[1]!,
      id: "other",
      enter: { music: { ...music, soundId: "Sound00000000002", soundName: undefined } },
    };
    input.phases = [input.phases[0]!, other, input.phases[1]!];
    const result = prepareProfileEdit(raw, input, choices, look);
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
    const removed = prepareProfileEdit(raw, input, choices, look);
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
    const input = formInput();
    input.kind = "elite";
    input.title = "Inactive unsaved title";
    input.phases = [];
    input.music = null;
    const elite = prepareProfileEdit(raw, input, choices, { look: "unsaved-look", overrides: {} });
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
    const view = profileEditView(elite.value, draft, choices);
    expect(view.values.music).toEqual(music);
    expect(view.values.phases[1]?.enter.music).toEqual(music);
    const boss = prepareProfileEdit(elite.value, draft, choices, {
      look: "new-look",
      overrides: { frame: "new-frame" },
    });
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

  it("keeps optional music and preset clears absent on rerender and full replacement", () => {
    const raw = stored();
    const input = formInput();
    input.music = null;
    input.phases[1]!.enter = {};
    const view = profileEditView(raw, input, choices);
    expect(view.music.groups).toEqual([]);
    expect(view.phases[1]?.music.groups).toEqual([]);
    expect(view.phases[1]?.overrides.every((row) => row.options.every((option) => !option.selected))).toBe(
      true,
    );
    const result = prepareProfileEdit(raw, input, choices, look);
    expect(result).toMatchObject({
      status: "ok",
      value: { music: null, phases: [{ id: "start" }, { id: "form", enter: {} }] },
    });
    if (result.status !== "ok" || result.value.kind !== "boss") throw new Error("boss save failed");
    expect(result.value.phases[1]?.enter).toEqual({});
  });

  it("reports empty required actor, item and rank fields instead of discarding their rows", () => {
    const input = formInput();
    input.phases[1]!.trigger = { type: "form", actorId: "" };
    input.miniBars[0]!.source = { type: "item", itemId: "" };
    const result = prepareProfileEdit(stored(), input, choices, look);
    expect(result).toEqual({
      status: "errors",
      errors: {
        "phases.1.actorId": "BB5E.Error.NoFormActor",
        "miniBars.0.source.itemId": "BB5E.Error.NoItem",
      },
    });
    const view = profileEditView(stored(), input, choices);
    expect(view.values.phases).toHaveLength(2);
    expect(view.values.phases[1]?.trigger).toEqual({ type: "form", actorId: "" });
    expect(view.values.miniBars[0]?.source).toEqual({ type: "item", itemId: "" });
    input.kind = "elite";
    input.rank = "";
    expect(prepareProfileEdit(stored(), input, choices, look)).toMatchObject({
      status: "errors",
      errors: { rank: "BB5E.Error.NoRank" },
    });
  });

  it("starts absent profiles from defaults but refuses invalid and newer stored data", () => {
    const input = formInput();
    expect(profileEditView(undefined, null, choices).values).toMatchObject({
      kind: "boss",
      size: 100,
      rank: "current",
    });
    expect(prepareProfileEdit(undefined, input, choices, look)).toMatchObject({
      status: "ok",
      value: { kind: "boss", playerName: "Edited name" },
    });
    expect(prepareProfileEdit({ kind: "unknown" }, input, choices, look)).toEqual({ status: "invalid" });
    expect(prepareProfileEdit({ ...stored(), dataVersion: 999 }, input, choices, look)).toEqual({
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
    const view = profileEditView(stored(), null, current);
    expect(view.music.groups[0]?.options[1]).toMatchObject({
      value: "sound:Playlist00000002:Sound00000000002",
      selected: true,
    });
    const input = formInput();
    input.music = { type: "sound", playlistId: "Playlist00000002", soundId: "Sound00000000002" };
    expect(prepareProfileEdit(stored(), input, current, look)).toMatchObject({
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
    expect(profileEditView(raw, null, choices).look).toEqual({
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
      const view = profileEditView(raw, null, choices);
      expect(view.values.kind).toBe("elite");
      expect(view.values.phases).toEqual(projectedPhases);
      expect(view.values.music).toBeNull();
      expect(view.music.groups).toEqual([]);
      expect(view.values.quotes).toEqual([]);
      const input = formInput();
      input.kind = "elite";
      expect(prepareProfileEdit(raw, input, choices, view.look)).toMatchObject({
        status: "ok",
        value: { kind: "elite", phases, music: inactiveMusic, quotes },
      });
    },
  );
});
