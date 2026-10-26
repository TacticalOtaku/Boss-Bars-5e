import { MODULE_ID } from "../constants";
import { readInstances, type Instance } from "../core/instances";
import { phaseIndex, romanNumeral } from "../core/phases";
import { readProfile, type Profile, type ProfileKind } from "../core/profile";
import { writeOrNotify } from "../foundry/authority";
import { instanceFor, profileActorOf, type BossHud } from "../foundry/store";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Other GM windows the panel links to (loaded lazily by main). */
export interface PanelLinks {
  openRanks(): void;
  openLayout(): void;
  openLibrary(): void;
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
  /** Shown rows only: manual counters and the boss's custom statuses. */
  counters: { barId: string; label: string; value: number; max: number }[];
  customs: { id: string; name: string; img: string; active: boolean }[];
  /** A shown boss with phases: pick one (GM only, like the whole panel). */
  phases: { id: string; label: string; selected: boolean }[];
  /** The form waits for a token: "Bind selected token". */
  waiting: boolean;
  /** A shown boss can say a profile quote or the GM's own line. */
  canSay: boolean;
  quotes: { id: string; label: string }[];
}

function rowOf(
  profile: Profile,
  actor: ActorDocument,
  instance: Instance | undefined,
  label: { name: string; count: number; tokenId: string },
): Row {
  const counters = instance
    ? profile.miniBars.flatMap(({ id, label, source }) =>
        source.type === "counter"
          ? [
              {
                barId: id,
                label,
                value: Math.min(source.max, instance.counters?.[id] ?? source.max),
                max: source.max,
              },
            ]
          : [],
      )
    : [];
  const customs =
    instance && profile.kind === "boss"
      ? profile.statuses.custom.map((status) => ({
          id: status.id,
          name: status.name,
          img: status.img,
          active: Boolean(instance.customStatuses?.includes(status.id)),
        }))
      : [];
  const phases = instance && profile.kind === "boss" ? profile.phases : [];
  const current = phaseIndex(phases, instance?.phase);
  return {
    kind: profile.kind,
    tokenId: label.tokenId,
    instanceId: instance?.id ?? null,
    name: profile.playerName ? `${label.name} (${profile.playerName})` : label.name,
    count: label.count,
    img: profile.portrait ?? actor.img,
    order: instance?.order ?? Number.POSITIVE_INFINITY,
    counters,
    customs,
    phases: phases.map((phase, index) => ({
      id: phase.id,
      label: phase.label || game.i18n.format("BB5E.Phase.Default", { n: romanNumeral(index + 1) }),
      selected: index === current,
    })),
    waiting: Boolean(instance?.phase?.waiting),
    canSay: Boolean(instance) && profile.kind === "boss",
    quotes:
      instance && profile.kind === "boss"
        ? profile.quotes.map((quote) => ({ id: quote.id, label: quote.texts[0]?.slice(0, 48) ?? quote.id }))
        : [],
  };
}

/**
 * Shown bars and cards first, in show order (a form's bar stays under its boss, even on another actor's token or
 * while it waits with no token at all), then the other tokens whose actor has a profile: one row per token, or one
 * per actor (×N) in that mode.
 */
