import { MODULE_ID } from "../constants";
import { ANCHORS, LAYOUT_LIMITS, readLayout, type Layout, type Placement } from "../core/layout";
import { isRecord, migrate } from "../core/schema";

interface ClientLayout {
  dataVersion: 1;
  preferences?: Layout;
  scenes: Record<string, Record<string, Placement>>;
  [key: string]: unknown;
}

/** Client positions are separate from legacy world/scene layout; unreadable data is never rewritten. */
function read(): ClientLayout | null {
  const raw: unknown = game.settings.get(MODULE_ID, "clientLayout");
  if (isRecord(raw) && Object.keys(raw).length === 0) return { dataVersion: 1, scenes: {} };
  if (!isRecord(raw) || migrate(raw, 1, {}).status !== "ok" || !isRecord(raw.scenes)) return null;
  for (const positions of Object.values(raw.scenes)) {
    if (!isRecord(positions)) return null;
    for (const value of Object.values(positions)) {
      if (
        !isRecord(value) ||
        typeof value.anchor !== "string" ||
        !Object.hasOwn(ANCHORS, value.anchor) ||
        typeof value.dx !== "number" ||
        !Number.isFinite(value.dx) ||
        Math.abs(value.dx) > LAYOUT_LIMITS.offset ||
        typeof value.dy !== "number" ||
        !Number.isFinite(value.dy) ||
        Math.abs(value.dy) > LAYOUT_LIMITS.offset
      )
        return null;
    }
  }
  let preferences: Layout | undefined;
  if (raw.preferences !== undefined) {
    if (!isRecord(raw.preferences)) return null;
    const result = readLayout({ ...raw.preferences, dataVersion: 1 }, true);
    if (result.status !== "ok") return null;
    preferences = result.value;
  }
  return { ...raw, dataVersion: 1, preferences, scenes: raw.scenes as ClientLayout["scenes"] };
}

export function clientPosition(scene: string, id: string): Placement | null {
  return read()?.scenes[scene]?.[id] ?? null;
}

export function clientPreferences(): Layout | null {
  return read()?.preferences ?? null;
}

// A second completed drag must not overwrite a position whose client-setting write is still pending.
let pending: Promise<unknown> = Promise.resolve();
function write(edit: (value: ClientLayout) => ClientLayout): Promise<boolean> {
  const next = pending.then(async () => {
    const value = read();
    if (!value) return false;
    await game.settings.set(MODULE_ID, "clientLayout", edit(value));
    return true;
  });
  pending = next.catch(() => undefined);
  return next;
}

export function saveClientPosition(scene: string, id: string, placement: Placement | null): Promise<boolean> {
  return write((value) => {
    const positions = Object.fromEntries(
      Object.entries(value.scenes[scene] ?? {}).filter(([key]) => key !== id),
    );
    if (placement) positions[id] = { ...placement };
    return { ...value, scenes: { ...value.scenes, [scene]: positions } };
  });
}

/** Optional scene reset clears only this client's dragged positions, leaving the old shared flags intact. */
export function saveClientPreferences(layout: Layout, resetScene?: string): Promise<boolean> {
  return write((value) => {
    const scenes = Object.fromEntries(Object.entries(value.scenes).filter(([key]) => key !== resetScene));
    return { ...value, preferences: structuredClone(layout), scenes };
  });
}
