import { describe, expect, it } from "vitest";
import { instanceEvents } from "../../src/core/events";
import type { Instance } from "../../src/core/instances";

const item = (id: string, extra: Partial<Instance> = {}): Instance => ({
  id,
  kind: "boss",
  tokenId: `t-${id}`,
  order: 1,
  ...extra,
});
const phaseKey = (each: Instance) => each.phase?.id ?? "first";
const types = (before: Instance[], after: Instance[]) =>
  instanceEvents(before, after, phaseKey).map((event) => `${event.type}:${event.item.id}`);

describe("instanceEvents", () => {
  it("shows new ids and hides missing ones", () => {
    expect(types([item("a")], [item("b")])).toEqual(["hide:a", "show:b"]);
    expect(types([item("a")], [item("a")])).toEqual([]);
  });

  it("treats a form moving to another token as neither hide nor show", () => {
    expect(types([item("a")], [item("a", { tokenId: "other", phase: { id: "first", mark: 100 } })])).toEqual(
      [],
    );
  });

  it("reports a phase change with the previous item, but not a bar shown straight into a phase", () => {
    const before = item("a");
    const events = instanceEvents([before], [item("a", { phase: { id: "fury", mark: 50 } })], phaseKey);
    expect(events).toEqual([expect.objectContaining({ type: "phaseChange", previous: before })]);
    expect(types([], [item("a", { phase: { id: "fury", mark: 50 } })])).toEqual(["show:a"]);
  });

  it("reports each new quote key once", () => {
    const quote = { key: "q1", text: "Hi", priority: 1, at: 0, duration: 3 };
    expect(types([item("a")], [item("a", { quote })])).toEqual(["quote:a"]);
    expect(types([item("a", { quote })], [item("a", { quote })])).toEqual([]);
    expect(types([], [item("a", { quote })])).toEqual(["show:a", "quote:a"]);
  });
});