function sceneRows(scene: SceneDocument): Row[] {
  const read = readInstances(scene.flags[MODULE_ID]?.instances);
  const items = read.status === "ok" ? read.value.items : [];
  const rows: Row[] = [];
  for (const item of items) {
    const actor = profileActorOf(scene, item);
    const profile = readProfile(actor?.flags[MODULE_ID]?.profile);
    if (!actor || profile.status !== "ok") continue;
    const tokens = item.tokenId
      ? scene.tokens.filter((token) => token.id === item.tokenId)
      : scene.tokens.filter((token) => token.actorId === item.actorId);
    const name = item.source
      ? actor.prototypeToken?.name || actor.name
      : (item.tokenId && tokens[0]?.name) || actor.name;
    rows.push(
      rowOf(profile.value, actor, item, { name, count: tokens.length, tokenId: tokens[0]?.id ?? "" }),
    );
  }
  // shortcut: every token of a boss whose bar moved onto a form is left out, not just the fallen one; fine while
  // forms are used one boss token at a time.
  const sources = new Set(items.flatMap((item) => (item.source ? [item.source] : [])));
  const hidden = new Map<string, Row>();
  for (const token of scene.tokens.values()) {
    const actor = token.baseActor;
    const profile = readProfile(actor?.flags[MODULE_ID]?.profile);
    if (!actor || profile.status !== "ok" || sources.has(actor.id) || instanceFor(items, token)) continue;
    const byActor = profile.value.displayMode === "actor";
    const key = byActor ? `actor:${actor.id}` : token.id;
    const existing = hidden.get(key);
    if (existing) existing.count += 1;
    else {
      const name = byActor ? actor.name : token.name;
      hidden.set(key, rowOf(profile.value, actor, undefined, { name, count: 1, tokenId: token.id }));
    }
  }
  rows.sort((a, b) => a.order - b.order);
  return [...rows, ...[...hidden.values()].sort((a, b) => a.name.localeCompare(b.name))];
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
      counter: ActiveBosses.#onCounter,
      toggleStatus: ActiveBosses.#onToggleStatus,
      setPhase: ActiveBosses.#onSetPhase,
      bindToken: ActiveBosses.#onBindToken,
      sayQuote: ActiveBosses.#onSayQuote,
      sayText: ActiveBosses.#onSayText,
      hideAll: ActiveBosses.#onHideAll,
      openRanks: ActiveBosses.#onOpenRanks,
      openLayout: ActiveBosses.#onOpenLayout,
      openLibrary: ActiveBosses.#onOpenLibrary,
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

  /** Own lines being typed survive the re-render every HUD recompute brings. */
  #drafts = new Map<string, string>();

  override async _preRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._preRender(context, options);
    for (const input of this.element?.querySelectorAll<HTMLInputElement>("[data-say-text]") ?? []) {
      const id = input.closest<HTMLElement>("[data-instance-id]")?.dataset.instanceId;
      if (id) this.#drafts.set(id, input.value);
    }
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    for (const input of this.element.querySelectorAll<HTMLInputElement>("[data-say-text]")) {
      const id = input.closest<HTMLElement>("[data-instance-id]")?.dataset.instanceId;
      input.value = (id && this.#drafts.get(id)) || "";
    }
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
    const { tokenId, instanceId } = target.closest<HTMLElement>("[data-token-id]")?.dataset ?? {};
    if (!scene) return;
    // A waiting form may have no token left: hiding goes by the instance.
    if (instanceId) await writeOrNotify({ type: "hide", sceneId: scene.id, instanceId });
    else if (tokenId) await writeOrNotify({ type: "show", sceneId: scene.id, tokenId });
  }

  static async #onCounter(this: ActiveBosses, _event: Event, target: HTMLElement) {
    const scene = canvas?.scene;
    const instanceId = target.closest<HTMLElement>("[data-instance-id]")?.dataset.instanceId;
    const counter = target.closest<HTMLElement>("[data-bar-id]");
    const { barId, value, max } = counter?.dataset ?? {};
    if (!scene || !instanceId || !barId) return;
    const next = Math.min(Number(max), Math.max(0, Number(value) + Number(target.dataset.delta)));
    if (next !== Number(value))
      await writeOrNotify({ type: "setCounter", sceneId: scene.id, instanceId, barId, value: next });
  }

  static async #onToggleStatus(this: ActiveBosses, _event: Event, target: HTMLElement) {
    const scene = canvas?.scene;
    const instanceId = target.closest<HTMLElement>("[data-instance-id]")?.dataset.instanceId;
    const statusId = target.dataset.statusId;
    if (!scene || !instanceId || !statusId) return;
    const active = target.getAttribute("aria-pressed") !== "true";
    await writeOrNotify({ type: "toggleStatus", sceneId: scene.id, instanceId, statusId, active });
  }

  static async #onSetPhase(this: ActiveBosses, _event: Event, target: HTMLElement) {
    const scene = canvas?.scene;
    const instanceId = target.closest<HTMLElement>("[data-instance-id]")?.dataset.instanceId;
    const phaseId = target.dataset.phaseId;
    if (scene && instanceId && phaseId)
      await writeOrNotify({ type: "setPhase", sceneId: scene.id, instanceId, phaseId });
  }

  /** The one token this GM has selected on the scene becomes the waiting form's token. */
  static async #onBindToken(this: ActiveBosses, _event: Event, target: HTMLElement) {
    const scene = canvas?.scene;
    const instanceId = target.closest<HTMLElement>("[data-instance-id]")?.dataset.instanceId;
    const selected = canvas?.tokens?.controlled ?? [];
    const token = selected.length === 1 ? selected[0]?.document : undefined;
    if (!scene || !instanceId) return;
    if (!token || token.parent?.id !== scene.id) {
      return ui.notifications.warn("BB5E.Panel.NoSelection", { localize: true });
    }
    await writeOrNotify({ type: "bindToken", sceneId: scene.id, instanceId, tokenId: token.id });
  }

  static async #onSayQuote(this: ActiveBosses, _event: Event, target: HTMLElement) {
    const scene = canvas?.scene;
    const row = target.closest<HTMLElement>("[data-instance-id]");
    const quoteId = row?.querySelector<HTMLSelectElement>("[data-say-quote]")?.value;
    const instanceId = row?.dataset.instanceId;
    if (scene && instanceId && quoteId)
      await writeOrNotify({ type: "say", sceneId: scene.id, instanceId, quoteId });
  }

  static async #onSayText(this: ActiveBosses, _event: Event, target: HTMLElement) {
    const scene = canvas?.scene;
    const row = target.closest<HTMLElement>("[data-instance-id]");
    const input = row?.querySelector<HTMLInputElement>("[data-say-text]");
    const instanceId = row?.dataset.instanceId;
    const text = input?.value.trim() ?? "";
    if (!scene || !instanceId || !input || !text) return;
    if (await writeOrNotify({ type: "say", sceneId: scene.id, instanceId, text })) {
      this.#drafts.delete(instanceId);
      input.value = "";
    }
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

  static async #onOpenLibrary(this: ActiveBosses) {
    this.#open.openLibrary();
  }
}

export function openActiveBosses(hud: BossHud, open: PanelLinks): void {
  const existing = foundry.applications.instances.get("bb5e-active-bosses");
  void (existing ?? new ActiveBosses(hud, open)).render({ force: true });
}
