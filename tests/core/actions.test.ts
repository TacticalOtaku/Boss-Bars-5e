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
