import { describe, expect, it } from "vitest";
import { defaultRanks, rankErrors, rankOf, readRanks } from "../../src/core/ranks";

const defaults = defaultRanks(["Captain", "Veteran", "Fighter", "Guard"]);

describe("ranks", () => {
  it("has four default ranks, strongest first, with the parts of the mock-up", () => {
    expect(defaults.map((r) => [r.id, r.name, r.size])).toEqual([
      ["captain", "Captain", 40],
      ["veteran", "Veteran", 34],
      ["fighter", "Fighter", 30],
      ["guard", "Guard", 30],
    ]);
    expect(defaults.map((r) => r.parts)).toEqual([
      { name: true, fill: true, statuses: true },
      { name: true, fill: true, statuses: false },
      { name: true, fill: false, statuses: false },
      { name: false, fill: false, statuses: false },
    ]);
  });

  it("uses the defaults until the GM saves ranks", () => {
    expect(readRanks(undefined, defaults)).toEqual({
      status: "ok",
      value: { dataVersion: 2, items: defaults },
    });
    expect(readRanks({}, defaults)).toEqual({ status: "ok", value: { dataVersion: 2, items: defaults } });
  });

  it("normalises stored ranks and never lets a colour or id inject CSS", () => {
    const read = readRanks(
      {
        dataVersion: 1,
        items: [
          {
            id: "boss-guard",
            name: " Guard ",
            color: "red; background: url(x)",
            parts: { fill: 1 },
            size: 999,
          },
          { id: "bad id!", name: "X", color: "#AABBCC", parts: {}, size: 30 },
        ],
      },
      defaults,
    );
    expect(read.status === "ok" && read.value.items).toEqual([
      {
        id: "boss-guard",
        name: "Guard",
        color: "#6a6a7a",
        parts: { name: false, fill: true, statuses: false },
        size: 64,
        look: null,
      },
    ]);
    expect(readRanks({ dataVersion: 1, items: [] }, defaults).status).toBe("ok");
    expect(readRanks({ dataVersion: 4, items: [] }, defaults).status).toBe("newer");
  });

  it("reads the rank's look (v2) and migrates v1 ranks", () => {
    const read = readRanks(
      {
        dataVersion: 2,
        items: [
          { id: "a", name: "A", look: "neon" },
          { id: "b", name: "B", look: "x y" },
        ],
      },
      defaults,
    );
    expect(read.status === "ok" && read.value.items.map((rank) => rank.look)).toEqual(["neon", null]);
    const v1 = readRanks({ dataVersion: 1, items: [{ id: "a", name: "A" }] }, defaults);
    expect(v1.status === "ok" && v1.value.dataVersion).toBe(2);
  });

  it("falls back to the weakest rank for an unknown id", () => {
    expect(rankOf(defaults, "veteran")).toEqual({ rank: defaults[1], index: 1 });
    expect(rankOf(defaults, "gone")).toEqual({ rank: defaults[3], index: 3 });
  });

  it("validates the editor list", () => {
    expect(rankErrors(defaults)).toEqual([]);
    expect(rankErrors([])).toEqual([{ index: -1, key: "BB5E.Error.NoRanks" }]);
    expect(
      rankErrors([
        { ...defaults[0]!, name: " " },
        { ...defaults[1]!, size: 10 },
      ]),
    ).toEqual([
      { index: 0, key: "BB5E.Error.RankName" },
      { index: 1, key: "BB5E.Error.RankSize" },
    ]);
  });
});
