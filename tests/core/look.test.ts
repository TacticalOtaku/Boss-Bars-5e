import { describe, expect, it } from "vitest";
import {
  BUILTIN_IDS,
  BUILTIN_LOOKS,
  BUILTIN_PRESETS,
  BUILTIN_SOURCES,
  CLASSIC,
} from "../../src/core/look/builtin";
import { effectStrength, hpChange, hpColor, isLow } from "../../src/core/look/effects";
import { resolveLook } from "../../src/core/look/resolve";
import {
  CATEGORIES,
  IMPORT_MAX_BYTES,
  LIBRARY_VERSION,
  parseImport,
  PARAMS,
  readLibrary,
  readParams,
} from "../../src/core/look/schema";
import { lookStyle } from "../../src/core/look/style";

describe("readParams", () => {
  it("keeps fitting values and replaces the rest with defaults", () => {
    const params = readParams("fill", {
      type: "flame",
      colors: ["#ABCDEF", "red", "#00000080", 5, "#111111", "#222222", "#333333", "#444444"],
      byHp: "yes",
      segmentEvery: 500,
      texture: 'x") ; background: url("evil',
      extra: 1,
    });
    expect(params.type).toBe("flame");
    expect(params.colors).toEqual(["#abcdef", "#00000080", "#111111", "#222222", "#333333"]);
    expect(params.byHp).toBe(false);
    expect(params.segmentEvery).toBe(50);
    expect(params.texture).toBe("");
    expect(params).not.toHaveProperty("extra");
  });

  it("gives the Classic RPG defaults for an empty preset", () => {
    expect(readParams("statuses", {})).toMatchObject({ max: 10, maxCard: 4, shape: "square" });
    expect(readParams("fill", undefined).shield).toBe(true);
    expect(readParams("font", { color2: "" }).color2).toBe("");
    expect(readParams("font", { family: "Comic Sans; x" }).family).toBe("cormorant");
  });
});

describe("built-in catalog", () => {
  it("has three looks, each with a preset in every category, all ids distinct", () => {
    expect(BUILTIN_LOOKS.map((look) => look.id)).toEqual(["classic", "frost", "neon"]);
    for (const look of BUILTIN_LOOKS) {
      for (const category of CATEGORIES) {
        expect(BUILTIN_PRESETS.find((each) => each.id === look.presets[category])?.category).toBe(category);
      }
    }
    expect(BUILTIN_IDS.size).toBe(BUILTIN_LOOKS.length + BUILTIN_PRESETS.length);
  });

  it("Classic RPG is the parameter defaults", () => {
    const classic = resolveLook("classic", {}, BUILTIN_SOURCES, CLASSIC);
    for (const category of CATEGORIES) expect(classic[category].params).toEqual(readParams(category, {}));
  });
});

describe("resolveLook", () => {
  const own = {
    id: "mine-frame",
    name: "Mine",
    category: "frame" as const,
    params: readParams("frame", { color: "#ff0000" }),
  };
  const sources = {
    looks: [
      ...BUILTIN_LOOKS,
      { id: "mine", name: "Mine", presets: { frame: "mine-frame", fill: "frost-fill" } },
    ],
    presets: [...BUILTIN_PRESETS, own],
  };

  it("takes the look's presets, then overrides, and fills gaps from Classic", () => {
    const look = resolveLook("mine", { font: "neon-font" }, sources, CLASSIC);
    expect([look.id, look.frame.id, look.fill.id, look.font.id, look.motion.id]).toEqual([
      "mine",
      "mine-frame",
      "frost-fill",
      "neon-font",
      "classic-motion",
    ]);
  });

  it("falls back on unknown looks and on presets of the wrong category", () => {
    const look = resolveLook("gone", { frame: "frost-fill", fill: "missing" }, sources, CLASSIC);
    expect([look.id, look.frame.id, look.fill.id]).toEqual(["classic", "classic-frame", "classic-fill"]);
  });
});

