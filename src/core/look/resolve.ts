import { CATEGORIES, readParams, type Category, type Look, type Preset } from "./schema";

export type ResolvedLook = { id: string } & { [C in Category]: Preset<C> };

/** Everything a look can come from: the built-ins and the GM's library together. */
export interface LookSources {
  looks: Look[];
  presets: Preset[];
}

/** Default values of a category, for a fallback look that lacks a preset. */
const defaultPreset = <C extends Category>(category: C): Preset<C> => ({
  id: `default-${category}`,
  name: category,
  category,
  params: readParams(category, {}),
});

/**
 * One preset per category for a boss profile (look + overrides) or a rank (look only). An unknown look takes the
 * fallback; an unknown or mismatched preset takes the fallback look's preset of that category. Never fails.
 */
export function resolveLook(
  lookId: string | null | undefined,
  overrides: Partial<Record<Category, string>> | undefined,
  sources: LookSources,
  fallback: Look,
): ResolvedLook {
  const look = sources.looks.find((each) => each.id === lookId) ?? fallback;
  const find = (category: Category, id: string | undefined) =>
    id === undefined
      ? undefined
      : sources.presets.find((each) => each.id === id && each.category === category);
  const resolved: Record<string, unknown> = { id: look.id };
  for (const category of CATEGORIES) {
    resolved[category] =
      find(category, overrides?.[category]) ??
      find(category, look.presets[category]) ??
      find(category, fallback.presets[category]) ??
      defaultPreset(category);
  }
  return resolved as ResolvedLook;
}
