import { isRecord, PROFILE_ID, text } from "./schema";

/** What makes a boss speak (spec §7). */
export type QuoteTrigger =
  | { type: "appear" | "heal" | "turn" | "crit" | "miss" | "defeat" | "manual" }
  /** Entering this phase. */
  | { type: "phase"; phaseId: string }
  /** HP falls under this share (once per fight), or one change takes at least this share. In %. */
  | { type: "below" | "damage"; percent: number }
  /** A status id or an effect name appears on the boss. */
  | { type: "status"; status: string };

export interface Quote {
  id: string;
  trigger: QuoteTrigger;
  /** The pool: plain text, `{name}` and (crit, miss) `{attacker}`. */
  texts: string[];
  order: "random" | "cycle";
  /** At most once per this many rounds; 0 — no limit. Not applied outside combat. */
  cooldown: number;
  /** Only once per fight. */
  once: boolean;
  /** Seconds on screen; null — 3 s + 60 ms per character, at most 10 s. */
  duration: number | null;
}

export const QUOTE_LIMITS = {
  quotes: 30,
  texts: 10,
  text: 200,
  cooldownMax: 99,
  percentMin: 1,
  percentMax: 99,
  durationMin: 1,
  durationMax: 20,
} as const;

/** Per quote, in the instance: the fight it was last used in, the round, "already said", the pool cursor. */
export interface QuoteState {
  fight: string;
  round?: number;
  done?: boolean;
  cursor?: number;
}

/** The quote on screen, in the instance: every client shows it from the data (decision 2). */
export interface ShownQuote {
  key: string;
  text: string;
  priority: number;
  /** Synchronized server time when the active GM wrote it (ms), and how long it shows (s). */
  at: number;
  duration: number;
}

/** What happened to a boss between two recomputes, or what the chat and the tracker told the active GM. */
export type QuoteEvent =
  | { type: "appear" | "heal" | "turn" | "defeat" }
  | { type: "phase"; phaseId: string }
  /** The HP share went from → to (both 0–1). */
  | { type: "hp"; from: number; to: number }
  /** Status ids and effect names that newly appeared. */
  | { type: "status"; statuses: string[] }
  | { type: "crit" | "miss"; attacker: string };

export interface QuoteContext {
  /** The combat the boss's token is in, or the showing (instance id) outside combat (decision 5). */
  fight: string;
  /** The combat round; null outside combat. */
  round: number | null;
  now: number;
  /** The bar's label as players see it. */
  name: string;
  random: () => number;
}

/** Every trigger type this version knows. */
export const QUOTE_TRIGGER_TYPES: readonly string[] = [
  "appear",
  "heal",
  "turn",
  "crit",
  "miss",
  "defeat",
  "manual",
  "phase",
  "below",
  "damage",
  "status",
];

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.min(max, Math.max(min, number))) : fallback;
};

function readTrigger(raw: unknown): QuoteTrigger {
  if (!isRecord(raw) || typeof raw.type !== "string") return { type: "manual" };
  switch (raw.type) {
    case "phase":
      return typeof raw.phaseId === "string" && PROFILE_ID.test(raw.phaseId)
        ? { type: "phase", phaseId: raw.phaseId }
        : { type: "manual" };
    case "below":
    case "damage":
      return {
        type: raw.type,
        percent: int(raw.percent, QUOTE_LIMITS.percentMin, QUOTE_LIMITS.percentMax, 50),
      };
    case "status": {
      const status = text(raw.status, 80);
      return status ? { type: "status", status } : { type: "manual" };
    }
    default:
      // A newer version's trigger never matches here and is written back as it is.
      return QUOTE_TRIGGER_TYPES.includes(raw.type)
        ? { type: raw.type as "appear" }
        : (raw as unknown as QuoteTrigger);
  }
}

