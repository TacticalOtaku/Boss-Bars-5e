import { hpFraction } from "../core/aggregate";
import type { Instance } from "../core/instances";
import type { QuoteEvent } from "../core/quotes";
import { dnd5eAttack, midiAttack, type AttackResult } from "../integrations/attacks";
import { applyQuoteEvents } from "./authority";
import { liveFoundryEnv, type FoundryEnv } from "./env";
import { instanceFor, sceneItems, type BossHud } from "./store";

/** What the active GM last saw of a boss with quotes. */
interface Seen {
  /** Whether this showing has reached players at least once. */
  appeared: boolean;
  fraction: number | null;
  value: number | null;
  defeated: boolean;
  statuses: Set<string>;
  phaseId: string | null;
  /** The bound token or actor: a form's move is no healing. */
  bound: string;
}

/** Events between two looks at the same boss (decision 6): from the data, never from damage hooks (ADR 0001). */
function eventsBetween(before: Seen, now: Seen): QuoteEvent[] {
  const events: QuoteEvent[] = [];
  if (!before.appeared && now.appeared) events.push({ type: "appear" });
  if (now.phaseId && now.phaseId !== before.phaseId) events.push({ type: "phase", phaseId: now.phaseId });
  if (now.bound === before.bound) {
    if (before.fraction !== null && now.fraction !== null && now.fraction < before.fraction) {
      events.push({ type: "hp", from: before.fraction, to: now.fraction });
    }
    if (
      before.value !== null &&
      now.value !== null &&
      before.value > 0 &&
      now.value > before.value &&
      !now.defeated
    )
      events.push({ type: "heal" });
  }
  if (now.defeated && !before.defeated) events.push({ type: "defeat" });
  const gained = [...now.statuses].filter((status) => !before.statuses.has(status));
  if (gained.length) events.push({ type: "status", statuses: gained });
  return events;
}

/** The instances an attack's target covers: one token, or every token of a linked world actor. */
function targetsOf(
  result: AttackResult,
  env: Pick<FoundryEnv, "game">,
): { scene: SceneDocument; instance: Instance }[] {
  const found: { scene: SceneDocument; instance: Instance }[] = [];
  for (const scene of env.game.scenes.values()) {
    const target = result.target;
    if ("sceneId" in target && target.sceneId !== scene.id) continue;
    const items = sceneItems(scene);
    const tokens =
      "tokenId" in target
        ? scene.tokens.filter((token) => token.id === target.tokenId)
        : scene.tokens.filter((token) => token.actorLink && token.actorId === target.actorId);
    for (const token of tokens) {
      const instance = instanceFor(items, token);
      if (instance && !found.some((each) => each.instance.id === instance.id))
        found.push({ scene, instance });
    }
  }
  return found;
}

/** The attacker's token name from the roll message's speaker. */
function attackerOf(message: ChatMessageDocument, env: Pick<FoundryEnv, "game">): string {
  const { scene, token, alias } = message.speaker ?? {};
  return env.game.scenes.get(scene ?? "")?.tokens.get(token ?? "")?.name ?? alias ?? "";
}

/**
 * Quote events on the active GM: data changes after each recompute (the first recompute after a load only looks),
 * the boss's turn from the tracker, crits and misses from the chat (dnd5e and Midi, both always: decision 8).
 */
export function startQuoteWatch(hud: BossHud, env: FoundryEnv = liveFoundryEnv()): void {
  let seen: Map<string, Seen> | null = null;
  hud.subscribe((snapshot) => {
    if (!snapshot.isActiveGM) {
      seen = null;
      return;
    }
    const next = new Map<string, Seen>();
    for (const { scene, subject, total, defeated } of snapshot.allEntries) {
      if (subject.profile.kind !== "boss" || !subject.profile.quotes.length) continue;
      const item = subject.instance;
      const now: Seen = {
        appeared: total !== null && !total.hidden,
        fraction: total?.hp ? hpFraction(total.hp) : null,
        value: total?.hp?.value ?? null,
        defeated,
        statuses: new Set(
          (total?.tokens ?? []).flatMap((token) =>
            (token.effects ?? []).flatMap((effect) => [...effect.statuses, effect.name]),
          ),
        ),
        phaseId: item.phase && !item.phase.waiting ? item.phase.id : null,
        bound: item.tokenId ?? item.actorId ?? "",
      };
      const before = seen?.get(item.id);
      // Preparing a hidden boss must not spend its arrival phrase before players can see it.
      // Once visible, hiding and revealing the same showing is not another arrival.
      now.appeared ||= before?.appeared ?? false;
      next.set(item.id, now);
      if (!seen) continue;
      applyQuoteEvents(
        scene,
        item.id,
        before ? eventsBetween(before, now) : now.appeared ? [{ type: "appear" }] : [],
        env,
      );
    }
    seen = next;
  });

  // One turn of one combatant per round speaks once, whatever rewinds or reorders happen.
  const turns = new Set<string>();
  env.Hooks.on(
    "combatTurnChange",
    (combat: CombatDocument, _prior: unknown, current: { round: number; combatantId: string | null }) => {
      if (!env.game.user.isActiveGM || !current.combatantId) return;
      const key = `${combat.id}:${current.round}:${current.combatantId}`;
      if (turns.has(key)) return;
      turns.add(key);
      const combatant = combat.combatants.get(current.combatantId);
      const scene = env.game.scenes.get(combatant?.sceneId ?? "");
      const token = scene?.tokens.get(combatant?.tokenId ?? "");
      const instance = token ? instanceFor(sceneItems(scene), token) : undefined;
      if (scene && instance) applyQuoteEvents(scene, instance.id, [{ type: "turn" }], env);
    },
  );

  // shortcut: a re-rolled attack in the same Midi card counts once; per message and boss is enough for 1.0.
  const attacks = new Set<string>();
  const onAttack = (message: ChatMessageDocument, results: AttackResult[] | null) => {
    if (!env.game.user.isActiveGM || !results) return;
    const attacker = attackerOf(message, env);
    for (const result of results) {
      if (result.outcome === "hit") continue;
      for (const { scene, instance } of targetsOf(result, env)) {
        const key = `${message.id}:${instance.id}`;
        if (attacks.has(key)) continue;
        attacks.add(key);
        applyQuoteEvents(scene, instance.id, [{ type: result.outcome, attacker }], env);
      }
    }
  };
  env.Hooks.on("createChatMessage", (message: ChatMessageDocument) =>
    onAttack(message, dnd5eAttack(message)),
  );
  env.Hooks.on("updateChatMessage", (message: ChatMessageDocument, changed: { flags?: unknown }) =>
    onAttack(message, midiAttack(changed, message)),
  );
}
