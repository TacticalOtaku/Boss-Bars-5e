import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  effectiveLayout,
  placeRect,
  readLayout,
  readOverride,
  readPlacement,
  toAnchor,
} from "../../src/core/layout";

const screen = { w: 1600, h: 900 };

describe("readLayout", () => {
  it("uses the defaults when nothing is saved, with the legacy collapse setting", () => {
    expect(readLayout(undefined, true)).toEqual({ status: "ok", value: DEFAULT_LAYOUT });
    const legacy = readLayout({}, false);
    expect(legacy.status === "ok" && legacy.value.bosses.collapse).toBe(false);
    expect(DEFAULT_LAYOUT).toEqual({
      bosses: { anchor: "tc", dx: 0, dy: 16, dir: "down", collapse: true },
      elites: { anchor: "ml", dx: 104, dy: 0, dir: "down", collapse: true, max: 12 },
    });
  });

  it("normalises blocks: unknown anchor, rows for elites, max out of range, absurd offsets", () => {
    const read = readLayout(
      {
        dataVersion: 1,
        bosses: { anchor: "zz", dx: "5", dy: 1e9, dir: "row", collapse: false },
        elites: { anchor: "br", dx: -20, dy: -30, dir: "row", collapse: true, max: 99 },
      },
      true,
    );
    expect(read.status === "ok" && read.value).toEqual({
      bosses: { anchor: "tc", dx: 5, dy: 10000, dir: "row", collapse: false },
      elites: { anchor: "br", dx: -20, dy: -30, dir: "down", collapse: true, max: 20 },
    });
    expect(readLayout({ dataVersion: 2, bosses: {} }, true).status).toBe("newer");
  });

  it("lets a scene override whole blocks", () => {
    const override = readOverride({ dataVersion: 1, elites: { anchor: "tr", dx: -10, dy: 20, dir: "up" } });
    expect(override).toEqual({
      elites: { anchor: "tr", dx: -10, dy: 20, dir: "up", collapse: true, max: 12 },
    });
    const layout = effectiveLayout(DEFAULT_LAYOUT, override);
    expect(layout.bosses).toBe(DEFAULT_LAYOUT.bosses);
    expect(layout.elites.anchor).toBe("tr");
    expect(readOverride(undefined)).toEqual({});
    expect(readOverride({ dataVersion: 5, bosses: {} })).toEqual({});
  });

  it("reads strict placements and rejects out-of-range or malformed ones", () => {
    expect(readPlacement({ anchor: "tc", dx: 12, dy: -34, extra: "ignored" })).toEqual({
      anchor: "tc",
      dx: 12,
      dy: -34,
    });
    expect(readPlacement(null)).toBeNull();
    expect(readPlacement({ anchor: "zz", dx: 0, dy: 0 })).toBeNull();
    expect(readPlacement({ anchor: "tc", dx: "5", dy: 0 })).toBeNull();
    expect(readPlacement({ anchor: "tc", dx: Number.POSITIVE_INFINITY, dy: 0 })).toBeNull();
    expect(readPlacement({ anchor: "tc", dx: 10001, dy: 0 })).toBeNull();
  });
});

describe("geometry", () => {
  const size = { w: 200, h: 100 };

  it("places a block by anchor and offset, aligned by the same point, scaled by uiScale", () => {
    expect(placeRect({ anchor: "tl", dx: 10, dy: 20 }, size, screen, 1)).toEqual({
      x: 10,
      y: 20,
      w: 200,
      h: 100,
    });
    expect(placeRect({ anchor: "mc", dx: 0, dy: 0 }, size, screen, 1)).toEqual({
      x: 700,
      y: 400,
      w: 200,
      h: 100,
    });
    expect(placeRect({ anchor: "br", dx: -10, dy: -10 }, size, screen, 2)).toEqual({
      x: 1380,
      y: 780,
      w: 200,
      h: 100,
    });
  });

  it("anchors by the third of the screen the block centre is in, and round-trips", () => {
    const rect = { x: 1300, y: 700, w: 200, h: 100 };
    const placed = toAnchor(rect, screen, 1);
    expect(placed).toEqual({ anchor: "br", dx: -100, dy: -100 });
    expect(placeRect(placed, rect, screen, 1)).toEqual(rect);
    expect(toAnchor({ x: 700, y: 10, w: 200, h: 100 }, screen, 2)).toEqual({ anchor: "tc", dx: 0, dy: 5 });
  });
});
