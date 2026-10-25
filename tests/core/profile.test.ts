import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_SHOW,
  PROFILE_LIMITS,
  PROFILE_VERSION,
  profileErrors,
  readProfile,
  type ProfileInput,
} from "../../src/core/profile";

/** Stage 4 fields as readProfile fills them in for a profile written by 0.4.0. */
const stage4 = { autoShow: DEFAULT_AUTO_SHOW, statuses: { hidden: [], custom: [] }, miniBars: [] };

const boss = {
  dataVersion: 2,
  kind: "boss",
  playerName: "Ксар’Тун",
  title: "Пожиратель пепла",
  portrait: null,
  displayMode: "token",
  size: 100,
};
const elite = {
  dataVersion: 2,
  kind: "elite",
  playerName: "",
  portrait: null,
  displayMode: "actor",
  rank: "veteran",
};

describe("readProfile", () => {
  it("reads boss and elite profiles and keeps unknown keys", () => {
    expect(readProfile({ ...boss, future: { x: 1 } })).toEqual({
      status: "ok",
      value: { ...boss, ...stage4, future: { x: 1 } },
    });
    expect(readProfile(elite)).toEqual({ status: "ok", value: { ...elite, ...stage4 } });
  });

  it("migrates a version 1 boss profile", () => {
    const v1 = { dataVersion: 1, kind: "boss", playerName: "A", title: "T", portrait: null, size: 80 };
    expect(readProfile(v1)).toEqual({
      status: "ok",
      value: { ...v1, ...stage4, dataVersion: PROFILE_VERSION, displayMode: "token" },
    });
  });

  it("keeps the other kind's fields when the kind changes", () => {
    const switched = readProfile({ ...boss, kind: "elite", rank: "guard" });
    expect(switched.status).toBe("ok");
    if (switched.status !== "ok") return;
    expect(switched.value).toMatchObject({
      kind: "elite",
      rank: "guard",
      title: "Пожиратель пепла",
      size: 100,
    });
  });

  it("reports missing, foreign and newer data", () => {
    expect(readProfile(undefined).status).toBe("none");
    expect(readProfile("boss").status).toBe("invalid");
    expect(readProfile({ ...boss, dataVersion: undefined }).status).toBe("invalid");
    expect(readProfile({ ...boss, kind: "minion" }).status).toBe("invalid");
    expect(readProfile({ ...boss, dataVersion: 3 }).status).toBe("newer");
  });

  it("normalises bad field values instead of dropping the profile", () => {
    const result = readProfile({
      ...boss,
      playerName: 42,
      title: "x".repeat(500),
      portrait: "",
      size: 999,
      displayMode: "both",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok" || result.value.kind !== "boss") return;
    expect(result.value.playerName).toBe("");
    expect(result.value.title).toHaveLength(PROFILE_LIMITS.text);
    expect(result.value.portrait).toBeNull();
    expect(result.value.size).toBe(PROFILE_LIMITS.sizeMax);
    expect(result.value.displayMode).toBe("token");
    const badRank = readProfile({ ...elite, rank: 5 });
    expect(badRank.status === "ok" && badRank.value.kind === "elite" && badRank.value.rank).toBe("");
  });
});

describe("profileErrors", () => {
  const input: ProfileInput = {
    kind: "boss",
    displayMode: "token",
    playerName: "A",
    title: "",
    portrait: "a.webm",
    size: 50,
    rank: "",
    ...stage4,
  };

  it("accepts valid input of both kinds", () => {
    expect(profileErrors(input)).toEqual({});
    expect(profileErrors({ ...input, kind: "elite", size: Number.NaN, rank: "guard" })).toEqual({});
  });

  it("names each invalid field", () => {
    expect(
      profileErrors({
        ...input,
        playerName: "x".repeat(81),
        title: "y".repeat(81),
        portrait: "p".repeat(2049),
        size: 49,
      }),
    ).toEqual({
      playerName: "BB5E.Error.TooLong",
      title: "BB5E.Error.TooLong",
      portrait: "BB5E.Error.TooLong",
      size: "BB5E.Error.SizeRange",
    });
    expect(profileErrors({ ...input, kind: "elite", rank: "" })).toEqual({ rank: "BB5E.Error.NoRank" });
  });
});

describe("stage 4 profile fields", () => {
  const read = (extra: Record<string, unknown>) => {
    const result = readProfile({ ...boss, ...extra });
    if (result.status !== "ok") throw new Error(result.status);
    return result.value;
  };

  it("reads auto-show with defaults and a clamped delay", () => {
    expect(read({}).autoShow).toEqual({
      onCombatStart: false,
      hideOnCombatEnd: true,
      hideOnDefeat: true,
      delay: 3,
    });
    expect(read({ autoShow: { onCombatStart: true, hideOnDefeat: "yes", delay: 99 } }).autoShow).toEqual({
      onCombatStart: true,
      hideOnCombatEnd: true,
      hideOnDefeat: true,
      delay: 60,
    });
  });

  it("keeps valid mini-bars and drops bad ones", () => {
    const bars = read({
      miniBars: [
        { id: "a", label: "Legendary", source: { type: "legact" } },
        { id: "b", label: "Armour", view: "pips", players: false, source: { type: "counter", max: 3.4 } },
        { id: "c", source: { type: "path", path: "system.attributes.ac.value", max: "system.x.max" } },
        { id: "d", source: { type: "path", path: "system.x", max: 20 } },
        { id: "e", source: { type: "item", itemId: "AbCdEf0123456789" } },
        { id: "bad id", source: { type: "temp" } },
        { id: "f", source: { type: "path", path: "flags.x", max: 1 } },
        { id: "g", source: { type: "path", path: "system.__proto__.x", max: 1 } },
        { id: "h", source: { type: "path", path: "system.x", max: "constructor" } },
        { id: "i", source: { type: "item", itemId: "x" } },
        { id: "j", source: { type: "eval" } },
      ],
    }).miniBars;
    expect(bars.map((bar) => bar.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(bars[0]).toEqual({
      id: "a",
      label: "Legendary",
      view: "pips",
      players: true,
      source: { type: "legact" },
    });
    expect(bars[1]).toMatchObject({ view: "pips", players: false, source: { type: "counter", max: 3 } });
    expect(bars[3]?.view).toBe("bar");
  });

  it("caps mini-bars at six", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ id: `b${index}`, source: { type: "temp" } }));
    expect(read({ miniBars: many }).miniBars).toHaveLength(PROFILE_LIMITS.miniBars);
  });

  it("reads hidden and custom statuses", () => {
    expect(
      read({
        statuses: {
          hidden: ["prone", " Bless ", 5, ""],
          custom: [
            { id: "rage", name: "Rage", img: "rage.webp", description: "x".repeat(300) },
            { id: "nameless", name: " " },
            { id: "<b>", name: "Bad" },
          ],
        },
      }).statuses,
    ).toEqual({
      hidden: ["prone", "Bless"],
      custom: [
        { id: "rage", name: "Rage", img: "rage.webp", description: "x".repeat(PROFILE_LIMITS.description) },
      ],
    });
  });
});

