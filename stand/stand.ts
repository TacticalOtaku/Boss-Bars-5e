import "../styles/boss-bars-5e.scss";
import { PLAYER_SCREENS } from "../src/core/screens";
import { ANCHORS, DEFAULT_LAYOUT, type Direction, type Placement } from "../src/core/layout";
import { isRecord } from "../src/core/schema";
import { BUILTIN_LOOKS, BUILTIN_SOURCES, CLASSIC } from "../src/core/look/builtin";
import { resolveLook } from "../src/core/look/resolve";
import { hpFraction } from "../src/core/hp";
import { nextPhase, phaseIndex, pickPhase } from "../src/core/phases";
import { pickQuote, speak, type QuoteEvent } from "../src/core/quotes";
import { LIVE_FILLS, type LiveFill } from "../src/core/look/live";
import { vfxRenderer } from "../src/ui/vfx/renderer";
import { buildViews, ELITE_COLUMN_ID, type SubjectInput } from "../src/core/view";
import { FONT_FACES } from "../src/core/look/fonts";
import { createBossStack } from "../src/ui/boss-stack";
import { registerFonts } from "../src/ui/look";
import { createEliteColumn } from "../src/ui/elite-column";
import { reducedMotion } from "../src/ui/dom";
import { mountOverlay } from "../src/ui/overlay";
import { startHudDrag } from "../src/ui/hud-drag";
import { logger } from "../src/logger";
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
let quotePlace: "above" | "below" | "side" = "above";
/** A live fill type forced onto the current look; null — the look's own. */
let liveType: LiveFill | null = null;

const overlay = mountOverlay(host);
const stack = createBossStack(overlay, {
  movable: true,
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

// Fixture-only persistence exercises the runtime controller without a Foundry world or settings service.
const POSITION_KEY = "boss-bars-5e-stand-positions";
function loadPositions(): Record<string, Placement> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "{}");
    if (!isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, item]) =>
          isRecord(item) &&
          typeof item.anchor === "string" &&
          Object.hasOwn(ANCHORS, item.anchor) &&
          typeof item.dx === "number" &&
          Number.isFinite(item.dx) &&
          typeof item.dy === "number" &&
          Number.isFinite(item.dy),
      ),
    ) as Record<string, Placement>;
  } catch {
    return {};
  }
}
let positions = loadPositions();
const movement = startHudDrag({
  host,
  overlay,
  uiScale: () => state.uiScale,
  hint: "Перетащите мышкой. Стрелки — сдвиг, Shift — быстрее, Home — сброс.",
  positionOf: (_scene, id) => positions[id] ?? null,
  async save(_scene, id, placement) {
    if (placement) positions[id] = placement;
    else positions = Object.fromEntries(Object.entries(positions).filter(([key]) => key !== id));
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(positions));
      return true;
    } catch {
      return false;
    }
  },
  onError: () => logger.error("Не удалось сохранить положение HUD на стенде."),
});
import.meta.hot?.dispose(() => movement.stop());

/** What the stand's "GM" last saw of each boss: HP share and phase, for the quote events. */
const seen = new Map<string, { fraction: number | null; phase: string | undefined }>();
const quoteContext = (subject: SubjectInput) => ({
  fight: "stand",
  round: null,
  now: Date.now(),
  name: subject.profile.playerName || subject.name,
  random: Math.random,
});

