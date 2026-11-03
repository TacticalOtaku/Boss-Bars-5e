import { CATEGORIES, type Category } from "./look/schema";
import { keepMusic, resolveMusic, type MusicSource, type PlaylistInfo } from "./music";
import {
  defaultProfile,
  DEFAULT_AUTO_SHOW,
  profileErrors,
  readProfile,
  type BossProfile,
  type Profile,
  type ProfileInput,
} from "./profile";
import { keepChoice } from "./profile-form";

interface Choice {
  id: string;
  name: string;
}
export interface ProfileEditChoices {
  ranks: Choice[];
  actors: Choice[];
  items: Choice[];
  presets: (Choice & { category: Category })[];
  playlists: readonly PlaylistInfo[];
}
export interface ProfileEditLook {
  look: string | null;
  overrides: Partial<Record<Category, string>>;
}
function selections(options: Choice[], saved: string) {
  return keepChoice(options, saved, "").map((choice) => ({
    ...choice,
    missing: Boolean(saved && choice.id === saved && !options.some((option) => option.id === saved)),
  }));
}
function musicValue(source: MusicSource | null | undefined) {
  return !source
    ? ""
    : source.type === "playlist"
      ? `playlist:${source.playlistId}`
      : `sound:${source.playlistId}:${source.soundId}`;
}
function musicSelection(source: MusicSource | null, playlists: readonly PlaylistInfo[]) {
  const found = resolveMusic(source, playlists);
  const current = musicValue(found ?? source);
  const groups = [...playlists]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((playlist) => ({
      name: playlist.name,
      missing: false,
      options: [
        {
          value: `playlist:${playlist.id}`,
          label: "",
          whole: true,
          selected: current === `playlist:${playlist.id}`,
        },
        ...playlist.sounds.map((sound) => ({
          value: `sound:${playlist.id}:${sound.id}`,
          label: sound.name,
          whole: false,
          selected: current === `sound:${playlist.id}:${sound.id}`,
        })),
      ],
    }));
  if (source && !found)
    groups.unshift({
      name: "",
      missing: true,
      options: [
        {
          value: current,
          label: [source.playlistName, source.type === "sound" ? source.soundName : undefined]
            .filter(Boolean)
            .join(" — "),
          whole: source.type === "playlist",
          selected: true,
        },
      ],
    });
  return { groups };
}
/** Elite profiles retain boss fields as extra keys; use the same reader when restoring them. */
function bossFields(stored: Profile | null): BossProfile | null {
  const read = stored ? readProfile({ ...stored, kind: "boss" }) : null;
  return read?.status === "ok" && read.value.kind === "boss" ? read.value : null;
}
function namedInput(input: ProfileInput, stored: Profile | null, choices: ProfileEditChoices) {
  const boss = bossFields(stored);
  return {
    ...input,
    music: keepMusic(input.music, boss?.music ?? null, choices.playlists),
    phases: input.phases.map((phase) => {
      const saved = boss?.phases.find((each) => each.id === phase.id);
      const music = keepMusic(phase.enter.music ?? null, saved?.enter.music ?? null, choices.playlists);
      return { ...saved, ...phase, enter: { ...phase.enter, ...(music ? { music } : {}) } };
    }),
  };
}

/** Stored values plus the unsaved form, with missing references kept as selected options. */
export function profileEditView(raw: unknown, draft: ProfileInput | null, choices: ProfileEditChoices) {
  const read = readProfile(raw);
  const stored = read.status === "ok" ? read.value : null;
  const defaults = defaultProfile("boss") as BossProfile;
  const boss = bossFields(stored);
  const projected = {
    ...defaults,
    rank: choices.ranks[Math.min(1, choices.ranks.length - 1)]?.id ?? "",
    ...stored,
    // Retained inactive fields are unknown data until the boss reader projects them for editing.
    ...boss,
    kind: stored?.kind ?? defaults.kind,
    ...draft,
  };
  const values = namedInput({ ...projected, portrait: projected.portrait ?? "" }, stored, choices);
  return {
    values,
    status: read.status,
    look: { look: boss?.look ?? null, overrides: boss?.overrides ?? {} },
    ranks: selections(choices.ranks, values.rank),
    miniBars: values.miniBars.map((bar) => ({
      bar,
      items: selections(choices.items, bar.source.type === "item" ? bar.source.itemId : ""),
    })),
    phases: values.phases.map((phase) => ({
      phase,
      actors: selections(choices.actors, phase.trigger.type === "form" ? phase.trigger.actorId : ""),
      music: musicSelection(phase.enter.music ?? null, choices.playlists),
      overrides: CATEGORIES.map((category) => ({
        category,
        options: selections(
          choices.presets.filter((preset) => preset.category === category),
          phase.enter.overrides?.[category] ?? "",
        ),
      })),
    })),
    music: musicSelection(values.music, choices.playlists),
  };
}
export type ProfileEditView = ReturnType<typeof profileEditView>;
export type ProfileEditResult =
  | { status: "ok"; value: Profile }
  | { status: "errors"; errors: Record<string, string> }
  | { status: "invalid" }
  | { status: "newer" };

/** Validate and prepare a whole-profile replacement, preserving the inactive kind's saved fields. */
export function prepareProfileEdit(
  raw: unknown,
  input: ProfileInput,
  choices: ProfileEditChoices,
  look: ProfileEditLook,
): ProfileEditResult {
  const errors = profileErrors(input);
  if (Object.keys(errors).length) return { status: "errors", errors };
  const read = readProfile(raw);
  if (read.status === "invalid" || read.status === "newer") return { status: read.status };
  const stored = read.status === "ok" ? read.value : defaultProfile(input.kind);
  const named = namedInput(input, stored, choices);
  const kindFields =
    input.kind === "boss"
      ? {
          title: input.title.trim(),
          size: input.size,
          phases: named.phases,
          fillMode: input.fillMode,
          playerTicks: input.playerTicks,
          quotes: input.quotes,
          music: named.music,
          musicPriority: input.musicPriority,
          musicFade: input.musicFade,
          ...look,
        }
      : { rank: input.rank };
  return {
    status: "ok",
    value: {
      ...stored,
      kind: input.kind,
      playerName: input.playerName.trim(),
      portrait: input.portrait.trim() || null,
      portraitFocus: input.portraitFocus,
      displayMode: input.displayMode,
      autoShow: { ...DEFAULT_AUTO_SHOW, ...input.autoShow },
      statuses: {
        hidden: input.statuses.hidden,
        custom: input.kind === "boss" ? input.statuses.custom : stored.statuses.custom,
      },
      miniBars: input.miniBars,
      ...kindFields,
    } as Profile,
  };
}
