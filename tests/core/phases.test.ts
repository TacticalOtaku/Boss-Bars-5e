import { describe, expect, it } from "vitest";
import {
  formPending,
  nextPhase,
  phaseChanges,
  phaseTicks,
  pickPhase,
  refillFraction,
  romanNumeral,
  shownIndex,
} from "../../src/core/phases";
import { readProfile, type Phase } from "../../src/core/profile";

const FORM = "FormActor0000001";
const phase = (id: string, trigger: Phase["trigger"], enter: Phase["enter"] = {}): Phase => ({
  id,
  label: "",
  trigger,
  enter,
});
const start = phase("p1", { type: "start" });
const hp66 = phase("p2", { type: "hp", below: 66 });
const hp33 = phase("p3", { type: "hp", below: 33 });
const form = phase("p4", { type: "form", actorId: FORM });
const hp50 = phase("p5", { type: "hp", below: 50 });
const phases = [start, hp66, hp33, form, hp50];

describe("nextPhase", () => {
  it("writes the first phase for a boss that has no state yet", () => {
    expect(nextPhase(phases, undefined, 1)).toEqual({ state: { id: "p1", mark: 100 } });
  });

  it("passes one threshold and marks the HP where the phase began", () => {
    expect(nextPhase(phases, { id: "p1", mark: 100 }, 0.5)).toEqual({ state: { id: "p2", mark: 50 } });
  });

  it("lands on the last threshold of a hit that passes several, as one step", () => {
    expect(nextPhase(phases, { id: "p1", mark: 100 }, 0.2)).toEqual({ state: { id: "p3", mark: 20 } });
  });

  it("never goes back on healing; healing only raises the mark", () => {
    expect(nextPhase(phases, { id: "p2", mark: 50 }, 0.9)).toEqual({ state: { id: "p2", mark: 90 } });
    expect(nextPhase(phases, { id: "p2", mark: 90 }, 0.8)).toBeNull();
  });

  it("changes exactly once: the same data after the step writes nothing", () => {
    const step = nextPhase(phases, { id: "p1", mark: 100 }, 0.5);
    expect(nextPhase(phases, step?.state, 0.5)).toBeNull();
  });

  it("does not pass a threshold above the mark (a phase picked at low HP)", () => {
    expect(nextPhase(phases, { id: "p1", mark: 40 }, 0.3)).toBeNull();
  });

  it("begins a form at 0 HP, after the thresholds of the same hit", () => {
    expect(nextPhase(phases, { id: "p1", mark: 100 }, 0)).toEqual({
      state: { id: "p4", mark: 100 },
      formActorId: FORM,
    });
  });

  it("treats 0 HP without a form next in line as a defeat: the phase stays", () => {
    expect(nextPhase([start, hp66, hp33], { id: "p1", mark: 100 }, 0)).toBeNull();
    expect(nextPhase(phases, { id: "p4", mark: 100 }, 0)).toBeNull();
  });

  it("waits while the form has no token, and stops at a manual phase", () => {
    expect(nextPhase(phases, { id: "p4", mark: 100, waiting: true }, 0)).toBeNull();
    const manual = [start, phase("m", { type: "manual" }), hp33];
    expect(nextPhase(manual, { id: "p1", mark: 100 }, 0.1)).toBeNull();
  });

  it("counts thresholds after a form against the form's own HP", () => {
    expect(nextPhase(phases, { id: "p4", mark: 100 }, 0.4)).toEqual({ state: { id: "p5", mark: 40 } });
  });

  it("does nothing without phases or readable HP", () => {
    expect(nextPhase([], undefined, 0.5)).toBeNull();
    expect(nextPhase(phases, undefined, null)).toBeNull();
  });
});

describe("pickPhase", () => {
  it("begins the picked phase at the current HP, a form at the top of its pool", () => {
    expect(pickPhase(phases, "p3", 0)).toEqual({ state: { id: "p3", mark: 0 } });
    expect(pickPhase(phases, "p4", 0.3)).toEqual({ state: { id: "p4", mark: 100 }, formActorId: FORM });
    expect(pickPhase(phases, "nope", 0.3)).toBeNull();
  });
});

