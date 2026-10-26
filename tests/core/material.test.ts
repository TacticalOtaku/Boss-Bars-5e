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
    expect([...material.trail]).toEqual(rgb("#ffd27a").map(Math.fround));
    // Classic defaults it keeps: a #6fb7f0 shield, no shine.
    expect([...material.shield]).toEqual(rgb("#6fb7f0").map(Math.fround));
    expect([...material.spark]).toEqual(rgb("#ff9a3c").map(Math.fround));
    expect(material).toMatchObject({ shieldOn: 1, edgeGlow: 1, shine: 0 });
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

  it("tells the shader which hit effects the look plays: sparks, the white flash, big cracks", () => {
    const of = (id: string) => barMaterial(resolveLook(id, {}, BUILTIN_SOURCES, CLASSIC));
    expect([...of("classic").hit]).toEqual([1, 1, 1]);
    // Parchment and Ink: no sparks, no flash, cracks kept; Minimal: none of them.
    expect([...of("parchment").hit]).toEqual([0, 0, 1]);
    expect([...of("minimal").hit]).toEqual([0, 1, 0]);
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
