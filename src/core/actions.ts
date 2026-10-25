import { isDocumentId, isRecord } from "./schema";

/** Writes to scene instances; only the active GM applies them, after checking them again. */
export type WriteAction =
  | { type: "show"; sceneId: string; tokenId: string }
  | { type: "hide"; sceneId: string; instanceId: string }
  | { type: "hideAll"; sceneId: string };

/** Payload check at the trust boundary (queries from other GMs): returns a clean copy or null. */
export function parseAction(raw: unknown): WriteAction | null {
  if (!isRecord(raw) || !isDocumentId(raw.sceneId)) return null;
  const sceneId = raw.sceneId;
  switch (raw.type) {
    case "show":
      return isDocumentId(raw.tokenId) ? { type: "show", sceneId, tokenId: raw.tokenId } : null;
    case "hide":
      return isDocumentId(raw.instanceId) ? { type: "hide", sceneId, instanceId: raw.instanceId } : null;
    case "hideAll":
      return { type: "hideAll", sceneId };
    default:
      return null;
  }
}
