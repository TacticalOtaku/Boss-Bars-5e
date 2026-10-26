import "../styles/boss-bars-5e.scss";
import ru from "../lang/ru.json";
import { DEFAULT_LAYOUT } from "../src/core/layout";
import { BUILTIN_LOOKS, BUILTIN_PRESETS, BUILTIN_SOURCES, CLASSIC } from "../src/core/look/builtin";
import { FONT_FACES } from "../src/core/look/fonts";
import { resolveLook, type ResolvedLook } from "../src/core/look/resolve";
import { CATEGORIES, type Category } from "../src/core/look/schema";
import { buildViews, type SubjectInput } from "../src/core/view";
import { createBossStack } from "../src/ui/boss-stack";
import { createEliteColumn } from "../src/ui/elite-column";
import { registerFonts } from "../src/ui/look";
import { FIXTURE_BOSSES, FIXTURE_ELITES, FIXTURE_RANKS } from "./fixtures";

/**
 * The catalog sheet for approval (stage 10, decision 9): every built-in look as a boss bar and an elite card, then
 * every category's 30 presets, each on top of Classic RPG. Nothing here is part of the package.
 */
const fontUrls = import.meta.glob<string>("../fonts/*.woff2", {
  query: "?url",
  import: "default",
  eager: true,
});
registerFonts(FONT_FACES, (file) => fontUrls[`../fonts/${file}`] ?? "");

const t = (key: string): string => {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], ru);
  return typeof value === "string" ? value : key;
};

const CATEGORY_KEYS: Record<Category, string> = {
  layoutBar: "BB5E.Look.Category.LayoutBar",
  layoutCard: "BB5E.Look.Category.LayoutCard",
  font: "BB5E.Look.Category.Font",
  frame: "BB5E.Look.Category.Frame",
  fill: "BB5E.Look.Category.Fill",
  hpEffect: "BB5E.Look.Category.HpEffect",
  motion: "BB5E.Look.Category.Motion",
  portrait: "BB5E.Look.Category.Portrait",
  miniBars: "BB5E.Look.Category.MiniBars",
  statuses: "BB5E.Look.Category.Statuses",
};

const viewer = { isGM: true, collapsed: new Set<string>(), mayCollapse: false, mayCollapseElites: false };
const boss = FIXTURE_BOSSES[0] as SubjectInput;
const elite = FIXTURE_ELITES[3] as SubjectInput;

function tile(parent: HTMLElement, title: string): HTMLElement {
  const el = document.createElement("section");
  el.className = "tile";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const row = document.createElement("div");
  row.className = "tile-row";
  el.append(heading, row);
  parent.append(el);
  return row;
}

/** One boss bar (and, if asked, one elite card) drawn by the HUD renderer in the given look. */
function draw(host: HTMLElement, look: ResolvedLook, parts: { bar: boolean; card: boolean }, scale: number) {
  host.style.setProperty("--bb5e-ui-scale", String(scale));
  const views = buildViews(
    [
      { ...structuredClone(boss), look },
      { ...structuredClone(elite), look },
    ],
    FIXTURE_RANKS,
    viewer,
    12,
  );
  if (parts.bar) {
    const holder = document.createElement("div");
    host.append(holder);
    const stack = createBossStack(holder, {
      labels: { collapse: "", expand: "", defeated: "Повержен", phase: "Фаза {n}" },
      onCollapse: () => undefined,
      reducedMotion: () => true,
    });
    stack.update(views.bosses, { ...DEFAULT_LAYOUT.bosses }, scale);
    // Again once the bar is in the page: a live fill draws its first frame then.
    stack.update(views.bosses, { ...DEFAULT_LAYOUT.bosses }, scale);
  }
  if (parts.card) {
    const holder = document.createElement("div");
    host.append(holder);
    createEliteColumn(holder, { reducedMotion: () => true }).update(
      views.elites,
      views,
      DEFAULT_LAYOUT.elites,
      scale,
    );
  }
}

function section(id: string, title: string, width: string): HTMLElement {
  const content = document.getElementById("content") as HTMLElement;
  const heading = document.createElement("h2");
  heading.id = id;
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.setProperty("--tile", width);
  content.append(heading, grid);
  const link = document.createElement("a");
  link.href = `#${id}`;
  link.textContent = title;
  document.getElementById("nav")?.append(link);
  return grid;
}

// 1. The 30 looks: bar and card.
const looks = section("looks", "Облики", "560px");
BUILTIN_LOOKS.forEach((look, index) => {
  const resolved = resolveLook(look.id, {}, BUILTIN_SOURCES, CLASSIC);
  draw(tile(looks, `${index + 1}. ${t(look.name)}`), resolved, { bar: true, card: true }, 0.7);
});

// 2. Each category: its 30 presets over Classic RPG (the card layouts on a card, everything else on a bar).
for (const category of CATEGORIES) {
  const grid = section(category, t(CATEGORY_KEYS[category]), category === "layoutCard" ? "260px" : "420px");
  for (const preset of BUILTIN_PRESETS.filter((each) => each.category === category)) {
    const resolved = resolveLook(CLASSIC.id, { [category]: preset.id }, BUILTIN_SOURCES, CLASSIC);
    const card = category === "layoutCard";
    draw(tile(grid, t(preset.name)), resolved, { bar: !card, card }, card ? 0.7 : 0.55);
  }
}
