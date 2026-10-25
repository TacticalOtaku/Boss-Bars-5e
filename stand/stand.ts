import "../styles/boss-bars-5e.scss";
import { PLAYER_SCREENS } from "../src/core/screens";
import { mountOverlay } from "../src/ui/overlay";

const select = document.querySelector<HTMLSelectElement>("#screen")!;
const viewport = document.querySelector<HTMLElement>(".stand-viewport")!;
const host = document.querySelector<HTMLElement>("#interface")!;

for (const [index, { width, height }] of PLAYER_SCREENS.entries()) {
  select.add(new Option(`${width}×${height}`, String(index), false, width === 1920));
}

/** Show the chosen player screen at its real pixel size, scaled down to fit the stand. */
function applyScreen(): void {
  const screen = PLAYER_SCREENS[Number(select.value)] ?? PLAYER_SCREENS[0];
  host.style.width = `${screen.width}px`;
  host.style.height = `${screen.height}px`;
  const scale = Math.min(1, viewport.clientWidth / screen.width, viewport.clientHeight / screen.height);
  host.style.transform = `scale(${scale})`;
}

select.addEventListener("change", applyScreen);
new ResizeObserver(applyScreen).observe(viewport);
applyScreen();
mountOverlay(host);
