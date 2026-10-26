import { describe, expect, it } from "vitest";
import type { TokenState } from "../../src/core/aggregate";
import { DEFAULT_AUTO_SHOW, type BossProfile, type EliteProfile } from "../../src/core/profile";
import { defaultRanks } from "../../src/core/ranks";
import { buildViews, type SubjectInput, type Viewer } from "../../src/core/view";

const ranks = defaultRanks(["Captain", "Veteran", "Fighter", "Guard"]);
const token = (id: string, extra: Partial<TokenState> = {}): TokenState => ({
  tokenId: id,
  hidden: false,
  linked: false,
  hp: { value: 30, effectiveMax: 120, temp: 5 },
  defeated: false,
  ...extra,
});
const stage4 = { autoShow: DEFAULT_AUTO_SHOW, statuses: { hidden: [], custom: [] }, miniBars: [] };
const bossProfile: BossProfile = {
  ...stage4,
  look: null,
  overrides: {},
  phases: [],
  fillMode: "segments",
  playerTicks: true,
  dataVersion: 2,
  kind: "boss",
  playerName: "",
  title: "Пожиратель",
  portrait: null,
  displayMode: "token",
  size: 110,
};
const eliteProfile = (rank: string, extra: Partial<EliteProfile> = {}): EliteProfile => ({
  ...stage4,
  dataVersion: 2,
  kind: "elite",
  playerName: "",
  portrait: null,
  displayMode: "token",
  rank,
  ...extra,
});
let order = 0;
const subject = (
  name: string,
  profile: BossProfile | EliteProfile,
  tokens = [token(name)],
): SubjectInput => ({
  instance: { id: `i-${name}-${++order}`, kind: profile.kind, tokenId: tokens[0]?.tokenId ?? "x", order },
  profile,
  name,
  actorImg: "actor.webp",
  tokens,
});
const gm: Viewer = { isGM: true, collapsed: new Set(), mayCollapse: true, mayCollapseElites: true };
const player: Viewer = { isGM: false, collapsed: new Set(), mayCollapse: true, mayCollapseElites: true };

describe("buildViews — boss bars", () => {
  const boss = subject("Ксар’Тун", bossProfile);

  it("gives the GM numbers and the player only the fill", () => {
    expect(buildViews([boss], ranks, gm, 12).bosses[0]?.numbers).toEqual({ value: 30, max: 120, temp: 5 });
    const view = buildViews([boss], ranks, player, 12).bosses[0]!;
    expect(view).not.toHaveProperty("numbers");
    // The look is styling shared by everyone (its numbers are sizes); HP must not leak anywhere else.
    expect(JSON.stringify({ ...view, look: undefined })).not.toMatch(/\b30\b|\b120\b|"temp"/);
    expect(view.fraction).toBe(0.25);
  });

  it("labels from the profile, else the given name; portrait falls back to the actor", () => {
    expect(buildViews([boss], ranks, player, 12).bosses[0]?.label).toBe("Ксар’Тун");
    const named = { ...boss, profile: { ...bossProfile, playerName: "???" } };
    expect(buildViews([named], ranks, player, 12).bosses[0]?.label).toBe("???");
    expect(buildViews([boss], ranks, player, 12).bosses[0]?.portrait).toEqual({
      src: "actor.webp",
      video: false,
    });
    const video = { ...boss, profile: { ...bossProfile, portrait: "boss.WEBM?v=2" } };
    expect(buildViews([video], ranks, player, 12).bosses[0]?.portrait).toEqual({
      src: "boss.WEBM?v=2",
      video: true,
    });
  });

  it("hides a hidden token from players and mutes it for the GM", () => {
    const hidden = { ...boss, tokens: [token("h", { hidden: true })] };
    expect(buildViews([hidden], ranks, player, 12).bosses).toEqual([]);
    expect(buildViews([hidden], ranks, gm, 12).bosses[0]?.muted).toBe(true);
  });

  it("shows ×N and summed HP for one bar per actor", () => {
    const tokens = [token("a"), token("b"), token("c")];
    const base = subject("Орда", { ...bossProfile, displayMode: "actor" }, tokens);
    const horde = { ...base, instance: { id: "horde", kind: "boss" as const, actorId: "x", order: 99 } };
    const view = buildViews([horde], ranks, gm, 12).bosses[0]!;
    expect(view.count).toBe(3);
    expect(view.numbers).toEqual({ value: 90, max: 360, temp: 15 });
    expect(buildViews([boss], ranks, gm, 12).bosses[0]).not.toHaveProperty("count");
  });

  it("lets only players collapse, when allowed", () => {
    const id = boss.instance.id;
    expect(buildViews([boss], ranks, gm, 12).bosses[0]?.canCollapse).toBe(false);
    expect(buildViews([boss], ranks, player, 12).bosses[0]?.canCollapse).toBe(true);
    expect(buildViews([boss], ranks, { ...player, collapsed: new Set([id]) }, 12).bosses[0]?.collapsed).toBe(
      true,
    );
    const locked = { ...player, collapsed: new Set([id]), mayCollapse: false };
    expect(buildViews([boss], ranks, locked, 12).bosses[0]).toMatchObject({
      collapsed: false,
      canCollapse: false,
    });
  });
});

