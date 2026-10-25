import "../styles/boss-bars-5e.scss";
import { PLAYER_SCREENS } from "../src/core/screens";
import { DEFAULT_LAYOUT, type Direction } from "../src/core/layout";
import { buildViews, ELITE_COLUMN_ID, type SubjectInput } from "../src/core/view";
import { createBossStack } from "../src/ui/boss-stack";
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
const peaks = new Map<string, number>();
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const overlay = mountOverlay(host);
const stack = createBossStack(overlay, {
  labels: { collapse: "Свернуть", expand: "Развернуть" },
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

function render(): void {
  const viewer = { isGM: state.gm, collapsed: state.collapsed, mayCollapse: true, mayCollapseElites: true };
  const views = buildViews([...state.bosses, ...state.elites], FIXTURE_RANKS, viewer, state.limit, peaks);
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
  "Урон элите": () => state.elites.forEach((elite) => hurt(elite, 0.2)),
  "Лимит 12 / 3": () => (state.limit = state.limit === 12 ? 3 : 12),
  "ГМ / игрок": () => (state.gm = !state.gm),
  "Боссы: вниз / в ряд": () => (state.bossDir = state.bossDir === "down" ? "row" : "down"),
  "uiScale 0.8 / 1": () => (state.uiScale = state.uiScale === 1 ? 0.8 : 1),
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
