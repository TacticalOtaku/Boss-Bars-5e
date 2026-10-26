import { describe, expect, it } from "vitest";
import {
  autoDuration,
  freeQuote,
  pickQuote,
  quoteErrors,
  readQuotes,
  type Quote,
  type QuoteContext,
  type QuoteEvent,
} from "../../src/core/quotes";

const quote = (id: string, trigger: Quote["trigger"], extra: Partial<Quote> = {}): Quote => ({
  id,
  trigger,
  texts: [`${id} {name}`],
  order: "random",
  cooldown: 0,
  once: false,
  duration: null,
  ...extra,
});
const context = (extra: Partial<QuoteContext> = {}): QuoteContext => ({
  fight: "c1",
  round: 1,
  now: 1000,
  name: "Ксар",
  random: () => 0,
  ...extra,
});
const hit = (from: number, to: number): QuoteEvent => ({ type: "hp", from, to });

describe("pickQuote — triggers", () => {
  const quotes = [
    quote("appear", { type: "appear" }),
    quote("below", { type: "below", percent: 50 }),
    quote("big", { type: "damage", percent: 25 }),
    quote("heal", { type: "heal" }),
    quote("rage", { type: "phase", phaseId: "p2" }),
    quote("burn", { type: "status", status: "burning" }),
    quote("crit", { type: "crit" }, { texts: ["{attacker}, how dare you"] }),
  ];
  const said = (events: QuoteEvent[]) => pickQuote(quotes, events, {}, undefined, context())?.quoteId ?? null;

  it("matches each trigger to its event", () => {
    expect(said([{ type: "appear" }])).toBe("appear");
    expect(said([hit(0.6, 0.45)])).toBe("below");
    expect(said([hit(0.9, 0.6)])).toBe("big");
    expect(said([{ type: "heal" }])).toBe("heal");
    expect(said([{ type: "phase", phaseId: "p2" }])).toBe("rage");
    expect(said([{ type: "phase", phaseId: "p3" }])).toBeNull();
    expect(said([{ type: "status", statuses: ["burning"] }])).toBe("burn");
    expect(said([hit(0.45, 0.4)])).toBeNull();
  });

  it("fills {name} and, for crit and miss, {attacker}", () => {
    expect(pickQuote(quotes, [{ type: "appear" }], {}, undefined, context())?.shown.text).toBe("appear Ксар");
    expect(
      pickQuote(quotes, [{ type: "crit", attacker: "Тарн" }], {}, undefined, context())?.shown.text,
    ).toBe("Тарн, how dare you");
  });
});

describe("pickQuote — importance, cooldown, once", () => {
  it("lets the most important quote win, then the first in the list", () => {
    const quotes = [
      quote("dmg", { type: "damage", percent: 10 }),
      quote("dmg2", { type: "damage", percent: 10 }),
      quote("dead", { type: "defeat" }),
    ];
    expect(pickQuote(quotes, [hit(0.5, 0), { type: "defeat" }], {}, undefined, context())?.quoteId).toBe(
      "dead",
    );
    expect(pickQuote(quotes, [hit(0.5, 0.3)], {}, undefined, context())?.quoteId).toBe("dmg");
  });

  it("keeps a more important quote on screen and replaces a lesser or finished one", () => {
    const quotes = [quote("dmg", { type: "damage", percent: 10 })];
    const shown = { key: "k", text: "t", priority: 2, at: 1000, duration: 5 };
    expect(pickQuote(quotes, [hit(0.5, 0.3)], {}, shown, context({ now: 3000 }))).toBeNull();
    expect(pickQuote(quotes, [hit(0.5, 0.3)], {}, shown, context({ now: 7000 }))?.quoteId).toBe("dmg");
    expect(pickQuote(quotes, [hit(0.5, 0.3)], {}, { ...shown, priority: 0 }, context())?.quoteId).toBe("dmg");
  });

  it("holds a quote back for its cooldown in rounds, only in combat", () => {
    const quotes = [quote("q", { type: "heal" }, { cooldown: 2 })];
    const first = pickQuote(quotes, [{ type: "heal" }], {}, undefined, context({ round: 3 }));
    const states = { q: first?.state ?? { fight: "c1" } };
    expect(pickQuote(quotes, [{ type: "heal" }], states, undefined, context({ round: 4 }))).toBeNull();
    expect(pickQuote(quotes, [{ type: "heal" }], states, undefined, context({ round: 5 }))?.quoteId).toBe(
      "q",
    );
    expect(pickQuote(quotes, [{ type: "heal" }], states, undefined, context({ round: null }))?.quoteId).toBe(
      "q",
    );
  });

  it("says a once-per-fight quote and a threshold once per fight, again in a new fight", () => {
    const quotes = [
      quote("once", { type: "turn" }, { once: true }),
      quote("low", { type: "below", percent: 50 }),
    ];
    const turn = pickQuote(quotes, [{ type: "turn" }], {}, undefined, context());
    const low = pickQuote(quotes, [hit(0.6, 0.4)], {}, undefined, context());
    const states = { once: turn?.state ?? { fight: "" }, low: low?.state ?? { fight: "" } };
    expect(pickQuote(quotes, [{ type: "turn" }], states, undefined, context({ round: 9 }))).toBeNull();
    expect(pickQuote(quotes, [hit(0.6, 0.4)], states, undefined, context())).toBeNull();
    expect(pickQuote(quotes, [{ type: "turn" }], states, undefined, context({ fight: "c2" }))?.quoteId).toBe(
      "once",
    );
  });

  it("goes through the pool in order with a cursor that survives in the state", () => {
    const quotes = [quote("q", { type: "heal" }, { order: "cycle", texts: ["a", "b"] })];
    const one = pickQuote(quotes, [{ type: "heal" }], {}, undefined, context());
    const two = pickQuote(
      quotes,
      [{ type: "heal" }],
      { q: one?.state ?? { fight: "" } },
      undefined,
      context(),
    );
    const three = pickQuote(
      quotes,
      [{ type: "heal" }],
      { q: two?.state ?? { fight: "" } },
      undefined,
      context(),
    );
    expect([one, two, three].map((pick) => pick?.shown.text)).toEqual(["a", "b", "a"]);
  });
});

