import { readLayout } from "./layout";
import { readLibrary } from "./look/schema";
import { readRanks } from "./ranks";
import { isRecord, type ReadResult } from "./schema";

/**
 * The world's Boss Bars settings as one file, to carry them to another world (World Gate and the like move
 * documents with their flags, not world settings): elite ranks, own looks and presets, the world layout.
 */
const KIND = "boss-bars-5e-settings";
export const SETTINGS_FILE_VERSION = 1;

/** The world settings the file carries, each written back as it was stored. */
export const SETTING_KEYS = ["ranks", "library", "layout"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type CarriedSettings = Partial<Record<SettingKey, unknown>>;

/** Each part is checked by the reader the module uses for it; its default arguments do not change the verdict. */
const READERS: Record<SettingKey, (raw: unknown) => ReadResult<unknown>> = {
  ranks: (raw) => readRanks(raw, []),
  library: (raw) => readLibrary(raw),
  layout: (raw) => readLayout(raw, true),
};

export const settingsFile = (settings: CarriedSettings) => ({
  kind: KIND,
  dataVersion: SETTINGS_FILE_VERSION,
  settings,
});

/** The settings a file carries, or the i18n key of why it is refused: not ours, unreadable, or newer. */
export function readSettingsFile(text: string): { settings: CarriedSettings } | { error: string } {
  const invalid = { error: "BB5E.SettingsFile.Invalid" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return invalid;
  }
  if (!isRecord(raw) || raw.kind !== KIND || !isRecord(raw.settings) || typeof raw.dataVersion !== "number") {
    return invalid;
  }
  if (raw.dataVersion > SETTINGS_FILE_VERSION) return { error: "BB5E.Error.NewerData" };
  const settings: CarriedSettings = {};
  for (const key of SETTING_KEYS) {
    if (!(key in raw.settings)) continue;
    const status = READERS[key](raw.settings[key]).status;
    if (status === "newer") return { error: "BB5E.Error.NewerData" };
    if (status !== "ok") return invalid;
    settings[key] = raw.settings[key];
  }
  return { settings };
}
