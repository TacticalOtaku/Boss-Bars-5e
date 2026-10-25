import { describe, expect, it } from "vitest";
import { buildStatuses, plainText, type EffectInput } from "../../src/core/statuses";

const effect = (name: string, extra: Partial<EffectInput> = {}): EffectInput => ({
  id: `e-${name}`,
  name,
  img: `${name}.webp`,
  description: "",
  statuses: [],
  showIcon: 1,
  temporary: true,
  autoCreated: false,
  stacks: 0,
  duration: "",
  ...extra,
});
const names = (result: ReturnType<typeof buildStatuses>) => result.statuses.map((status) => status.name);

describe("buildStatuses", () => {
  it("shows what Foundry draws on the token: always, or conditional and temporary", () => {
    const result = buildStatuses(
      [
        [
          effect("Prone", { showIcon: 2, temporary: false }),
          effect("Bless"),
          effect("Item bonus", { temporary: false }),
          effect("Never", { showIcon: 0 }),
        ],
      ],
      [],
      [],
      10,
    );
    expect(names(result)).toEqual(["Prone", "Bless"]);
  });

  it("never shows Midi bookkeeping or DAE's dependent copies", () => {
    const result = buildStatuses(
      [
        [
          effect("Reaction", { statuses: ["reaction"] }),
          effect("Bonus Action", { statuses: ["bonusaction"] }),
          effect("Flanking", { statuses: ["flanking"] }),
          effect("Flanked", { statuses: ["flanked"] }),
          effect("Hold Person", { statuses: ["paralyzed"] }),
          effect("Paralyzed", { statuses: ["paralyzed"], autoCreated: true }),
        ],
      ],
      [],
      [],
      10,
    );
    expect(names(result)).toEqual(["Hold Person"]);
  });

  it("hides by status id and by effect name, stack suffix included", () => {
    const result = buildStatuses(
      [[effect("Prone", { statuses: ["prone"] }), effect("Poison (3)", { stacks: 3 }), effect("Haste")]],
      ["PRONE", "poison"],
      [],
      10,
    );
    expect(names(result)).toEqual(["Haste"]);
  });

  it("merges ×N tokens by name and image, keeping the largest stack", () => {
    const result = buildStatuses(
      [[effect("Poison", { stacks: 2 })], [effect("Poison", { stacks: 4, id: "other" }), effect("Bless")]],
      [],
      [],
      10,
    );
    expect(result.statuses.map((status) => [status.name, status.stacks])).toEqual([
      ["Poison", 4],
      ["Bless", 0],
    ]);
  });

  it("adds custom statuses after the effects and cuts at the limit", () => {
    const custom = [{ id: "rage", name: "Rage", img: "rage.webp", description: "Angry <b>very</b>" }];
    const result = buildStatuses([[effect("A"), effect("B"), effect("C")]], [], custom, 2);
    expect(names(result)).toEqual(["A", "B"]);
    expect(result.overflow).toBe(2);
    const all = buildStatuses([[effect("A")]], [], custom, 10);
    expect(all.statuses[1]).toEqual({
      id: "custom-rage",
      name: "Rage",
      img: "rage.webp",
      stacks: 0,
      tooltip: "Rage\nAngry very",
    });
  });

  it("builds a plain-text tooltip from the name, remaining time and description", () => {
    const result = buildStatuses(
      [
        [
          effect("Bless", {
            duration: "9 rounds",
            description: "<p>Add @UUID[Item.x]{a d4} &amp; smile</p>",
          }),
        ],
      ],
      [],
      [],
      10,
    );
    expect(result.statuses[0]?.tooltip).toBe("Bless\n9 rounds\nAdd a d4 & smile");
  });
});

describe("plainText", () => {
  it("strips tags, enrichers and inline rolls, decodes entities, caps the length", () => {
    expect(plainText("<script>x</script>A&lt;b&gt; [[/r 1d4]] @Check[dex]&#33;")).toBe("x A<b> !");
    expect(plainText("x".repeat(400))).toHaveLength(300);
  });
});
