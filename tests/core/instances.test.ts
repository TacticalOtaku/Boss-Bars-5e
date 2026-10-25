import { describe, expect, it } from "vitest";
import { hideAll, hideInstance, pruneInstances, readInstances, showInstance } from "../../src/core/instances";

const empty = { dataVersion: 1, items: [] };

describe("readInstances", () => {
  it("treats a missing flag as an empty set", () => {
    expect(readInstances(undefined)).toEqual({ status: "ok", value: empty });
  });

  it("drops malformed items but keeps unknown keys", () => {
    const raw = {
      dataVersion: 1,
      extra: true,
      items: [{ id: "a", kind: "boss", tokenId: "t1", order: 1, note: "x" }, { id: 5 }, null],
    };
    expect(readInstances(raw)).toEqual({
      status: "ok",
      value: {
        dataVersion: 1,
        extra: true,
        items: [{ id: "a", kind: "boss", tokenId: "t1", order: 1, note: "x" }],
      },
    });
  });

  it("refuses newer and foreign data", () => {
    expect(readInstances({ dataVersion: 9, items: [] }).status).toBe("newer");
    expect(readInstances({ items: [] }).status).toBe("invalid");
    expect(readInstances({ dataVersion: 1, items: "x" }).status).toBe("invalid");
  });
});

describe("instance reducers", () => {
  it("shows a token once and orders it after the last one", () => {
    const one = showInstance(empty, "t1", "a");
    const two = showInstance(one, "t2", "b");
    expect(two.items.map((i) => [i.id, i.tokenId, i.order])).toEqual([
      ["a", "t1", 1],
      ["b", "t2", 2],
    ]);
    expect(showInstance(two, "t1", "c")).toBe(two);
  });

  it("hides one, all, or whatever fails a check", () => {
    const state = showInstance(showInstance(empty, "t1", "a"), "t2", "b");
    expect(hideInstance(state, "a").items.map((i) => i.id)).toEqual(["b"]);
    expect(hideInstance(state, "zzz")).toBe(state);
    expect(hideAll(state).items).toEqual([]);
    expect(pruneInstances(state, (i) => i.tokenId !== "t2").items.map((i) => i.id)).toEqual(["a"]);
    expect(pruneInstances(state, () => true)).toBe(state);
  });
});
