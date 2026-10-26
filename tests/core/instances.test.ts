import { describe, expect, it } from "vitest";
import {
  hideAll,
  hideInstance,
  INSTANCES_VERSION,
  moveInstance,
  pruneInstances,
  readInstances,
  rebindInstances,
  setCounter,
  setPhaseState,
  setQuote,
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
      value: { dataVersion: 3, extra: true, items: [{ id: "a", kind: "boss", tokenId: "t1", order: 1 }] },
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

describe("phases and forms", () => {
  const S = "SourceActor00001";
  it("reads the phase state and source, dropping bad ones", () => {
    const raw = {
      dataVersion: 2,
      items: [
        {
          id: "a",
          kind: "boss",
          tokenId: "t1",
          order: 1,
          phase: { id: "p2", mark: 140, waiting: true },
          source: S,
        },
        { id: "b", kind: "boss", tokenId: "t2", order: 2, phase: { id: "bad id", mark: 1 }, source: "x" },
      ],
    };
    const read = readInstances(raw);
    expect(read.status === "ok" && read.value).toEqual({
      dataVersion: 3,
      items: [
        {
          id: "a",
          kind: "boss",
          tokenId: "t1",
          order: 1,
          phase: { id: "p2", mark: 100, waiting: true },
          source: S,
        },
        { id: "b", kind: "boss", tokenId: "t2", order: 2 },
      ],
    });
  });

  it("sets the phase state, returning the same state when nothing changes", () => {
    const state = { dataVersion: 3, items: [{ id: "a", kind: "boss" as const, tokenId: "t1", order: 1 }] };
    const next = setPhaseState(state, "a", { id: "p2", mark: 50 });
    expect(next.items[0]?.phase).toEqual({ id: "p2", mark: 50 });
    expect(setPhaseState(next, "a", { id: "p2", mark: 50 })).toBe(next);
  });

  it("moves an instance onto a form's token in its place, replacing the one already there", () => {
    const state = {
      dataVersion: 3,
      items: [
        { id: "a", kind: "boss" as const, actorId: "boss", order: 1 },
        { id: "b", kind: "boss" as const, tokenId: "form1", order: 2 },
        { id: "c", kind: "elite" as const, tokenId: "t3", order: 3 },
      ],
    };
    expect(moveInstance(state, "a", { tokenId: "form1" }, S, { id: "p4", mark: 100 }).items).toEqual([
      { id: "a", kind: "boss", tokenId: "form1", order: 1, source: S, phase: { id: "p4", mark: 100 } },
      { id: "c", kind: "elite", tokenId: "t3", order: 3 },
    ]);
  });

  it("does not rebind a form's instance by the display mode of the actor under it", () => {
    const state = {
      dataVersion: 3,
      items: [{ id: "a", kind: "boss" as const, tokenId: "form1", order: 1, source: S }],
    };
    const info = () => ({ actorId: "x", mode: "actor" as const, kind: "boss" as const });
    expect(
      rebindInstances(
        state,
        info,
        () => [],
        () => "n",
      ),
    ).toBe(state);
  });
});

describe("quotes in the instance", () => {
  it("reads the quote state and the quote on screen, dropping bad entries", () => {
    const raw = {
      dataVersion: 3,
      items: [
        {
          id: "a",
          kind: "boss",
          tokenId: "t1",
          order: 1,
          quoteState: {
            roar: { fight: "c1", round: 2, done: true, cursor: 1 },
            "bad id": { fight: "x" },
            q: {},
          },
          quote: { key: "roar-1", text: "x".repeat(300), priority: 1, at: 5, duration: 99 },
        },
        { id: "b", kind: "boss", tokenId: "t2", order: 2, quote: { key: "k", text: "t", priority: "1" } },
      ],
    };
    const read = readInstances(raw);
    expect(read.status === "ok" && read.value.items).toEqual([
      expect.objectContaining({
        quoteState: { roar: { fight: "c1", round: 2, done: true, cursor: 1 } },
        quote: { key: "roar-1", text: "x".repeat(200), priority: 1, at: 5, duration: 20 },
      }),
      { id: "b", kind: "boss", tokenId: "t2", order: 2 },
    ]);
  });

  it("puts a quote on screen with its quote's state", () => {
    const state = { dataVersion: 3, items: [{ id: "a", kind: "boss" as const, tokenId: "t1", order: 1 }] };
    const shown = { key: "k", text: "t", priority: 0, at: 1, duration: 3 };
    expect(setQuote(state, "a", shown, "roar", { fight: "c1", cursor: 1 }).items[0]).toMatchObject({
      quote: shown,
      quoteState: { roar: { fight: "c1", cursor: 1 } },
    });
  });
});
