import { hpFraction, type HpData } from "./hp";
import type { BarValue } from "./minibars";
import type { EffectInput } from "./statuses";

/** One token as the HUD needs it. */
export interface TokenState {
  tokenId: string;
  hidden: boolean;
  /** Linked tokens share their world actor, and so its HP. */
  linked: boolean;
  hp: HpData | null;
  defeated: boolean;
  /** Effects Foundry would draw as icons on this token. */
  effects?: EffectInput[];
  /** Mini-bar values read from the actor, by mini-bar id (counters and temp HP are not here). */
  bars?: Record<string, BarValue | null>;
}

/** Defeat: 0 HP, the defeated status ("dead") or "defeated" in the combat tracker (spec §3). */
export function isDefeated(hp: HpData | null, deadStatus: boolean, combatantDefeated: boolean): boolean {
  return (hp !== null && hpFraction(hp) === 0) || deadStatus || combatantDefeated;
}

/** Linked tokens of one subject share the world actor: only the first of them counts for summed values. */
export function distinctActors(tokens: TokenState[]): TokenState[] {
  let linkedSeen = false;
  return tokens.filter((token) => {
    if (!token.linked) return true;
    if (linkedSeen) return false;
    linkedSeen = true;
    return true;
  });
}

export interface Aggregate {
  hp: HpData | null;
  /** Tokens counted for this viewer (×N). */
  count: number;
  /** The counted tokens themselves. */
  tokens: TokenState[];
  /** Every token is hidden: the GM sees the bar dimmed. */
  hidden: boolean;
  /** Every counted token is defeated. */
  defeated: boolean;
}

/**
 * The tokens behind one bar or card, as one viewer sees them. Players count only tokens they can see, so neither
 * N nor the summed HP reveal hidden ones. null — nothing to show this viewer.
 */
export function aggregate(tokens: TokenState[], isGM: boolean): Aggregate | null {
  const counted = isGM ? tokens : tokens.filter((token) => !token.hidden);
  if (!counted.length) return null;
  let hp = null as HpData | null;
  for (const token of distinctActors(counted)) {
    if (!token.hp) continue;
    hp = {
      value: (hp?.value ?? 0) + token.hp.value,
      effectiveMax: (hp?.effectiveMax ?? 0) + token.hp.effectiveMax,
      temp: (hp?.temp ?? 0) + token.hp.temp,
    };
  }
  return {
    hp,
    count: counted.length,
    tokens: counted,
    hidden: tokens.every((token) => token.hidden),
    defeated: counted.every((token) => token.defeated),
  };
}
