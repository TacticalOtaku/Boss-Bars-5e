import type { TokenState } from "../src/core/aggregate";
import type { Profile } from "../src/core/profile";
import { defaultRanks } from "../src/core/ranks";
import type { SubjectInput } from "../src/core/view";

const portrait = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 45% 18%)"/><circle cx="32" cy="24" r="12" fill="hsl(${hue} 40% 70%)"/><ellipse cx="32" cy="62" rx="24" ry="20" fill="hsl(${hue} 45% 35%)"/></svg>`,
  )}`;

export const FIXTURE_RANKS = defaultRanks(["Капитан", "Ветеран", "Боец", "Страж"]);

const token = (id: string, value: number, max: number, extra: Partial<TokenState> = {}): TokenState => ({
  tokenId: id,
  hidden: false,
  linked: false,
  hp: { value, effectiveMax: max, temp: 0 },
  defeated: false,
  ...extra,
});

let order = 0;
function subject(
  name: string,
  hue: number,
  profile: Partial<Profile>,
  tokens: TokenState[],
  byActor = false,
) {
  const base = { dataVersion: 2, playerName: "", portrait: null, displayMode: byActor ? "actor" : "token" };
  const id = `Inst${String(++order).padStart(12, "0")}`;
  return {
    instance: { id, kind: profile.kind ?? "elite", order, ...(byActor ? { actorId: id } : { tokenId: id }) },
    profile: { ...base, ...profile } as Profile,
    name,
    actorImg: portrait(hue),
    tokens,
  } satisfies SubjectInput;
}

const boss = { kind: "boss", title: "", size: 100 } as const;
const elite = (rank: string) => ({ kind: "elite", rank }) as const;

/** Fixtures in the shape the store hands to buildViews. */
export const FIXTURE_BOSSES: SubjectInput[] = [
  subject("Ксар’Тун", 0, { ...boss, title: "Пожиратель пепла" }, [
    token("t1", 312, 420, { hp: { value: 312, effectiveMax: 420, temp: 24 } }),
  ]),
  subject("Morwen", 140, { ...boss, playerName: "Морвен", title: "Тень у трона", size: 70 }, [
    token("t2", 88, 130),
  ]),
];

export const FIXTURE_ELITES: SubjectInput[] = [
  subject("Волк", 30, elite("guard"), [token("w1", 11, 11), token("w2", 5, 11)], true),
  subject("Орк-берсерк", 10, elite("veteran"), [token("o1", 30, 45)]),
  subject("Шаман", 260, elite("fighter"), [token("s1", 18, 27)]),
  subject("Орк-вожак", 50, { ...elite("captain"), playerName: "Гром" }, [token("c1", 60, 75)]),
  subject("Орк-берсерк", 10, elite("veteran"), [token("o2", 45, 45)]),
  subject("Орк-берсерк", 10, elite("veteran"), [token("o3", 12, 45, { hidden: true })]),
];