describe("buildViews — elite column", () => {
  it("sorts by rank, then show order, and shows only the parts of the rank", () => {
    const subjects = [
      subject("Волк", eliteProfile("guard")),
      subject("Шаман", eliteProfile("fighter")),
      subject("Вожак", eliteProfile("captain")),
      subject("Берсерк", eliteProfile("veteran")),
      subject("Сирота", eliteProfile("deleted-rank")),
    ];
    const { elites } = buildViews(subjects, ranks, player, 12);
    expect(elites.map((e) => [e.label, e.rank.name, e.parts.name, e.parts.fill])).toEqual([
      ["Вожак", "Captain", true, true],
      ["Берсерк", "Veteran", true, true],
      ["Шаман", "Fighter", true, false],
      ["Волк", "Guard", false, false],
      ["Сирота", "Guard", false, false],
    ]);
    expect(elites[0]?.rank).toEqual({ name: "Captain", color: "#e5c06a", size: 40 });
  });

  it("numbers equal names across bosses and elites, hidden ones last", () => {
    const subjects = [
      subject("Орк", eliteProfile("veteran"), [token("h", { hidden: true })]),
      subject("Орк", eliteProfile("veteran")),
      subject("Орк", bossProfile),
    ];
    const asGM = buildViews(subjects, ranks, gm, 12);
    expect(asGM.bosses.map((b) => b.label)).toEqual(["Орк 2"]);
    expect(asGM.elites.map((e) => e.label)).toEqual(["Орк 3", "Орк"]);
    expect(buildViews(subjects, ranks, player, 12).elites.map((e) => e.label)).toEqual(["Орк"]);
  });

  it("keeps the first cards within the limit and counts the rest", () => {
    const subjects = Array.from({ length: 5 }, (_, i) => subject(`E${i}`, eliteProfile("veteran")));
    const result = buildViews(subjects, ranks, player, 3);
    expect(result.elites.map((e) => e.label)).toEqual(["E0", "E1", "E2"]);
    expect(result.eliteOverflow).toBe(2);
  });

  it("gives the GM numbers on cards, never the player", () => {
    const subjects = [subject("Орк", eliteProfile("guard"))];
    expect(buildViews(subjects, ranks, gm, 12).elites[0]?.numbers).toEqual({ value: 30, max: 120, temp: 5 });
    expect(buildViews(subjects, ranks, player, 12).elites[0]).not.toHaveProperty("numbers");
  });

  it("lets players collapse the whole column, when allowed", () => {
    const subjects = [subject("Орк", eliteProfile("guard")), subject("Волк", eliteProfile("guard"))];
    expect(buildViews(subjects, ranks, gm, 12).column).toEqual({
      canCollapse: false,
      collapsed: false,
      total: 2,
    });
    const collapsed = { ...player, collapsed: new Set(["elites"]) };
    expect(buildViews(subjects, ranks, collapsed, 1).column).toEqual({
      canCollapse: true,
      collapsed: true,
      total: 2,
    });
    const locked = { ...collapsed, mayCollapseElites: false };
    expect(buildViews(subjects, ranks, locked, 12).column).toMatchObject({
      canCollapse: false,
      collapsed: false,
    });
  });
});

