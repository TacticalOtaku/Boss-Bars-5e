import "../styles/boss-bars-5e.scss";
import { PLAYER_SCREENS } from "../src/core/screens";
import { DEFAULT_LAYOUT, type Direction } from "../src/core/layout";
import { BUILTIN_LOOKS, BUILTIN_SOURCES, CLASSIC } from "../src/core/look/builtin";
import { resolveLook } from "../src/core/look/resolve";
import { hpFraction } from "../src/core/hp";
import { nextPhase, phaseIndex, pickPhase } from "../src/core/phases";
import { buildViews, ELITE_COLUMN_ID, type SubjectInput } from "../src/core/view";
import { FONT_FACES } from "../src/core/look/fonts";
import { createBossStack } from "../src/ui/boss-stack";
import { registerFonts } from "../src/ui/look";
import { createEliteColumn } from "../src/ui/elite-column";
import { mountOverlay } from "../src/ui/overlay";
import { FIXTURE_BOSSES, FIXTURE_ELITES, FIXTURE_RANKS } from "./fixtures";

const select = document.querySelector<HTMLSelectElement>("#screen")!;
const viewport = document.querySelector<HTMLElement>(".stand-viewport")!;
const host = document.querySelector<HTMLElement>("#interface")!;
const controls = document.querySelector<HTMLElement>("#controls")!;

for (const [index, { width, height }] of PLAYER_SCREENS.entries()) {
  select.add(new Option(`${width}×${height}`, String(index), false, width === 1920));
}

/** Show the chosen player screen at its real pixel size, scaled down to fit the stand. */
function applyScreen(): void {
  const screen = PLAYER_SCREENS[Number(select.value)] ?? PLAYER_SCREENS[0];
  host.style.width = `${screen.width}px`;
  host.style.height = `${screen.height}px`;
  const scale = Math.min(1, viewport.clientWidth / screen.width, viewport.clientHeight / screen.height);
  host.style.transform = `scale(${scale})`;
}

select.addEventListener("change", applyScreen);
new ResizeObserver(applyScreen).observe(viewport);
applyScreen();

const fresh = () => ({
  bosses: [structuredClone(FIXTURE_BOSSES[0]!)],
  elites: structuredClone(FIXTURE_ELITES),
});
const state = {
  gm: true,
  uiScale: 1,
  limit: 12,
  bossDir: "down" as Direction,
  collapsed: new Set<string>(),
  ...fresh(),
};
// The dev server serves the fonts folder by URL imports (the module resolves them from its script URL).
const fontUrls = import.meta.glob<string>("../fonts/*.woff2", {
  query: "?url",
  import: "default",
  eager: true,
});
registerFonts(FONT_FACES, (file) => fontUrls[`../fonts/${file}`] ?? "");
const peaks = new Map<string, number>();
// One resolved object per look, as the store keeps them: equal looks share one style.
const looks = BUILTIN_LOOKS.map((look) => resolveLook(look.id, {}, BUILTIN_SOURCES, CLASSIC));
let lookIndex = 0;
const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.body.classList.contains("performance-low");

const overlay = mountOverlay(host);
const stack = createBossStack(overlay, {
  labels: { collapse: "Свернуть", expand: "Развернуть", defeated: "Повержен", phase: "Фаза {n}" },
  onCollapse(id, collapsed) {
    if (collapsed) state.collapsed.add(id);
    else state.collapsed.delete(id);
    render();
  },
  reducedMotion,
});
const column = createEliteColumn(overlay, {
  reducedMotion,
  collapse: {
    labels: { title: "Элита", collapse: "Свернуть", expand: "Развернуть" },
    onToggle(collapsed) {
      if (collapsed) state.collapsed.add(ELITE_COLUMN_ID);
      else state.collapsed.delete(ELITE_COLUMN_ID);
      render();
    },
  },
});

/** The active GM's phase engine, run in place: damage through a threshold changes the phase. */
function runPhases(): void {
  for (const subject of state.bosses) {
    const hp = subject.tokens[0]?.hp;
    if (subject.profile.kind !== "boss" || !hp) continue;
    const step = nextPhase(subject.profile.phases, subject.instance.phase, hpFraction(hp));
    if (step) subject.instance.phase = step.state;
  }
}

