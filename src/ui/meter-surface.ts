import type { LookStyle } from "../core/look/compile";
import { hpChange, isLow, type HpChange } from "../core/look/effects";
import { sparks, type Particle } from "../core/look/particles";
import type { VfxEvent } from "../core/look/vfx";
import { part } from "./dom";
import { playHpChange } from "./effects";
import { applyHpColor } from "./look";
import { vfxRenderer, type VfxHandle } from "./vfx/renderer";

export interface MeterSurfaceOptions {
  /** Root element receiving `data-low`, `--bb5e-f`, `--bb5e-t`, `bb5e-vfx` and root HP hit effects. */
  root: HTMLElement;
  /** Parent element into which the meter container is appended. */
  parent: HTMLElement;
  /** BEM block/element prefix for `meter`, `trail`, `fill`, `shield` and `vfx` (`"bb5e-boss"` or `"bb5e-elite"`). */
  classPrefix: string;
  /** Whether a damage linger trail element is created and driven. */
  withTrail?: boolean;
  /** Portrait/icon element animated on HP hits. */
  portrait: HTMLElement | null;
  /** Name element animated on HP hits. */
  name: HTMLElement;
  /** Where the WebGL2 canvas is mounted relative to the meter or root. */
  vfxPlacement: "beforeMeter" | "prependRoot";
  /** Optional predicate deciding whether the look wants WebGL2 VFX; defaults to always true. */
  vfxWanted?(look: LookStyle): boolean;
  /** Extra options forwarded to `renderer.attach(...)`. */
  vfxOptions?: { card?: HTMLElement; icon?: HTMLElement; text?: HTMLElement[] };
  /** Optional listener notified whenever a VFX event is emitted (used by boss portraits sharing bar events). */
  onVfxEvent?(event: Omit<VfxEvent, "at">): void;
  /** Whether big hits play big shader cracks (`true` on boss bars, `false` on compact elite cards). */
  allowBigCrack?: boolean;
  /** Whether vertical card fills (`cfill === "vertical"`) orient with `scaleY`. */
  respectCardDirection?: boolean;
  /** Reduced-motion check used for fallback CSS hit effects. */
  reducedMotion(): boolean;
  /** Optional 2D particle layer for CSS-fallback sparks when WebGL2 is not actively drawing. */
  particles?: { emit(born: Particle[]): void };
}

export interface MeterUpdateInput {
  label: string;
  look: LookStyle;
  fraction: number | null;
  shield: number;
  defeated: boolean;
  /** `true` skips trail linger and HP hit effects (used on initial placement or phase reset). */
  quiet?: boolean;
  /** Whether the meter element is shown (`false` when an elite card layout hides its fill). */
  visible?: boolean;
  ticks?: number[];
  /** Extra WebGL2 state fields used by elite cards. */
  accent?: string;
  accentTop?: boolean;
  iconFrame?: boolean;
}

export interface MeterSurface {
  readonly meter: HTMLElement;
  readonly fill: HTMLElement;
  readonly flash: HTMLElement;
  readonly crack: HTMLElement;
  readonly shown: number | null;
  readonly isVfxLive: boolean;
  update(input: MeterUpdateInput): number;
  emit(event: Omit<VfxEvent, "at">): void;
  playQuarter(effect: "damage" | "heal", look: LookStyle): void;
}

/**
 * Shared meter DOM, fill/trail transitions, HP hit effects and WebGL2 canvas lifecycle for boss bars and elite cards.
 * Keeps an explicit `isVfxLive` flag synced with `onLive` so 2D fallback sparks keep firing during async shader
 * compilation or after WebGL2 context loss instead of checking handle presence alone.
 */
