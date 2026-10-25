/** The Foundry 14.367 surface this module touches, typed only as far as it is used. */
declare global {
  type FlagBag = Record<string, Record<string, unknown> | undefined>;

  interface FoundryCollection<T> extends Map<string, T> {
    contents: T[];
    find(predicate: (value: T) => boolean): T | undefined;
    filter(predicate: (value: T) => boolean): T[];
    some(predicate: (value: T) => boolean): boolean;
  }

  interface FlaggedDocument {
    id: string;
    flags: FlagBag;
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    unsetFlag(scope: string, key: string): Promise<unknown>;
  }

  interface ActorDocument extends FlaggedDocument {
    name: string;
    img: string;
    type: string;
    isToken: boolean;
    token: TokenDocument | null;
    system: { attributes?: { hp?: Record<string, unknown> } };
    statuses: Set<string>;
  }

  interface TokenDocument {
    id: string;
    name: string;
    hidden: boolean;
    actor: ActorDocument | null;
    baseActor: ActorDocument | null;
    parent: SceneDocument | null;
  }

  interface SceneDocument extends FlaggedDocument {
    name: string;
    tokens: FoundryCollection<TokenDocument>;
  }

  interface CombatDocument {
    combatants: FoundryCollection<{ sceneId: string; tokenId: string; defeated: boolean }>;
  }

  interface UserDocument {
    id: string;
    isGM: boolean;
    isActiveGM: boolean;
    query(name: string, data: unknown, options?: { timeout?: number }): Promise<unknown>;
  }

  interface ApplicationV2Instance {
    element: HTMLElement;
    rendered: boolean;
    title: string;
    document?: ActorDocument;
    render(options?: boolean | Record<string, unknown>): Promise<this>;
    close(options?: Record<string, unknown>): Promise<this>;
    bringToFront(): void;
    _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>>;
    _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void>;
    _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void>;
    _onClose(options: Record<string, unknown>): void;
  }

  const Hooks: {
    once(hook: string, callback: (...args: never[]) => void): number;
    on(hook: string, callback: (...args: never[]) => unknown): number;
  };

  const game: {
    modules: Map<string, { active: boolean; version: string }>;
    user: UserDocument;
    users: FoundryCollection<UserDocument> & { activeGM: UserDocument | null };
    scenes: FoundryCollection<SceneDocument>;
    combats: FoundryCollection<CombatDocument>;
    settings: {
      register(namespace: string, key: string, config: Record<string, unknown>): void;
      get(namespace: string, key: string): unknown;
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
    };
    i18n: { localize(key: string): string; format(key: string, data: Record<string, string>): string };
  };

  const canvas: { scene: SceneDocument | null } | undefined;

  const ui: {
    notifications: {
      error(message: string, options?: { localize?: boolean }): void;
      warn(message: string, options?: { localize?: boolean }): void;
    };
  };

  const CONFIG: {
    queries: Record<string, (data: unknown, context: { user: UserDocument }) => unknown>;
    specialStatusEffects: { DEFEATED: string };
  };

  const foundry: {
    utils: { randomID(): string; hasProperty(object: object, key: string): boolean };
    applications: {
      instances: Map<string, ApplicationV2Instance>;
      api: {
        ApplicationV2: new (options?: Record<string, unknown>) => ApplicationV2Instance;
        HandlebarsApplicationMixin<T extends new (...args: never[]) => ApplicationV2Instance>(base: T): T;
        DialogV2: {
          confirm(options: { window: { title: string }; content: string }): Promise<boolean | null>;
        };
      };
    };
  };
}

export {};
