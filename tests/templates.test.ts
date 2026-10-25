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

/** A context that switches every optional branch on. */
const context = {
  partId: "app-main",
  tabs: { main: { cssClass: "active" } },
  profile: { playerName: '"><img src=x>', title: "", portrait: null, size: 100 },
  limits: { text: 80, sizeMin: 50, sizeMax: 200 },
  hasProfile: true,
  hasScene: true,
  anyShown: true,
  rows: [{ tokenId: "t", instanceId: "i", name: "<b>Boss</b>", img: "a.webp" }],
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
