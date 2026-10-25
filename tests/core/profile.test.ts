import { describe, expect, it } from "vitest";
import { PROFILE_LIMITS, profileErrors, readProfile } from "../../src/core/profile";

const valid = {
  dataVersion: 1,
  kind: "boss",
  playerName: "Ксар’Тун",
  title: "Пожиратель пепла",
  portrait: null,
  size: 100,
};

describe("readProfile", () => {
  it("reads a valid profile and keeps unknown keys", () => {
    const result = readProfile({ ...valid, future: { x: 1 } });
    expect(result).toEqual({ status: "ok", value: { ...valid, future: { x: 1 } } });
  });

  it("reports missing, foreign and newer data", () => {
    expect(readProfile(undefined).status).toBe("none");
    expect(readProfile("boss").status).toBe("invalid");
    expect(readProfile({ ...valid, dataVersion: undefined }).status).toBe("invalid");
    expect(readProfile({ ...valid, kind: "elite" }).status).toBe("invalid");
    expect(readProfile({ ...valid, dataVersion: 2 }).status).toBe("newer");
  });

  it("normalises bad field values instead of dropping the profile", () => {
    const result = readProfile({ ...valid, playerName: 42, title: "x".repeat(500), portrait: "", size: 999 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.value.playerName).toBe("");
    expect(result.value.title).toHaveLength(PROFILE_LIMITS.text);
    expect(result.value.portrait).toBeNull();
    expect(result.value.size).toBe(PROFILE_LIMITS.sizeMax);
  });
});

describe("profileErrors", () => {
  it("accepts valid input", () => {
    expect(profileErrors({ playerName: "A", title: "", portrait: "a.webm", size: 50 })).toEqual({});
  });

  it("names each invalid field", () => {
    expect(
      profileErrors({
        playerName: "x".repeat(81),
        title: "y".repeat(81),
        portrait: "p".repeat(2049),
        size: 49,
      }),
    ).toEqual({
      playerName: "BB5E.Error.TooLong",
      title: "BB5E.Error.TooLong",
      portrait: "BB5E.Error.TooLong",
      size: "BB5E.Error.SizeRange",
    });
    expect(profileErrors({ playerName: "", title: "", portrait: "", size: Number.NaN }).size).toBe(
      "BB5E.Error.SizeRange",
    );
  });
});