/** Bad or duplicate ids and quotes without text are dropped; unknown keys stay. */
export function readQuotes(raw: unknown): Quote[] {
  const quotes: Quote[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (quotes.length >= QUOTE_LIMITS.quotes) break;
    if (!isRecord(entry) || typeof entry.id !== "string" || !PROFILE_ID.test(entry.id)) continue;
    if (quotes.some((quote) => quote.id === entry.id)) continue;
    const texts = (Array.isArray(entry.texts) ? entry.texts : [])
      .map((each) => text(each, QUOTE_LIMITS.text))
      .filter(Boolean)
      .slice(0, QUOTE_LIMITS.texts);
    if (!texts.length) continue;
    quotes.push({
      ...entry,
      id: entry.id,
      trigger: readTrigger(entry.trigger),
      texts,
      order: entry.order === "cycle" ? "cycle" : "random",
      cooldown: int(entry.cooldown, 0, QUOTE_LIMITS.cooldownMax, 0),
      once: entry.once === true,
      duration:
        entry.duration === null || entry.duration === undefined
          ? null
          : int(entry.duration, QUOTE_LIMITS.durationMin, QUOTE_LIMITS.durationMax, 5),
    });
  }
  return quotes;
}

/**
 * Editor validation of quote rows: at least one variant, each up to 200 characters; thresholds 1–99%; an existing
 * phase; a status; cooldown 0–99 rounds; duration empty (auto) or 1–20 s.
 */
export function quoteErrors(
  quotes: readonly Quote[],
  phaseIds: readonly string[],
  errors: Record<string, string>,
): void {
  quotes.forEach((quote, index) => {
    const at = `quotes.${index}`;
    const { trigger } = quote;
    if (!quote.texts.length) errors[`${at}.texts`] = "BB5E.Error.QuoteEmpty";
    else if (
      quote.texts.length > QUOTE_LIMITS.texts ||
      quote.texts.some((each) => each.length > QUOTE_LIMITS.text)
    ) {
      errors[`${at}.texts`] = "BB5E.Error.QuoteTexts";
    }
    if (
      (trigger.type === "below" || trigger.type === "damage") &&
      !(
        Number.isInteger(trigger.percent) &&
        trigger.percent >= QUOTE_LIMITS.percentMin &&
        trigger.percent <= QUOTE_LIMITS.percentMax
      )
    ) {
      errors[`${at}.percent`] = "BB5E.Error.PercentRange";
    }
    if (trigger.type === "phase" && !phaseIds.includes(trigger.phaseId))
      errors[`${at}.phaseId`] = "BB5E.Error.NoPhase";
    if (trigger.type === "status" && !trigger.status.trim()) errors[`${at}.status`] = "BB5E.Error.NoStatus";
    if (!(
      Number.isInteger(quote.cooldown) &&
      quote.cooldown >= 0 &&
      quote.cooldown <= QUOTE_LIMITS.cooldownMax
    )) {
      errors[`${at}.cooldown`] = "BB5E.Error.CooldownRange";
    }
    const { duration } = quote;
    if (
      duration !== null &&
      !(duration >= QUOTE_LIMITS.durationMin && duration <= QUOTE_LIMITS.durationMax)
    ) {
      errors[`${at}.duration`] = "BB5E.Error.DurationRange";
    }
  });
}

/** Importance (decision 7): defeat > phase entry > manual > the rest. */
export function quotePriority(trigger: QuoteTrigger): number {
  return trigger.type === "defeat" ? 3 : trigger.type === "phase" ? 2 : trigger.type === "manual" ? 1 : 0;
}

/** 3 s plus ~60 ms per character, at most 10 s (spec §7). */
export const autoDuration = (value: string) => Math.min(10, 3 + 0.06 * value.length);

