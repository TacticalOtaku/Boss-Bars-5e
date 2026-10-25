import { describe, expect, it, vi } from "vitest";
import { hpFraction } from "../src/core/hp";
import { baseActorOf, hasDefeatedStatus, readHp } from "../src/integrations/dnd5e/actor";

/** Shape of `system.attributes.hp` after dnd5e 5.3.3 `prepareHitPoints` (research/dnd5e-facts §1). */
const prepared = (hp: Record<string, unknown>) => ({ system: { attributes: { hp } } });

describe("readHp", () => {
  it("reads value, effectiveMax (with tempmax) and temp", () => {
    const hp = readHp(prepared({ value: 40, max: 60, tempmax: -10, effectiveMax: 50, temp: 7 }));
    expect(hp).toEqual({ value: 40, effectiveMax: 50, temp: 7 });
    expect(hpFraction(hp!)).toBe(0.8);
  });

  it("gives no fill for an effective maximum of 0 and no data for actors without HP", () => {
    expect(
      hpFraction(readHp(prepared({ value: 0, max: 10, tempmax: -10, effectiveMax: 0, temp: 0 }))!),
    ).toBeNull();
    expect(readHp({ system: {} })).toBeNull();
    expect(readHp(prepared({ value: null, max: null }))).toEqual({ value: 0, effectiveMax: 0, temp: 0 });
  });
});

describe("actor helpers", () => {
  it("checks the configured defeated status", () => {
    vi.stubGlobal("CONFIG", { specialStatusEffects: { DEFEATED: "dead" } });
    expect(hasDefeatedStatus({ statuses: new Set(["dead"]) })).toBe(true);
    expect(hasDefeatedStatus({ statuses: new Set(["prone"]) })).toBe(false);
  });

  it("resolves the world actor behind an unlinked token", () => {
    const world = { isToken: false } as ActorDocument;
    const synthetic = { isToken: true, token: { baseActor: world } } as unknown as ActorDocument;
    expect(baseActorOf(world)).toBe(world);
    expect(baseActorOf(synthetic)).toBe(world);
  });
});
