import { isRecord, migrate, type ReadResult } from "./schema";

export const LAYOUT_VERSION = 1;

/** The 9 screen points; a block is aligned by the same point of itself (spec §10). */
export const ANCHORS = {
  tl: [0, 0],
  tc: [0.5, 0],
  tr: [1, 0],
  ml: [0, 0.5],
  mc: [0.5, 0.5],
  mr: [1, 0.5],
  bl: [0, 1],
  bc: [0.5, 1],
  br: [1, 1],
} as const;
export type Anchor = keyof typeof ANCHORS;
export type BlockKey = "bosses" | "elites";
export type Direction = "down" | "up" | "row";

export interface Placement {
  anchor: Anchor;
  /** Offsets in px at uiScale 1. */
  dx: number;
  dy: number;
}

export interface Block extends Placement {
  dir: Direction;
  /** Players may collapse this block. */
  collapse: boolean;
}

export interface Layout {
  bosses: Block;
  elites: Block & { max: number };
}

export type LayoutOverride = Partial<Layout>;

export const LAYOUT_LIMITS = { offset: 10_000, maxMin: 1, maxMax: 20 } as const;

export const DEFAULT_LAYOUT: Layout = {
  bosses: { anchor: "tc", dx: 0, dy: 16, dir: "down", collapse: true },
  elites: { anchor: "ml", dx: 104, dy: 0, dir: "down", collapse: true, max: 12 },
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

/** Reads a stored drag placement (`anchor` + finite offsets within bounds), or `null` if invalid. */
export function readPlacement(raw: unknown): Placement | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.anchor !== "string" || !Object.hasOwn(ANCHORS, raw.anchor)) return null;
  const { dx, dy } = raw;
  if (typeof dx !== "number" || !Number.isFinite(dx) || Math.abs(dx) > LAYOUT_LIMITS.offset) return null;
  if (typeof dy !== "number" || !Number.isFinite(dy) || Math.abs(dy) > LAYOUT_LIMITS.offset) return null;
  return { anchor: raw.anchor as Anchor, dx, dy };
}

function readBlock<K extends BlockKey>(raw: unknown, key: K): Layout[K] {
  const fallback = DEFAULT_LAYOUT[key];
  const value = isRecord(raw) ? raw : {};
  const { offset } = LAYOUT_LIMITS;
  const dirs: Direction[] = key === "bosses" ? ["down", "up", "row"] : ["down", "up"];
  const block: Block = {
    anchor:
      typeof value.anchor === "string" && value.anchor in ANCHORS
        ? (value.anchor as Anchor)
        : fallback.anchor,
    dx: clamp(value.dx, -offset, offset, fallback.dx),
    dy: clamp(value.dy, -offset, offset, fallback.dy),
    dir: dirs.includes(value.dir as Direction) ? (value.dir as Direction) : fallback.dir,
    collapse: typeof value.collapse === "boolean" ? value.collapse : fallback.collapse,
  };
  if (key === "bosses") return block as Layout[K];
  const max = clamp(value.max, LAYOUT_LIMITS.maxMin, LAYOUT_LIMITS.maxMax, DEFAULT_LAYOUT.elites.max);
  return { ...block, max } as Layout[K];
}

/**
 * The world layout. Nothing saved yet means the defaults, with the stage 1–2 "players may collapse" setting
 * carried over to the boss stack.
 */
export function readLayout(raw: unknown, legacyCollapse: boolean): ReadResult<Layout> {
  if (!isRecord(raw) || raw.dataVersion === undefined) {
    return {
      status: "ok",
      value: { ...DEFAULT_LAYOUT, bosses: { ...DEFAULT_LAYOUT.bosses, collapse: legacyCollapse } },
    };
  }
  const migrated = migrate(raw, LAYOUT_VERSION, {});
  if (migrated.status !== "ok") return migrated;
  return {
    status: "ok",
    value: { bosses: readBlock(raw.bosses, "bosses"), elites: readBlock(raw.elites, "elites") },
  };
}

/** A scene's override: only the blocks it replaces. Unreadable or newer data overrides nothing. */
export function readOverride(raw: unknown): LayoutOverride {
  if (!isRecord(raw) || migrate(raw, LAYOUT_VERSION, {}).status !== "ok") return {};
  const override: LayoutOverride = {};
  if (isRecord(raw.bosses)) override.bosses = readBlock(raw.bosses, "bosses");
  if (isRecord(raw.elites)) override.elites = readBlock(raw.elites, "elites");
  return override;
}

/** A scene override replaces whole blocks (spec §2), never single fields. */
export function effectiveLayout(world: Layout, override: LayoutOverride): Layout {
  return { bosses: override.bosses ?? world.bosses, elites: override.elites ?? world.elites };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}

export function placeRect(placement: Placement, size: Size, screen: Size, uiScale: number): Rect {
  const [fx, fy] = ANCHORS[placement.anchor];
  return {
    x: fx * screen.w - fx * size.w + placement.dx * uiScale,
    y: fy * screen.h - fy * size.h + placement.dy * uiScale,
    w: size.w,
    h: size.h,
  };
}

const third = (centre: number, length: number) => Math.min(2, Math.max(0, Math.floor((centre / length) * 3)));

/** The anchor of the screen third holding the block centre, and the offset from it (at uiScale 1). */
export function toAnchor(rect: Rect, screen: Size, uiScale: number): Placement {
  const row = ["t", "m", "b"][third(rect.y + rect.h / 2, screen.h)];
  const column = ["l", "c", "r"][third(rect.x + rect.w / 2, screen.w)];
  const anchor = `${row}${column}` as Anchor;
  const origin = placeRect({ anchor, dx: 0, dy: 0 }, rect, screen, uiScale);
  return {
    anchor,
    dx: Math.round((rect.x - origin.x) / uiScale),
    dy: Math.round((rect.y - origin.y) / uiScale),
  };
}
