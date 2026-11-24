// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { setPortrait } from "../src/ui/dom";

const parsePair = (raw: string, fallback: [number, number]): [number, number] => {
  const parts = raw.trim().split(/\s+/);
  if (!raw.trim() || parts.length === 0) return fallback;
  const parsePart = (token: string, otherFallback: number) => {
    const cleaned = token.replace(/%$/, "");
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : otherFallback;
  };
  const x = parsePart(parts[0] ?? "", fallback[0]);
  const y = parsePart(parts[1] ?? parts[0] ?? "", fallback[1]);
  return [x, y];
};

/**
 * Computes where the CSS-transformed media box `[0..1] × [0..1]` lands inside a normalised `[0..1] × [0..1]`
 * `.bb5e-face` frame, plus which normalised slice of the source artwork (`naturalAspect = natW / natH`) appears
 * through `object-fit: cover` inside `containerAspect = frameW / frameH`.
 */
function measurePortrait(
  container: HTMLElement,
  { naturalAspect = 1, frameAspect = 1 }: { naturalAspect?: number; frameAspect?: number } = {},
) {
  const media = container.firstElementChild as HTMLElement;
  const scale = Number(media.style.scale || "1");
  const [ox, oy] = parsePair(media.style.transformOrigin, [50, 50]).map((n) => n / 100) as [number, number];
  const [tx, ty] = parsePair(media.style.translate, [0, 0]).map((n) => n / 100) as [number, number];
  const [px, py] = parsePair(media.style.objectPosition, [50, 50]).map((n) => n / 100) as [number, number];

  // CSS Transforms Level 2: translate -> transform-origin scale around (ox, oy).
  const boxLeft = tx + ox * (1 - scale);
  const boxRight = boxLeft + scale;
  const boxTop = ty + oy * (1 - scale);
  const boxBottom = boxTop + scale;

  // object-fit: cover sizes the artwork relative to the [0..1] element box.
  const coverW = naturalAspect > frameAspect ? naturalAspect / frameAspect : 1;
  const coverH = naturalAspect < frameAspect ? frameAspect / naturalAspect : 1;
  const objOffsetX = (1 - coverW) * px;
  const objOffsetY = (1 - coverH) * py;

  const boxU0 = -boxLeft / scale;
  const boxU1 = (1 - boxLeft) / scale;
  const boxV0 = -boxTop / scale;
  const boxV1 = (1 - boxTop) / scale;

  const u0 = (boxU0 - objOffsetX) / coverW;
  const u1 = (boxU1 - objOffsetX) / coverW;
  const v0 = (boxV0 - objOffsetY) / coverH;
  const v1 = (boxV1 - objOffsetY) / coverH;

  return {
    box: { left: boxLeft, right: boxRight, top: boxTop, bottom: boxBottom },
    window: { u0, u1, v0, v1, centerX: (u0 + u1) / 2, centerY: (v0 + v1) / 2 },
  };
}

describe("setPortrait framing", () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div class="bb5e-face"></div>';
    host = document.querySelector<HTMLElement>(".bb5e-face")!;
  });

  it("never leaves empty frame borders across extreme x/y values (including video repro cases)", () => {
    const cases = [
      { x: 52, y: 31, zoom: 165 },
      { x: 52, y: 16, zoom: 165 },
      { x: 52, y: 2, zoom: 165 },
      { x: 52, y: 67, zoom: 165 },
      { x: 52, y: 80, zoom: 165 },
      { x: 52, y: 100, zoom: 165 },
      { x: 0, y: 0, zoom: 100 },
      { x: 100, y: 100, zoom: 100 },
      { x: 0, y: 100, zoom: 120 },
      { x: 100, y: 0, zoom: 300 },
    ];

    for (const focus of cases) {
      setPortrait(host, { src: "boss.webp", video: false, focus });
      const { box } = measurePortrait(host);
      expect(box.left, `left for ${JSON.stringify(focus)}`).toBeLessThanOrEqual(1e-9);
      expect(box.top, `top for ${JSON.stringify(focus)}`).toBeLessThanOrEqual(1e-9);
      expect(box.right, `right for ${JSON.stringify(focus)}`).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(box.bottom, `bottom for ${JSON.stringify(focus)}`).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it("pans linearly from top/left edge to bottom/right edge with zero dead zones", () => {
    for (const naturalAspect of [1, 2 / 3, 16 / 9]) {
      for (const frameAspect of [1, 7 / 5.5]) {
        const steps = [0, 25, 50, 75, 100].map((y) => {
          setPortrait(host, { src: "boss.webp", video: false, focus: { x: 50, y, zoom: 165 } });
          return measurePortrait(host, { naturalAspect, frameAspect }).window;
        });

        expect(steps[0]!.v0).toBeCloseTo(0, 6);
        expect(steps[2]!.centerY).toBeCloseTo(0.5, 6);
        expect(steps[4]!.v1).toBeCloseTo(1, 6);

        const deltas = steps.slice(1).map((step, i) => step.v0 - steps[i]!.v0);
        for (const delta of deltas) {
          expect(delta).toBeGreaterThan(0.05);
          expect(delta).toBeCloseTo(deltas[0]!, 5);
        }
      }
    }
  });

  it("pans non-square artwork smoothly even at 100% zoom without exposing voids", () => {
    setPortrait(host, { src: "tall.webp", video: false, focus: { x: 50, y: 0, zoom: 100 } });
    const top = measurePortrait(host, { naturalAspect: 0.5 });
    setPortrait(host, { src: "tall.webp", video: false, focus: { x: 50, y: 100, zoom: 100 } });
    const bottom = measurePortrait(host, { naturalAspect: 0.5 });

    expect(top.box).toEqual({ left: 0, right: 1, top: 0, bottom: 1 });
    expect(bottom.box).toEqual({ left: 0, right: 1, top: 0, bottom: 1 });
    expect(top.window.v0).toBeCloseTo(0, 6);
    expect(bottom.window.v1).toBeCloseTo(1, 6);
  });

  it("reuses the media element across focus changes and clamps out-of-range focus inputs", () => {
    setPortrait(host, { src: "boss.webp", video: false, focus: { x: 50, y: 50, zoom: 100 } });
    const firstImg = host.firstElementChild as HTMLElement;
    firstImg.style.translate = "25% -15%";
    setPortrait(host, { src: "boss.webp", video: false, focus: { x: -25, y: 150, zoom: 40 } });
    expect(host.firstElementChild).toBe(firstImg);
    expect(firstImg.style.translate).toBe("");

    const { box } = measurePortrait(host);
    expect(box.left).toBeLessThanOrEqual(1e-9);
    expect(box.top).toBeLessThanOrEqual(1e-9);
    expect(box.right).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(box.bottom).toBeGreaterThanOrEqual(1 - 1e-9);

    setPortrait(host, { src: "boss.webm", video: true, focus: { x: 20, y: 80, zoom: 200 } });
    const video = host.firstElementChild as HTMLVideoElement;
    expect(video.tagName).toBe("VIDEO");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
  });
});
