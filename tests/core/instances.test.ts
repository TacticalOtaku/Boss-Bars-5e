import { describe, expect, it } from "vitest";
import {
  hideAll,
  hideInstance,
  INSTANCES_VERSION,
  pruneInstances,
  readInstances,
  rebindInstances,
  setCounter,
  showInstance,
  toggleStatus,
} from "../../src/core/instances";

const empty = { dataVersion: INSTANCES_VERSION, items: [] };

describe("readInstances", () => {
  it("treats a missing flag as an empty set", () => {
    expect(readInstances(undefined)).toEqual({ status: "ok", value: empty });
  });

  it("migrates version 1 and keeps unknown keys", () => {
    const raw = { dataVersion: 1, extra: true, items: [{ id: "a", kind: "boss", tokenId: "t1", order: 1 }] };
    expect(readInstances(raw)).toEqual({
      status: "ok",
      value: { dataVersion: 2, extra: true, items: [{ id: "a", kind: "boss", tokenId: "t1", order: 1 }] },
    });
  });

  it("drops malformed items: a key must be exactly one of tokenId and actorId", () => {
    const raw = {
      dataVersion: 2,
      items: [
        { id: "a", kind: "elite", actorId: "x", order: 1, note: "kept" },
        { id: "b", kind: "boss", tokenId: "t", actorId: "x", order: 2 },
        { id: "c", kind: "minion", tokenId: "t", order: 3 },
        { id: "d", kind: "boss", order: 4 },
        null,
      ],
    };
    const read = readInstances(raw);
    expect(read.status === "ok" && read.value.items).toEqual([
      { id: "a", kind: "elite", actorId: "x", order: 1, note: "kept" },
    ]);
  });

  it("refuses newer and foreign data", () => {
    expect(readInstances({ dataVersion: 9, items: [] }).status).toBe("newer");
    expect(readInstances({ items: [] }).status).toBe("invalid");
    expect(readInstances({ dataVersion: 2, items: "x" }).status).toBe("invalid");
  });
});

describe("rebindInstances", () => {
  const tokensOf = (actorId: string) => (actorId === "x" ? ["t1", "t2", "t3"] : []);
  let n = 0;
  const newId = () => `new${++n}`;

  it("merges per-token items into one per-actor item when the profile switched to one per actor", () => {
    const state = {
      dataVersion: 2,
      items: [
        { id: "a", kind: "elite" as const, tokenId: "t1", order: 1 },
        { id: "b", kind: "elite" as const, tokenId: "t2", order: 2 },
        { id: "z", kind: "boss" as const, tokenId: "other", order: 3 },
      ],
    };
    const info = (item: { tokenId?: string }) =>
      item.tokenId === "other" ? null : { actorId: "x", mode: "actor" as const, kind: "elite" as const };
    expect(rebindInstances(state, info, tokensOf, newId).items).toEqual([
      { id: "a", kind: "elite", actorId: "x", order: 1 },
      { id: "z", kind: "boss", tokenId: "other", order: 3 },
    ]);
  });

  it("splits a per-actor item into one per token, and follows a kind change", () => {
    const state = { dataVersion: 2, items: [{ id: "a", kind: "elite" as const, actorId: "x", order: 4 }] };
    const info = () => ({ actorId: "x", mode: "token" as const, kind: "boss" as const });
    expect(rebindInstances(state, info, tokensOf, () => "n").items).toEqual([
      { id: "a", kind: "boss", tokenId: "t1", order: 4 },
      { id: "n", kind: "boss", tokenId: "t2", order: 4 },
      { id: "n", kind: "boss", tokenId: "t3", order: 4 },
    ]);
  });

  it("returns the same state when everything is bound as its profile says", () => {
    const state = { dataVersion: 2, items: [{ id: "a", kind: "elite" as const, tokenId: "t1", order: 1 }] };
    const info = () => ({ actorId: "x", mode: "token" as const, kind: "elite" as const });
    expect(rebindInstances(state, info, tokensOf, newId)).toBe(state);
  });
});

describe("instance reducers", () => {
  it("shows a token or an actor once and orders it after the last one", () => {
    const one = showInstance(empty, "boss", { tokenId: "t1" }, "a");
    const two = showInstance(one, "elite", { actorId: "x" }, "b");
    expect(two.items).toEqual([
      { id: "a", kind: "boss", tokenId: "t1", order: 1 },
      { id: "b", kind: "elite", actorId: "x", order: 2 },
    ]);
    expect(showInstance(two, "boss", { tokenId: "t1" }, "c")).toBe(two);
    expect(showInstance(two, "elite", { actorId: "x" }, "c")).toBe(two);
  });

  it("hides one, all, or whatever fails a check", () => {
    const state = showInstance(
      showInstance(empty, "boss", { tokenId: "t1" }, "a"),
      "boss",
      { tokenId: "t2" },
      "b",
    );
    expect(hideInstance(state, "a").items.map((i) => i.id)).toEqual(["b"]);
    expect(hideInstance(state, "zzz")).toBe(state);
    expect(hideAll(state).items).toEqual([]);
    expect(pruneInstances(state, (i) => i.tokenId !== "t2").items.map((i) => i.id)).toEqual(["a"]);
    expect(pruneInstances(state, () => true)).toBe(state);
  });
});

describe("counters and custom statuses", () => {
  const state = {
    dataVersion: INSTANCES_VERSION,
    items: [{ id: "a", kind: "boss" as const, tokenId: "t", order: 1 }],
  };

  it("cleans stored counters and custom statuses without dropping the instance", () => {
    const read = readInstances({
      dataVersion: 2,
      items: [
        {
          id: "a",
          kind: "boss",
          tokenId: "t",
          order: 1,
          counters: { armour: 2, "a b": 1, x: "3", y: Number.NaN },
          customStatuses: ["rage", 5, "<b>"],
        },
        { id: "b", kind: "boss", tokenId: "u", order: 2, counters: [], customStatuses: "rage" },
      ],
    });
    expect(read.status === "ok" && read.value.items).toEqual([
      { id: "a", kind: "boss", tokenId: "t", order: 1, counters: { armour: 2 }, customStatuses: ["rage"] },
      { id: "b", kind: "boss", tokenId: "u", order: 2, counters: {}, customStatuses: [] },
    ]);
  });

  it("sets a counter and toggles a status, returning the same state when nothing changes", () => {
    const counted = setCounter(state, "a", "armour", 2);
    expect(counted.items[0]?.counters).toEqual({ armour: 2 });
    expect(setCounter(counted, "a", "armour", 2)).toBe(counted);
    expect(setCounter(state, "missing", "armour", 2)).toBe(state);
    const on = toggleStatus(state, "a", "rage", true);
    expect(on.items[0]?.customStatuses).toEqual(["rage"]);
    expect(toggleStatus(on, "a", "rage", true)).toBe(on);
    expect(toggleStatus(on, "a", "rage", false).items[0]?.customStatuses).toEqual([]);
  });
});
