import { describe, expect, it } from "vitest";
import type { TokenState } from "../../src/core/aggregate";
import type { BossProfile, EliteProfile } from "../../src/core/profile";
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
const bossProfile: BossProfile = {
  dataVersion: 2,
  kind: "boss",
  playerName: "",
  title: "Пожиратель",
  portrait: null,
  displayMode: "token",
  size: 110,
};
const eliteProfile = (rank: string, extra: Partial<EliteProfile> = {}): EliteProfile => ({
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
    expect(JSON.stringify(view)).not.toMatch(/\b30\b|\b120\b|"temp"/);
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