export function createMeterSurface(options: MeterSurfaceOptions): MeterSurface {
  const { root, classPrefix } = options;
  const meter = part("div", `${classPrefix}__meter`, options.parent);
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");
  const trail = options.withTrail ? part("div", `${classPrefix}__trail`, meter) : null;
  const fill = part("div", `${classPrefix}__fill`, meter);
  const shieldEl = part("div", `${classPrefix}__shield`, meter);
  const flash = part("div", "bb5e-fx bb5e-fx--flash", meter);
  const crack = part("div", "bb5e-fx bb5e-fx--crack", meter);
  const wave = part("div", "bb5e-fx bb5e-fx--wave", meter);

  let shownValue: number | null = null;
  let vfx: { handle: VfxHandle; canvas: HTMLCanvasElement } | null = null;
  let vfxLive = false;

  function emit(event: Omit<VfxEvent, "at">) {
    vfx?.handle.event(event);
    options.onVfxEvent?.(event);
  }

  function playHp(change: HpChange, look: LookStyle, fraction: number) {
    if (change) {
      emit({
        kind: change.kind,
        share: change.share,
        x: fraction,
        big:
          Boolean(options.allowBigCrack) && change.kind === "damage" && change.big && look.effects.bigCrack,
        scale: look.effects.scaleByDamage,
      });
    }
    if (change?.kind === "damage" && look.effects.sparks && options.particles && !vfxLive) {
      const rect = meter.getBoundingClientRect();
      const at = { x: rect.left + rect.width * fraction, y: rect.top + rect.height / 2 };
      options.particles.emit(sparks(at, change.share, look.effects.sparkColor));
    }
    playHpChange(
      change,
      look,
      { root, portrait: options.portrait, flash, crack, wave, name: options.name },
      options.reducedMotion(),
    );
  }

  function setFill(look: LookStyle, shown: number, quiet: boolean) {
    const previous = shownValue;
    const vertical = Boolean(options.respectCardDirection) && look.attrs.cfill === "vertical";
    const scale = (fraction: number) => (vertical ? `scaleY(${fraction})` : `scaleX(${fraction})`);
    fill.style.transform = scale(shown);
    root.style.setProperty("--bb5e-f", String(shown));
    // One HP change fires several hooks; re-rendering the same fill must not cut a running trail short.
    if (shown === previous) return;
    shownValue = shown;
    if (trail) {
      const jump = (fraction: number) => {
        trail.style.transition = "none";
        trail.style.transform = scale(fraction);
        root.style.setProperty("--bb5e-t", String(fraction));
        void trail.offsetWidth;
        trail.style.transition = "";
      };
      if (previous === null || shown >= previous || quiet) jump(shown);
      else if (!look.effects.trailAccumulate) jump(previous);
      if (previous !== null && shown < previous) {
        trail.style.transform = scale(shown);
        root.style.setProperty("--bb5e-t", String(shown));
      }
    }
    if (!quiet) playHp(hpChange(previous, shown, look.effects.bigThreshold), look, shown);
  }

  function syncVfx(input: MeterUpdateInput, shown: number, low: boolean) {
    const wanted = options.vfxWanted ? options.vfxWanted(input.look) : true;
    if (!wanted) {
      if (!vfx) return;
      vfx.handle.detach();
      vfx.canvas.remove();
      root.classList.remove("bb5e-vfx");
      vfx = null;
      vfxLive = false;
      return;
    }
    if (!vfx) {
      const renderer = vfxRenderer();
      if (!renderer) return;
      const canvas = document.createElement("canvas");
      canvas.className = `${classPrefix}__vfx`;
      canvas.setAttribute("aria-hidden", "true");
      if (options.vfxPlacement === "prependRoot") root.prepend(canvas);
      else meter.before(canvas);
      const handle = renderer.attach(
        canvas,
        meter,
        (live) => {
          vfxLive = live;
          root.classList.toggle("bb5e-vfx", live);
        },
        options.vfxOptions,
      );
      vfx = { handle, canvas };
    }
    vfx.handle.setMaterial(input.look.material, input.look.key);
    vfx.handle.setState({
      fill: shown,
      shield: input.defeated ? 0 : input.shield,
      ticks: input.ticks ?? [],
      low,
      defeated: input.defeated,
      ...(input.accent !== undefined ? { accent: input.accent } : {}),
      ...(input.accentTop !== undefined ? { accentTop: input.accentTop } : {}),
      ...(input.iconFrame !== undefined ? { iconFrame: input.iconFrame } : {}),
    });
  }

  return {
    meter,
    fill,
    flash,
    crack,
    get shown() {
      return shownValue;
    },
    get isVfxLive() {
      return vfxLive;
    },
    update(input: MeterUpdateInput) {
      const visible = input.visible ?? true;
      meter.hidden = !visible;
      meter.setAttribute("aria-label", input.label);
      const shown = input.defeated ? 0 : (input.fraction ?? 0);
      if (input.fraction === null) meter.removeAttribute("aria-valuenow");
      else meter.setAttribute("aria-valuenow", String(Math.round(shown * 100)));
      applyHpColor(fill, input.look, shown);
      setFill(input.look, shown, Boolean(input.quiet));
      const low = visible && !input.defeated && isLow(shown, input.look.effects.lowThreshold);
      syncVfx(input, shown, low);
      const lowMode = input.look.effects.lowFlicker ? "flicker" : input.look.effects.lowPulse ? "pulse" : "";
      if (low && lowMode) root.dataset.low = lowMode;
      else delete root.dataset.low;
      // The temp HP shield sits right after the fill; the meter clips what reaches past its end.
      shieldEl.hidden = !input.shield || input.defeated;
      shieldEl.style.setProperty("--bb5e-at", String(shown));
      shieldEl.style.setProperty("--bb5e-shield", String(input.shield));
      return shown;
    },
    emit,
    playQuarter(effect, look) {
      const fillAt = shownValue ?? 0;
      const [from, to] = effect === "damage" ? [fillAt + 0.25, fillAt] : [fillAt - 0.25, fillAt];
      playHp(hpChange(from, to, look.effects.bigThreshold), look, fillAt);
    },
  };
}