describe("buildViews — statuses, mini-bars and shield", () => {
  const effect = (name: string) => ({
    id: name,
    name,
    img: `${name}.webp`,
    description: "",
    statuses: [],
    showIcon: 2,
    temporary: false,
    autoCreated: false,
    stacks: 0,
    duration: "",
  });
  const custom = [{ id: "rage", name: "Rage", img: "rage.webp", description: "" }];
  const miniBars = [
    { id: "leg", label: "L", view: "pips" as const, players: true, source: { type: "legact" as const } },
    {
      id: "gm",
      label: "G",
      view: "bar" as const,
      players: false,
      source: { type: "counter" as const, max: 3 },
    },
  ];
  const tokens = [
    token("b", {
      effects: Array.from({ length: 12 }, (_, i) => effect(`E${i}`)),
      bars: { leg: { value: 1, max: 3 } },
    }),
  ];

  it("gives a boss up to 10 statuses, its switched-on custom statuses, mini-bars and the shield", () => {
    const boss = subject("Boss", { ...bossProfile, statuses: { hidden: ["E0"], custom }, miniBars }, tokens);
    boss.instance.customStatuses = ["rage"];
    const view = buildViews([boss], ranks, gm, 12).bosses[0]!;
    expect(view.statuses).toHaveLength(10);
    expect(view.statuses[0]?.name).toBe("E1");
    expect(view.statusOverflow).toBe(2);
    expect(view.miniBars.map((bar) => bar.id)).toEqual(["leg", "gm"]);
    expect(view.shield).toBe(5 / 120);
  });

  it("shows players only their mini-bars, without numbers, and the shield as a share", () => {
    const boss = subject("Boss", { ...bossProfile, miniBars }, tokens);
    const view = buildViews([boss], ranks, player, 12).bosses[0]!;
    expect(view.miniBars).toEqual([
      { id: "leg", label: "L", fraction: 1 / 3, pips: { filled: 1, total: 3 } },
    ]);
    expect(view.shield).toBe(5 / 120);
  });

  it("gives an elite statuses and mini-bars only as its rank allows, never custom statuses", () => {
    const profile = { statuses: { hidden: [], custom }, miniBars };
    const captain = subject("C", eliteProfile("captain", profile), tokens);
    captain.instance.customStatuses = ["rage"];
    const fighter = subject("F", eliteProfile("fighter", profile), tokens);
    const [c, f] = buildViews([captain, fighter], ranks, gm, 12).elites;
    expect([c?.statuses.length, c?.statusOverflow, c?.miniBars.length]).toEqual([4, 8, 2]);
    expect(c?.statuses.some((status) => status.name === "Rage")).toBe(false);
    expect([f?.statuses.length, f?.miniBars.length]).toEqual([0, 0]);
  });
});

