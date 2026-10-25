import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  effectiveLayout,
  moveToScreen,
  offscreen,
  overlapping,
  placeRect,
  readLayout,
  readOverride,
  snap,
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

  it("snaps to the centre and the edges within 12 px", () => {
    const near = snap({ x: 705, y: 395, w: 200, h: 100 }, screen);
    expect(near).toEqual({
      rect: { x: 700, y: 400, w: 200, h: 100 },
      guides: { vertical: true, horizontal: true },
    });
    expect(snap({ x: 8, y: 795, w: 200, h: 100 }, screen).rect).toEqual({ x: 0, y: 800, w: 200, h: 100 });
    expect(snap({ x: 300, y: 300, w: 200, h: 100 }, screen).guides).toEqual({
      vertical: false,
      horizontal: false,
    });
  });

  it("finds overlapping zones and blocks past the edge", () => {
    const zones = [
      { id: "hotbar", rect: { x: 418, y: 824, w: 764, h: 60 } },
      { id: "controls", rect: { x: 16, y: 16, w: 72, h: 300 } },
    ];
    expect(overlapping({ x: 500, y: 800, w: 200, h: 50 }, zones).map((z) => z.id)).toEqual(["hotbar"]);
    expect(overlapping({ x: 100, y: 16, w: 200, h: 50 }, zones)).toEqual([]);
    expect(offscreen({ x: 1500, y: 0, w: 200, h: 50 }, screen)).toBe(true);
    expect(offscreen({ x: 0, y: 0, w: 200, h: 50 }, screen)).toBe(false);
  });

  it("moves Foundry zones to a player's screen by their anchor; full-height zones stretch", () => {
    const player = { w: 1366, h: 768 };
    expect(moveToScreen({ x: 16, y: 16, w: 72, h: 300 }, screen, player)).toEqual({
      x: 16,
      y: 16,
      w: 72,
      h: 300,
    });
    expect(moveToScreen({ x: 418, y: 824, w: 764, h: 60 }, screen, player)).toEqual({
      x: 301,
      y: 692,
      w: 764,
      h: 60,
    });
    expect(moveToScreen({ x: 1552, y: 0, w: 48, h: 900 }, screen, player)).toEqual({
      x: 1318,
      y: 0,
      w: 48,
      h: 768,
    });
  });
});