describe("readLibrary and import", () => {
  const preset = { id: "Abc123", name: "Red frame", category: "frame", params: { color: "#ff0000" } };

  it("reads looks and presets, drops bad ones and entries shadowing built-ins", () => {
    const read = readLibrary(
      {
        dataVersion: 1,
        looks: [
          { id: "L1", name: "Mine", presets: { frame: "Abc123", nope: "x", fill: "bad id!" } },
          { id: "classic" },
        ],
        presets: [preset, { id: "x y", category: "frame" }, { id: "p2", category: "unknown" }],
      },
      BUILTIN_IDS,
    );
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.value.looks).toEqual([{ id: "L1", name: "Mine", presets: { frame: "Abc123" } }]);
    expect(read.value.presets.map((each) => [each.id, (each.params as { color?: string }).color])).toEqual([
      ["Abc123", "#ff0000"],
    ]);
  });

  it("treats nothing stored as empty and refuses newer or malformed data", () => {
    expect(readLibrary(undefined)).toEqual({
      status: "ok",
      value: { dataVersion: LIBRARY_VERSION, looks: [], presets: [] },
    });
    expect(readLibrary({ dataVersion: 3, looks: [], presets: [] }).status).toBe("newer");
    expect(readLibrary({ dataVersion: 1, looks: {} }).status).toBe("invalid");
  });

  it("imports the export shape within the size limit", () => {
    const json = JSON.stringify({ dataVersion: 1, looks: [], presets: [preset] });
    expect(parseImport(json, BUILTIN_IDS)).toMatchObject({ presets: [{ id: "Abc123" }] });
    expect(parseImport("{", BUILTIN_IDS)).toEqual({ error: "BB5E.Error.ImportInvalid" });
    expect(parseImport(JSON.stringify(preset), BUILTIN_IDS)).toEqual({ error: "BB5E.Error.ImportInvalid" });
    expect(parseImport(JSON.stringify({ dataVersion: 1, looks: [], presets: [] }), BUILTIN_IDS)).toEqual({
      error: "BB5E.Error.ImportEmpty",
    });
    expect(parseImport(JSON.stringify({ dataVersion: 9, looks: [], presets: [] }), BUILTIN_IDS)).toEqual({
      error: "BB5E.Error.NewerData",
    });
    // Cyrillic is two bytes in UTF-8: the limit counts bytes, not characters.
    const big = JSON.stringify({
      dataVersion: 1,
      looks: [],
      presets: [{ ...preset, name: "я".repeat(IMPORT_MAX_BYTES / 2) }],
    });
    expect(parseImport(big, BUILTIN_IDS)).toEqual({ error: "BB5E.Error.ImportTooLarge" });
  });
});

describe("lookStyle", () => {
  it("turns presets into attributes and variables", () => {
    const style = lookStyle(resolveLook("neon", {}, BUILTIN_SOURCES, CLASSIC));
    expect(style.attrs).toMatchObject({
      portrait: "notch",
      bar: "thin",
      icon: "tile",
      fill: "energy",
      segments: "every",
    });
    expect(style.vars["--bb5e-font-display"]).toContain("BB5E Russo One");
    // Russo One has a single face: no bold, never synthetic.
    expect(style.vars["--bb5e-name-weight"]).toBe("400");
    expect(style.statuses.max).toBe(12);
    expect(style.motion.defeat).toBe("banner");
  });

  it("falls back to the palette for frames without an image and registers a GM font", () => {
    const look = resolveLook("classic", {}, BUILTIN_SOURCES, CLASSIC);
    const custom = {
      ...look,
      frame: { ...look.frame, params: { ...look.frame.params, style: "image", image: "" } },
      font: {
        ...look.font,
        id: "F1",
        params: { ...look.font.params, family: "custom", fontFile: "fonts/my.woff2" },
      },
    };
    const style = lookStyle(custom);
    expect(style.attrs.frame).toBe("classic");
    expect(style.customFont).toEqual({ family: "bb5e-custom-F1", file: "fonts/my.woff2" });
    expect(style.vars["--bb5e-font-display"]).toContain('"bb5e-custom-F1"');
  });

  it("every parameter of every category has a default the reader accepts", () => {
    for (const category of CATEGORIES) {
      const defaults = Object.fromEntries(
        Object.entries(PARAMS[category]).map(([key, param]) => [key, param.default]),
      );
      expect(readParams(category, defaults)).toEqual(readParams(category, {}));
    }
  });
});

describe("HP effects", () => {
  it("reads damage and healing from the change, never from the first render or the same value", () => {
    expect(hpChange(null, 0.5, 25)).toBeNull();
    expect(hpChange(0.5, 0.5, 25)).toBeNull();
    expect(hpChange(0.9, 0.8, 25)).toEqual({ kind: "damage", share: expect.closeTo(0.1), big: false });
    expect(hpChange(0.9, 0.6, 25)).toMatchObject({ kind: "damage", big: true });
    expect(hpChange(0.2, 0.5, 25)).toMatchObject({ kind: "heal" });
  });

  it("knows low HP, scales strength and mixes colours by HP", () => {
    expect([isLow(0.25, 25), isLow(0.3, 25), isLow(0, 25)]).toEqual([true, false, false]);
    expect([effectStrength(0, true), effectStrength(0.5, true), effectStrength(0.1, false)]).toEqual([
      0.35, 1, 1,
    ]);
    expect(hpColor(["#000000", "#ffffff"], 0.5)).toBe("#808080");
    expect(hpColor(["#ff0000", "#00ff00", "#0000ff"], 1)).toBe("#0000ff");
    expect(hpColor(["#123456"], 0.3)).toBe("#123456");
  });
});