describe("form, shown phase and changes", () => {
  it("holds off defeat while a form is next in line or waiting", () => {
    expect(formPending(phases, { id: "p3", mark: 20 })).toBe(true);
    expect(formPending(phases, { id: "p4", mark: 100, waiting: true })).toBe(true);
    expect(formPending(phases, { id: "p2", mark: 50 })).toBe(false);
  });

  it("shows the phase before a waiting form", () => {
    expect(shownIndex(phases, { id: "p4", mark: 100, waiting: true })).toBe(2);
    expect(shownIndex(phases, { id: "p4", mark: 100 })).toBe(3);
  });

  it("adds entry changes up from the first phase", () => {
    const list = [
      phase("a", { type: "start" }, { title: "T1", overrides: { fill: "f1" } }),
      phase("b", { type: "manual" }, { playerName: "N2", overrides: { frame: "r2" } }),
      phase("c", { type: "manual" }, { title: "T3", overrides: { fill: "f3" } }),
    ];
    expect(phaseChanges(list, 1)).toEqual({
      title: "T1",
      playerName: "N2",
      overrides: { fill: "f1", frame: "r2" },
    });
    expect(phaseChanges(list, 2)).toEqual({
      title: "T3",
      playerName: "N2",
      overrides: { fill: "f3", frame: "r2" },
    });
    expect(phaseChanges([start], 0)).toEqual({});
  });
});

describe("ticks and refill", () => {
  it("ticks the thresholds of the current HP pool only", () => {
    expect(phaseTicks(phases, 1)).toEqual([0.66, 0.33]);
    expect(phaseTicks(phases, 3)).toEqual([0.5]);
  });

  it("refills between the current phase's threshold and the next one", () => {
    expect(refillFraction(phases, 0, 0.83)).toBeCloseTo(0.5);
    expect(refillFraction(phases, 1, 0.66)).toBe(1);
    expect(refillFraction(phases, 1, 0.495)).toBeCloseTo(0.5);
    expect(refillFraction(phases, 2, 0.165)).toBeCloseTo(0.5);
    expect(refillFraction(phases, 3, 0.75)).toBeCloseTo(0.5);
    expect(refillFraction(phases, 1, 0.9)).toBe(1);
  });

  it("numbers phases in Roman numerals", () => {
    expect([1, 2, 4, 6, 9].map(romanNumeral)).toEqual(["I", "II", "IV", "VI", "IX"]);
  });
});

describe("readProfile — phases", () => {
  const boss = { dataVersion: 2, kind: "boss", playerName: "", title: "", portrait: null, size: 100 };
  const read = (raw: unknown) => {
    const result = readProfile({ ...boss, phases: raw });
    return result.status === "ok" && result.value.kind === "boss" ? result.value.phases : null;
  };

  it("defaults to no phases, segments and ticks for players", () => {
    const result = readProfile(boss);
    expect(result.status === "ok" && result.value).toMatchObject({
      phases: [],
      fillMode: "segments",
      playerTicks: true,
    });
  });

  it("makes the first phase the start, clamps thresholds and drops bad or duplicate ids", () => {
    expect(
      read([
        { id: "a", trigger: { type: "hp", below: 50 } },
        { id: "b", trigger: { type: "hp", below: 99 }, label: "x".repeat(60) },
        { id: "b", trigger: { type: "manual" } },
        { id: "bad id", trigger: { type: "manual" } },
        { id: "c", trigger: { type: "form", actorId: "short" } },
      ]),
    ).toEqual([
      { id: "a", label: "", trigger: { type: "start" }, enter: {} },
      { id: "b", label: "x".repeat(40), trigger: { type: "hp", below: 95 }, enter: {} },
      { id: "c", label: "", trigger: { type: "manual" }, enter: {} },
    ]);
  });

  it("keeps a newer trigger type and unknown keys as they are, and at most 6 phases", () => {
    const newer = { type: "round", round: 3 };
    const phasesRead = read([{ id: "a" }, { id: "b", trigger: newer, note: 1 }]);
    expect(phasesRead?.[1]).toMatchObject({ trigger: newer, note: 1 });
    expect(nextPhase(phasesRead ?? [], { id: "a", mark: 100 }, 0.01)).toBeNull();
    expect(read(Array.from({ length: 9 }, (_, i) => ({ id: `p${i}` })))).toHaveLength(6);
  });

  it("reads entry changes field by field", () => {
    expect(
      read([{ id: "a", enter: { title: " T ", portrait: 5, overrides: { fill: "f", nope: "x" } } }])?.[0]
        ?.enter,
    ).toEqual({ title: "T", overrides: { fill: "f" } });
  });
});
