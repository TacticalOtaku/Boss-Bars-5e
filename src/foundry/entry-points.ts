import { MODULE_ID } from "../constants";
import { readInstances } from "../core/instances";
import { readProfile } from "../core/profile";
import { baseActorOf, hasHp } from "../integrations/dnd5e/actor";
import { writeOrNotify } from "./authority";

export interface EntryPoints {
  openProfile(actor: ActorDocument): void;
  openPanel(): void;
}

/** GM-only ways in: token HUD button, actor sheet ⋮ menu item, scene control button. */
export function registerEntryPoints({ openProfile, openPanel }: EntryPoints): void {
  // The HUD is rebuilt on every render (root part), so the button is added each time (research/foundry-ui §5).
  Hooks.on(
    "renderTokenHUD",
    (app: ApplicationV2Instance & { document: TokenDocument }, element: HTMLElement) => {
      if (!game.user.isGM) return;
      const token = app.document;
      const actor = token.baseActor;
      const scene = token.parent;
      if (!actor || !scene || !hasHp(actor)) return;
      const hasProfile = readProfile(actor.flags[MODULE_ID]?.profile).status === "ok";
      const read = readInstances(scene.flags[MODULE_ID]?.instances);
      const instance =
        read.status === "ok" ? read.value.items.find((item) => item.tokenId === token.id) : undefined;

      const button = document.createElement("button");
      button.type = "button"; // the HUD root is a <form> that submits on change
      button.className = "control-icon bb5e-hud-button";
      button.classList.toggle("active", Boolean(instance));
      button.dataset.tooltip = "";
      const label = !hasProfile ? "BB5E.Hud.Setup" : instance ? "BB5E.Hud.Hide" : "BB5E.Hud.Show";
      button.setAttribute(
        "aria-label",
        hasProfile
          ? `${game.i18n.localize(label)}. ${game.i18n.localize("BB5E.Hud.RightClick")}`
          : game.i18n.localize(label),
      );
      button.innerHTML = '<i class="fa-solid fa-skull" inert></i>';
      button.addEventListener("click", (event) => {
        event.preventDefault();
        if (!hasProfile) return openProfile(actor);
        const action = instance
          ? ({ type: "hide", sceneId: scene.id, instanceId: instance.id } as const)
          : ({ type: "show", sceneId: scene.id, tokenId: token.id } as const);
        void writeOrNotify(action).then((done) => {
          if (done) void app.render();
        });
      });
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openProfile(actor);
      });
      element.querySelector(".col.right")?.append(button);
    },
  );

  // getHeaderControlsActorSheetV2 reaches only actor sheets (research/old-boss-bar F6).
  Hooks.on(
    "getHeaderControlsActorSheetV2",
    (app: ApplicationV2Instance, controls: Record<string, unknown>[]) => {
      const actor = app.document;
      if (!game.user.isGM || !actor || !["npc", "character"].includes(actor.type)) return;
      controls.push({
        action: "bb5eProfile",
        icon: "fa-solid fa-skull",
        label: "BB5E.Profile.Open",
        // dnd5e calls onClick(window.event) without a target: the actor comes from the closure.
        onClick: () => {
          const base = baseActorOf(actor);
          if (base) openProfile(base);
        },
      });
    },
  );

  // v13+: controls and tools are records, not arrays (research/foundry-ui §6).
  Hooks.on("getSceneControlButtons", (controls: Record<string, { tools: Record<string, unknown> }>) => {
    const tokens = controls.tokens;
    if (!tokens) return;
    tokens.tools.bb5eActiveBosses = {
      name: "bb5eActiveBosses",
      order: Object.keys(tokens.tools).length,
      title: "BB5E.Panel.Title",
      icon: "fa-solid fa-skull-crossbones",
      button: true,
      visible: game.user.isGM,
      onChange: () => openPanel(),
    };
  });
}
