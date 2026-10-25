import { describe, expect, it } from "vitest";
import type { TokenState } from "../../src/core/aggregate";
import { isCombatStart, newlyDefeated } from "../../src/core/combat";
import { buildMiniBars } from "../../src/core/minibars";
import type { MiniBar, MiniBarSource } from "../../src/core/profile";

const token = (id: string, extra: Partial<TokenState> = {}): TokenState => ({
  tokenId: id,
  hidden: false,
  linked: false,
  hp: { value: 10, effectiveMax: 20, temp: 0 },
  defeated: false,
  ...extra,
});
const bar = (id: string, source: MiniBarSource, extra: Partial<MiniBar> = {}): MiniBar => ({
  id,
  label: id,
  view: "bar",
  players: true,
  source,
  ...extra,
});

describe("buildMiniBars", () => {
  it("reads actor resources, gives pips up to 10 and numbers to the GM only", () => {
    const bars = [
      bar("leg", { type: "legact" }, { view: "pips" }),
      bar("ac", { type: "path", path: "system.x", max: 30 }),
    ];
    const tokens = [token("a", { bars: { leg: { value: 2, max: 3 }, ac: { value: 15, max: 30 } } })];
    expect(buildMiniBars(bars, tokens, undefined, true, new Map(), "i")).toEqual([
      {
        id: "leg",
        label: "leg",
        fraction: 2 / 3,
        pips: { filled: 2, total: 3 },
        numbers: { value: 2, max: 3 },
      },
      { id: "ac", label: "ac", fraction: 0.5, pips: null, numbers: { value: 15, max: 30 } },
    ]);
    const player = buildMiniBars(bars, tokens, undefined, false, new Map(), "i");
    expect(player.map((view) => "numbers" in view)).toEqual([false, false]);
  });

  it("falls back to a bar beyond 10 pips and leaves out bars without a maximum", () => {
    const bars = [bar("many", { type: "legres" }, { view: "pips" }), bar("none", { type: "legact" })];
    const tokens = [token("a", { bars: { many: { value: 5, max: 12 }, none: { value: 0, max: 0 } } })];
    expect(
      buildMiniBars(bars, tokens, undefined, true, new Map(), "i").map((view) => [view.id, view.pips]),
    ).toEqual([["many", null]]);
  });

  it("hides bars not marked for players from players", () => {
    const bars = [bar("secret", { type: "counter", max: 3 }, { players: false })];
    expect(buildMiniBars(bars, [token("a")], undefined, false, new Map(), "i")).toEqual([]);
    expect(buildMiniBars(bars, [token("a")], undefined, true, new Map(), "i")).toHaveLength(1);
  });

  it("starts a counter full and clamps it to its maximum", () => {
    const bars = [bar("armour", { type: "counter", max: 4 })];
    expect(buildMiniBars(bars, [token("a")], undefined, true, new Map(), "i")[0]?.numbers).toEqual({
      value: 4,
      max: 4,
    });
    expect(buildMiniBars(bars, [token("a")], { armour: 1 }, true, new Map(), "i")[0]?.fraction).toBe(0.25);
    expect(buildMiniBars(bars, [token("a")], { armour: 9 }, true, new Map(), "i")[0]?.fraction).toBe(1);
  });

  it("sums ×N tokens, counting linked tokens once", () => {
    const bars = [bar("leg", { type: "legact" })];
    const res = { leg: { value: 1, max: 3 } };
    const tokens = [
      token("a", { bars: res }),
      token("b", { bars: res }),
      token("c", { linked: true, bars: res }),
      token("d", { linked: true, bars: res }),
    ];
    expect(buildMiniBars(bars, tokens, undefined, true, new Map(), "i")[0]?.numbers).toEqual({
      value: 3,
      max: 9,
    });
  });

  it("measures temp HP against its peak, which resets when the shield is gone", () => {
    const bars = [bar("temp", { type: "temp" })];
    const peaks = new Map<string, number>();
    const at = (temp: number) =>
      buildMiniBars(
        bars,
        [token("a", { hp: { value: 10, effectiveMax: 20, temp } })],
        undefined,
        true,
        peaks,
        "i",
      );
    expect(at(8)[0]?.fraction).toBe(1);
    expect(at(2)[0]?.fraction).toBe(0.25);
    expect(at(0)).toEqual([]);
    expect(at(5)[0]?.fraction).toBe(1);
  });
});

describe("combat decisions", () => {
  it("starts on round 0 → 1 only", () => {
    expect(isCombatStart(0, 1)).toBe(true);
    expect(isCombatStart(2, 1)).toBe(false);
    expect(isCombatStart(1, 2)).toBe(false);
    expect(isCombatStart(undefined, 1)).toBe(false);
  });

  it("hides everything defeated on the first check, then only fresh defeats", () => {
    const now = new Map([
      ["a", true],
      ["b", false],
    ]);
    expect(newlyDefeated(null, now)).toEqual(["a"]);
    const later = new Map([
      ["a", true],
      ["b", true],
      ["c", true],
    ]);
    expect(newlyDefeated(now, later)).toEqual(["b"]);
  });
});
