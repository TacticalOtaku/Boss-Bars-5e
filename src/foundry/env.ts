/**
 * Runtime boundary to Foundry VTT globals. Injecting a fake `FoundryEnv` lets `foundry/` and `apps/` unit tests
 * run without global stubs, while production code defaults to `liveFoundryEnv()`.
 */
export interface FoundryEnv {
  readonly game: typeof game;
  readonly canvas: typeof canvas;
  readonly Hooks: typeof Hooks;
  readonly foundry: typeof foundry;
  readonly ui: typeof ui;
  readonly CONFIG: typeof CONFIG;
}

/**
 * Live bridge to Foundry's globals: getters read `globalThis` dynamically on every access so tests or late-initialized
 * Foundry state can swap globals without recreating watchers.
 */
export function liveFoundryEnv(): FoundryEnv {
  return {
    get game() {
      return typeof game === "undefined" ? (undefined as unknown as typeof game) : game;
    },
    get canvas() {
      return typeof canvas === "undefined" ? (undefined as unknown as typeof canvas) : canvas;
    },
    get Hooks() {
      return typeof Hooks === "undefined" ? (undefined as unknown as typeof Hooks) : Hooks;
    },
    get foundry() {
      return typeof foundry === "undefined" ? (undefined as unknown as typeof foundry) : foundry;
    },
    get ui() {
      return typeof ui === "undefined" ? (undefined as unknown as typeof ui) : ui;
    },
    get CONFIG() {
      return typeof CONFIG === "undefined" ? (undefined as unknown as typeof CONFIG) : CONFIG;
    },
  };
}

/** Foundry's synchronized real time, independent of each computer's clock and the in-world calendar. */
export function serverTime(env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): number {
  const now = env.game.time?.serverTime;
  return typeof now === "number" && Number.isFinite(now) ? now : Date.now();
}
