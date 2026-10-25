import { describe, expect, it, vi } from "vitest";
import { hpFraction } from "../src/core/hp";
import {
  baseActorOf,
  hasDefeatedStatus,
  readBar,
  readEffects,
  readHp,
} from "../src/integrations/dnd5e/actor";

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

describe("readEffects", () => {
  it("reads what the token-icon filter needs, with DAE flags and the remaining time", () => {
    const effect = {
      id: "e1",
      name: "Poison (2)",
      img: "poison.webp",
      description: "<p>Sick</p>",
      statuses: new Set(["poisoned"]),
      showIcon: 1,
      isTemporary: true,
      flags: { dae: { stacks: 2, autoCreated: true } },
      duration: { remaining: 3, label: "3 rounds" },
    };
    const lasting = {
      ...effect,
      id: "e2",
      img: null,
      flags: {},
      duration: { remaining: Infinity, label: "None" },
    };
    expect(readEffects({ appliedEffects: [effect, lasting] })).toEqual([
      {
        id: "e1",
        name: "Poison (2)",
        img: "poison.webp",
        description: "<p>Sick</p>",
        statuses: ["poisoned"],
        showIcon: 1,
        temporary: true,
        autoCreated: true,
        stacks: 2,
        duration: "3 rounds",
      },
      expect.objectContaining({ id: "e2", img: "", autoCreated: false, stacks: 0, duration: "" }),
    ]);
  });
});

describe("readBar", () => {
  const items = new Map([["AbCdEf0123456789", { system: { uses: { value: 2, max: 5 } } }]]);
  const actor = {
    system: {
      resources: { legact: { value: 1, max: 3 } },
      attributes: { ac: { value: 17 } },
      x: { max: 20 },
    },
    items,
  } as unknown as ActorDocument;

  it("reads legendary resources, item uses and system paths", () => {
    vi.stubGlobal("foundry", {
      utils: {
        getProperty: (object: object, path: string) =>
          path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], object),
      },
    });
    expect(readBar(actor, { type: "legact" })).toEqual({ value: 1, max: 3 });
    expect(readBar(actor, { type: "legres" })).toBeNull();
    expect(readBar(actor, { type: "item", itemId: "AbCdEf0123456789" })).toEqual({ value: 2, max: 5 });
    expect(readBar(actor, { type: "item", itemId: "Missing000000000" })).toBeNull();
    expect(readBar(actor, { type: "path", path: "system.attributes.ac.value", max: "system.x.max" })).toEqual(
      {
        value: 17,
        max: 20,
      },
    );
    expect(readBar(actor, { type: "path", path: "system.nothing", max: 5 })).toBeNull();
  });
});
