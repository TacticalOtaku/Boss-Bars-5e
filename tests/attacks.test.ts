import { describe, expect, it } from "vitest";
import { attackTarget, dnd5eAttack, midiAttack } from "../src/integrations/attacks";

const SCENE = "Scene00000000001";
const TOKEN = "Token00000000001";
const ACTOR = "Actor00000000001";
const tokenUuid = `Scene.${SCENE}.Token.${TOKEN}`;

describe("attackTarget", () => {
  it("maps token, unlinked actor and world actor uuids", () => {
    expect(attackTarget(tokenUuid)).toEqual({ sceneId: SCENE, tokenId: TOKEN });
    expect(attackTarget(`${tokenUuid}.Actor.${ACTOR}`)).toEqual({ sceneId: SCENE, tokenId: TOKEN });
    expect(attackTarget(`Actor.${ACTOR}`)).toEqual({ actorId: ACTOR });
    expect(attackTarget("Item.x")).toBeNull();
    expect(attackTarget(5)).toBeNull();
  });
});

describe("dnd5eAttack (5.3.3 attack roll message)", () => {
  const message = (roll: object, targets: object[]) => ({
    flags: { dnd5e: { roll: { type: "attack" }, targets } },
    rolls: [roll],
  });

  it("reads crit, miss under the AC, fumble and hit per target", () => {
    const targets = [
      { uuid: `Actor.${ACTOR}`, ac: 15 },
      { uuid: tokenUuid, ac: 12 },
    ];
    expect(dnd5eAttack(message({ total: 13, isCritical: false, isFumble: false }, targets))).toEqual([
      { target: { actorId: ACTOR }, outcome: "miss" },
      { target: { sceneId: SCENE, tokenId: TOKEN }, outcome: "hit" },
    ]);
    expect(
      dnd5eAttack(message({ total: 25, isCritical: true }, targets)).map((each) => each.outcome),
    ).toEqual(["crit", "crit"]);
    expect(dnd5eAttack(message({ total: 30, isFumble: true }, targets.slice(1)))[0]?.outcome).toBe("miss");
  });

  it("counts total cover without a fumble as no miss, and ignores other rolls", () => {
    expect(dnd5eAttack(message({ total: 1 }, [{ uuid: tokenUuid, ac: null }]))[0]?.outcome).toBe("hit");
    expect(dnd5eAttack({ flags: { dnd5e: { roll: { type: "damage" } } }, rolls: [{}] })).toEqual([]);
    expect(dnd5eAttack({ flags: {} })).toEqual([]);
  });
});

describe("midiAttack (Midi QOL 14 card update)", () => {
  const card = (extra: object) => ({
    flags: {
      "midi-qol": {
        targets: [{ uuid: tokenUuid }, { uuid: `Scene.${SCENE}.Token.Token00000000002` }],
        hitTargetUuids: [tokenUuid],
        isCritical: false,
        ...extra,
      },
    },
  });

  it("skips the first update and reads hits from the second", () => {
    expect(midiAttack({ flags: { "midi-qol": { GMOnlyAttackRoll: true } } }, card({}))).toBeNull();
    expect(midiAttack({ content: "x" } as object, card({}))).toBeNull();
    const second = { flags: { "midi-qol": { GMOnlyAttackRoll: false } } };
    expect(midiAttack(second, card({}))).toEqual([
      { target: { sceneId: SCENE, tokenId: TOKEN }, outcome: "hit" },
      { target: { sceneId: SCENE, tokenId: "Token00000000002" }, outcome: "miss" },
    ]);
    expect(midiAttack(second, card({ isCritical: true }))?.[0]?.outcome).toBe("crit");
  });
});
