import { MODULE_ID } from "../constants";
import {
  defaultProfile,
  PROFILE_LIMITS,
  profileErrors,
  readProfile,
  type ProfileInput,
  type ProfileKind,
} from "../core/profile";
import { rankOf } from "../core/ranks";
import { currentRanks } from "../foundry/settings";
import { confirmDiscard, previewCard } from "./shared";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const TEMPLATES = `modules/${MODULE_ID}/templates`;

type FormData = { object: Record<string, unknown> };

/** Boss or elite profile; the "Main" tab of stages 1–2. It always edits the world actor. */
class ProfileEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["bb5e-app"],
    tag: "form",
    window: { title: "BB5E.Profile.Title", icon: "fa-solid fa-skull", contentClasses: ["standard-form"] },
    position: { width: 520 },
    form: { handler: ProfileEditor.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: { removeProfile: ProfileEditor.#onRemove },
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${TEMPLATES}/profile-main.hbs` },
    footer: { template: `${TEMPLATES}/editor-footer.hbs` },
  };

  static TABS = {
    sheet: {
      tabs: [{ id: "main", icon: "fa-solid fa-id-card", label: "BB5E.Profile.Tab.Main" }],
      initial: "main",
    },
  };

  readonly actor: ActorDocument;
  #dirty = false;
  #confirming = false;

  constructor(actor: ActorDocument) {
    super({ id: `bb5e-profile-${actor.id}` });
    this.actor = actor;
  }

  override get title(): string {
    return `${game.i18n.localize("BB5E.Profile.Title")}: ${this.actor.name}`;
  }

  override async _prepareContext(options: Record<string, unknown>) {
    const read = readProfile(this.actor.flags[MODULE_ID]?.profile);
    const ranks = currentRanks();
    // Both kinds' fields: the stored profile keeps the other kind's values as extra keys.
    const values: Record<string, unknown> = {
      ...defaultProfile("boss"),
      rank: ranks[Math.min(1, ranks.length - 1)]?.id ?? "",
      ...(read.status === "ok" ? read.value : {}),
    };
    return {
      ...(await super._prepareContext(options)),
      values,
      isElite: values.kind === "elite",
      byActor: values.displayMode === "actor",
      ranks: ranks.map((rank) => ({ id: rank.id, name: rank.name, selected: rank.id === values.rank })),
      hasProfile: read.status === "ok",
      limits: PROFILE_LIMITS,
    };
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    this.#setDirty(this.#dirty);
    this.#syncKind();
    // Re-rendering replaces the parts, so listening on the form root survives every render.
    if (options.isFirstRender) {
      this.element.addEventListener("input", () => this.#setDirty(true));
      this.element.addEventListener("change", (event) => {
        this.#setDirty(true);
        if ((event.target as HTMLInputElement).name === "kind") this.#syncKind();
        else this.#updatePreview();
      });
    }
  }

  #field(name: string): string {
    return this.element.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "";
  }

  #kind(): ProfileKind {
    return this.element.querySelector<HTMLInputElement>('[name="kind"]:checked')?.value === "elite"
      ? "elite"
      : "boss";
  }

  /** Shows the fields of the chosen kind only. */
  #syncKind() {
    const kind = this.#kind();
    for (const group of this.element.querySelectorAll<HTMLElement>("[data-kind-group]")) {
      group.hidden = group.dataset.kindGroup !== kind;
    }
    this.#updatePreview();
  }

  #updatePreview() {
    const host = this.element.querySelector<HTMLElement>(".bb5e-preview");
    if (!host || this.#kind() !== "elite") return;
    previewCard(host, {
      label: this.#field("playerName").trim() || this.actor.name,
      img: this.#field("portrait").trim() || this.actor.img,
      rank: rankOf(currentRanks(), this.#field("rank")).rank,
    });
  }

  #setDirty(dirty: boolean) {
    this.#dirty = dirty;
    const badge = this.element.querySelector<HTMLElement>(".bb5e-footer__dirty");
    if (badge) badge.hidden = !dirty;
  }

  /** Unsaved edits ask before closing; a second close while the question is open is ignored. */
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

  static async #onSubmit(this: ProfileEditor, _event: Event, form: HTMLFormElement, formData: FormData) {
    const data = formData.object;
    const input: ProfileInput = {
      kind: data.kind === "elite" ? "elite" : "boss",
      playerName: String(data.playerName ?? ""),
      title: String(data.title ?? ""),
      portrait: String(data.portrait ?? ""),
      size: Number(data.size),
      rank: String(data.rank ?? ""),
    };
    const errors = profileErrors(input);
    for (const field of form.querySelectorAll<HTMLElement>("[data-error-for]")) {
      const key = errors[field.dataset.errorFor as keyof ProfileInput];
      field.hidden = !key;
      field.textContent = key ? game.i18n.localize(key) : "";
      form.querySelector(`[name="${field.dataset.errorFor}"]`)?.toggleAttribute("aria-invalid", Boolean(key));
    }
    if (Object.keys(errors).length) return;
    const current = readProfile(this.actor.flags[MODULE_ID]?.profile);
    if (current.status === "newer") return ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    // Only the chosen kind's fields are written; the other kind's stay in the flag for a switch back.
    const kindFields =
      input.kind === "boss" ? { title: input.title.trim(), size: input.size } : { rank: input.rank };
    await this.actor.setFlag(MODULE_ID, "profile", {
      ...(current.status === "ok" ? current.value : defaultProfile(input.kind)),
      kind: input.kind,
      playerName: input.playerName.trim(),
      portrait: input.portrait.trim() || null,
      displayMode: data.displayMode === "actor" ? "actor" : "token",
      ...kindFields,
    });
    this.#setDirty(false);
    await this.render();
  }

  /** Removing the profile hides this actor's bars and cards on every scene (the active GM prunes them). */
  static async #onRemove(this: ProfileEditor) {
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("BB5E.Profile.Remove.Title") },
      content: `<p>${game.i18n.localize("BB5E.Profile.Remove.Body")}</p>`,
    });
    if (!confirmed) return;
    await this.actor.unsetFlag(MODULE_ID, "profile");
    this.#dirty = false;
    await this.close({ force: true });
  }
}

export function openProfileEditor(actor: ActorDocument): void {
  if (readProfile(actor.flags[MODULE_ID]?.profile).status === "newer") {
    ui.notifications.warn("BB5E.Error.NewerData", { localize: true });
    return;
  }
  const existing = foundry.applications.instances.get(`bb5e-profile-${actor.id}`);
  void (existing ?? new ProfileEditor(actor)).render({ force: true });
}
