import { PROFILE_ID, PROFILE_LIMITS } from "./profile";
import { QUOTE_LIMITS } from "./quotes";
import { isDocumentId, isRecord } from "./schema";

/** Writes to scene instances; only the active GM applies them, after checking them again. */
export type WriteAction =
  | { type: "show"; sceneId: string; tokenId: string }
  | { type: "hide"; sceneId: string; instanceId: string }
  | { type: "hideAll"; sceneId: string }
  | { type: "setCounter"; sceneId: string; instanceId: string; barId: string; value: number }
  | { type: "toggleStatus"; sceneId: string; instanceId: string; statusId: string; active: boolean }
  | { type: "setPhase"; sceneId: string; instanceId: string; phaseId: string }
  /** A waiting form takes the token the GM selected. */
  | { type: "bindToken"; sceneId: string; instanceId: string; tokenId: string }
  /** A profile quote, or the GM's own text. */
  | { type: "say"; sceneId: string; instanceId: string; quoteId?: string; text?: string };

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
    case "setCounter": {
      const { instanceId, barId, value } = raw;
      const valid =
        isDocumentId(instanceId) &&
        typeof barId === "string" &&
        PROFILE_ID.test(barId) &&
        Number.isInteger(value) &&
        (value as number) >= 0 &&
        (value as number) <= PROFILE_LIMITS.counterMax;
      return valid ? { type: "setCounter", sceneId, instanceId, barId, value: value as number } : null;
    }
    case "toggleStatus": {
      const { instanceId, statusId, active } = raw;
      const valid =
        isDocumentId(instanceId) &&
        typeof statusId === "string" &&
        PROFILE_ID.test(statusId) &&
        typeof active === "boolean";
      return valid ? { type: "toggleStatus", sceneId, instanceId, statusId, active } : null;
    }
    case "setPhase": {
      const { instanceId, phaseId } = raw;
      const valid = isDocumentId(instanceId) && typeof phaseId === "string" && PROFILE_ID.test(phaseId);
      return valid ? { type: "setPhase", sceneId, instanceId, phaseId } : null;
    }
    case "bindToken": {
      const { instanceId, tokenId } = raw;
      return isDocumentId(instanceId) && isDocumentId(tokenId)
        ? { type: "bindToken", sceneId, instanceId, tokenId }
        : null;
    }
    case "say": {
      const { instanceId, quoteId, text } = raw;
      if (!isDocumentId(instanceId)) return null;
      if (typeof quoteId === "string" && PROFILE_ID.test(quoteId)) {
        return { type: "say", sceneId, instanceId, quoteId };
      }
      const said = typeof text === "string" ? text.trim() : "";
      return said && said.length <= QUOTE_LIMITS.text
        ? { type: "say", sceneId, instanceId, text: said }
        : null;
    }
    default:
      return null;
  }
}
