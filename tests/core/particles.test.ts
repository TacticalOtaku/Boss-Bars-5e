import { describe, expect, it } from "vitest";
import { admit, ash, PARTICLE_LIMIT, sparks, stepParticles } from "../../src/core/look/particles";

const fixed = () => 0.5;

describe("particles", () => {
  it("throws more sparks for a bigger hit, from the given point, upward", () => {
    expect(sparks({ x: 10, y: 20 }, 0, "#fff", fixed)).toHaveLength(6);
    expect(sparks({ x: 10, y: 20 }, 0.3, "#fff", fixed)).toHaveLength(30);
    expect(sparks({ x: 10, y: 20 }, 1, "#fff", fixed)).toHaveLength(40);
    const [spark] = sparks({ x: 10, y: 20 }, 0.1, "#ffcc66", fixed);
    expect(spark).toMatchObject({ x: 10, y: 20, color: "#ffcc66", kind: "spark" });
    expect(spark?.vy).toBeLessThan(0);
  });

  it("spreads ash over the bar in its colours", () => {
    const flakes = ash({ x: 100, y: 50, width: 400, height: 20 }, ["#111", "#222"], fixed);
    expect(flakes).toHaveLength(50);
    expect(flakes.every((each) => each.x >= 100 && each.x <= 500 && each.y >= 50 && each.y <= 70)).toBe(true);
  });

  it("keeps at most the ceiling, dropping the oldest", () => {
    const old = sparks({ x: 0, y: 0 }, 1, "old", fixed);
    const pool = admit(Array.from({ length: 5 }, () => old).flat(), sparks({ x: 0, y: 0 }, 1, "new", fixed));
    expect(pool).toHaveLength(PARTICLE_LIMIT);
    expect(pool.at(-1)?.color).toBe("new");
  });

  it("moves sparks under gravity, lets ash drift up, and drops the dead", () => {
    const [spark] = sparks({ x: 0, y: 0 }, 0, "#fff", fixed);
    const [flake] = ash({ x: 0, y: 0, width: 10, height: 10 }, ["#000"], fixed);
    if (!spark || !flake) throw new Error("no particles");
    const [movedSpark, movedFlake] = stepParticles([spark, flake], 100);
    expect(movedSpark?.vy).toBeGreaterThan(spark.vy);
    expect(movedFlake?.y).toBeLessThan(flake.y);
    expect(stepParticles([spark], spark.max + 1)).toEqual([]);
  });
});
