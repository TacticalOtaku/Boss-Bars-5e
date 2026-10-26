import { describe, expect, it } from "vitest";
import { BUILTIN_SOURCES, CLASSIC, CLASSIC_RESOLVED } from "../../src/core/look/builtin";
import {
  barMaterial,
  FILL_MOTES,
  FILL_PATTERNS,
  FILL_TYPES,
  FRAME_STYLES,
  PORTRAIT_SHAPES,
} from "../../src/core/look/material";
import { resolveLook } from "../../src/core/look/resolve";

const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);

describe("barMaterial — a look as shader uniforms", () => {
  it("turns Classic RPG into its fill type, colours and a frame sized to the bar", () => {
    const material = barMaterial(CLASSIC_RESOLVED);
    expect(FILL_TYPES[material.fillType]).toBe("gradient");
    expect(material.colorCount).toBe(2);
    // Classic RPG: #e0473f → #8e1414 on #1a0d0d, a #c9a45c frame 0.125em thick on a 1.125em bar.
    expect([...material.colors.slice(0, 6)]).toEqual([...rgb("#e0473f"), ...rgb("#8e1414")].map(Math.fround));
    expect([...material.empty]).toEqual(rgb("#1a0d0d").map(Math.fround));
    expect([...material.frameColor]).toEqual(rgb("#c9a45c").map(Math.fround));
    expect(material.frameWidth).toBeCloseTo(0.125 / 1.125);
  });

  it("carries Ash and Flame's glow, trail, shield, sparks and edge light", () => {
    const material = barMaterial(resolveLook("ember", {}, BUILTIN_SOURCES, CLASSIC));
    expect(FILL_TYPES[material.fillType]).toBe("flame");
    expect(material.colorCount).toBe(4);
    expect(material.frameGlow).toBe(0.35);
    expect([...material.glowColor]).toEqual(rgb("#ff9a3c").map(Math.fround));
    // Classic defaults it keeps: a #6fb7f0 shield, no shine.
    expect([...material.shield]).toEqual(rgb("#6fb7f0").map(Math.fround));
    expect(material).toMatchObject({ shieldOn: 1, edgeGlow: 1, shine: 0 });
  });

  it("takes spark and trail colours from the look when its HP effect leaves them empty", () => {
    const close = (actual: Float32Array, expected: number[]) =>
      expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 3));
    // Ash and Flame: sparks in its frame light #ff9a3c; the trail is its lightest fill colour #ffe08a,
    // 35% of the way to white: (255, 234.85, 178.95).
    const ember = barMaterial(resolveLook("ember", {}, BUILTIN_SOURCES, CLASSIC));
    close(ember.spark, [1, 154 / 255, 60 / 255]);
    close(ember.trail, [1, 234.85 / 255, 178.95 / 255]);
    // Permafrost lists its fill dark last: the lightest is #dff6ff, so the trail is (234.3, 249.25, 255).
    const frost = barMaterial(resolveLook("frost", {}, BUILTIN_SOURCES, CLASSIC));
    close(frost.trail, [234.3 / 255, 249.25 / 255, 1]);
    // A colour the effect states wins.
    const own = resolveLook("ember", {}, BUILTIN_SOURCES, CLASSIC);
    const stated = {
      ...own,
      hpEffect: {
        ...own.hpEffect,
        params: { ...own.hpEffect.params, trailColor: "#00ff00", sparkColor: "#0000ff" },
      },
    };
    expect([...barMaterial(stated).trail]).toEqual([0, 1, 0]);
    expect([...barMaterial(stated).spark]).toEqual([0, 0, 1]);
  });

  it("carries the portrait frame: its shape, colour, width and glow", () => {
    const frost = barMaterial(resolveLook("frost", {}, BUILTIN_SOURCES, CLASSIC));
    expect(PORTRAIT_SHAPES[frost.portraitShape]).toBe("hexagon");
    expect([...frost.portraitColor]).toEqual(rgb("#9fd4ff").map(Math.fround));
    expect([...frost.portraitGlowColor]).toEqual(rgb("#7fc8ff").map(Math.fround));
    expect(frost.portraitGlow).toBe(0.3);
    // Classic RPG: a 0.1875em border on a 4.75em portrait.
    const classic = barMaterial(CLASSIC_RESOLVED);
    expect(PORTRAIT_SHAPES[classic.portraitShape]).toBe("circle");
    expect(classic.portraitWidth).toBeCloseTo(0.1875 / 4.75);
    expect(classic.portraitFrame).toBe(1);
  });

  it("tells the shader the frame style; a frame image without a path draws the classic frame", () => {
    expect(FRAME_STYLES[barMaterial(CLASSIC_RESOLVED).frameStyle]).toBe("classic");
    expect(FRAME_STYLES[barMaterial(resolveLook("frost", {}, BUILTIN_SOURCES, CLASSIC)).frameStyle]).toBe(
      "double",
    );
    expect(FRAME_STYLES[barMaterial(resolveLook("abyss", {}, BUILTIN_SOURCES, CLASSIC)).frameStyle]).toBe(
      "none",
    );
    const look = resolveLook("classic", {}, BUILTIN_SOURCES, CLASSIC);
    const image = {
      ...look,
      frame: { ...look.frame, params: { ...look.frame.params, style: "image", image: "" } },
    };
    expect(FRAME_STYLES[barMaterial(image).frameStyle]).toBe("classic");
  });

  it("carries the fill's pattern and the motes around it", () => {
    const of = (id: string) => barMaterial(resolveLook(id, {}, BUILTIN_SOURCES, CLASSIC));
    expect([FILL_PATTERNS[of("classic").pattern], FILL_MOTES[of("classic").motes]]).toEqual(["none", "none"]);
    expect(FILL_PATTERNS[of("rune").pattern]).toBe("runes");
    expect([FILL_PATTERNS[of("dragon").pattern], FILL_MOTES[of("dragon").motes]]).toEqual([
      "scales",
      "embers",
    ]);
    expect(FILL_MOTES[of("sylvan").motes]).toBe("fireflies");
    expect(FILL_MOTES[of("celestial").motes]).toBe("sparkles");
  });

  it("tells the shader which hit effects the look plays: sparks, the white flash, big cracks, the heal wave", () => {
    const of = (id: string) => barMaterial(resolveLook(id, {}, BUILTIN_SOURCES, CLASSIC));
    expect([...of("classic").hit]).toEqual([1, 1, 1, 0]);
    // "Quiet" (Parchment and Ink): none of them; "Snappy" (Neon): no big cracks; "Brittle" (Permafrost): the wave.
    expect([...of("parchment").hit]).toEqual([0, 0, 0, 0]);
    expect([...of("neon").hit]).toEqual([1, 1, 0, 0]);
    expect([...of("frost").hit]).toEqual([1, 1, 1, 1]);
  });

  it("tells the renderer the trail's timing, the low HP signal and the phase refill and palette blend", () => {
    const of = (id: string) => barMaterial(resolveLook(id, {}, BUILTIN_SOURCES, CLASSIC));
    // Classic: the trail waits 550 ms and follows in 600 ms, gathering a series of hits; low HP pulses.
    expect(of("classic")).toMatchObject({ trailDelay: 550, trailSpeed: 600, trailAccumulate: 1, lowMode: 1 });
    // "Snappy" (Neon): 150 ms, 300 ms, one hit at a time, a flicker; "Chronicle" refills on a phase change.
    expect(of("neon")).toMatchObject({
      trailDelay: 150,
      trailSpeed: 300,
      trailAccumulate: 0,
      lowMode: 2,
      phaseRefill: 1,
    });
    // "Quiet" (Minimal): no low HP signal; "Majestic" (Royal Court) blends the palette.
    expect(of("minimal").lowMode).toBe(0);
    expect(of("royal")).toMatchObject({ phaseRefill: 1, phasePalette: 1 });
  });

  it("tells the shader how a phase change plays: the bright flash and the cracks", () => {
    const of = (id: string) => barMaterial(resolveLook(id, {}, BUILTIN_SOURCES, CLASSIC));
    expect([...of("classic").phase]).toEqual([1, 0]);
    expect([...of("dragon").phase]).toEqual([1, 1]);
    // calm looks: no flash, no cracks
    expect([...of("parchment").phase]).toEqual([0, 0]);
    expect([...of("minimal").phase]).toEqual([0, 0]);
  });

  it("gives every built-in look a fill type the shader knows", () => {
    for (const look of BUILTIN_SOURCES.looks) {
      const material = barMaterial(resolveLook(look.id, {}, BUILTIN_SOURCES, CLASSIC));
      expect(material.fillType).toBeGreaterThanOrEqual(0);
      expect(material.colorCount).toBeGreaterThanOrEqual(2);
    }
  });
});
