import { describe, expect, it } from "vitest";
import { profileRows } from "../../src/core/hub";
import { defaultProfile, PROFILE_VERSION } from "../../src/core/profile";

const actor = (id: string, name: string, profile: unknown) => ({ id, name, img: `${id}.webp`, profile });

describe("profileRows — the hub's list of profiles", () => {
  const boss = { ...defaultProfile("boss"), playerName: "The Ash Wyrm" };
  const elite = defaultProfile("elite");
  const actors = [
    actor("b", "Orc Warlord", defaultProfile("boss")),
    actor("a", "Ash Dragon", boss),
    actor("e", "orc berserker", elite),
    actor("x", "Commoner", undefined),
    actor("n", "Lich", { dataVersion: PROFILE_VERSION + 1, kind: "boss" }),
    actor("i", "Broken", { dataVersion: PROFILE_VERSION, kind: 42 }),
  ];

  it("lists boss and elite profiles apart, by name, and leaves out actors without one", () => {
    const rows = profileRows(actors, "");
    expect(rows.bosses.map((row) => row.id)).toEqual(["a", "b"]);
    expect(rows.elites.map((row) => row.id)).toEqual(["e"]);
    expect(rows.bosses[0]).toMatchObject({ name: "Ash Dragon", img: "a.webp", playerName: "The Ash Wyrm" });
  });

  it("lists data from a newer version apart, so it is never edited", () => {
    expect(profileRows(actors, "").newer.map((row) => row.id)).toEqual(["n"]);
  });

  it("finds a profile by its actor name or the name players see, ignoring case", () => {
    expect(profileRows(actors, "ORC").bosses.map((row) => row.id)).toEqual(["b"]);
    expect(profileRows(actors, "orc").elites.map((row) => row.id)).toEqual(["e"]);
    expect(profileRows(actors, "wyrm").bosses.map((row) => row.id)).toEqual(["a"]);
    expect(profileRows(actors, "  ").bosses).toHaveLength(2);
  });
});
