import { describe, expect, it } from "vitest";
import { buildBossView, type BossViewInput } from "../../src/core/view";

const input: BossViewInput = {
  instance: { id: "i1", kind: "boss", tokenId: "t1", order: 1 },
  profile: { dataVersion: 1, kind: "boss", playerName: "", title: "Пожиратель", portrait: null, size: 110 },
  tokenName: "Ксар’Тун",
  tokenHidden: false,
  actorImg: "actor.webp",
  hp: { value: 30, effectiveMax: 120, temp: 5 },
  dead: false,
  combatantDefeated: false,
};
const gm = { isGM: true, collapsed: new Set<string>(), mayCollapse: true };
const player = { isGM: false, collapsed: new Set<string>(), mayCollapse: true };

describe("buildBossView", () => {
  it("gives the GM numbers and the player only the fill", () => {
    expect(buildBossView(input, gm)?.numbers).toEqual({ value: 30, max: 120, temp: 5 });
    const view = buildBossView(input, player)!;
    expect(view).not.toHaveProperty("numbers");
    expect(JSON.stringify(view)).not.toMatch(/\b30\b|\b120\b|"temp"/);
    expect(view.fraction).toBe(0.25);
  });

  it("labels from the profile, else the token; portrait falls back to the actor", () => {
    expect(buildBossView(input, player)?.label).toBe("Ксар’Тун");
    expect(buildBossView({ ...input, profile: { ...input.profile, playerName: "???" } }, player)?.label).toBe(
      "???",
    );
    expect(buildBossView(input, player)?.portrait).toEqual({ src: "actor.webp", video: false });
    const video = { ...input, profile: { ...input.profile, portrait: "boss.WEBM?v=2" } };
    expect(buildBossView(video, player)?.portrait).toEqual({ src: "boss.WEBM?v=2", video: true });
  });

  it("hides a hidden token from players and mutes it for the GM", () => {
    const hidden = { ...input, tokenHidden: true };
    expect(buildBossView(hidden, player)).toBeNull();
    expect(buildBossView(hidden, gm)?.muted).toBe(true);
    expect(buildBossView(input, gm)?.muted).toBe(false);
  });

  it("is defeated at 0 HP, with the dead status or a defeated combatant", () => {
    expect(buildBossView(input, player)?.defeated).toBe(false);
    expect(buildBossView({ ...input, hp: { value: 0, effectiveMax: 120, temp: 0 } }, player)?.defeated).toBe(
      true,
    );
    expect(buildBossView({ ...input, dead: true }, player)?.defeated).toBe(true);
    expect(buildBossView({ ...input, combatantDefeated: true }, player)?.defeated).toBe(true);
  });

  it("lets only players collapse, when allowed", () => {
    expect(buildBossView(input, gm)?.canCollapse).toBe(false);
    expect(buildBossView(input, player)?.canCollapse).toBe(true);
    expect(buildBossView(input, { ...player, mayCollapse: false })?.canCollapse).toBe(false);
    expect(buildBossView(input, { ...player, collapsed: new Set(["i1"]) })?.collapsed).toBe(true);
    expect(
      buildBossView(input, { ...player, collapsed: new Set(["i1"]), mayCollapse: false })?.collapsed,
    ).toBe(false);
  });

  it("survives missing HP data", () => {
    expect(buildBossView({ ...input, hp: null }, gm)).toMatchObject({ fraction: null, defeated: false });
    expect(buildBossView({ ...input, hp: null }, gm)).not.toHaveProperty("numbers");
  });
});
