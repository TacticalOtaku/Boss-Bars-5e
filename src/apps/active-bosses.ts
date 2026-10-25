import { MODULE_ID } from "../constants";
import { readInstances } from "../core/instances";
import { readProfile, type ProfileKind } from "../core/profile";
import { writeOrNotify } from "../foundry/authority";
import { instanceFor, type BossHud } from "../foundry/store";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Other GM windows the panel links to (loaded lazily by main). */
export interface PanelLinks {
  openRanks(): void;
  openLayout(): void;
}

interface Row {
  kind: ProfileKind;
  /** Any of the subject's tokens: "show" picks the binding from the profile's display mode. */
  tokenId: string;
  instanceId: string | null;
  name: string;
  count: number;
  img: string;
  order: number;
}

/**
 * Tokens of the viewed scene whose actor has a profile: one row per token, or one per actor (×N) in that mode.
 * Shown ones first, in show order.
 */
function sceneRows(scene: SceneDocument): Row[] {
  const read = readInstances(scene.flags[MODULE_ID]?.instances);
  const items = read.status === "ok" ? read.value.items : [];
  const rows = new Map<string, Row>();
  for (const token of scene.tokens.values()) {
    const actor = token.baseActor;
    const profile = readProfile(actor?.flags[MODULE_ID]?.profile);
    if (!actor || profile.status !== "ok") continue;
    const byActor = profile.value.displayMode === "actor";
    const key = byActor ? `actor:${actor.id}` : token.id;
    const existing = rows.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const instance = instanceFor(items, token);
    const name = byActor ? actor.name : token.name;
    rows.set(key, {
      kind: profile.value.kind,
      tokenId: token.id,
      instanceId: instance?.id ?? null,
      name: profile.value.playerName ? `${name} (${profile.value.playerName})` : name,
      count: 1,
      img: profile.value.portrait ?? actor.img,
      order: instance?.order ?? Number.POSITIVE_INFINITY,
    });
  }
  return [...rows.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** "Active bosses": show or hide each boss and elite of the viewed scene, or all of them. */
class ActiveBosses extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "bb5e-active-bosses",
    classes: ["bb5e-app"],
    window: { title: "BB5E.Panel.Title", icon: "fa-solid fa-skull-crossbones", resizable: true },
    position: { width: 400, height: "auto" },
    actions: {
      toggle: ActiveBosses.#onToggle,
      hideAll: ActiveBosses.#onHideAll,
      openRanks: ActiveBosses.#onOpenRanks,
      openLayout: ActiveBosses.#onOpenLayout,
    },
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/active-bosses.hbs`,
      // Partials must be preloaded to be usable by name.
      templates: [`modules/${MODULE_ID}/templates/panel-row.hbs`],
    },
  };

  readonly #hud: BossHud;
  readonly #open: PanelLinks;
  #unsubscribe: (() => void) | null = null;

  constructor(hud: BossHud, open: PanelLinks) {
    super();
    this.#hud = hud;
    this.#open = open;
  }

  override async _prepareContext(options: Record<string, unknown>) {
    const scene = canvas?.scene ?? null;
    const rows = (scene ? sceneRows(scene) : []).map((row) => ({ ...row, many: row.count > 1 }));
    return {
      ...(await super._prepareContext(options)),
      hasScene: Boolean(scene),
      bosses: rows.filter((row) => row.kind === "boss"),
      elites: rows.filter((row) => row.kind === "elite"),
      anyRows: rows.length > 0,
      anyShown: rows.some((row) => row.instanceId),
    };
  }

  override async _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onFirstRender(context, options);
    this.#unsubscribe = this.#hud.subscribe(() => void this.render());
  }

  override _onClose(options: Record<string, unknown>) {
    super._onClose(options);
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  static async #onToggle(this: ActiveBosses, _event: Event, target: HTMLElement) {
    const scene = canvas?.scene;
    const row = target.closest<HTMLElement>("[data-token-id]");
    if (!scene || !row?.dataset.tokenId) return;
    const { tokenId, instanceId } = row.dataset;
    await writeOrNotify(
      instanceId
        ? { type: "hide", sceneId: scene.id, instanceId }
        : { type: "show", sceneId: scene.id, tokenId },
    );
  }

  static async #onHideAll(this: ActiveBosses) {
    const scene = canvas?.scene;
    if (scene) await writeOrNotify({ type: "hideAll", sceneId: scene.id });
  }

  static async #onOpenRanks(this: ActiveBosses) {
    this.#open.openRanks();
  }

  static async #onOpenLayout(this: ActiveBosses) {
    this.#open.openLayout();
  }
}

export function openActiveBosses(hud: BossHud, open: PanelLinks): void {
  const existing = foundry.applications.instances.get("bb5e-active-bosses");
  void (existing ?? new ActiveBosses(hud, open)).render({ force: true });
}
