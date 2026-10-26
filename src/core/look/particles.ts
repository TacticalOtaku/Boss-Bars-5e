/** One spark or ash flake, in screen pixels; `life` counts down from `max` (ms). */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "spark" | "ash";
}

/** The pool's ceiling (decision 7): the oldest particles give way to new ones. */
export const PARTICLE_LIMIT = 200;

const between = (random: () => number, min: number, max: number) => min + random() * (max - min);

/** Sparks from the fill's edge on damage; more for a bigger hit (6 for a scratch, 40 at most). */
export function sparks(
  at: { x: number; y: number },
  share: number,
  color: string,
  random: () => number = Math.random,
): Particle[] {
  const count = Math.min(40, Math.max(6, Math.round(6 + share * 80)));
  return Array.from({ length: count }, () => {
    const angle = between(random, -Math.PI * 0.9, -Math.PI * 0.1);
    const speed = between(random, 120, 360);
    const max = between(random, 350, 750);
    return {
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: max,
      max,
      size: between(random, 1.2, 2.6),
      color,
      kind: "spark",
    };
  });
}

/** Ash rising from the whole bar when it leaves with the "dissolve" defeat. */
export function ash(
  rect: { x: number; y: number; width: number; height: number },
  colors: readonly string[],
  random: () => number = Math.random,
): Particle[] {
  const count = Math.min(80, Math.max(20, Math.round(rect.width / 8)));
  return Array.from({ length: count }, () => {
    const max = between(random, 900, 1700);
    return {
      x: rect.x + random() * rect.width,
      y: rect.y + random() * rect.height,
      vx: between(random, -25, 25),
      vy: between(random, -70, -20),
      life: max,
      max,
      size: between(random, 1.5, 3.5),
      color: colors[Math.floor(random() * colors.length)] ?? "#555555",
      kind: "ash",
    };
  });
}

/** Adds new particles; past the ceiling the oldest go first. */
export const admit = (
  alive: readonly Particle[],
  born: readonly Particle[],
  limit = PARTICLE_LIMIT,
): Particle[] => [...alive, ...born].slice(-limit);

/** One step of `dt` ms: sparks fall under gravity, ash drifts up and slows; dead particles are dropped. */
export function stepParticles(alive: readonly Particle[], dt: number): Particle[] {
  const s = dt / 1000;
  return alive.flatMap((particle) => {
    const life = particle.life - dt;
    if (life <= 0) return [];
    const spark = particle.kind === "spark";
    const drag = spark ? 1 : 1 - Math.min(1, 1.5 * s);
    const vy = spark ? particle.vy + 900 * s : particle.vy * drag;
    return [
      {
        ...particle,
        x: particle.x + particle.vx * s,
        y: particle.y + vy * s,
        vx: particle.vx * drag,
        vy,
        life,
      },
    ];
  });
}
