export interface KeyedItem {
  el: HTMLElement;
  leaving: Animation | null;
}

const ENTER_MS = 300;
const LEAVE_MS = 250;

/**
 * One DOM item per view id, kept in view order, no framework. New items fade in; removed ones fade out and stay
 * after the shown ones until their exit ends; an item shown again while leaving comes back at once.
 */
export function createKeyedList<V extends { id: string }, I extends KeyedItem>(
  container: HTMLElement,
  create: () => I,
  update: (item: I, view: V) => void,
  reducedMotion: () => boolean,
) {
  const items = new Map<string, I>();

  // Reduced motion (spec §12): only the opacity change stays.
  const motion = (from: Keyframe, to: Keyframe): Keyframe[] =>
    reducedMotion() ? [{ opacity: from.opacity }, { opacity: to.opacity }] : [from, to];

  function leave(id: string, item: I) {
    const animation = item.el.animate?.(
      motion({ opacity: 1 }, { opacity: 0, transform: "translateY(-0.5em)" }),
      {
        duration: LEAVE_MS,
        easing: "ease-in",
        fill: "forwards",
      },
    );
    if (!animation) {
      item.el.remove();
      items.delete(id);
      return;
    }
    item.leaving = animation;
    // cancel() on re-show rejects `finished`; that is expected, not an error.
    animation.finished?.catch(() => undefined);
    animation.onfinish = () => {
      if (item.leaving !== animation) return;
      item.el.remove();
      items.delete(id);
    };
  }

  return {
    update(views: V[]) {
      const ids = new Set(views.map((view) => view.id));
      for (const [id, item] of items) if (!ids.has(id) && !item.leaving) leave(id, item);
      let previous: HTMLElement | null = null;
      for (const view of views) {
        let item = items.get(view.id);
        if (!item) {
          item = create();
          items.set(view.id, item);
          item.el.animate?.(motion({ opacity: 0, transform: "translateY(-0.5em)" }, { opacity: 1 }), {
            duration: ENTER_MS,
            easing: "ease-out",
          });
        } else if (item.leaving) {
          item.leaving.cancel();
          item.leaving = null;
        }
        item.el.dataset.instanceId = view.id;
        update(item, view);
        const next: ChildNode | null = previous ? previous.nextSibling : container.firstChild;
        if (next !== item.el) container.insertBefore(item.el, next);
        previous = item.el;
      }
    },
  };
}
