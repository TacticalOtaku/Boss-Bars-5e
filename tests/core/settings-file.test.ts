import { describe, expect, it } from "vitest";
import { readSettingsFile, settingsFile } from "../../src/core/settings-file";

const ranks = {
  dataVersion: 1,
  items: [{ id: "boss-guard", name: "Стража", color: "#a33", size: 32, look: null, parts: {} }],
};
const library = { dataVersion: 1, looks: [], presets: [] };
const layout = {
  dataVersion: 1,
  bosses: { anchor: "tc", dx: 0, dy: 40, dir: "down", collapse: true },
  elites: { anchor: "ml", dx: 104, dy: 76, dir: "down", collapse: true, max: 12 },
};

describe("settings file", () => {
  it("brings the world's ranks, own looks and layout back as they were saved", () => {
    const text = JSON.stringify(settingsFile({ ranks, library, layout }));
    expect(readSettingsFile(text)).toEqual({ settings: { ranks, library, layout } });
  });

  it("refuses a file that is not a Boss Bars settings file", () => {
    const invalid = { error: "BB5E.SettingsFile.Invalid" };
    expect(readSettingsFile("not json")).toEqual(invalid);
    expect(readSettingsFile(JSON.stringify(library))).toEqual(invalid);
    expect(readSettingsFile(JSON.stringify(settingsFile({ ranks: { dataVersion: 1, items: "x" } })))).toEqual(
      invalid,
    );
  });

  it("leaves the world alone when a newer version wrote the file or a part of it", () => {
    const newer = { error: "BB5E.Error.NewerData" };
    expect(readSettingsFile(JSON.stringify({ ...settingsFile({ layout }), dataVersion: 99 }))).toEqual(newer);
    expect(
      readSettingsFile(JSON.stringify(settingsFile({ layout: { ...layout, dataVersion: 99 } }))),
    ).toEqual(newer);
  });
});
