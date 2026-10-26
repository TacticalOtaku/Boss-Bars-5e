import { effectStrength, type HpChange } from "../core/look/effects";
import type { LookStyle } from "../core/look/style";

/** Parts of a bar or card the effects touch; the overlays sit inside the meter (or the ring). */
export interface EffectTargets {
  root: HTMLElement;
  portrait: HTMLElement | null;
  flash: HTMLElement;
  crack: HTMLElement;
  wave: HTMLElement;
  name: HTMLElement;
}

const run = (el: HTMLElement, frames: Keyframe[], duration: number, easing = "ease-out") =>
  el.animate?.(frames, { duration, easing });

/**
 * Plays the HP-change effects of a look (spec §9 "Эффект изменения ХП"). Only transform and opacity move. With
 * reduced motion only the opacity changes stay: the flash, the wave's fade; no shake, no crack.
 */
export function playHpChange(
  change: HpChange,
  style: LookStyle,
  targets: EffectTargets,
  reduced: boolean,
): void {
  if (!change) return;
  const effects = style.effects;
  if (change.kind === "damage") {
    const strength = effectStrength(change.share, effects.scaleByDamage);
    if (effects.damageFlash) run(targets.flash, [{ opacity: 0.85 * strength }, { opacity: 0 }], 260);
    if (reduced) return;
    const shift = 0.25 * strength;
    const shake = [0, -shift, shift, -shift / 2, 0].map((x) => ({ transform: `translateX(${x}em)` }));
    if (effects.damageShake) run(targets.root, shake, 320);
    if (style.portraitShake && targets.portrait) run(targets.portrait, shake, 320);
    if (change.big && effects.bigCrack) {
      run(
        targets.crack,
        [{ opacity: 0, transform: "scale(0.9)" }, { opacity: 1, offset: 0.15 }, { opacity: 0 }],
        900,
      );
    }
    return;
  }
  if (effects.healWave) {
    run(
      targets.wave,
      reduced
        ? [{ opacity: 0.6 }, { opacity: 0 }]
        : [
            { opacity: 0.7, transform: "translateX(-100%)" },
            { opacity: 0, transform: "translateX(100%)" },
          ],
      700,
    );
  }
  if (effects.healRise && !reduced) {
    run(
      targets.root,
      [{ transform: "translateY(0)" }, { transform: "translateY(-0.15em)" }, { transform: "translateY(0)" }],
      420,
    );
  }
}

export interface PhaseTargets {
  meter: HTMLElement;
  fill: HTMLElement;
  flash: HTMLElement;
  crack: HTMLElement;
  banner: HTMLElement;
}

/**
 * The phase change of the new phase's look (spec §9, decision 5): frame crack, flash, refill sweep, palette blend
 * from `palette` (the old fill's background) and a banner with `text`. Reduced motion keeps the opacity ones: the
 * flash, the blend and the banner.
 */
export function playPhaseChange(
  style: LookStyle,
  targets: PhaseTargets,
  shown: number,
  text: string,
  palette: string | null,
  reduced: boolean,
): void {
  const motion = style.motion;
  if (motion.phaseFlash) run(targets.flash, [{ opacity: 1 }, { opacity: 0 }], 600);
  if (motion.phaseCrack && !reduced) {
    run(
      targets.crack,
      [
        { opacity: 0, transform: "scale(1.04)" },
        { opacity: 1, transform: "scale(1)", offset: 0.1 },
        { opacity: 1, offset: 0.6 },
        { opacity: 0 },
      ],
      1400,
    );
  }
  if (motion.phaseRefill && !reduced) {
    run(targets.fill, [{ transform: "scaleX(0)" }, { transform: `scaleX(${shown})` }], 700);
  }
  if (palette) {
    // The old palette lies over the new one and fades out.
    const layer = document.createElement("div");
    layer.className = "bb5e-fx bb5e-fx--palette";
    layer.style.background = palette;
    layer.style.transform = `scaleX(${shown})`;
    targets.meter.append(layer);
    const blend = run(layer, [{ opacity: 1 }, { opacity: 0 }], 800);
    if (blend)
      void blend.finished.then(
        () => layer.remove(),
        () => layer.remove(),
      );
    else layer.remove();
  }
  if (motion.phaseBanner && text) {
    const { banner } = targets;
    banner.textContent = text;
    banner.hidden = false;
    const show = run(
      banner,
      [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }],
      2000,
    );
    const hide = () => {
      banner.hidden = true;
    };
    if (show) void show.finished.then(hide, hide);
    else hide();
  }
}

/** A quote fades in, rising a little (reduced motion: the fade only), and leaves after `ms`. */
export function showQuote(
  el: HTMLElement,
  text: string,
  ms: number,
  reduced: boolean,
): ReturnType<typeof setTimeout> {
  el.textContent = text;
  el.hidden = false;
  run(
    el,
    reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: "translateY(0.4em)" }, { opacity: 1 }],
    300,
  );
  return setTimeout(() => {
    const out = run(el, [{ opacity: 1 }, { opacity: 0 }], 300);
    const hide = () => {
      el.hidden = true;
    };
    if (out) void out.finished.then(hide, hide);
    else hide();
  }, ms);
}

/** Entry of a bar or card as its look says; reduced motion keeps the fade only. */
export function enterFrames(style: LookStyle, reduced: boolean): Keyframe[] {
  if (reduced) return [{ opacity: 0 }, { opacity: 1 }];
  switch (style.motion.enter) {
    case "expand":
      return [
        { opacity: 0, transform: "scaleX(0.2)" },
        { opacity: 1, transform: "scaleX(1)" },
      ];
    case "fade":
    case "type":
      return [{ opacity: 0 }, { opacity: 1 }];
    default:
      return [{ opacity: 0, transform: "translateY(-0.5em)" }, { opacity: 1 }];
  }
}

/** "Printing" the name: revealed letter by letter (enter "type"). */
export function typeName(name: HTMLElement, style: LookStyle, reduced: boolean): void {
  if (reduced || style.motion.enter !== "type") return;
  const letters = Math.max(1, name.textContent?.length ?? 1);
  name.animate?.([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], {
    duration: Math.min(1500, 60 * letters),
    easing: `steps(${letters})`,
  });
}

/** Exit frames: the normal leave, or the defeat leave (dissolve grows and fades; banner and fade just fade). */
export function leaveFrames(style: LookStyle, defeated: boolean, reduced: boolean): Keyframe[] {
  if (reduced) return [{ opacity: 1 }, { opacity: 0 }];
  if (defeated && style.motion.defeat === "dissolve") {
    return [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.08)" },
    ];
  }
  if (defeated && style.motion.defeat === "banner")
    return [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }];
  if (defeated || style.motion.leave === "fade") return [{ opacity: 1 }, { opacity: 0 }];
  return [{ opacity: 1 }, { opacity: 0, transform: "translateY(-0.5em)" }];
}

/** How long a leave takes: the defeat banner stays readable before the bar fades. */
export function leaveDuration(style: LookStyle, defeated: boolean): number {
  const base = style.motion.duration;
  if (!defeated) return base;
  return style.motion.defeat === "banner" ? base + 1500 : base * 2;
}