describe("quote texts and reading", () => {
  it("shows 3 s plus 60 ms per character, at most 10 s, or the quote's own duration", () => {
    expect(autoDuration("x".repeat(50))).toBeCloseTo(6);
    expect(autoDuration("x".repeat(200))).toBe(10);
    const quotes = [quote("q", { type: "heal" }, { duration: 15 })];
    expect(pickQuote(quotes, [{ type: "heal" }], {}, undefined, context())?.shown.duration).toBe(15);
    expect(freeQuote("  hi  ", { now: 5 })).toEqual({
      key: "say-5",
      text: "hi",
      priority: 1,
      at: 5,
      duration: 3.12,
    });
  });

  it("reads quotes: clamps numbers, drops bad ids, duplicates and empty pools, keeps newer triggers", () => {
    const newer = { type: "roar", loud: true };
    expect(
      readQuotes([
        {
          id: "a",
          trigger: { type: "below", percent: 150 },
          texts: [" hi ", "", 5],
          cooldown: -3,
          duration: 99,
        },
        { id: "a", trigger: { type: "heal" }, texts: ["x"] },
        { id: "bad id", texts: ["x"] },
        { id: "b", trigger: { type: "heal" }, texts: [] },
        { id: "c", trigger: newer, texts: ["x".repeat(300)], order: "cycle", once: true },
      ]),
    ).toEqual([
      {
        id: "a",
        trigger: { type: "below", percent: 99 },
        texts: ["hi"],
        order: "random",
        cooldown: 0,
        once: false,
        duration: 20,
      },
      {
        id: "c",
        trigger: newer,
        texts: ["x".repeat(200)],
        order: "cycle",
        cooldown: 0,
        once: true,
        duration: null,
      },
    ]);
    expect(
      pickQuote(
        readQuotes([{ id: "c", trigger: newer, texts: ["x"] }]),
        [{ type: "heal" }],
        {},
        undefined,
        context(),
      ),
    ).toBeNull();
  });
});

describe("quoteErrors", () => {
  it("names empty or long pools, bad thresholds, unknown phases, empty statuses, cooldown and duration", () => {
    const errors: Record<string, string> = {};
    quoteErrors(
      [
        quote("a", { type: "heal" }, { texts: [] }),
        quote("b", { type: "below", percent: 0 }, { texts: ["x".repeat(201)] }),
        quote("c", { type: "phase", phaseId: "gone" }, { cooldown: 100 }),
        quote("d", { type: "status", status: " " }, { duration: 30 }),
        quote("e", { type: "phase", phaseId: "p2" }, { duration: 5 }),
      ],
      ["p1", "p2"],
      errors,
    );
    expect(errors).toEqual({
      "quotes.0.texts": "BB5E.Error.QuoteEmpty",
      "quotes.1.texts": "BB5E.Error.QuoteTexts",
      "quotes.1.percent": "BB5E.Error.PercentRange",
      "quotes.2.phaseId": "BB5E.Error.NoPhase",
      "quotes.2.cooldown": "BB5E.Error.CooldownRange",
      "quotes.3.status": "BB5E.Error.NoStatus",
      "quotes.3.duration": "BB5E.Error.DurationRange",
    });
  });
});
