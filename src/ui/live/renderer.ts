import { approach, frameInterval, palette, shaderTime, type LiveFill } from "../../core/look/live";
import { logger } from "../../logger";
import { fragmentSource, VERTEX } from "./shaders";

/** One boss bar's live fill: its own 2D canvas, fed from the shared WebGL2 frame. */
export interface LiveHandle {
  setLook(type: LiveFill, colors: readonly string[]): void;
  setFill(fill: number): void;
  detach(): void;
}

interface Target {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D | null;
  type: LiveFill;
  colors: { rgb: Float32Array; count: number };
  drawn: number;
  fill: number;
  /** Something changed since the last frame (needed with reduced motion, where nothing else redraws). */
  dirty: boolean;
  /** Seen in the page once: a bar removed after that is dropped (one being built is not). */
  seen: boolean;
  /** The canvas holds a frame: only then does the CSS fill hide, so the bar never shows empty. */
  live: boolean;
  onLive(live: boolean): void;
}

/** Bars bigger than this are drawn at this size and scaled by the browser. */
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 128;

/** The canvas fills its parent (the meter); it stays display:none until its first frame, so measure the parent. */
const box = (canvas: HTMLCanvasElement) => canvas.parentElement ?? canvas;
const visible = (canvas: HTMLCanvasElement) =>
  canvas.isConnected && box(canvas).clientWidth > 0 && box(canvas).clientHeight > 0;

/**
 * The page's single WebGL2 context for live fills (ADR 0002): each frame is rendered off screen at the bar's size
 * and copied into the bar's 2D canvas, so any number of bars costs one WebGL context. One loop drives every bar:
 * ~60 fps while a fill catches up, ~15 fps at rest, none when nothing visible is live (decision 3). A lost context
 * hands every bar back to its CSS fill at once and rebuilds when restored (decision 6).
 */
class LiveRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #programs = new Map<
    LiveFill,
    { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> } | null
  >();
  readonly #targets = new Set<Target>();
  readonly #reduced: () => boolean;
  #lost = false;
  #frame = 0;
  #recheck: ReturnType<typeof setTimeout> | undefined;
  #last = 0;

  constructor(gl: WebGL2RenderingContext, reduced: () => boolean) {
    this.#gl = gl;
    this.#reduced = reduced;
    this.#canvas = gl.canvas as HTMLCanvasElement;
    this.#canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.#lost = true;
      this.#programs.clear();
      for (const target of this.#targets) {
        target.live = false;
        target.onLive(false);
      }
    });
    this.#canvas.addEventListener("webglcontextrestored", () => {
      this.#lost = false;
      for (const target of this.#targets) target.dirty = true;
      this.#wake();
    });
  }

  get lost() {
    return this.#lost;
  }

  /** For checks: lose the context the way a GPU reset would. */
  simulateLoss(restoreAfter?: number) {
    const extension = this.#gl.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    if (extension && restoreAfter !== undefined) setTimeout(() => extension.restoreContext(), restoreAfter);
  }

  attach(canvas: HTMLCanvasElement, onLive: (live: boolean) => void): LiveHandle {
    const target: Target = {
      canvas,
      context: canvas.getContext("2d"),
      type: "liquid",
      colors: palette([]),
      drawn: -1,
      fill: 1,
      dirty: true,
      seen: false,
      live: false,
      onLive,
    };
    this.#targets.add(target);
    return {
      setLook: (type, colors) => {
        target.type = type;
        target.colors = palette(colors);
        target.dirty = true;
        this.#wake();
      },
      setFill: (fill) => {
        const first = target.drawn < 0;
        if (first) target.drawn = fill;
        if (fill !== target.fill) target.dirty = true;
        target.fill = fill;
        // Until the canvas has a frame it is drawn at once: the bar should not wait a loop turn on its CSS fill.
        if (!target.live && !this.#lost && visible(canvas)) this.#draw(target, shaderTime(performance.now()));
        this.#wake();
      },
      detach: () => {
        this.#targets.delete(target);
      },
    };
  }

  /** (Re)starts the loop; it stops itself when there is nothing to draw. */
  #wake() {
    if (!this.#frame) this.#frame = requestAnimationFrame((now) => this.#tick(now));
  }

  #tick(now: number) {
    this.#frame = 0;
    if (this.#lost) return;
    const reduced = this.#reduced();
    for (const target of this.#targets) {
      if (target.canvas.isConnected) target.seen = true;
      else if (target.seen) this.#targets.delete(target);
    }
    const shown = [...this.#targets].filter((target) => visible(target.canvas));
    if (!shown.length) return;
    const catchingUp = shown.some((target) => target.drawn !== target.fill);
    const interval = frameInterval(catchingUp, reduced);
    if (interval === null) {
      // Reduced motion: one still frame per change, at the final fill.
      for (const target of shown.filter((each) => each.dirty)) {
        target.drawn = target.fill;
        this.#draw(target, 0);
      }
      // No frames while still; a slow check notices when reduced motion is switched off again.
      clearTimeout(this.#recheck);
      this.#recheck = setTimeout(() => this.#wake(), 1000);
      return;
    }
    if (now - this.#last >= interval - 1) {
      const dt = Math.min(100, now - this.#last);
      this.#last = now;
      for (const target of shown) {
        target.drawn = approach(target.drawn, target.fill, dt);
        this.#draw(target, shaderTime(now));
      }
    }
    this.#wake();
  }

  #program(type: LiveFill) {
    if (this.#programs.has(type)) return this.#programs.get(type) ?? null;
    const gl = this.#gl;
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      logger.warn("Live fill shader failed", type, gl.getShaderInfoLog(shader));
      return null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource(type));
    const program = vertex && fragment ? gl.createProgram() : null;
    let entry = null;
    if (program && vertex && fragment) {
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const uniforms = Object.fromEntries(
          ["u_res", "u_time", "u_fill", "u_colors", "u_count"].map((name) => [
            name,
            gl.getUniformLocation(program, name),
          ]),
        );
        entry = { program, uniforms };
      } else logger.warn("Live fill program failed", type, gl.getProgramInfoLog(program));
    }
    // A type that fails to build stays on its CSS fill; it is not retried until the context is rebuilt.
    this.#programs.set(type, entry);
    return entry;
  }

  #draw(target: Target, time: number) {
    const entry = this.#program(target.type);
    const { canvas, context } = target;
    if (!entry || !context) {
      if (target.live) target.onLive(false);
      target.live = false;
      return;
    }
    const scale = devicePixelRatio || 1;
    const width = Math.min(MAX_WIDTH, Math.max(1, Math.round(box(canvas).clientWidth * scale)));
    const height = Math.min(MAX_HEIGHT, Math.max(1, Math.round(box(canvas).clientHeight * scale)));
    const gl = this.#gl;
    // The shared canvas only grows: drawing a smaller bar uses its lower left corner.
    if (this.#canvas.width < width) this.#canvas.width = width;
    if (this.#canvas.height < height) this.#canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(entry.program);
    const { uniforms } = entry;
    gl.uniform2f(uniforms.u_res ?? null, width, height);
    gl.uniform1f(uniforms.u_time ?? null, time);
    gl.uniform1f(uniforms.u_fill ?? null, target.drawn);
    gl.uniform3fv(uniforms.u_colors ?? null, target.colors.rgb);
    gl.uniform1i(uniforms.u_count ?? null, target.colors.count);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    // WebGL rows start at the bottom: the bar's frame is the last `height` rows of the shared canvas image.
    context.drawImage(this.#canvas, 0, this.#canvas.height - height, width, height, 0, 0, width, height);
    target.dirty = false;
    if (!target.live) {
      target.live = true;
      target.onLive(true);
    }
  }
}

let renderer: LiveRenderer | null | undefined;

/**
 * The shared renderer, created on first use; null when WebGL2 is unavailable (the CSS fills stay for the session).
 * The first caller's reduced-motion check is used for every bar: it is the same global switch everywhere.
 */
export function liveRenderer(reduced: () => boolean): LiveRenderer | null {
  if (renderer !== undefined) return renderer;
  const gl = document
    .createElement("canvas")
    .getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false });
  renderer = gl ? new LiveRenderer(gl, reduced) : null;
  if (!gl) logger.info("WebGL2 unavailable: live fills use their CSS version");
  return renderer;
}
