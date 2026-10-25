import { MODULE_ID } from "../constants";
import { readInstances } from "../core/instances";
import { readProfile } from "../core/profile";
import { writeOrNotify } from "../foundry/authority";
import type { BossHud } from "../foundry/store";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface Row {
  tokenId: string;
  instanceId: string | null;
  name: string;
  img: string;
  order: number;
}

/** Tokens of the viewed scene whose actor has a boss profile; shown ones first, in stack order. */
function sceneRows(scene: SceneDocument): Row[] {
  const read = readInstances(scene.flags[MODULE_ID]?.instances);
  const items = read.status === "ok" ? read.value.items : [];
  const rows: Row[] = [];
  for (const token of scene.tokens.values()) {
    const actor = token.baseActor;
    const profile = readProfile(actor?.flags[MODULE_ID]?.profile);
    if (!actor || profile.status !== "ok") continue;
    const instance = items.find((item) => item.tokenId === token.id);
    rows.push({
      tokenId: token.id,
      instanceId: instance?.id ?? null,
      name: profile.value.playerName ? `${token.name} (${profile.value.playerName})` : token.name,
      img: profile.value.portrait ?? actor.img,
      order: instance?.order ?? Number.POSITIVE_INFINITY,
    });
  }
  return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** "Active bosses": show or hide each boss of the viewed scene, or all of them. */
class ActiveBosses extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "bb5e-active-bosses",
    classes: ["bb5e-app"],
    window: { title: "BB5E.Panel.Title", icon: "fa-solid fa-skull-crossbones", resizable: true },
    position: { width: 400, height: "auto" },
    actions: { toggle: ActiveBosses.#onToggle, hideAll: ActiveBosses.#onHideAll },
  };

  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/active-bosses.hbs` } };

  readonly #hud: BossHud;
  #unsubscribe: (() => void) | null = null;

  constructor(hud: BossHud) {
    super();
    this.#hud = hud;
  }

  override async _prepareContext(options: Record<string, unknown>) {
    const scene = canvas?.scene ?? null;
    const rows = scene ? sceneRows(scene) : [];
    return {
      ...(await super._prepareContext(options)),
      hasScene: Boolean(scene),
      rows,
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
}

export function openActiveBosses(hud: BossHud): void {
  const existing = foundry.applications.instances.get("bb5e-active-bosses");
  void (existing ?? new ActiveBosses(hud)).render({ force: true });
}
