import "../styles/boss-bars-5e.scss";
import { PLAYER_SCREENS } from "../src/core/screens";
import { buildBossView, type BossViewInput } from "../src/core/view";
import { createBossStack } from "../src/ui/boss-stack";
import { mountOverlay } from "../src/ui/overlay";
import { FIXTURE_BOSSES } from "./fixtures";

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

const state = {
  gm: true,
  uiScale: 1,
  bosses: [structuredClone(FIXTURE_BOSSES[0]!)],
  collapsed: new Set<string>(),
};

const stack = createBossStack(mountOverlay(host), {
  labels: { collapse: "Свернуть", expand: "Развернуть" },
  onCollapse(id, collapsed) {
    if (collapsed) state.collapsed.add(id);
    else state.collapsed.delete(id);
    render();
  },
  reducedMotion: () => matchMedia("(prefers-reduced-motion: reduce)").matches,
});

function render(): void {
  const viewer = { isGM: state.gm, collapsed: state.collapsed, mayCollapse: true };
  stack.update(
    state.bosses.flatMap((boss) => buildBossView(boss, viewer) ?? []),
    state.uiScale,
  );
}

const first = () => state.bosses[0];
const hurt = (share: number) => (boss: BossViewInput) => {
  if (boss.hp) boss.hp.value = Math.max(0, Math.round(boss.hp.value - boss.hp.effectiveMax * share));
};

const ACTIONS: Record<string, () => void> = {
  "Урон 10%": () => first() && hurt(0.1)(first()!),
  "Урон 30%": () => first() && hurt(0.3)(first()!),
  Лечение: () => {
    const hp = first()?.hp;
    if (hp) hp.value = Math.min(hp.effectiveMax, hp.value + Math.round(hp.effectiveMax * 0.2));
  },
  Поражение: () => first() && (first()!.dead = !first()!.dead),
  "Скрыть токен": () => first() && (first()!.tokenHidden = !first()!.tokenHidden),
  "Второй босс": () => {
    if (state.bosses.length > 1) state.bosses.pop();
    else state.bosses.push(structuredClone(FIXTURE_BOSSES[1]!));
  },
  "ГМ / игрок": () => (state.gm = !state.gm),
  "uiScale 0.8 / 1": () => (state.uiScale = state.uiScale === 1 ? 0.8 : 1),
  Сброс: () => {
    state.bosses = [structuredClone(FIXTURE_BOSSES[0]!)];
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
