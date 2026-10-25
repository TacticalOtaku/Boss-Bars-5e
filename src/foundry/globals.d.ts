/** The few Foundry globals this module touches; extend as they are used. */
declare global {
  const Hooks: {
    once(hook: string, callback: (...args: never[]) => void): number;
    on(hook: string, callback: (...args: never[]) => void): number;
  };

  const game: {
    modules: Map<string, { active: boolean; version: string }>;
  };
}

export {};
