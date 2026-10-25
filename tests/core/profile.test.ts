import { describe, expect, it } from "vitest";
import { PROFILE_LIMITS, PROFILE_VERSION, profileErrors, readProfile } from "../../src/core/profile";

const boss = {
  dataVersion: 2,
  kind: "boss",
  playerName: "Ксар’Тун",
  title: "Пожиратель пепла",
  portrait: null,
  displayMode: "token",
  size: 100,
};
const elite = {
  dataVersion: 2,
  kind: "elite",
  playerName: "",
  portrait: null,
  displayMode: "actor",
  rank: "veteran",
};

describe("readProfile", () => {
  it("reads boss and elite profiles and keeps unknown keys", () => {
    expect(readProfile({ ...boss, future: { x: 1 } })).toEqual({
      status: "ok",
      value: { ...boss, future: { x: 1 } },
    });
    expect(readProfile(elite)).toEqual({ status: "ok", value: elite });
  });

  it("migrates a version 1 boss profile", () => {
    const v1 = { dataVersion: 1, kind: "boss", playerName: "A", title: "T", portrait: null, size: 80 };
    expect(readProfile(v1)).toEqual({
      status: "ok",
      value: { ...v1, dataVersion: PROFILE_VERSION, displayMode: "token" },
    });
  });

  it("keeps the other kind's fields when the kind changes", () => {
    const switched = readProfile({ ...boss, kind: "elite", rank: "guard" });
    expect(switched.status).toBe("ok");
    if (switched.status !== "ok") return;
    expect(switched.value).toMatchObject({
      kind: "elite",
      rank: "guard",
      title: "Пожиратель пепла",
      size: 100,
    });
  });

  it("reports missing, foreign and newer data", () => {
    expect(readProfile(undefined).status).toBe("none");
    expect(readProfile("boss").status).toBe("invalid");
    expect(readProfile({ ...boss, dataVersion: undefined }).status).toBe("invalid");
    expect(readProfile({ ...boss, kind: "minion" }).status).toBe("invalid");
    expect(readProfile({ ...boss, dataVersion: 3 }).status).toBe("newer");
  });

  it("normalises bad field values instead of dropping the profile", () => {
    const result = readProfile({
      ...boss,
      playerName: 42,
      title: "x".repeat(500),
      portrait: "",
      size: 999,
      displayMode: "both",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok" || result.value.kind !== "boss") return;
    expect(result.value.playerName).toBe("");
    expect(result.value.title).toHaveLength(PROFILE_LIMITS.text);
    expect(result.value.portrait).toBeNull();
    expect(result.value.size).toBe(PROFILE_LIMITS.sizeMax);
    expect(result.value.displayMode).toBe("token");
    const badRank = readProfile({ ...elite, rank: 5 });
    expect(badRank.status === "ok" && badRank.value.kind === "elite" && badRank.value.rank).toBe("");
  });
});

describe("profileErrors", () => {
  const input = { kind: "boss", playerName: "A", title: "", portrait: "a.webm", size: 50, rank: "" } as const;

  it("accepts valid input of both kinds", () => {
    expect(profileErrors(input)).toEqual({});
    expect(profileErrors({ ...input, kind: "elite", size: Number.NaN, rank: "guard" })).toEqual({});
  });

  it("names each invalid field", () => {
    expect(
      profileErrors({
        ...input,
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
    expect(profileErrors({ ...input, kind: "elite", rank: "" })).toEqual({ rank: "BB5E.Error.NoRank" });
  });
});
