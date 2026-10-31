import { placeRect, toAnchor, type Placement, type Rect } from "../core/layout";

export interface DragTarget {
  id: string;
  element: HTMLElement;
  label: string;
}
interface Options {
  host: HTMLElement;
  overlay: HTMLElement;
  uiScale(): number;
  hint: string;
  positionOf(scene: string, id: string): Placement | null;
  save(scene: string, id: string, placement: Placement | null): Promise<boolean>;
  onError(): void;
}
interface Target extends DragTarget {
  x: number;
  y: number;
  revision: number;
  pending?: Placement | null;
  active: boolean;
  last?: Rect;
  frozen?: Rect;
}
const INTERACTIVE =
  "button, input, select, textarea, a, summary, [contenteditable], [role=button], [role=slider]";
const STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Runtime-only movement: wrappers keep their normal stack slots; appearance/HP animations live inside them. */
export function startHudDrag(options: Options) {
  const targets = new Map<HTMLElement, Target>();
  const containers = new Set<Element>();
  let scene: string | null = null;
  let stopped = false;
  let frame = 0;
  let drag: { target: Target; pointer: number; x: number; y: number; start: Rect; moved: boolean } | null =
    null;
  const screen = () => {
    const rect = options.host.getBoundingClientRect();
    return { w: options.host.clientWidth || rect.width, h: options.host.clientHeight || rect.height };
  };
  const hostScale = () => {
    const rect = options.host.getBoundingClientRect();
    const logical = screen();
    return { x: rect.width / logical.w || 1, y: rect.height / logical.h || 1 };
  };
  const rectOf = (target: Target): Rect => {
    const rect = target.element.getBoundingClientRect();
    const host = options.host.getBoundingClientRect();
    const scale = hostScale();
    return {
      x: (rect.left - host.left) / scale.x,
      y: (rect.top - host.top) / scale.y,
      w: rect.width / scale.x,
      h: rect.height / scale.y,
    };
  };
  function constrain(rect: Rect): Rect {
    const size = screen();
    return {
      ...rect,
      x: Math.max(0, Math.min(Math.max(0, size.w - rect.w), rect.x)),
      y: Math.max(0, Math.min(Math.max(0, size.h - rect.h), rect.y)),
    };
  }
  function apply(target: Target, desired: Rect) {
    const current = rectOf(target);
    target.x += desired.x - current.x;
    target.y += desired.y - current.y;
    target.element.style.transform = `translate(${target.x}px, ${target.y}px)`;
    target.last = desired;
  }
  function refreshTarget(target: Target) {
    if (!scene || drag?.target === target) return;
    if (!target.element.isConnected) {
      detach(target);
      return;
    }
    if (target.frozen) {
      apply(target, target.frozen);
      return;
    }
    const current = rectOf(target);
    const base = { ...current, x: current.x - target.x, y: current.y - target.y };
    const position = target.pending !== undefined ? target.pending : options.positionOf(scene, target.id);
    apply(target, constrain(position ? placeRect(position, current, screen(), options.uiScale()) : base));
  }
  function refresh() {
    frame = 0;
    if (!stopped) for (const target of targets.values()) refreshTarget(target);
  }
  function schedule() {
    if (!frame && !stopped) frame = requestAnimationFrame(refresh);
  }
  function release() {
    if (!drag) return;
    const released = drag;
    drag = null;
    released.target.element.classList.remove("bb5e-moving");
    try {
      released.target.element.releasePointerCapture?.(released.pointer);
    } catch {
      // Synthetic/already released pointer.
    }
  }
  function cancel() {
    const target = drag?.target;
    release();
    if (target) refreshTarget(target);
  }
  function commit(target: Target, position: Placement | null) {
    if (!scene) return;
    const savedScene = scene;
    const revision = ++target.revision;
    target.pending = position;
    refreshTarget(target);
    void options
      .save(savedScene, target.id, position)
      .then(
        (saved) => {
          if (!saved) options.onError();
        },
        () => options.onError(),
      )
      .finally(() => {
        if (
          stopped ||
          scene !== savedScene ||
          target.revision !== revision ||
          targets.get(target.element) !== target
        )
          return;
        target.pending = undefined;
        refreshTarget(target);
      });
  }
  function pointerDown(event: PointerEvent) {
    if (!scene || drag || event.button !== 0 || event.isPrimary === false) return;
    const element = event.target instanceof Element ? event.target : null;
    if (!element || element.closest(INTERACTIVE)) return;
    const target = [...targets.values()].find((value) => value.active && value.element.contains(element));
    if (!target) return;
    // Prevent canvas/token dragging, while a simple click can still focus and activate normal controls.
    event.stopPropagation();
    drag = {
      target,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: rectOf(target),
      moved: false,
    };
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const scale = hostScale();
    const dx = (event.clientX - drag.x) / scale.x;
    const dy = (event.clientY - drag.y) / scale.y;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.target.element.classList.add("bb5e-moving");
      try {
        drag.target.element.setPointerCapture?.(drag.pointer);
      } catch {
        /* Synthetic pointer. */
      }
    }
    event.preventDefault();
    event.stopPropagation();
    apply(drag.target, constrain({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }));
  }
  function pointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { target, moved } = drag;
    const position = moved ? toAnchor(rectOf(target), screen(), options.uiScale()) : null;
    release();
    if (moved && position) {
      event.preventDefault();
      event.stopPropagation();
      commit(target, position);
    }
  }
  function pointerCancel(event: PointerEvent) {
    if (event.pointerId === drag?.pointer) cancel();
  }
  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    const target = event.target instanceof HTMLElement ? targets.get(event.target) : undefined;
    if (!target?.active || !scene) return;
    const step = STEPS[event.key];
    if (!step && event.key !== "Home") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
    if (event.key === "Home") commit(target, null);
    else if (step) {
      const rect = rectOf(target);
      const factor = event.shiftKey ? 10 : 1;
      const desired = constrain({ ...rect, x: rect.x + step[0] * factor, y: rect.y + step[1] * factor });
      commit(target, toAnchor(desired, screen(), options.uiScale()));
    }
  }
  function disable(target: Target) {
    target.element.classList.remove("bb5e-movable", "bb5e-moving");
    target.element.removeAttribute("tabindex");
    target.element.removeAttribute("role");
    target.element.removeAttribute("aria-label");
    target.element.removeAttribute("title");
  }
  function detach(target: Target) {
    observer.unobserve(target.element);
    disable(target);
    target.element.inert = false;
    target.element.style.transform = "";
    targets.delete(target.element);
  }
  const observer = new ResizeObserver(schedule);
  observer.observe(options.host);
  options.overlay.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointermove", pointerMove, true);
  window.addEventListener("pointerup", pointerUp, true);
  window.addEventListener("pointercancel", pointerCancel, true);
  options.overlay.addEventListener("lostpointercapture", pointerCancel, true);
  window.addEventListener("blur", cancel);
  window.addEventListener("resize", schedule);
  document.addEventListener("keydown", keyDown, true);

  return {
    refresh,
    update(nextScene: string | null, list: DragTarget[]) {
      if (stopped) return;
      if (scene !== nextScene) {
        cancel();
        for (const target of targets.values()) detach(target);
        scene = nextScene;
      }
      const shown = new Set(list.map((target) => target.element));
      for (const target of targets.values())
        if (!shown.has(target.element)) {
          if (drag?.target === target) cancel();
          if (!target.element.isConnected) detach(target);
          else {
            // Keyed exits retain their wrappers. Freeze the previous viewport rect even if reordering
            // or another exit moves their normal stack slot, and remove interaction during the exit.
            target.active = false;
            target.frozen ??= target.last ?? rectOf(target);
            target.element.inert = true;
            disable(target);
          }
        }
      if (!scene) return;
      for (const item of list) {
        let target = targets.get(item.element);
        if (!target) {
          target = { ...item, x: 0, y: 0, revision: 0, active: true };
          targets.set(item.element, target);
          observer.observe(item.element);
          const container = item.element.parentElement;
          if (container && !containers.has(container)) {
            containers.add(container);
            observer.observe(container);
          }
        }
        target.active = true;
        target.frozen = undefined;
        item.element.inert = false;
        item.element.classList.add("bb5e-movable");
        item.element.tabIndex = 0;
        item.element.setAttribute("role", "group");
        target.element.setAttribute("aria-label", `${item.label}. ${options.hint}`);
        target.element.title = options.hint;
      }
      refresh();
    },
    stop() {
      if (stopped) return;
      cancel();
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      for (const target of targets.values()) detach(target);
      options.overlay.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove, true);
      window.removeEventListener("pointerup", pointerUp, true);
      window.removeEventListener("pointercancel", pointerCancel, true);
      options.overlay.removeEventListener("lostpointercapture", pointerCancel, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("keydown", keyDown, true);
    },
  };
}
