import { describe, expect, it } from "vitest";
import { VFX_SLOTS, vfxAt, vfxFrameInterval } from "../../src/core/look/vfx";

describe("vfxFrameInterval — how often the bars are drawn", () => {
  it("runs a busy bar at 60 fps, an idle boss bar at 30, idle cards at 15, nothing moving with reduced motion", () => {
    expect(vfxFrameInterval({ busy: true, bosses: true, reduced: false })).toBeCloseTo(1000 / 60);
    expect(vfxFrameInterval({ busy: false, bosses: true, reduced: false })).toBeCloseTo(1000 / 30);
    expect(vfxFrameInterval({ busy: false, bosses: false, reduced: false })).toBeCloseTo(1000 / 15);
    expect(vfxFrameInterval({ busy: true, bosses: true, reduced: true })).toBeNull();
  });
});

describe("vfxAt — the effect timeline", () => {
  it("plays a hit at full strength at once, fades it out and drops it once over", () => {
    const hit = { kind: "damage", at: 1000, share: 0.4, x: 0.6 } as const;
    const [start] = vfxAt([hit], 1000, { reduced: false });
    expect(start).toMatchObject({ kind: "damage", t: 0, x: 0.6, share: 0.4 });
    expect(start?.strength).toBe(1);
    const [later] = vfxAt([hit], 1300, { reduced: false });
    expect(later?.t).toBeGreaterThan(0);
    expect(later?.t).toBeLessThan(1);
    expect(vfxAt([hit], 5000, { reduced: false })).toEqual([]);
  });

  it("makes a scratch weaker than a heavy blow, and a big hit last longer", () => {
    const scratch = { kind: "damage", at: 0, share: 0.02, x: 0.9, big: false } as const;
    // A third of the bar hits at full strength.
    const blow = { kind: "damage", at: 0, share: 0.34, x: 0.5, big: true } as const;
    const [weak, strong] = vfxAt([scratch, blow], 0, { reduced: false });
    expect(weak?.strength).toBeGreaterThan(0.3);
    expect(weak?.strength).toBeLessThan(0.5);
    expect(strong).toMatchObject({ strength: 1, big: true });
    // 800 ms on: the scratch is over, the big hit still runs.
    expect(vfxAt([scratch, blow], 800, { reduced: false }).map((each) => each.big)).toEqual([true]);
  });

  it("plays every hit at full strength for a look that does not scale by damage", () => {
    const scratch = { kind: "damage", at: 0, share: 0.02, x: 0.9, scale: false } as const;
    const heal = { kind: "heal", at: 0, share: 0.02, x: 0.9, scale: false } as const;
    expect(vfxAt([scratch, heal], 0, { reduced: false }).map((each) => each.strength)).toEqual([1, 1]);
  });

  it("gives healing, a phase change, defeat and the entrance their own length", () => {
    const events = [
      { kind: "heal", at: 0, share: 0.2, x: 0.7 },
      { kind: "phase", at: 0, share: 0, x: 0.5 },
      { kind: "defeat", at: 0, share: 0, x: 0 },
      { kind: "appear", at: 0, share: 0, x: 1 },
    ] as const;
    // heal 0.9 s, appear 1.2 s, phase 1.6 s, defeat 2 s.
    const at = (ms: number) => vfxAt(events, ms, { reduced: false }).map((each) => [each.kind, each.t]);
    expect(at(600)).toEqual([
      ["heal", 600 / 900],
      ["phase", 600 / 1600],
      ["defeat", 600 / 2000],
      ["appear", 600 / 1200],
    ]);
    expect(at(1500).map(([kind]) => kind)).toEqual(["phase", "defeat"]);
    expect(vfxAt(events, 0, { reduced: false }).map((each) => each.strength)).toEqual([0.75, 1, 1, 1]);
  });

  it("keeps only the light of an effect with reduced motion: no motion, no shards", () => {
    const blow = { kind: "damage", at: 0, share: 0.5, x: 0.5, big: true } as const;
    expect(vfxAt([blow], 100, { reduced: false })[0]).toMatchObject({ motion: true, big: true });
    expect(vfxAt([blow], 100, { reduced: true })[0]).toMatchObject({
      motion: false,
      big: false,
      strength: 1,
    });
  });

  it("keeps the newest effects of a long series, as many as the shader takes", () => {
    const series = Array.from({ length: 12 }, (_, i) => ({
      kind: "damage" as const,
      at: i * 10,
      share: 0.05,
      x: 1 - i * 0.05,
    }));
    const running = vfxAt(series, 150, { reduced: false });
    expect(running).toHaveLength(VFX_SLOTS);
    expect(running.at(-1)?.x).toBeCloseTo(1 - 11 * 0.05);
    expect(running[0]?.x).toBeCloseTo(1 - (12 - VFX_SLOTS) * 0.05);
  });
});