/** The active GM's phase and quote engines, run in place. */
function runPhases(): void {
  for (const subject of state.bosses) {
    const hp = subject.tokens[0]?.hp;
    if (subject.profile.kind !== "boss" || !hp) continue;
    const step = nextPhase(subject.profile.phases, subject.instance.phase, hpFraction(hp));
    if (step) subject.instance.phase = step.state;
    const now = { fraction: hpFraction(hp), phase: subject.instance.phase?.id };
    const before = seen.get(subject.instance.id);
    seen.set(subject.instance.id, now);
    if (!before) continue;
    const events: QuoteEvent[] = [];
    if (now.phase && now.phase !== before.phase) events.push({ type: "phase", phaseId: now.phase });
    if (before.fraction !== null && now.fraction !== null && now.fraction !== before.fraction) {
      events.push(
        now.fraction < before.fraction
          ? { type: "hp", from: before.fraction, to: now.fraction }
          : { type: "heal" },
      );
    }
    const pick = pickQuote(
      subject.profile.quotes,
      events,
      subject.instance.quoteState ?? {},
      subject.instance.quote,
      quoteContext(subject),
    );
    if (pick) {
      subject.instance.quote = pick.shown;
      subject.instance.quoteState = { ...subject.instance.quoteState, [pick.quoteId]: pick.state };
    }
  }
}

function render(): void {
  runPhases();
  const viewer = { isGM: state.gm, collapsed: state.collapsed, mayCollapse: true, mayCollapseElites: true };
  const base = looks[lookIndex];
  const look =
    base && liveType
      ? { ...base, fill: { ...base.fill, params: { ...base.fill.params, type: liveType } } }
      : base;
  const subjects = [...state.bosses, ...state.elites].map((subject) => ({ ...subject, look }));
  const views = buildViews(subjects, FIXTURE_RANKS, viewer, state.limit, peaks);
  stack.update(views.bosses, { ...DEFAULT_LAYOUT.bosses, dir: state.bossDir }, state.uiScale);
  // The quote place is a layout parameter; the stand flips it on the rendered bars to show all three.
  for (const bar of overlay.querySelectorAll<HTMLElement>(".bb5e-boss")) bar.dataset.lookQuote = quotePlace;
  column.update(views.elites, views, DEFAULT_LAYOUT.elites, state.uiScale);
  movement.update("stand", [
    ...stack.targets(),
    ...(views.column.total ? [{ id: "elites", element: column.element, label: "Элита" }] : []),
  ]);
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
  Фраза: () => {
    const subject = state.bosses[0];
    const quote =
      subject?.profile.kind === "boss" ? subject.profile.quotes.find((each) => each.id === "say") : undefined;
    if (!subject || !quote) return;
    const pick = speak(quote, subject.instance.quoteState?.say, quoteContext(subject));
    subject.instance.quote = pick.shown;
    subject.instance.quoteState = { ...subject.instance.quoteState, say: pick.state };
  },
  "Фраза: под / сбоку / над": () => {
    const next = { above: "below", below: "side", side: "above" } as const;
    quotePlace = next[quotePlace];
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
  // Budget check (VFX decision 4): fill the column to the 12-card limit with copies of a veteran.
  "12 элит": () => {
    const veteran = FIXTURE_ELITES[1];
    if (!veteran) return;
    for (let i = state.elites.length; i < 13; i++) {
      const copy = structuredClone(veteran);
      const id = `Inst9${String(i).padStart(11, "0")}`;
      copy.instance = { ...copy.instance, id, tokenId: id, order: 100 + i };
      copy.tokens = copy.tokens.map((t) => ({ ...t, tokenId: `x${i}` }));
      copy.name = `Орк ${i}`;
      state.elites.push(copy);
    }
  },
  "ГМ / игрок": () => (state.gm = !state.gm),
  "Боссы: вниз / в ряд": () => (state.bossDir = state.bossDir === "down" ? "row" : "down"),
  "uiScale 0.8 / 1": () => (state.uiScale = state.uiScale === 1 ? 0.8 : 1),
  "Облик →": () => (lookIndex = (lookIndex + 1) % looks.length),
  "Меньше движения": () => document.body.classList.toggle("performance-low"),
  "Живая заливка →": () => {
    const next = liveType ? LIVE_FILLS.indexOf(liveType) + 1 : 0;
    liveType = LIVE_FILLS[next] ?? null;
  },
  "Потеря контекста (2 с)": () => vfxRenderer()?.simulateLoss(2000),
  Сброс: () => {
    Object.assign(state, fresh());
    state.collapsed.clear();
    positions = {};
    localStorage.removeItem(POSITION_KEY);
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
