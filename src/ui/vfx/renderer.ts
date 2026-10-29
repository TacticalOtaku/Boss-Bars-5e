import { approach, palette, shaderTime } from "../../core/look/live";
import type { BarMaterial } from "../../core/look/material";
import { VFX_SLOTS, vfxAt, vfxFrameInterval, type VfxEvent, type VfxKind } from "../../core/look/vfx";
import { logger } from "../../logger";
import { reducedMotion } from "../dom";
import { BAR_VERTEX, barFragment, variantKey, type BarVariant } from "./bar-shader";

/** What a bar shows; the renderer animates the fill, the trail and defeat on its own. */
export interface BarState {
  fill: number;
  shield: number;
  ticks: number[];
  low: boolean;
  defeated: boolean;
  /** An elite card's rank colour (#rrggbb), and whether its rank strip runs along the top (icon on top). */
  accent?: string;
  accentTop?: boolean;
  /** An elite card: the shader frames its icon (not in the tile layout, where the icon is the card's background). */
  iconFrame?: boolean;
}

/** A boss bar's body, or an elite card's plate and meter: its own 2D canvas, fed from the shared WebGL2 frame. */
export interface VfxHandle {
  setMaterial(material: BarMaterial, key: string): void;
  setState(state: BarState): void;
  event(event: Omit<VfxEvent, "at">): void;
  detach(): void;
}

interface Target {
  canvas: HTMLCanvasElement;
  meter: HTMLElement;
  /** An elite card: the canvas covers the whole card around the meter; null for a boss bar. */
  card: HTMLElement | null;
  /** A boss portrait: `meter` is the picture, the canvas lies over it with its frame and light. */
  portrait: boolean;
  /** An elite card's icon and its place in the card (CSS px from the padding edge). */
  icon: HTMLElement | null;
  iconBox: { x: number; y: number; w: number; h: number };
  /** A boss bar's name and title, and their union in the meter's frame (CSS px; empty when hidden). */
  text: HTMLElement[];
  textBox: { x: number; y: number; w: number; h: number };
  panel: { w: number; h: number };
  /** The card's border widths: the canvas is placed from its padding edge, the plate covers the border box. */
  border: { x: number; y: number };
  lastDraw: number;
  context: CanvasRenderingContext2D | null;
  material: BarMaterial | null;
  key: string;
  /** The program variant of the frame on the canvas: while another one compiles, the CSS look shows instead. */
  variant: string;
  state: BarState;
  drawn: number;
  trail: number;
  /** When the trail starts to follow a hit (ms). */
  trailFrom: number;
  defeatedAt: number | null;
  /** The old palette and when the blend to the new one began (motion.phasePalette). */
  paletteFrom: Float32Array | null;
  paletteAt: number;
  events: VfxEvent[];
  seeds: number;
  /** Meter size and place in the frame, CSS px (ResizeObserver: read after layout, never in the frame loop). */
  box: { x: number; y: number; w: number; h: number };
  pad: { x: number; y: number };
  dirty: boolean;
  live: boolean;
  /** The canvas has been in the document: once it leaves, the target is forgotten, drawn or not. */
  connected: boolean;
  onLive(live: boolean): void;
}

const KIND: Record<VfxKind, number> = { damage: 0, heal: 1, phase: 2, defeat: 3, appear: 4 };
/** The trail waits, then follows slower than the fill (the look's defaults). */
/** A phase's palette blend (motion.phasePalette). */
const PALETTE_MS = 800;
const DEFEAT_MS = 2000;
const MAX_PX = 4096;

const UNIFORMS = [
  "u_res",
  "u_origin",
  "u_box",
  "u_time",
  "u_fill",
  "u_trail",
  "u_shield",
  "u_defeat",
  "u_low",
  "u_ticks",
  "u_tickCount",
  "u_colors",
  "u_count",
  "u_empty",
  "u_frameColor",
  "u_glowColor",
  "u_trailColor",
  "u_shieldColor",
  "u_spark",
  "u_frameW",
  "u_frameGlow",
  "u_shieldOn",
  "u_edgeGlow",
  "u_shine",
  "u_fxA",
  "u_fxB",
  "u_fxCount",
  "u_panel",
  "u_rank",
  "u_shape",
  "u_frameStyle",
  "u_hit",
  "u_phase",
  "u_icon",
  "u_iconColor",
  "u_iconGlow",
  "u_text",
] as const;
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
interface Program {
  program: WebGLProgram;
  uniforms: Uniforms;
}

