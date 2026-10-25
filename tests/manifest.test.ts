import { describe, expect, it } from "vitest";
import manifest from "../module.json";
import en from "../lang/en.json";
import ru from "../lang/ru.json";

type Strings = { [key: string]: string | Strings };

function flatten(value: Strings, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof child === "string" ? [[path, child]] : Object.entries(flatten(child, path));
    }),
  );
}

const placeholders = (text: string) => [...text.matchAll(/\{\w+\}/g)].map(([match]) => match).sort();

describe("module manifest", () => {
  it("targets Foundry 14.367 and dnd5e 5.3.3", () => {
    expect(manifest.id).toBe("boss-bars-5e");
    expect(manifest.compatibility).toEqual({ minimum: "14", verified: "14.367", maximum: "14" });
    expect(manifest.relationships.systems).toEqual([
      { id: "dnd5e", type: "system", compatibility: { minimum: "5.3.3", verified: "5.3.3" } },
    ]);
  });

  it("lists the built entry, stylesheet, languages and socket", () => {
    expect(manifest.esmodules).toEqual(["scripts/boss-bars-5e.js"]);
    expect(manifest.styles).toEqual(["styles/boss-bars-5e.css"]);
    expect(manifest.languages.map((language) => language.lang)).toEqual(["en", "ru"]);
    expect(manifest.socket).toBe(true);
  });
});

describe("localisation", () => {
  const english = flatten(en);
  const russian = flatten(ru);

  it("has the same keys in English and Russian", () => {
    expect(Object.keys(russian).sort()).toEqual(Object.keys(english).sort());
  });

  it("keeps the same placeholders in every string", () => {
    for (const [key, text] of Object.entries(english)) {
      expect(placeholders(russian[key] ?? ""), key).toEqual(placeholders(text));
    }
  });

  it("has no empty strings", () => {
    for (const text of [...Object.values(english), ...Object.values(russian)])
      expect(text.trim()).not.toBe("");
  });
});
