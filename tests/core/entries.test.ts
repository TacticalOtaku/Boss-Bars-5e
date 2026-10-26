import { describe, expect, it } from "vitest";
import type { TokenState } from "../../src/core/aggregate";
import { activeEntries } from "../../src/core/entries";
import { DEFAULT_AUTO_SHOW, type BossProfile, type EliteProfile } from "../../src/core/profile";
import { defaultRanks } from "../../src/core/ranks";
import { buildViews, type SubjectInput, type Viewer } from "../../src/core/view";

const ranks = defaultRanks(["Captain", "Veteran", "Fighter", "Guard"]);
const token = (id: string, hidden = false): TokenState => ({
  tokenId: id,
  hidden,
  linked: false,
  hp: { value: 30, effectiveMax: 120, temp: 5 },
  defeated: false,
});
const boss: BossProfile = {
  autoShow: DEFAULT_AUTO_SHOW,
  statuses: { hidden: [], custom: [{ id: "enraged", name: "Enraged", img: "", description: "" }] },
  miniBars: [
    { id: "souls", label: "Souls", view: "pips", players: true, source: { type: "counter", max: 5 } },
  ],
  look: null,
  overrides: {},
  phases: [
    { id: "calm", label: "", trigger: { type: "start" }, enter: {} },
    { id: "fury", label: "", trigger: { type: "hp", below: 50 }, enter: {} },
    { id: "wyrm", label: "Wyrm", trigger: { type: "form", actorId: "a2" }, enter: {} },
  ],
  fillMode: "segments",
  playerTicks: false,
  quotes: [
    {
      id: "hello",
      trigger: { type: "appear" },
      texts: ["Hi"],
      order: "cycle",
      cooldown: 0,
      once: false,
      duration: 3,
    },
  ],
  music: null,
  musicPriority: 0,
  musicFade: 2000,
  dataVersion: 2,
  kind: "boss",
  playerName: "",
  title: "",
  portrait: null,
  displayMode: "token",
  size: 100,
};
const elite: EliteProfile = {
  autoShow: DEFAULT_AUTO_SHOW,
  statuses: { hidden: [], custom: [] },
  miniBars: [],
  dataVersion: 2,
  kind: "elite",
  playerName: "",
  portrait: null,
  displayMode: "token",
  rank: "",
};
const subjects: SubjectInput[] = [
  {
    instance: {
      id: "b1",
      kind: "boss",
      tokenId: "t1",
      order: 1,
      phase: { id: "wyrm", mark: 100, waiting: true },
      counters: { souls: 2 },
      customStatuses: ["enraged"],
      quote: { key: "q1", text: "Kneel!", priority: 1, at: 1000, duration: 5 },
    },
    profile: boss,
    name: "Xar",
    actorImg: "",
    tokens: [token("t1")],
  },
  {
    instance: { id: "e1", kind: "elite", tokenId: "t2", order: 2 },
    profile: elite,
    name: "Guard",
    actorImg: "",
    tokens: [token("t2")],
  },
  {
    instance: { id: "e2", kind: "elite", tokenId: "t3", order: 3 },
    profile: elite,
    name: "Spy",
    actorImg: "",
    tokens: [token("t3", true)],
  },
];
const viewer = (isGM: boolean): Viewer => ({
  isGM,
  collapsed: new Set(),
  mayCollapse: false,
  mayCollapseElites: false,
});
const entries = (isGM: boolean, now = 2000) =>
  activeEntries(
    subjects,
    buildViews(subjects, ranks, viewer(isGM), Infinity),
    "s1",
    isGM,
    now,
    (n) => `Phase ${n}`,
  );

describe("activeEntries", () => {
  it("gives the GM ids, numbers, phases, quotes, counters and statuses", () => {
    const [first, ...rest] = entries(true);
    expect(rest.map((entry) => entry.id)).toEqual(["e1", "e2"]);
    expect(first).toEqual({
      id: "b1",
      sceneId: "s1",
      kind: "boss",
      tokenId: "t1",
      actorId: null,
      label: "Xar",
      fraction: 0.25,
      defeated: false,
      // A waiting form shows the phase before it; the GM learns that a form waits.
      phase: { label: "Phase II", id: "fury", waiting: true },
      quote: "Kneel!",
      hp: { value: 30, max: 120, temp: 5 },
      phases: [
        { id: "calm", label: "" },
        { id: "fury", label: "Phase II" },
        { id: "wyrm", label: "Wyrm" },
      ],
      quotes: [{ id: "hello", trigger: "appear" }],
      counters: [{ id: "souls", label: "Souls", value: 2, max: 5 }],
      statuses: [{ id: "enraged", label: "Enraged", active: true }],
    });
  });

  it("gives a player no hidden cards, HP numbers, phase list or waiting form", () => {
    const list = entries(false);
    expect(list.map((entry) => entry.id)).toEqual(["b1", "e1"]);
    expect(list[0]).toEqual({
      id: "b1",
      sceneId: "s1",
      kind: "boss",
      tokenId: "t1",
      actorId: null,
      label: "Xar",
      fraction: 0.25,
      defeated: false,
      phase: { label: "Phase II" },
      quote: "Kneel!",
    });
    expect(JSON.stringify(list)).not.toMatch(/\b30\b|\b120\b|wyrm|waiting|souls|enraged/);
  });

  it("drops a quote whose time ran out and freezes everything", () => {
    const [first] = entries(false, 7000);
    expect(first?.quote).toBeNull();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(entries(true)[0]?.phases?.[0])).toBe(true);
  });
});
