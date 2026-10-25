import { MODULE_ID } from "../constants";
import {
  defaultProfile,
  PROFILE_LIMITS,
  profileErrors,
  readProfile,
  type ProfileInput,
} from "../core/profile";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const TEMPLATES = `modules/${MODULE_ID}/templates`;

type FormData = { object: Record<string, unknown> };

/** Boss profile editor; stage 1 has the "Main" tab. It always edits the world actor. */
class ProfileEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["bb5e-app"],
    tag: "form",
    window: { title: "BB5E.Profile.Title", icon: "fa-solid fa-skull", contentClasses: ["standard-form"] },
    position: { width: 480 },
    form: { handler: ProfileEditor.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: { removeProfile: ProfileEditor.#onRemove },
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${TEMPLATES}/profile-main.hbs` },
    footer: { template: `${TEMPLATES}/profile-footer.hbs` },
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
    return {
      ...(await super._prepareContext(options)),
      profile: read.status === "ok" ? read.value : defaultProfile(),
      hasProfile: read.status === "ok",
      limits: PROFILE_LIMITS,
    };
  }

  override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>) {
    await super._onRender(context, options);
    this.#setDirty(this.#dirty);
    // Re-rendering replaces the parts, so listening on the form root survives every render.
    if (options.isFirstRender) this.element.addEventListener("input", () => this.#setDirty(true));
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
      const discard = await DialogV2.confirm({
        window: { title: game.i18n.localize("BB5E.Profile.Unsaved.Title") },
        content: `<p>${game.i18n.localize("BB5E.Profile.Unsaved.Body")}</p>`,
      });
      this.#confirming = false;
      if (!discard) return this;
    }
    return super.close(options);
  }

  static async #onSubmit(this: ProfileEditor, _event: Event, form: HTMLFormElement, formData: FormData) {
    const data = formData.object;
    const input: ProfileInput = {
      playerName: String(data.playerName ?? ""),
      title: String(data.title ?? ""),
      portrait: String(data.portrait ?? ""),
      size: Number(data.size),
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
    await this.actor.setFlag(MODULE_ID, "profile", {
      ...(current.status === "ok" ? current.value : defaultProfile()),
      playerName: input.playerName.trim(),
      title: input.title.trim(),
      portrait: input.portrait.trim() || null,
      size: input.size,
    });
    this.#setDirty(false);
    await this.render();
  }

  /** Removing the profile hides this actor's bars on every scene (the active GM prunes them). */
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
