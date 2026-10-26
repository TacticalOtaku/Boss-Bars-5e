import { MODULE_ID } from "../constants";
import { readProfile } from "../core/profile";
import { RANK_LIMITS, RANKS_VERSION, rankErrors, readRanks, type Rank } from "../core/ranks";
import { currentRanks, defaultRankList } from "../foundry/settings";
import { BUILTIN_IDS, CLASSIC } from "../core/look/builtin";
import { readLibrary } from "../core/look/schema";
import { confirmDiscard, displayName, previewCard, sourcesOf, styleFor } from "./shared";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const TEMPLATES = `modules/${MODULE_ID}/templates`;
/** Core Foundry image for the sample card. */
const SAMPLE_IMG = "icons/svg/mystery-man.svg";

type Action = (this: RanksEditor, event: Event, target: HTMLElement) => Promise<void>;

/** "Elite ranks": the GM's ordered list, strongest first, each with a live card. */
class RanksEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "bb5e-ranks",
    classes: ["bb5e-app", "bb5e-hosted"],
    tag: "form",
    window: { frame: false, positioned: false },
    form: { handler: RanksEditor.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: {
      addRank: RanksEditor.#onAdd,
      removeRank: RanksEditor.#onRemove,
      moveUp: RanksEditor.#move(-1),
      moveDown: RanksEditor.#move(1),
    },
  };

  static PARTS = {
    list: { template: `${TEMPLATES}/ranks-list.hbs` },
    footer: { template: `${TEMPLATES}/editor-footer.hbs` },
  };

  constructor(readonly slot: HTMLElement) {
    super();
  }

  /** Drawn inside the hub (stage 13): the element goes into the hub's slot, not the page. */
  override async _insertElement(element: HTMLElement) {
    if (element.parentElement !== this.slot) this.slot.replaceChildren(element);
  }

  #draft: Rank[] = structuredClone(currentRanks());
  /** Looks to pick from: built-ins and the world library. */
  readonly #sources = (() => {
    const read = readLibrary(game.settings.get(MODULE_ID, "library"), BUILTIN_IDS);
    return sourcesOf(read.status === "ok" ? read.value : null);
  })();
  #dirty = false;
  #confirming = false;

  override async _prepareContext(options: Record<string, unknown>) {
    return {
      ...(await super._prepareContext(options)),
      rows: this.#draft.map((rank, index) => ({
        ...rank,
        index,
        first: index === 0,
        last: index === this.#draft.length - 1,
        looks: this.#sources.looks.map((look) => ({
          id: look.id,
          name: displayName(look),
          selected: look.id === (rank.look ?? CLASSIC.id),
        })),
      })),
      limits: RANK_LIMITS,
    };
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    this.#setDirty(this.#dirty);
    this.#updatePreviews();
    if (options.isFirstRender) {
      const edited = () => {
        this.#collect();
        this.#setDirty(true);
        this.#updatePreviews();
      };
      this.element.addEventListener("input", edited);
      this.element.addEventListener("change", edited);
    }
  }

  /** Reads the rows back into the draft; fields carry data-field / data-part instead of form names. */
  #collect() {
    for (const row of this.element.querySelectorAll<HTMLElement>("[data-rank-index]")) {
      const rank = this.#draft[Number(row.dataset.rankIndex)];
      if (!rank) continue;
      const value = (field: string) =>
        row.querySelector<HTMLInputElement>(`[data-field="${field}"]`)?.value ?? "";
      const part = (name: string) =>
        Boolean(row.querySelector<HTMLInputElement>(`[data-part="${name}"]`)?.checked);
      rank.name = value("name");
      rank.color = value("color") || rank.color;
      rank.size = Number(value("size"));
      rank.parts = { name: part("name"), fill: part("fill"), statuses: part("statuses") };
      // "Classic RPG" is stored as no look, the default.
      const look = value("look");
      rank.look = look && look !== CLASSIC.id ? look : null;
    }
  }

  #updatePreviews() {
    const label = game.i18n.localize("BB5E.Ranks.Sample");
    for (const row of this.element.querySelectorAll<HTMLElement>("[data-rank-index]")) {
      const rank = this.#draft[Number(row.dataset.rankIndex)];
      const host = row.querySelector<HTMLElement>(".bb5e-preview");
      if (rank && host)
        previewCard(host, { label, img: SAMPLE_IMG, rank, look: styleFor(this.#sources, rank.look) });
    }
  }

  #setDirty(dirty: boolean) {
    this.#dirty = dirty;
    const badge = this.element.querySelector<HTMLElement>(".bb5e-footer__dirty");
    if (badge) badge.hidden = !dirty;
  }

  override async close(options: Record<string, unknown> = {}) {
    if (this.#dirty && !options.force) {
      if (this.#confirming) return this;
      this.#confirming = true;
      const discard = await confirmDiscard();
      this.#confirming = false;
      if (!discard) return this;
    }
    return super.close(options);
  }

  async #restructure(change: () => void) {
    this.#collect();
    change();
    this.#setDirty(true);
    await this.render();
  }

  static #move(step: number): Action {
    return async function (this: RanksEditor, _event, target) {
      const index = Number(target.dataset.index);
      const other = index + step;
      if (!this.#draft[index] || !this.#draft[other]) return;
      await this.#restructure(() => {
        const [moved] = this.#draft.splice(index, 1);
        if (moved) this.#draft.splice(other, 0, moved);
      });
    };
  }

  static async #onAdd(this: RanksEditor) {
    if (this.#draft.length >= RANK_LIMITS.count) return;
    await this.#restructure(() =>
      this.#draft.push({
        id: foundry.utils.randomID(),
        name: game.i18n.localize("BB5E.Ranks.NewName"),
        color: "#9a7b5c",
        parts: { name: true, fill: true, statuses: false },
        look: null,
        size: 30,
      }),
    );
  }

  /** A rank in use asks first; its elites then take the weakest remaining rank. */
  static async #onRemove(this: RanksEditor, _event: Event, target: HTMLElement) {
    const index = Number(target.dataset.index);
    const rank = this.#draft[index];
    if (!rank) return;
    if (this.#draft.length === 1) {
      ui.notifications.warn("BB5E.Error.NoRanks", { localize: true });
      return;
    }
    const users = game.actors.filter((actor) => {
      const profile = readProfile(actor.flags[MODULE_ID]?.profile);
      return profile.status === "ok" && profile.value.kind === "elite" && profile.value.rank === rank.id;
    }).length;
    if (users) {
      const rest = this.#draft.filter((each) => each !== rank);
      const confirmed = await DialogV2.confirm({
        window: { title: game.i18n.localize("BB5E.Ranks.Remove") },
        content: `<p>${foundry.utils.escapeHTML(
          game.i18n.format("BB5E.Ranks.RemoveBody", {
            count: String(users),
            fallback: rest.at(-1)?.name ?? "",
          }),
        )}</p>`,
      });
      if (!confirmed) return;
    }
    await this.#restructure(() => this.#draft.splice(index, 1));
  }

  static async #onSubmit(this: RanksEditor, _event: Event, form: HTMLFormElement) {
    this.#collect();
    const errors = rankErrors(this.#draft);
    for (const field of form.querySelectorAll<HTMLElement>("[data-rank-error]")) {
      const error = errors.find((each) => String(each.index) === field.dataset.rankError);
      field.hidden = !error;
      field.textContent = error ? game.i18n.localize(error.key) : "";
    }
    if (errors.length) return;
    const stored = readRanks(game.settings.get(MODULE_ID, "ranks"), defaultRankList());
    if (stored.status === "newer") return ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    await game.settings.set(MODULE_ID, "ranks", { dataVersion: RANKS_VERSION, items: this.#draft });
    this.#setDirty(false);
  }
}

/** The hub's "Elite ranks" section. */
export function hostRanksEditor(slot: HTMLElement): ApplicationV2Instance {
  return new RanksEditor(slot);
}