/** Room around the meter for light, flames and shards: more above (flames, embers) than at the sides. */
/** An element's offset box inside an ancestor, summed along offset parents (transforms do not count). */
function offsetBox(element: HTMLElement, ancestor: HTMLElement | null) {
  let x = 0;
  let y = 0;
  for (
    let at: Element | null = element;
    at && at !== ancestor && at instanceof HTMLElement;
    at = at.offsetParent
  ) {
    x += at.offsetLeft;
    y += at.offsetTop;
  }
  return { x, y, w: element.offsetWidth, h: element.offsetHeight };
}

/** An element's offset box relative to another element, whatever their offset parents (transforms do not count). */
function relativeBox(element: HTMLElement, to: HTMLElement) {
  const box = offsetBox(element, null);
  const origin = offsetBox(to, null);
  return { ...box, x: box.x - origin.x, y: box.y - origin.y };
}

/** A target's canvas: CSS height and device pixels. */
interface Size {
  scale: number;
  cssH: number;
  width: number;
  height: number;
}

function sizeOf(target: Target, scale: number): Size {
  const { card, panel, box, pad } = target;
  const cssW = card ? panel.w + pad.x * 2 : box.w + pad.x * 2;
  const cssH = card ? panel.h + pad.y * 2 : box.h + pad.y * 2;
  return {
    scale,
    cssH,
    width: Math.min(MAX_PX, Math.round(cssW * scale)),
    height: Math.min(MAX_PX, Math.round(cssH * scale)),
  };
}

const padOf = (h: number) => ({ x: Math.round(Math.max(h * 1.4, 20)), y: Math.round(Math.max(h * 2.2, 28)) });

/**
 * The page's single WebGL2 context for boss bar bodies (ADR 0003): each frame is rendered off screen and copied into
 * the bar's 2D canvas. One loop drives every bar (decision 4): 60 fps while something moves, 30 at rest, a still
 * frame with reduced motion. A lost context hands every bar back to its CSS look at once.
 */
class VfxRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  #vertex: WebGLShader | null | undefined;
  /** Programs by variant: ready, still compiling (`building`), or null when they failed. */
  readonly #programs = new Map<string, Program | { building: WebGLProgram } | null>();
  #parallel: KHR_parallel_shader_compile | null = null;
  /** A program was still compiling in this frame: keep the loop going until it is ready. */
  #waiting = false;
  readonly #targets = new Set<Target>();
  readonly #byElement = new Map<Element, Target>();
  readonly #reduced: () => boolean;
  #lost = false;
  #frame = 0;
  readonly #sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const target = this.#byElement.get(entry.target);
      if (!target) continue;
      const { meter, card, canvas } = target;
      // Offsets ignore transforms (enter animations, shakes): the meter in its frame, or in its card.
      target.box = { x: meter.offsetLeft, y: meter.offsetTop, w: meter.offsetWidth, h: meter.offsetHeight };
      if (card) {
        target.iconBox = target.icon ? offsetBox(target.icon, card) : { x: 0, y: 0, w: 0, h: 0 };
        target.panel = { w: card.offsetWidth, h: card.offsetHeight };
        target.border = { x: card.clientLeft, y: card.clientTop };
        const room = Math.round(Math.max(target.panel.h * 0.35, 10));
        target.pad = { x: room, y: room };
        canvas.style.left = `${-room - target.border.x}px`;
        canvas.style.top = `${-room - target.border.y}px`;
        canvas.style.width = `${target.panel.w + room * 2}px`;
        canvas.style.height = `${target.panel.h + room * 2}px`;
      } else {
        const frame = meter.offsetParent;
        const boxes =
          frame instanceof HTMLElement
            ? target.text.map((el) => relativeBox(el, frame)).filter((b) => b.w > 0)
            : [];
        const x0 = Math.min(...boxes.map((b) => b.x));
        const y0 = Math.min(...boxes.map((b) => b.y));
        target.textBox = boxes.length
          ? {
              x: x0,
              y: y0,
              w: Math.max(...boxes.map((b) => b.x + b.w)) - x0,
              h: Math.max(...boxes.map((b) => b.y + b.h)) - y0,
            }
          : { x: 0, y: 0, w: 0, h: 0 };
        const room = Math.round(Math.max(target.box.h * 0.3, 12));
        target.pad = target.portrait ? { x: room, y: room } : padOf(target.box.h);
        const { box, pad } = target;
        canvas.style.left = `${box.x - pad.x}px`;
        canvas.style.top = `${box.y - pad.y}px`;
        canvas.style.width = `${box.w + pad.x * 2}px`;
        canvas.style.height = `${box.h + pad.y * 2}px`;
      }
      target.dirty = true;
    }
    this.#wake();
  });

  constructor(gl: WebGL2RenderingContext, reduced: () => boolean) {
    this.#gl = gl;
    this.#reduced = reduced;
    this.#canvas = gl.canvas as HTMLCanvasElement;
    this.#parallel = gl.getExtension("KHR_parallel_shader_compile");
    this.#canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.#lost = true;
      this.#vertex = undefined;
      this.#programs.clear();
      for (const target of this.#targets) this.#setLive(target, false);
    });
    this.#canvas.addEventListener("webglcontextrestored", () => {
      this.#lost = false;
      for (const target of this.#targets) target.dirty = true;
      this.#wake();
    });
  }

  /** For checks: lose the context the way a GPU reset would. */
  simulateLoss(restoreAfter?: number) {
    const extension = this.#gl.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    if (extension && restoreAfter !== undefined) setTimeout(() => extension.restoreContext(), restoreAfter);
  }

  /**
   * `card`: an elite card holding the canvas; `portrait`: `meter` is a boss portrait; otherwise the canvas sits
   * around a boss bar's meter.
   */
  attach(
    canvas: HTMLCanvasElement,
    meter: HTMLElement,
    onLive: (live: boolean) => void,
    options: { card?: HTMLElement; portrait?: boolean; icon?: HTMLElement; text?: HTMLElement[] } = {},
  ): VfxHandle {
    const card = options.card ?? null;
    const target: Target = {
      canvas,
      meter,
      card,
      portrait: Boolean(options.portrait),
      icon: options.icon ?? null,
      iconBox: { x: 0, y: 0, w: 0, h: 0 },
      text: options.text ?? [],
      textBox: { x: 0, y: 0, w: 0, h: 0 },
      panel: { w: 0, h: 0 },
      border: { x: 0, y: 0 },
      lastDraw: 0,
      context: canvas.getContext("2d"),
      material: null,
      key: "",
      variant: "",
      state: { fill: 1, shield: 0, ticks: [], low: false, defeated: false },
      drawn: -1,
      trail: -1,
      trailFrom: 0,
      defeatedAt: null,
      paletteFrom: null,
      paletteAt: 0,
      events: [],
      seeds: 0,
      box: { x: 0, y: 0, w: 0, h: 0 },
      pad: { x: 0, y: 0 },
      dirty: true,
      live: false,
      connected: canvas.isConnected,
      onLive,
    };
    this.#targets.add(target);
    for (const element of [meter, card, target.icon, ...target.text]) {
      if (!element) continue;
      this.#byElement.set(element, target);
      this.#sizes.observe(element);
    }
    return {
      setMaterial: (material, key) => {
        if (key === target.key) return;
        if (target.material && material.phasePalette) {
          target.paletteFrom = target.material.colors;
          target.paletteAt = performance.now();
        }
        target.material = material;
        target.key = key;
        target.dirty = true;
        this.#wake();
      },
      setState: (state) => {
        const now = performance.now();
        if (target.drawn < 0) {
          target.drawn = state.fill;
          target.trail = state.fill;
          // The first state is where the bar starts, not a change: no trail from full, no defeat played again.
          target.state = state;
          target.defeatedAt = state.defeated ? now - DEFEAT_MS : null;
        }
        // A hit holds the trail where the fill was (a look that does not gather hits drops the older ones);
        // healing takes it along.
        if (state.fill < target.state.fill) {
          if (target.material?.trailAccumulate === 0) target.trail = target.state.fill;
          target.trailFrom = now + (target.material?.trailDelay ?? 550);
        } else if (state.fill > target.state.fill) target.trail = state.fill;
        if (state.defeated && !target.state.defeated) target.defeatedAt = now;
        if (!state.defeated) target.defeatedAt = null;
        target.state = state;
        target.dirty = true;
        this.#wake();
      },
      event: (event) => {
        // "Refill": a phase change sweeps the fill up from empty.
        if (event.kind === "phase" && target.material?.phaseRefill) {
          target.drawn = 0;
          target.trail = 0;
        }
        target.events.push({ ...event, at: performance.now() });
        target.seeds++;
        this.#wake();
      },
      detach: () => this.#forget(target),
    };
  }

  #forget(target: Target) {
    this.#targets.delete(target);
    for (const element of [target.meter, target.card, target.icon, ...target.text]) {
      if (!element) continue;
      this.#byElement.delete(element);
      this.#sizes.unobserve(element);
    }
  }

  #setLive(target: Target, live: boolean) {
    if (target.live === live) return;
    target.live = live;
    target.onLive(live);
  }

  #wake() {
    if (!this.#frame) this.#frame = requestAnimationFrame((now) => this.#tick(now));
  }

  #tick(now: number) {
    this.#frame = 0;
    if (this.#lost) return;
    const reduced = this.#reduced();
    const shown: Target[] = [];
    for (const target of this.#targets) {
      // A bar removed before its first frame (a program still compiling, a lost context) is forgotten too.
      if (!target.canvas.isConnected) {
        if (target.connected) this.#forget(target);
        continue;
      }
      target.connected = true;
      const sized = target.card ? target.panel.w > 0 : target.box.w > 0 && target.box.h > 0;
      if (sized && target.material) shown.push(target);
    }
    if (!shown.length) return;
    // Each bar keeps its own pace: busy ones at 60 fps, idle boss bars at 30, idle cards at 15 (decision 4).
    const due: [Target, number][] = [];
    for (const target of shown) {
      const busy =
        target.drawn !== target.state.fill ||
        target.trail !== target.state.fill ||
        vfxAt(target.events, now, { reduced }).length > 0 ||
        now - target.paletteAt < PALETTE_MS ||
        (target.defeatedAt !== null && now - target.defeatedAt < DEFEAT_MS);
      const interval = vfxFrameInterval({ busy, bosses: !target.card, reduced });
      if (interval === null) {
        if (!target.dirty) continue;
        target.drawn = target.state.fill;
        target.trail = target.state.fill;
        due.push([target, 0]);
        continue;
      }
      if (now - target.lastDraw < interval - 1 && !target.dirty) continue;
      const dt = Math.min(100, now - target.lastDraw);
      target.lastDraw = now;
      target.drawn = approach(target.drawn, target.state.fill, dt);
      if (target.trail < target.drawn) target.trail = target.drawn;
      else if (now >= target.trailFrom) {
        const next =
          target.trail +
          (target.drawn - target.trail) * Math.min(1, dt / (target.material?.trailSpeed ?? 600));
        target.trail = Math.abs(next - target.drawn) < 0.001 ? target.drawn : next;
      }
      target.events = target.events.filter((event) => now - event.at < 3000);
      due.push([target, shaderTime(now)]);
    }
    this.#waiting = false;
    this.#drawAll(due, now, reduced);
    if (!reduced || this.#waiting) this.#wake();
  }

  /**
   * Renders every due target into its own strip of the GL canvas, then copies all strips: copying after each draw
   * made the browser snapshot the GL buffer once per bar (drawImage was a third of the frame with 12 cards).
   */
  #drawAll(due: [Target, number][], now: number, reduced: boolean) {
    const scale = devicePixelRatio || 1;
    let batch: { target: Target; time: number; size: Size }[] = [];
    let used = 0;
    const flush = () => {
      if (!batch.length) return;
      const width = Math.max(...batch.map((job) => job.size.width));
      if (this.#canvas.width < width) this.#canvas.width = width;
      if (this.#canvas.height < used) this.#canvas.height = used;
      let y = 0;
      const copies: (() => void)[] = [];
      for (const job of batch) {
        const copy = this.#draw(job.target, job.time, now, reduced, job.size, y);
        if (copy) copies.push(copy);
        y += job.size.height;
      }
      for (const copy of copies) copy();
      batch = [];
      used = 0;
    };
    for (const [target, time] of due) {
      const size = sizeOf(target, scale);
      if (used + size.height > MAX_PX) flush();
      batch.push({ target, time, size });
      used += size.height;
    }
    flush();
  }

  /**
   * The program for a variant, compiled on first use without blocking: with KHR_parallel_shader_compile the link is
   * polled each frame and the element keeps its CSS look meanwhile (a blocking link froze the page for seconds).
   * Returns undefined while it compiles, null when it failed.
   */
  #programFor(variant: BarVariant): Program | null | undefined {
    const gl = this.#gl;
    const key = variantKey(variant);
    const entry = this.#programs.get(key);
    if (entry === null) return null;
    if (entry && "uniforms" in entry) return entry;
    if (!entry) {
      const building = this.#compile(variant);
      this.#programs.set(key, building ? { building } : null);
      if (!building) return null;
      if (this.#parallel) return undefined;
      return this.#programFor(variant);
    }
    const program = entry.building;
    if (this.#parallel && !gl.getProgramParameter(program, this.#parallel.COMPLETION_STATUS_KHR))
      return undefined;
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      logger.warn("Bar program failed", key, gl.getProgramInfoLog(program));
      this.#programs.set(key, null);
      return null;
    }
    const uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Uniforms;
    const ready = { program, uniforms };
    this.#programs.set(key, ready);
    return ready;
  }

  /** Starts compiling a variant; its status is read later (reading it now would wait for the compile). */
  #compile(variant: BarVariant): WebGLProgram | null {
    const gl = this.#gl;
    const shader = (kind: number, source: string) => {
      const each = gl.createShader(kind);
      if (!each) return null;
      gl.shaderSource(each, source);
      gl.compileShader(each);
      return each;
    };
    if (this.#vertex === undefined) this.#vertex = shader(gl.VERTEX_SHADER, BAR_VERTEX);
    const fragment = shader(gl.FRAGMENT_SHADER, barFragment(variant));
    const program = this.#vertex && fragment ? gl.createProgram() : null;
    if (!program || !this.#vertex || !fragment) return null;
    gl.attachShader(program, this.#vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    return program;
  }

  /** Draws one target into the strip of the GL canvas starting at row `y` (from the bottom); returns its copy. */
  #draw(target: Target, time: number, now: number, reduced: boolean, size: Size, y: number) {
    const { canvas, context, material, box, pad, card, panel } = target;
    if (!context || !material) {
      this.#setLive(target, false);
      return null;
    }
    // A portrait needs none of the fill's variants, and motes are drawn on boss bars only: fewer programs to compile.
    const mode = target.portrait ? 3 : card ? (target.state.accentTop ? 2 : 1) : 0;
    const variant = {
      mode,
      fill: mode === 3 ? 0 : material.fillType,
      pattern: mode === 3 ? 0 : material.pattern,
      motes: mode === 0 ? material.motes : 0,
    };
    const entry = this.#programFor(variant);
    if (entry === undefined) {
      this.#waiting = true;
      if (target.variant !== variantKey(variant)) this.#setLive(target, false);
      return null;
    }
    if (!entry) {
      this.#setLive(target, false);
      return null;
    }
    const { scale, cssH, width, height } = size;
    // The meter's place in the canvas, CSS px from the top left; GL counts rows from the bottom.
    const meterX = card ? pad.x + target.border.x + box.x : pad.x;
    const meterY = card ? pad.y + target.border.y + box.y : pad.y;
    const glY = (top: number, h: number) => (cssH - top - h) * scale;
    const gl = this.#gl;
    gl.viewport(0, y, width, height);
    gl.useProgram(entry.program);
    const u = entry.uniforms;
    const { state } = target;
    gl.uniform2f(u.u_origin, 0, y);
    gl.uniform2f(u.u_res, width, height);
    gl.uniform4f(
      u.u_box,
      meterX * scale,
      glY(meterY, box.h),
      (meterX + box.w) * scale,
      glY(meterY, box.h) + box.h * scale,
    );
    gl.uniform1i(u.u_shape, material.portraitShape);
    gl.uniform1i(u.u_frameStyle, material.frameStyle);
    gl.uniform4fv(u.u_hit, material.hit);
    gl.uniform2fv(u.u_phase, material.phase);
    gl.uniform4f(
      u.u_panel,
      pad.x * scale,
      glY(pad.y, panel.h),
      (pad.x + panel.w) * scale,
      glY(pad.y, panel.h) + panel.h * scale,
    );
    gl.uniform3fv(u.u_rank, palette([state.accent ?? "#c9a45c"]).rgb.slice(0, 3));
    const ib = target.iconBox;
    if (card && state.iconFrame && ib.w > 0) {
      const ix = pad.x + target.border.x + ib.x;
      const iy = pad.y + target.border.y + ib.y;
      gl.uniform4f(u.u_icon, ix * scale, glY(iy, ib.h), (ix + ib.w) * scale, glY(iy, ib.h) + ib.h * scale);
    } else gl.uniform4f(u.u_icon, 0, 0, 0, 0);
    const tb = target.textBox;
    if (!card && !target.portrait && tb.w > 0) {
      const tx = pad.x + tb.x - box.x;
      const ty = pad.y + tb.y - box.y;
      gl.uniform4f(u.u_text, tx * scale, glY(ty, tb.h), (tx + tb.w) * scale, glY(ty, tb.h) + tb.h * scale);
    } else gl.uniform4f(u.u_text, 0, 0, 0, 0);
    gl.uniform4fv(u.u_iconColor, [...material.portraitColor, material.portraitFrame]);
    gl.uniform4fv(u.u_iconGlow, [...material.portraitGlowColor, material.portraitGlow]);
    gl.uniform1f(u.u_time, time);
    gl.uniform1f(u.u_fill, target.drawn);
    gl.uniform1f(u.u_trail, target.trail);
    gl.uniform1f(u.u_shield, state.shield);
    const defeat = target.defeatedAt === null ? 0 : Math.min(1, (now - target.defeatedAt) / DEFEAT_MS);
    gl.uniform1f(u.u_defeat, state.defeated ? Math.max(defeat, this.#reduced() ? 1 : 0) : 0);
    gl.uniform1f(u.u_low, state.low ? material.lowMode : 0);
    const ticks = new Float32Array(8);
    state.ticks.slice(0, 8).forEach((at, index) => (ticks[index] = at));
    gl.uniform1fv(u.u_ticks, ticks);
    gl.uniform1i(u.u_tickCount, Math.min(8, state.ticks.length));
    const blend = Math.min(1, (now - target.paletteAt) / PALETTE_MS);
    const from = target.paletteFrom;
    gl.uniform3fv(
      u.u_colors,
      from && blend < 1
        ? material.colors.map(
            (value, index) => (from[index] ?? value) + (value - (from[index] ?? value)) * blend,
          )
        : material.colors,
    );
    gl.uniform1i(u.u_count, material.colorCount);
    gl.uniform3fv(u.u_empty, material.empty);
    gl.uniform3fv(u.u_frameColor, material.frameColor);
    gl.uniform3fv(u.u_glowColor, material.glowColor);
    gl.uniform3fv(u.u_trailColor, material.trail);
    gl.uniform3fv(u.u_shieldColor, material.shield);
    gl.uniform3fv(u.u_spark, material.spark);
    if (target.portrait) {
      // A portrait wears the look's portrait frame in the same slots.
      gl.uniform3fv(u.u_frameColor, material.portraitColor);
      gl.uniform3fv(u.u_glowColor, material.portraitGlowColor);
      gl.uniform1f(u.u_frameW, material.portraitWidth * Math.min(box.w, box.h) * scale);
      gl.uniform1f(u.u_frameGlow, material.portraitGlow);
      gl.uniform1f(u.u_shieldOn, material.portraitFrame);
    } else {
      gl.uniform1f(u.u_frameW, Math.max(material.frameWidth * box.h, card ? 1 : 0) * scale);
      gl.uniform1f(u.u_frameGlow, material.frameGlow);
      gl.uniform1f(u.u_shieldOn, material.shieldOn);
    }
    gl.uniform1f(u.u_edgeGlow, material.edgeGlow);
    gl.uniform1f(u.u_shine, material.shine);
    const running = reduced ? [] : vfxAt(target.events, now, { reduced: false });
    const fxA = new Float32Array(VFX_SLOTS * 4);
    const fxB = new Float32Array(VFX_SLOTS * 4);
    running.forEach((fx, index) => {
      fxA.set([KIND[fx.kind], fx.t, fx.strength, fx.x], index * 4);
      fxB.set([fx.big ? 1 : 0, fx.motion ? 1 : 0, fx.share, (index + target.seeds) * 17.31], index * 4);
    });
    gl.uniform4fv(u.u_fxA, fxA);
    gl.uniform4fv(u.u_fxB, fxB);
    gl.uniform1i(u.u_fxCount, running.length);
    // No blending: the triangle writes every pixel of the strip, so nothing needs clearing.
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const source = this.#canvas;
    return () => {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      context.drawImage(source, 0, source.height - y - height, width, height, 0, 0, width, height);
      target.dirty = false;
      target.variant = variantKey(variant);
      this.#setLive(target, true);
    };
  }
}

let renderer: VfxRenderer | null | undefined;

/**
 * The shared renderer, created on first use; null without WebGL2 (bars keep their CSS look for the session). It reads
 * the page's reduced motion itself: an editor preview's own setting must not stick to every bar.
 */
export function vfxRenderer(): VfxRenderer | null {
  if (renderer !== undefined) return renderer;
  const gl = document
    .createElement("canvas")
    .getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  renderer = gl ? new VfxRenderer(gl, reducedMotion) : null;
  if (!gl) logger.info("WebGL2 unavailable: boss bars use their CSS look");
  return renderer;
}
