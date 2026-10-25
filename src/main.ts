import "../styles/boss-bars-5e.scss";
import { logger } from "./logger";
import { mountOverlay } from "./ui/overlay";

// #interface exists from Game#initializeUI, so it is guaranteed by "ready" (research/foundry-ui §1).
Hooks.once("ready", () => {
  const host = document.getElementById("interface");
  if (!host) {
    logger.error("#interface not found; overlay not mounted");
    return;
  }
  mountOverlay(host);
});