/** Whether an event fires a trigger; for crit and miss, who attacked. */
function matches(trigger: QuoteTrigger, event: QuoteEvent): { attacker?: string } | null {
  switch (trigger.type) {
    case "phase":
      return event.type === "phase" && event.phaseId === trigger.phaseId ? {} : null;
    case "below":
      return event.type === "hp" && event.from * 100 >= trigger.percent && event.to * 100 < trigger.percent
        ? {}
        : null;
    case "damage":
      // Fractions such as 1 - 0.8 round just below 20%; tolerate only floating-point subtraction error.
      return event.type === "hp" && event.from - event.to + Number.EPSILON >= trigger.percent / 100
        ? {}
        : null;
    case "status":
      return event.type === "status" && event.statuses.includes(trigger.status) ? {} : null;
    case "crit":
    case "miss":
      return event.type === trigger.type ? { attacker: event.attacker } : null;
    default:
      return event.type === trigger.type ? {} : null;
  }
}

/** Cooldown in rounds (combat only) and once per fight; "below" is once per fight by itself. */
function available(quote: Quote, state: QuoteState | undefined, context: QuoteContext): boolean {
  if (!state || state.fight !== context.fight) return true;
  if ((quote.once || quote.trigger.type === "below") && state.done) return false;
  return !(
    quote.cooldown > 0 &&
    context.round !== null &&
    state.round !== undefined &&
    context.round - state.round < quote.cooldown
  );
}

const fill = (template: string, name: string, attacker: string) =>
  template.replaceAll("{name}", name).replaceAll("{attacker}", attacker);

export interface QuotePick {
  shown: ShownQuote;
  /** The new state of the quote that spoke. */
  state: QuoteState;
  quoteId: string;
}

/** A pool variant, the text with its placeholders and the quote's next state. */
export function speak(
  quote: Quote,
  state: QuoteState | undefined,
  context: QuoteContext,
  attacker = "",
): QuotePick {
  const fresh = !state || state.fight !== context.fight;
  const cursor = fresh ? 0 : (state.cursor ?? 0);
  const index =
    quote.order === "cycle" ? cursor % quote.texts.length : Math.floor(context.random() * quote.texts.length);
  const said = fill(quote.texts[index] ?? "", context.name, attacker).trim();
  const next: QuoteState = { fight: context.fight };
  if (context.round !== null) next.round = context.round;
  if (quote.once || quote.trigger.type === "below") next.done = true;
  if (quote.order === "cycle") next.cursor = cursor + 1;
  return {
    quoteId: quote.id,
    state: next,
    shown: {
      key: `${quote.id}-${context.now}-${index}`,
      text: said,
      priority: quotePriority(quote.trigger),
      at: context.now,
      duration: quote.duration ?? autoDuration(said),
    },
  };
}

/**
 * The quote for the events of one recompute (or one chat or tracker event), or null. Of the quotes whose trigger
 * fired and that are not held back, the most important wins, then the first in the profile's list (decision 7);
 * the others spend nothing. A more important quote still on screen keeps it.
 */
export function pickQuote(
  quotes: readonly Quote[],
  events: readonly QuoteEvent[],
  states: Readonly<Record<string, QuoteState>>,
  shown: ShownQuote | undefined,
  context: QuoteContext,
): QuotePick | null {
  let best: { quote: Quote; attacker: string } | null = null;
  for (const quote of quotes) {
    if (best && quotePriority(quote.trigger) <= quotePriority(best.quote.trigger)) continue;
    if (!available(quote, states[quote.id], context)) continue;
    for (const event of events) {
      const hit = matches(quote.trigger, event);
      if (hit) {
        best = { quote, attacker: hit.attacker ?? "" };
        break;
      }
    }
  }
  if (!best) return null;
  if (shown && isShowing(shown, context.now) && shown.priority > quotePriority(best.quote.trigger))
    return null;
  return speak(best.quote, states[best.quote.id], context, best.attacker);
}

export const isShowing = (shown: ShownQuote, now: number) => now < shown.at + shown.duration * 1000;

/** The GM's own text (spec §7): it speaks at once, as a manual quote. */
export function freeQuote(said: string, context: Pick<QuoteContext, "now">): ShownQuote {
  const value = said.trim().slice(0, QUOTE_LIMITS.text);
  return {
    key: `say-${context.now}`,
    text: value,
    priority: 1,
    at: context.now,
    duration: autoDuration(value),
  };
}
