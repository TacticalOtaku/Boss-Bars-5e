import { describe, expect, it } from "vitest";
import {
  approach,
  frameInterval,
  isLiveFill,
  palette,
  shaderTime,
  TIME_PERIOD,
} from "../../src/core/look/live";

describe("live fills", () => {
  it("knows the five live types", () => {
    expect(["liquid", "energy", "flame", "ice", "void"].every(isLiveFill)).toBe(true);
    expect(isLiveFill("gradient")).toBe(false);
  });

  it("turns colours into five rgb slots, repeating the last, with at least two in use", () => {
    const { rgb, count } = palette(["#ff0000", "#00ff80"]);
    expect(count).toBe(2);
    expect([...rgb.slice(0, 6)].map((value) => Math.round(value * 255))).toEqual([255, 0, 0, 0, 255, 128]);
    expect([...rgb.slice(12, 15)].map((value) => Math.round(value * 255))).toEqual([0, 255, 128]);
    expect(palette(["#123456"]).count).toBe(2);
    expect(palette(["bad"]).rgb.every((value) => value === 0)).toBe(true);
  });

  it("wraps the shader time within its period", () => {
    expect(shaderTime(1500)).toBeCloseTo(1.5);
    expect(shaderTime((TIME_PERIOD + 2) * 1000)).toBeCloseTo(2);
  });

  it("catches up with a new fill and snaps once close", () => {
    let fill = 1;
    for (let i = 0; i < 60; i++) fill = approach(fill, 0.4, 16);
    expect(fill).toBe(0.4);
    expect(approach(1, 0.4, 16)).toBeGreaterThan(0.9);
    expect(approach(0.4, 0.4, 16)).toBe(0.4);
  });

  it("runs fast while catching up, slow at rest and not at all with reduced motion", () => {
    expect(frameInterval(true, false)).toBeCloseTo(16.7, 0);
    expect(frameInterval(false, false)).toBeCloseTo(66.7, 0);
    expect(frameInterval(true, true)).toBeNull();
  });
});
