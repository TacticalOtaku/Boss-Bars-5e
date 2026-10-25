import { describe, expect, it } from "vitest";
import { parseAction } from "../../src/core/actions";

const id = "AbCdEf0123456789";

describe("parseAction", () => {
  it("accepts the write actions and drops extra keys", () => {
    expect(parseAction({ type: "show", sceneId: id, tokenId: id })).toEqual({
      type: "show",
      sceneId: id,
      tokenId: id,
    });
    expect(parseAction({ type: "hide", sceneId: id, instanceId: id })).toEqual({
      type: "hide",
      sceneId: id,
      instanceId: id,
    });
    expect(parseAction({ type: "hideAll", sceneId: id, junk: 1 })).toEqual({ type: "hideAll", sceneId: id });
  });

  it("rejects anything else", () => {
    for (const raw of [
      null,
      "show",
      { type: "delete", sceneId: id },
      { type: "show", sceneId: id },
      { type: "show", sceneId: "../x", tokenId: id },
      { type: "hide", sceneId: id, instanceId: `${id}"]` },
    ]) {
      expect(parseAction(raw)).toBeNull();
    }
  });
});

describe("parseAction — counters and custom statuses", () => {
  it("accepts a counter value and a status toggle", () => {
    expect(
      parseAction({ type: "setCounter", sceneId: id, instanceId: id, barId: "armour", value: 3, x: 1 }),
    ).toEqual({ type: "setCounter", sceneId: id, instanceId: id, barId: "armour", value: 3 });
    expect(
      parseAction({ type: "toggleStatus", sceneId: id, instanceId: id, statusId: "rage", active: false }),
    ).toEqual({ type: "toggleStatus", sceneId: id, instanceId: id, statusId: "rage", active: false });
  });

  it("rejects bad values, ids and flags", () => {
    for (const raw of [
      { type: "setCounter", sceneId: id, instanceId: id, barId: "a", value: -1 },
      { type: "setCounter", sceneId: id, instanceId: id, barId: "a", value: 1.5 },
      { type: "setCounter", sceneId: id, instanceId: id, barId: "a", value: 10000 },
      { type: "setCounter", sceneId: id, instanceId: id, barId: "a b", value: 1 },
      { type: "toggleStatus", sceneId: id, instanceId: id, statusId: "rage", active: "yes" },
      { type: "toggleStatus", sceneId: id, instanceId: "x", statusId: "rage", active: true },
    ]) {
      expect(parseAction(raw)).toBeNull();
    }
  });
});