describe("profileErrors — stage 4 fields", () => {
  const base: ProfileInput = {
    kind: "boss",
    displayMode: "token",
    playerName: "",
    title: "",
    portrait: "",
    size: 100,
    rank: "",
    ...stage4,
  };

  it("names bad mini-bar fields, custom statuses and the delay", () => {
    expect(
      profileErrors({
        ...base,
        autoShow: { ...DEFAULT_AUTO_SHOW, delay: 61 },
        miniBars: [
          { id: "a", label: "x".repeat(41), view: "bar", players: true, source: { type: "temp" } },
          {
            id: "b",
            label: "",
            view: "bar",
            players: true,
            source: { type: "path", path: "flags.x", max: 0 },
          },
          { id: "c", label: "", view: "bar", players: true, source: { type: "counter", max: 1.5 } },
          { id: "d", label: "", view: "bar", players: true, source: { type: "item", itemId: "" } },
          {
            id: "e",
            label: "",
            view: "bar",
            players: true,
            source: { type: "path", path: "system.a", max: "system.b" },
          },
        ],
        statuses: { hidden: [], custom: [{ id: "s", name: " ", img: "", description: "d".repeat(201) }] },
      }),
    ).toEqual({
      "autoShow.delay": "BB5E.Error.DelayRange",
      "miniBars.0.label": "BB5E.Error.TooLong",
      "miniBars.1.source.path": "BB5E.Error.FieldPath",
      "miniBars.1.source.max": "BB5E.Error.BarMax",
      "miniBars.2.source.max": "BB5E.Error.BarMax",
      "miniBars.3.source.itemId": "BB5E.Error.NoItem",
      "statuses.custom.0.name": "BB5E.Error.StatusName",
      "statuses.custom.0.description": "BB5E.Error.TooLong",
    });
  });

  it("ignores custom statuses of an elite", () => {
    const custom = [{ id: "s", name: "", img: "", description: "" }];
    expect(profileErrors({ ...base, kind: "elite", rank: "r", statuses: { hidden: [], custom } })).toEqual(
      {},
    );
  });
});
