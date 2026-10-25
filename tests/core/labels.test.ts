import { describe, expect, it } from "vitest";
import { numberLabels } from "../../src/core/labels";

describe("numberLabels", () => {
  it("keeps the first name plain and numbers the next ones in show order", () => {
    const labels = numberLabels([
      { id: "c", label: "Orc", hidden: false, order: 3 },
      { id: "a", label: "Orc", hidden: false, order: 1 },
      { id: "w", label: "Wolf", hidden: false, order: 2 },
      { id: "b", label: "Orc", hidden: false, order: 2 },
    ]);
    expect(Object.fromEntries(labels)).toEqual({ a: "Orc", b: "Orc 2", c: "Orc 3", w: "Wolf" });
  });

  it("numbers visible ones first, so a hidden enemy never shows in players' numbers", () => {
    const labels = numberLabels([
      { id: "hidden", label: "Orc", hidden: true, order: 1 },
      { id: "x", label: "Orc", hidden: false, order: 2 },
      { id: "y", label: "Orc", hidden: false, order: 3 },
    ]);
    expect(Object.fromEntries(labels)).toEqual({ x: "Orc", y: "Orc 2", hidden: "Orc 3" });
  });
});
