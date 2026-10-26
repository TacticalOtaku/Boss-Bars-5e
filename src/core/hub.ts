import { readProfile, type ProfileKind } from "./profile";

/** An actor as the hub lists it: its raw Boss Bars profile flag is read here. */
export interface HubActor {
  id: string;
  name: string;
  img: string;
  profile: unknown;
}

export interface HubProfileRow {
  id: string;
  name: string;
  img: string;
  kind: ProfileKind;
  /** The name players see, when the profile sets one. */
  playerName: string;
}

/**
 * The hub's "Profiles" list (stage 13): boss and elite profiles apart, by name, filtered by the actor name or the
 * name players see. Data written by a newer version is listed apart and never offered for editing.
 */
export function profileRows(
  actors: readonly HubActor[],
  query: string,
): { bosses: HubProfileRow[]; elites: HubProfileRow[]; newer: { id: string; name: string }[] } {
  const needle = query.trim().toLocaleLowerCase();
  const rows: HubProfileRow[] = [];
  const newer: { id: string; name: string }[] = [];
  for (const actor of actors) {
    const read = readProfile(actor.profile);
    if (read.status === "newer") newer.push({ id: actor.id, name: actor.name });
    if (read.status !== "ok") continue;
    const { kind, playerName } = read.value;
    const haystack = `${actor.name}\n${playerName}`.toLocaleLowerCase();
    if (!needle || haystack.includes(needle))
      rows.push({ id: actor.id, name: actor.name, img: actor.img, kind, playerName });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return {
    bosses: rows.filter((row) => row.kind === "boss"),
    elites: rows.filter((row) => row.kind === "elite"),
    newer: newer.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
