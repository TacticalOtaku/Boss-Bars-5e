import { describe, expect, it } from "vitest";
import { aggregate, isDefeated, type TokenState } from "../../src/core/aggregate";

const token = (id: string, extra: Partial<TokenState> = {}): TokenState => ({
  tokenId: id,
  hidden: false,
  linked: false,
  hp: { value: 10, effectiveMax: 20, temp: 2 },
  defeated: false,
  ...extra,
});

describe("isDefeated", () => {
  it("is 0 HP, the dead status or a defeated combatant", () => {
    const hp = { value: 5, effectiveMax: 10, temp: 0 };
    expect(isDefeated(hp, false, false)).toBe(false);
    expect(isDefeated({ ...hp, value: 0 }, false, false)).toBe(true);
    expect(isDefeated(hp, true, false)).toBe(true);
    expect(isDefeated(hp, false, true)).toBe(true);
    expect(isDefeated(null, false, false)).toBe(false);
  });
});

describe("aggregate", () => {
  it("sums unlinked tokens and counts them", () => {
    const result = aggregate(
      [token("a"), token("b"), token("c", { hp: { value: 0, effectiveMax: 20, temp: 0 } })],
      true,
    );
    expect(result).toEqual({
      hp: { value: 20, effectiveMax: 60, temp: 4 },
      count: 3,
      hidden: false,
      defeated: false,
    });
  });

  it("counts a linked actor's HP once, because its tokens share it", () => {
    const linked = { linked: true, hp: { value: 30, effectiveMax: 40, temp: 0 } };
    expect(aggregate([token("a", linked), token("b", linked)], true)).toMatchObject({
      hp: { value: 30, effectiveMax: 40, temp: 0 },
      count: 2,
    });
  });

  it("leaves hidden tokens out for players, and mutes for the GM only when all are hidden", () => {
    const tokens = [token("a", { hidden: true }), token("b")];
    expect(aggregate(tokens, false)).toMatchObject({
      count: 1,
      hp: { value: 10, effectiveMax: 20 },
      hidden: false,
    });
    expect(aggregate(tokens, true)).toMatchObject({ count: 2, hidden: false });
    expect(aggregate([token("a", { hidden: true })], true)?.hidden).toBe(true);
    expect(aggregate([token("a", { hidden: true })], false)).toBeNull();
    expect(aggregate([], true)).toBeNull();
  });

  it("is defeated only when every counted token is", () => {
    expect(aggregate([token("a", { defeated: true }), token("b")], true)?.defeated).toBe(false);
    expect(aggregate([token("a", { defeated: true }), token("b", { defeated: true })], true)?.defeated).toBe(
      true,
    );
  });

  it("has no HP when no token has data", () => {
    expect(aggregate([token("a", { hp: null })], true)?.hp).toBeNull();
  });
});
