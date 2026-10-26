import { admit, stepParticles, type Particle } from "../core/look/particles";

/**
 * The HUD's one particle canvas (ADR 0002): it is created with the first particle, covers the screen without taking
 * pointer events, and goes away with the last one. Reduced motion emits nothing (spec §12).
 */
export function createParticleLayer(host: HTMLElement, reduced: () => boolean) {
  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let alive: Particle[] = [];
  let frame = 0;
  let last = 0;

  const stop = () => {
    canvas?.remove();
    canvas = null;
    context = null;
    alive = [];
    frame = 0;
  };

  const tick = (now: number) => {
    alive = stepParticles(alive, Math.min(50, now - last));
    last = now;
    if (!alive.length || !canvas || !context) return stop();
    const scale = devicePixelRatio || 1;
    const width = Math.round(innerWidth * scale);
    const height = Math.round(innerHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, innerWidth, innerHeight);
    for (const particle of alive) {
      context.globalAlpha = Math.min(1, (particle.life / particle.max) * 1.4);
      context.fillStyle = particle.color;
      context.fillRect(
        particle.x - particle.size / 2,
        particle.y - particle.size / 2,
        particle.size,
        particle.size,
      );
    }
    frame = requestAnimationFrame(tick);
  };

  return {
    emit(born: Particle[]) {
      if (reduced() || !born.length) return;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.className = "bb5e-particles";
        canvas.setAttribute("aria-hidden", "true");
        context = canvas.getContext("2d");
        host.append(canvas);
      }
      if (!context) return stop();
      alive = admit(alive, born);
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    },
  };
}
