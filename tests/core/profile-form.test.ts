import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { profileErrors } from "../../src/core/profile";
import { inputOf, keepChoice } from "../../src/core/profile-form";

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
