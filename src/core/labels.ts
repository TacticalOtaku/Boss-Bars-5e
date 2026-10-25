export interface LabelEntry {
  id: string;
  label: string;
  /** Hidden from players: numbered after the visible ones, so players' numbers never reveal it. */
  hidden: boolean;
  order: number;
}

/** Equal names on a scene: the first stays plain, the next ones become "Name 2", "Name 3" in show order. */
export function numberLabels(entries: LabelEntry[]): Map<string, string> {
  const result = new Map<string, string>();
  const groups = new Map<string, LabelEntry[]>();
  for (const entry of entries) groups.set(entry.label, [...(groups.get(entry.label) ?? []), entry]);
  for (const [label, group] of groups) {
    group
      .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.order - b.order)
      .forEach((entry, index) => result.set(entry.id, index ? `${label} ${index + 1}` : label));
  }
  return result;
}
