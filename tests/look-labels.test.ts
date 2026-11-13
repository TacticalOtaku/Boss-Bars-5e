import { describe, expect, it } from "vitest";
import en from "../lang/en.json";
import ru from "../lang/ru.json";
import { CATEGORY_LABELS, FONT_LABELS, PARAM_LABELS, VALUE_LABELS } from "../src/apps/look-labels";
import { FONTS } from "../src/core/look/fonts";
import { CATEGORIES, PARAMS } from "../src/core/look/schema";

const hasKey = (bundle: Record<string, unknown>, key: string): boolean => {
  let node: unknown = bundle;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
};

describe("look-labels parity with schema and localization", () => {
  it("labels every category and has no stale category keys", () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORIES].sort());
    for (const key of Object.values(CATEGORY_LABELS)) {
      expect([key, hasKey(en, key), hasKey(ru, key)]).toEqual([key, true, true]);
    }
  });

  it("labels every parameter in PARAMS with no missing or stale keys", () => {
    const schemaKeys = CATEGORIES.flatMap((category) =>
      Object.keys(PARAMS[category]).map((param) => `${category}.${param}`),
    );
    expect(Object.keys(PARAM_LABELS).sort()).toEqual(schemaKeys.sort());
    for (const key of Object.values(PARAM_LABELS)) {
      expect([key, hasKey(en, key), hasKey(ru, key)]).toEqual([key, true, true]);
    }
  });

  it("labels every enum value in PARAMS with no missing or stale keys", () => {
    const enumValues = new Set<string>();
    for (const category of CATEGORIES) {
      for (const param of Object.values(PARAMS[category])) {
        if (param.type === "enum") {
          for (const value of param.values) enumValues.add(value);
        }
      }
    }
    expect(Object.keys(VALUE_LABELS).sort()).toEqual([...enumValues].sort());
    for (const key of Object.values(VALUE_LABELS)) {
      expect([key, hasKey(en, key), hasKey(ru, key)]).toEqual([key, true, true]);
    }
  });

  it("labels every built-in font and custom font choice", () => {
    expect(Object.keys(FONT_LABELS).sort()).toEqual([...Object.keys(FONTS), "custom"].sort());
    expect([hasKey(en, FONT_LABELS.custom!), hasKey(ru, FONT_LABELS.custom!)]).toEqual([true, true]);
  });
});
