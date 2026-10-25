import type { BossViewInput } from "../src/core/view";

const portrait = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 45% 18%)"/><circle cx="32" cy="24" r="12" fill="hsl(${hue} 40% 70%)"/><ellipse cx="32" cy="62" rx="24" ry="20" fill="hsl(${hue} 45% 35%)"/></svg>`,
  )}`;

/** Fixture bosses in the shape the store hands to buildBossView. */
export const FIXTURE_BOSSES: BossViewInput[] = [
  {
    instance: { id: "Inst000000000001", kind: "boss", tokenId: "Token00000000001", order: 1 },
    profile: {
      dataVersion: 1,
      kind: "boss",
      playerName: "",
      title: "Пожиратель пепла",
      portrait: null,
      size: 100,
    },
    tokenName: "Ксар’Тун",
    tokenHidden: false,
    actorImg: portrait(0),
    hp: { value: 312, effectiveMax: 420, temp: 24 },
    dead: false,
    combatantDefeated: false,
  },
  {
    instance: { id: "Inst000000000002", kind: "boss", tokenId: "Token00000000002", order: 2 },
    profile: {
      dataVersion: 1,
      kind: "boss",
      playerName: "Морвен",
      title: "Тень у трона",
      portrait: null,
      size: 70,
    },
    tokenName: "Morwen, Shadow Queen",
    tokenHidden: false,
    actorImg: portrait(140),
    hp: { value: 88, effectiveMax: 130, temp: 0 },
    dead: false,
    combatantDefeated: false,
  },
];
