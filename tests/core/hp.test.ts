import { describe, expect, it } from "vitest";
import { hpFraction } from "../../src/core/hp";

describe("hpFraction", () => {
  it("is value / effectiveMax without rounding, temp excluded", () => {
    expect(hpFraction({ value: 312, effectiveMax: 420, temp: 24 })).toBe(312 / 420);
  });

  it("clamps and refuses unusable data", () => {
    expect(hpFraction({ value: 500, effectiveMax: 420, temp: 0 })).toBe(1);
    expect(hpFraction({ value: -3, effectiveMax: 420, temp: 0 })).toBe(0);
    expect(hpFraction({ value: 5, effectiveMax: 0, temp: 0 })).toBeNull();
    expect(hpFraction({ value: Number.NaN, effectiveMax: 10, temp: 0 })).toBeNull();
    expect(hpFraction({ value: 5, effectiveMax: Number.POSITIVE_INFINITY, temp: 0 })).toBeNull();
  });
});
