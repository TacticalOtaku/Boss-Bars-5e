// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { mountOverlay } from "../src/ui/overlay";

describe("mountOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="interface"><section id="ui-middle"></section></div>';
  });

  it("appends one overlay root to the host", () => {
    const host = document.getElementById("interface")!;
    const overlay = mountOverlay(host);
    expect(overlay.id).toBe("boss-bars-5e");
    expect(overlay.classList.contains("bb5e-overlay")).toBe(true);
    expect(overlay.parentElement).toBe(host);
    expect(overlay.childElementCount).toBe(0);
  });

  it("reuses the existing root instead of adding a second one", () => {
    const host = document.getElementById("interface")!;
    const first = mountOverlay(host);
    expect(mountOverlay(host)).toBe(first);
    expect(document.querySelectorAll("#boss-bars-5e")).toHaveLength(1);
  });
});
