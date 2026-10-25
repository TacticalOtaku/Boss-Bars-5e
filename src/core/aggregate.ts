import { hpFraction, type HpData } from "./hp";

/** One token as the HUD needs it. */
export interface TokenState {
  tokenId: string;
  hidden: boolean;
  /** Linked tokens share their world actor, and so its HP. */
  linked: boolean;
  hp: HpData | null;
  defeated: boolean;
}

/** Defeat: 0 HP, the defeated status ("dead") or "defeated" in the combat tracker (spec §3). */
export function isDefeated(hp: HpData | null, deadStatus: boolean, combatantDefeated: boolean): boolean {
  return (hp !== null && hpFraction(hp) === 0) || deadStatus || combatantDefeated;
}

export interface Aggregate {
  hp: HpData | null;
  /** Tokens counted for this viewer (×N). */
  count: number;
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
  let linkedCounted = false;
  let hp = null as HpData | null;
  for (const token of counted) {
    if (!token.hp || (token.linked && linkedCounted)) continue;
    if (token.linked) linkedCounted = true;
    hp = {
      value: (hp?.value ?? 0) + token.hp.value,
      effectiveMax: (hp?.effectiveMax ?? 0) + token.hp.effectiveMax,
      temp: (hp?.temp ?? 0) + token.hp.temp,
    };
  }
  return {
    hp,
    count: counted.length,
    hidden: tokens.every((token) => token.hidden),
    defeated: counted.every((token) => token.defeated),
  };
}
