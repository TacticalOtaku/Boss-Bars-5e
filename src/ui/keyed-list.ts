export interface KeyedItem {
  el: HTMLElement;
  leaving: Animation | null;
}

/** Per-view entry and exit animations (the look's "Appearance and exit"); without it a slide and fade is used. */
export interface ListMotion<V, I> {
  enter(view: V, reduced: boolean, item: I): { frames: Keyframe[]; duration: number };
  leave(view: V, reduced: boolean): { frames: Keyframe[]; duration: number };
  /** Called when the exit starts (the defeat banner shows here). */
  onLeave?(item: I, view: V): void;
}

const ENTER_MS = 300;
const LEAVE_MS = 250;

/**
 * One DOM item per view id, kept in view order, no framework. New items animate in; removed ones animate out and
 * stay after the shown ones until their exit ends; an item shown again while leaving comes back at once.
 */
export function createKeyedList<V extends { id: string }, I extends KeyedItem>(
  container: HTMLElement,
  create: () => I,
  update: (item: I, view: V) => void,
  reducedMotion: () => boolean,
  motion?: ListMotion<V, I>,
) {
  const items = new Map<string, I>();
  const views = new WeakMap<I, V>();

  // Reduced motion (spec §12): only the opacity change stays.
  const fallback = (from: Keyframe, to: Keyframe): Keyframe[] =>
    reducedMotion() ? [{ opacity: from.opacity }, { opacity: to.opacity }] : [from, to];

  function leave(id: string, item: I) {
    const view = views.get(item);
    const reduced = reducedMotion();
    const exit =
      motion && view
        ? motion.leave(view, reduced)
        : {
            frames: fallback({ opacity: 1 }, { opacity: 0, transform: "translateY(-0.5em)" }),
            duration: LEAVE_MS,
          };
    const animation = item.el.animate?.(exit.frames, {
      duration: exit.duration,
      easing: "ease-in",
      fill: "forwards",
    });
    if (!animation) {
      item.el.remove();
      items.delete(id);
      return;
    }
    item.leaving = animation;
    if (motion?.onLeave && view) motion.onLeave(item, view);
    // cancel() on re-show rejects `finished`; that is expected, not an error.
    animation.finished?.catch(() => undefined);
    animation.onfinish = () => {
      if (item.leaving !== animation) return;
      item.el.remove();
      items.delete(id);
    };
  }

  return {
    /** The shown item of a view id and its last view; nothing while it leaves. */
    get(id: string): { item: I; view: V } | undefined {
      const item = items.get(id);
      const view = item && !item.leaving ? views.get(item) : undefined;
      return item && view ? { item, view } : undefined;
    },
    update(list: V[]) {
      const ids = new Set(list.map((view) => view.id));
      for (const [id, item] of items) if (!ids.has(id) && !item.leaving) leave(id, item);
      let previous: HTMLElement | null = null;
      for (const view of list) {
        let item = items.get(view.id);
        const fresh = !item;
        if (!item) {
          item = create();
          items.set(view.id, item);
        } else if (item.leaving) {
          item.leaving.cancel();
          item.leaving = null;
        }
        item.el.dataset.instanceId = view.id;
        update(item, view);
        views.set(item, view);
        if (fresh) {
          const entry = motion
            ? motion.enter(view, reducedMotion(), item)
            : {
                frames: fallback({ opacity: 0, transform: "translateY(-0.5em)" }, { opacity: 1 }),
                duration: ENTER_MS,
              };
          item.el.animate?.(entry.frames, { duration: entry.duration, easing: "ease-out" });
        }
        const next: ChildNode | null = previous ? previous.nextSibling : container.firstChild;
        if (next !== item.el) container.insertBefore(item.el, next);
        previous = item.el;
      }
    },
  };
}