describe("buildViews — look", () => {
  it("takes status limits and the shield switch from the subject's look", async () => {
    const { BUILTIN_SOURCES, CLASSIC } = await import("../../src/core/look/builtin");
    const { resolveLook } = await import("../../src/core/look/resolve");
    const neon = resolveLook("neon", {}, BUILTIN_SOURCES, CLASSIC);
    const effect = (name: string) => ({
      id: name,
      name,
      img: "",
      description: "",
      statuses: [],
      showIcon: 2,
      temporary: false,
      autoCreated: false,
      stacks: 0,
      duration: "",
    });
    const tokens = [token("n", { effects: Array.from({ length: 14 }, (_, i) => effect(`E${i}`)) })];
    const boss = { ...subject("Neon", bossProfile, tokens), look: neon };
    const view = buildViews([boss], ranks, gm, 12).bosses[0]!;
    expect([view.statuses.length, view.statusOverflow, view.look.attrs.bar]).toEqual([12, 2, "thin"]);
    const noShield = { ...neon, fill: { ...neon.fill, params: { ...neon.fill.params, shield: false } } };
    expect(buildViews([{ ...boss, look: noShield }], ranks, gm, 12).bosses[0]?.shield).toBe(0);
  });
});

describe("buildViews — phases", () => {
  const FORM = "FormActor0000001";
  const phased: BossProfile = {
    ...bossProfile,
    playerName: "Ксар",
    phases: [
      { id: "p1", label: "", trigger: { type: "start" }, enter: {} },
      {
        id: "p2",
        label: "",
        trigger: { type: "hp", below: 50 },
        enter: { title: "Ярость", portrait: "rage.webp" },
      },
      { id: "p3", label: "Пепел", trigger: { type: "form", actorId: FORM }, enter: { playerName: "Пепел" } },
    ],
  };
  const at = (phase: SubjectInput["instance"]["phase"], profile = phased, tokens = [token("b")]) => {
    const input = subject("b", profile, tokens);
    return { ...input, instance: { ...input.instance, ...(phase ? { phase } : {}) } };
  };

  it("labels the phase, adds up entry changes and ticks the thresholds", () => {
    const first = buildViews([at(undefined)], ranks, player, 12).bosses[0]!;
    expect(first.phase).toEqual({ key: "p1", label: "", numeral: null });
    expect(first.ticks).toEqual([0.5]);
    const second = buildViews([at({ id: "p2", mark: 25 })], ranks, player, 12).bosses[0]!;
    expect(second).toMatchObject({
      phase: { key: "p2", label: "", numeral: "II" },
      title: "Ярость",
      portrait: { src: "rage.webp" },
      label: "Ксар",
    });
  });

  it("hides the ticks from players when the profile says so, never from the GM", () => {
    const hidden = { ...phased, playerTicks: false };
    expect(buildViews([at(undefined, hidden)], ranks, player, 12).bosses[0]?.ticks).toEqual([]);
    expect(buildViews([at(undefined, hidden)], ranks, gm, 12).bosses[0]?.ticks).toEqual([0.5]);
  });

  it("refills the bar inside the phase and drops the ticks", () => {
    const refill = { ...phased, fillMode: "refill" as const };
    const view = buildViews([at({ id: "p2", mark: 25 }, refill)], ranks, player, 12).bosses[0]!;
    expect(view.fraction).toBeCloseTo(0.5);
    expect(view.ticks).toEqual([]);
  });

  it("is no defeat at 0 HP while a form is next, and hides a waiting form behind the phase before it", () => {
    const dead = [token("b", { hp: { value: 0, effectiveMax: 120, temp: 0 }, defeated: true })];
    expect(
      buildViews([at({ id: "p2", mark: 25 }, phased, dead)], ranks, player, 12).bosses[0]?.defeated,
    ).toBe(false);
    const waiting = buildViews([at({ id: "p3", mark: 100, waiting: true }, phased, dead)], ranks, player, 12)
      .bosses[0]!;
    expect(waiting).toMatchObject({ defeated: false, phase: { key: "p2" }, label: "Ксар" });
    const formed = buildViews([at({ id: "p3", mark: 100 }, phased)], ranks, player, 12).bosses[0]!;
    expect(formed).toMatchObject({ phase: { key: "p3", label: "Пепел", numeral: null }, label: "Пепел" });
  });

  it("gives a boss without phases no phase and no ticks", () => {
    expect(buildViews([subject("x", bossProfile)], ranks, player, 12).bosses[0]).toMatchObject({
      phase: null,
      ticks: [],
    });
  });
});
