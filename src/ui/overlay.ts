import { MODULE_ID } from "../constants";

/** The HUD root over the whole Foundry interface. Reuses an existing root, so mounting twice is harmless. */
export function mountOverlay(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>(`:scope > #${MODULE_ID}`);
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = MODULE_ID;
  overlay.className = "bb5e-overlay";
  host.append(overlay);
  return overlay;
}
