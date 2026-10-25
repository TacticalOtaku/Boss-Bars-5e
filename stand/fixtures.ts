import type { TokenState } from "../src/core/aggregate";
import { DEFAULT_AUTO_SHOW, type MiniBar, type Profile } from "../src/core/profile";
import type { EffectInput } from "../src/core/statuses";
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
  const base = {
    dataVersion: 2,
    playerName: "",
    portrait: null,
    displayMode: byActor ? "actor" : "token",
    autoShow: DEFAULT_AUTO_SHOW,
    statuses: { hidden: [], custom: [] },
    miniBars: [],
  };
  const id = `Inst${String(++order).padStart(12, "0")}`;
  return {
    instance: { id, kind: profile.kind ?? "elite", order, ...(byActor ? { actorId: id } : { tokenId: id }) },
    profile: { ...base, ...profile } as Profile,
    name,
    actorImg: portrait(hue),
    tokens,
  } satisfies SubjectInput;
}

const icon = (hue: number, glyph: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="hsl(${hue} 50% 30%)"/><text x="12" y="17" font-size="14" text-anchor="middle" fill="#fff">${glyph}</text></svg>`,
  )}`;
const effect = (name: string, hue: number, glyph: string, extra: Partial<EffectInput> = {}): EffectInput => ({
  id: name,
  name,
  img: icon(hue, glyph),
  description: `<p>${name}: описание из <b>HTML</b> эффекта.</p>`,
  statuses: [],
  showIcon: 2,
  temporary: true,
  autoCreated: false,
  stacks: 0,
  duration: "3 раунда",
  ...extra,
});
const EFFECTS = [
  effect("Благословение", 50, "✚"),
  effect("Яд (3)", 110, "☠", { stacks: 3 }),
  effect("Сбит с ног", 20, "↓", { duration: "" }),
  effect("Реакция", 0, "R", { statuses: ["reaction"] }),
  effect("Парализован", 270, "P", { autoCreated: true }),
];
const BOSS_BARS: MiniBar[] = [
  { id: "legact", label: "Легендарные действия", view: "pips", players: true, source: { type: "legact" } },
  { id: "temp", label: "Щит", view: "bar", players: true, source: { type: "temp" } },
  { id: "armour", label: "Броня", view: "bar", players: false, source: { type: "counter", max: 5 } },
];

const boss = { kind: "boss", title: "", size: 100 } as const;
const elite = (rank: string) => ({ kind: "elite", rank }) as const;

/** Fixtures in the shape the store hands to buildViews. */
export const FIXTURE_BOSSES: SubjectInput[] = [
  subject(
    "Ксар’Тун",
    0,
    {
      ...boss,
      title: "Пожиратель пепла",
      miniBars: BOSS_BARS,
      statuses: {
        hidden: [],
        custom: [{ id: "rage", name: "Ярость", img: icon(0, "!"), description: "Свой статус ГМа." }],
      },
    },
    [
      token("t1", 312, 420, {
        hp: { value: 312, effectiveMax: 420, temp: 24 },
        effects: EFFECTS,
        bars: { legact: { value: 2, max: 3 } },
      }),
    ],
  ),
  subject("Morwen", 140, { ...boss, playerName: "Морвен", title: "Тень у трона", size: 70 }, [
    token("t2", 88, 130),
  ]),
];

export const FIXTURE_ELITES: SubjectInput[] = [
  subject("Волк", 30, elite("guard"), [token("w1", 11, 11), token("w2", 5, 11)], true),
  subject("Орк-берсерк", 10, elite("veteran"), [token("o1", 30, 45)]),
  subject("Шаман", 260, elite("fighter"), [token("s1", 18, 27)]),
  subject(
    "Орк-вожак",
    50,
    {
      ...elite("captain"),
      playerName: "Гром",
      miniBars: [{ id: "legres", label: "Сопр.", view: "pips", players: true, source: { type: "legres" } }],
    },
    [token("c1", 60, 75, { effects: EFFECTS, bars: { legres: { value: 1, max: 2 } } })],
  ),
  subject("Орк-берсерк", 10, elite("veteran"), [token("o2", 45, 45)]),
  subject("Орк-берсерк", 10, elite("veteran"), [token("o3", 12, 45, { hidden: true })]),
];
