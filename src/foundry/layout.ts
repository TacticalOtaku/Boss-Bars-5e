import { MODULE_ID } from "../constants";
import { clientPreferences } from "./client-layout";
import { liveFoundryEnv, type FoundryEnv } from "./env";
import {
  DEFAULT_LAYOUT,
  effectiveLayout,
  readLayout,
  readOverride,
  type Layout,
  type LayoutOverride,
} from "../core/layout";
import type { ReadResult } from "../core/schema";

/** The world layout as stored (the old "players may collapse" setting seeds it until the first save). */
export function storedLayout(env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): ReadResult<Layout> {
  const legacy = env.game.settings.get(MODULE_ID, "playersMayCollapse") !== false;
  return readLayout(env.game.settings.get(MODULE_ID, "layout"), legacy);
}

export function worldLayout(env: Pick<FoundryEnv, "game"> = liveFoundryEnv()): Layout {
  const read = storedLayout(env);
  return read.status === "ok" ? read.value : DEFAULT_LAYOUT;
}

export function sceneOverride(scene: SceneDocument | null | undefined): LayoutOverride {
  return readOverride(scene?.flags[MODULE_ID]?.layout);
}

/** Unsaved local preferences while the panel is open, affecting only this client. */
let draft: Layout | null = null;

export function setLayoutDraft(layout: Layout | null): void {
  draft = layout;
}

export function currentLayout(
  scene: SceneDocument | null | undefined,
  env: Pick<FoundryEnv, "game"> = liveFoundryEnv(),
): Layout {
  return draft ?? clientPreferences(env) ?? effectiveLayout(worldLayout(env), sceneOverride(scene));
}
