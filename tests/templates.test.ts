// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";
import en from "../lang/en.json";

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

const templates = files("templates", /\.hbs$/);
const handlebars = Handlebars.create();
handlebars.registerHelper("localize", (key: string) => key);
// Foundry registers preloaded templates as partials under their module path.
for (const file of templates) {
  const name = file.replaceAll("\\", "/").split("/").at(-1);
  handlebars.registerPartial(`modules/boss-bars-5e/templates/${name}`, readFileSync(file, "utf8"));
}

const panelRow = {
  tokenId: "t",
  instanceId: "i",
  name: "<b>Boss</b>",
  img: "a.webp",
  many: true,
  count: 3,
  counters: [{ barId: "a", label: "<b>C</b>", value: 1, max: 3 }],
  customs: [{ id: "s", name: "<b>S</b>", img: "s.webp", active: true }],
  phases: [{ id: "p", label: "<b>P</b>", selected: true }],
  waiting: true,
  canSay: true,
  quotes: [{ id: "q", label: "<b>Q</b>" }],
};
/** A context that switches every optional branch on, with markup in every user-written text. */
const context = {
  partId: "app-main",
  tabs: { main: { cssClass: "active" } },
  values: {
    playerName: '"><img src=x>',
    title: "<b>T</b>",
    portrait: null,
    size: 100,
    rank: "r",
    autoShow: { onCombatStart: true, hideOnCombatEnd: true, hideOnDefeat: true, delay: 3 },
  },
  miniBars: [
    {
      index: 0,
      id: "b",
      label: '"><b>L</b>',
      pips: true,
      players: true,
      sources: [{ value: "item", label: "<b>K</b>", selected: true }],
      items: [{ id: "i", name: "<b>I</b>", selected: true }],
      path: "<b>p</b>",
      pathMax: "<b>m</b>",
      counterMax: 3,
    },
  ],
  barsFull: true,
  statusChoices: [{ id: "prone", name: "<b>P</b>", img: "p.svg", hidden: true }],
  hiddenNames: "</textarea><b>x</b>",
  customStatuses: [
    { index: 0, id: "s", name: "<b>S</b>", img: "s.webp", description: "</textarea><b>D</b>" },
  ],
  statusesFull: true,
  phases: [
    {
      index: 0,
      id: "p",
      label: '"><b>L</b>',
      first: false,
      last: false,
      numeral: "I",
      placeholder: '"><b>P</b>',
      triggers: [{ value: "hp", label: "<b>T</b>", selected: true }],
      newer: '"><b>n</b>',
      below: 50,
      actors: [{ id: "a", name: "<b>A</b>", selected: true }],
      enter: { playerName: '"><b>N</b>', title: '"><b>T</b>', portrait: '"><b>p</b>' },
      music: {
        groups: [{ name: '"><b>G</b>', options: [{ value: "v", label: "<b>L</b>", selected: true }] }],
      },
      overrides: [
        { category: "frame", label: "<b>F</b>", options: [{ id: "p", name: "<b>P</b>", selected: true }] },
      ],
    },
  ],
  phasesFull: true,
  scale: [{ at: 0.5, text: "<b>S</b>" }],
  scaleLabel: '"><b>L</b>',
  refill: true,
  music: { groups: [{ name: '"><b>G</b>', options: [{ value: "v", label: "<b>L</b>", selected: true }] }] },
  musicFadeSeconds: 2,
  hasPhases: true,
  isElite: true,
  byActor: true,
  ranks: [{ id: "r", name: "<b>R</b>", selected: true }],
  limits: {
    text: 80,
    sizeMin: 50,
    sizeMax: 200,
    name: 40,
    offset: 10000,
    maxMin: 1,
    maxMax: 20,
    label: 40,
    fieldPath: 200,
    counterMax: 9999,
    description: 200,
    delayMax: 60,
  },
  worldLayer: false,
  blocks: [
    {
      key: "elites",
      label: "<b>L</b>",
      selected: true,
      isElites: true,
      overridden: true,
      anchorLabel: "↖ tl",
      dx: 1,
      dy: 2,
      max: 12,
      collapse: true,
      dirs: [{ value: "down", label: "<b>D</b>", selected: true }],
    },
  ],
  screens: [{ value: -1, label: "<b>S</b>", selected: true }],
  map: {
    w: 300,
    h: 200,
    zones: [{ x: 1, y: 2, w: 3, h: 4, soft: true, label: "<b>Z</b>" }],
    blocks: [{ x: 1, y: 2, w: 3, h: 4, warn: true, label: "<b>B</b>" }],
  },
  warnings: ["<b>W</b>"],
  hasProfile: true,
  hasScene: true,
  anyRows: true,
  anyShown: true,
  bosses: [panelRow],
  elites: [panelRow],
  rows: [
    {
      index: 0,
      first: true,
      last: false,
      id: "r",
      name: '"><b>R</b>',
      color: "#ffffff",
      size: 30,
      parts: { name: true, fill: true, statuses: true },
      looks: [{ id: "neon", name: "<b>N</b>", selected: true }],
      // Workshop rows share the key: their fields ride along.
      category: "frame",
      label: "<b>F</b>",
      inLook: "<b>I</b>",
      options: [{ id: "p", name: "<b>P</b>", selected: true }],
    },
  ],
  lookName: "<b>L</b>",
  sections: [{ id: "looks", label: "<b>S</b>", active: true }],
  filters: [{ id: "all", label: "<b>A</b>", active: true }],
  search: '"><b>s</b>',
  items: [{ id: "x", name: "<b>X</b>", builtIn: true, selected: true }],
  looks: [{ id: "x", name: "<b>X</b>", builtIn: false, selected: true }],
  sheet: false,
  detail: {
    own: true,
    isLook: true,
    name: '"><b>D</b>',
    rows: [
      {
        category: "frame",
        label: "<b>R</b>",
        current: "<b>C</b>",
        options: [{ id: "p", name: "<b>P</b>", selected: true }],
      },
    ],
    fields: [
      {
        name: "params.a",
        label: "<b>1</b>",
        isEnum: true,
        options: [{ value: "v", label: "<b>V</b>", selected: true }],
      },
      { name: "params.b", label: "<b>2</b>", isNumber: true, value: 1, min: 0, max: 2, step: 1 },
      { name: "params.c", label: "<b>3</b>", isBool: true, checked: true },
      { name: "params.d", label: "<b>4</b>", isColor: true, value: '"><b>c</b>' },
      { name: "params.e", label: "<b>5</b>", isText: true, value: '"><b>t</b>', max: 40, hint: "<b>H</b>" },
      { name: "params.f", label: "<b>6</b>", isPath: true, value: '"><b>p</b>', pickType: "image" },
    ],
  },
};

describe("templates", () => {
  // ApplicationV2 parts must render exactly one root element.
  it.each(templates)("%s renders one root element and escapes values", (file) => {
    const html = handlebars.compile(readFileSync(file, "utf8"))(context);
    const holder = document.createElement("template");
    holder.innerHTML = html;
    expect(holder.content.children).toHaveLength(1);
    expect(holder.content.querySelectorAll("b, img[src=x]")).toHaveLength(0);
  });

  it("uses only i18n keys that exist", () => {
    const sources = [...templates, ...files("src", /\.ts$/)].map((file) => readFileSync(file, "utf8"));
    const keys = new Set(sources.flatMap((source) => source.match(/BB5E(\.[A-Z][A-Za-z]*)+/g) ?? []));
    const missing = [...keys].filter(
      (key) =>
        typeof key
          .split(".")
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en) !== "string",
    );
    expect(missing).toEqual([]);
  });
});
