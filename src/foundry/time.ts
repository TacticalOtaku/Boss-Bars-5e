/** Foundry's synchronized real time, independent of each computer's clock and the in-world calendar. */
export function serverTime(): number {
  const now = game.time?.serverTime;
  return typeof now === "number" && Number.isFinite(now) ? now : Date.now();
}