function render(): void {
  runPhases();
  const viewer = { isGM: state.gm, collapsed: state.collapsed, mayCollapse: true, mayCollapseElites: true };
  const look = looks[lookIndex];
  const subjects = [...state.bosses, ...state.elites].map((subject) => ({ ...subject, look }));
  const views = buildViews(subjects, FIXTURE_RANKS, viewer, state.limit, peaks);
  stack.update(views.bosses, { ...DEFAULT_LAYOUT.bosses, dir: state.bossDir }, state.uiScale);
  column.update(views.elites, views, DEFAULT_LAYOUT.elites, state.uiScale);
}

const firstHp = () => state.bosses[0]?.tokens[0]?.hp;
const hurt = (subject: SubjectInput | undefined, share: number) => {
  for (const token of subject?.tokens ?? []) {
    if (token.hp) token.hp.value = Math.max(0, Math.round(token.hp.value - token.hp.effectiveMax * share));
  }
};

const ACTIONS: Record<string, () => void> = {
  "Урон 10%": () => hurt(state.bosses[0], 0.1),
  "Урон 30%": () => hurt(state.bosses[0], 0.3),
  Лечение: () => {
    const hp = firstHp();
    if (hp) hp.value = Math.min(hp.effectiveMax, hp.value + Math.round(hp.effectiveMax * 0.2));
  },
  Поражение: () => {
    const token = state.bosses[0]?.tokens[0];
    if (token) token.defeated = !token.defeated;
  },
  "Скрыть токен": () => {
    const token = state.bosses[0]?.tokens[0];
    if (token) token.hidden = !token.hidden;
  },
  "Второй босс": () => {
    if (state.bosses.length > 1) state.bosses.pop();
    else state.bosses.push(structuredClone(FIXTURE_BOSSES[1]!));
  },
  "Щит −8": () => {
    const hp = firstHp();
    if (hp) hp.temp = hp.temp > 0 ? Math.max(0, hp.temp - 8) : 24;
  },
  "Легендарное −1": () => {
    const leg = state.bosses[0]?.tokens[0]?.bars?.legact;
    if (leg) leg.value = leg.value > 0 ? leg.value - 1 : leg.max;
  },
  "Броня −1": () => {
    const instance = state.bosses[0]?.instance;
    if (!instance) return;
    const value = instance.counters?.armour ?? 5;
    instance.counters = { armour: value > 0 ? value - 1 : 5 };
  },
  "Свой статус": () => {
    const instance = state.bosses[0]?.instance;
    if (instance) instance.customStatuses = instance.customStatuses?.length ? [] : ["rage"];
  },
  "Фаза →": () => {
    const subject = state.bosses[0];
    if (subject?.profile.kind !== "boss") return;
    const { phases } = subject.profile;
    const next = phases[(phaseIndex(phases, subject.instance.phase) + 1) % phases.length];
    const hp = subject.tokens[0]?.hp;
    const step = next ? pickPhase(phases, next.id, hp ? hpFraction(hp) : null) : null;
    if (step) subject.instance.phase = step.state;
  },
  "Сегменты / перезаливка": () => {
    const profile = state.bosses[0]?.profile;
    if (profile?.kind === "boss") profile.fillMode = profile.fillMode === "segments" ? "refill" : "segments";
  },
  "Засечки игрокам": () => {
    const profile = state.bosses[0]?.profile;
    if (profile?.kind === "boss") profile.playerTicks = !profile.playerTicks;
  },
  "Урон элите": () => state.elites.forEach((elite) => hurt(elite, 0.2)),
  "Лимит 12 / 3": () => (state.limit = state.limit === 12 ? 3 : 12),
  "ГМ / игрок": () => (state.gm = !state.gm),
  "Боссы: вниз / в ряд": () => (state.bossDir = state.bossDir === "down" ? "row" : "down"),
  "uiScale 0.8 / 1": () => (state.uiScale = state.uiScale === 1 ? 0.8 : 1),
  "Облик →": () => (lookIndex = (lookIndex + 1) % looks.length),
  "Меньше движения": () => document.body.classList.toggle("performance-low"),
  Сброс: () => {
    Object.assign(state, fresh());
    state.collapsed.clear();
  },
};

for (const [label, action] of Object.entries(ACTIONS)) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => {
    action();
    render();
  });
  controls.append(button);
}

render();
