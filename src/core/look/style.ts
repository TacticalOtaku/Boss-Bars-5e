import { customFamily, FONTS } from "./fonts";
import type { ResolvedLook } from "./resolve";
import type { Params } from "./schema";

/** How a resolved look draws: data attributes and CSS variables for the bar or card root, plus behaviour. */
export interface LookStyle {
  /** Changes whenever attrs or vars change: the renderer skips re-applying an equal style. */
  key: string;
  attrs: Record<string, string>;
  vars: Record<string, string>;
  /** A GM woff2 to register as `family` before it is used. */
  customFont: { family: string; file: string } | null;
  fill: { byHp: boolean; colors: string[] };
  shield: boolean;
  statuses: { max: number; maxCard: number; tip: { name: boolean; description: boolean; duration: boolean } };
  effects: Params<"hpEffect">;
  motion: Params<"motion">;
  portraitShake: boolean;
}

const em = (value: number) => `${value}em`;
const ms = (value: number) => `${value}ms`;
const url = (path: string) => (path ? `url("${path}")` : "none");
const glow = (size: number, color: string) => (size > 0 ? `0 0 ${em(size)} ${color}` : "0 0 0 transparent");

function fillBackground({ type, colors, texture }: Params<"fill">): string {
  const [first = "#000000"] = colors;
  switch (type) {
    case "solid":
      return first;
    case "gradient":
      return colors.length > 1 ? `linear-gradient(${colors.join(", ")})` : first;
    case "texture":
      return texture ? `${url(texture)} center / cover, ${first}` : first;
    default:
      // Live fills (stage 9) fall back to their palette, moving sideways (see _look.scss).
      return `linear-gradient(90deg, ${[...colors, first].join(", ")})`;
  }
}

function fontOf(look: ResolvedLook): { family: string; bold: boolean; custom: LookStyle["customFont"] } {
  const { id, params } = look.font;
  if (params.family === "custom" && params.fontFile) {
    const family = customFamily(id);
    return { family: `"${family}", georgia, serif`, bold: false, custom: { family, file: params.fontFile } };
  }
  const font = FONTS[params.family] ?? FONTS.system ?? { family: "serif", bold: false };
  return { ...font, custom: null };
}

/** Attributes and variables of a resolved look; one style serves the boss bar and the elite card. */
export function lookStyle(look: ResolvedLook): LookStyle {
  const bar = look.layoutBar.params;
  const card = look.layoutCard.params;
  const font = look.font.params;
  const frame = look.frame.params;
  const fill = look.fill.params;
  const effects = look.hpEffect.params;
  const portrait = look.portrait.params;
  const mini = look.miniBars.params;
  const status = look.statuses.params;
  const face = fontOf(look);
  const flag = (on: boolean) => (on ? "1" : "0");

  const attrs: Record<string, string> = {
    portrait: bar.portrait,
    bar: bar.bar,
    name: bar.name,
    extras: bar.extras,
    icon: card.icon,
    cfill: card.fill,
    cname: card.name,
    cstatuses: card.statuses,
    frame: frame.style === "image" && !frame.image ? "classic" : frame.style,
    corners: frame.corners,
    pframe: flag(frame.portraitFrame),
    fill: fill.type,
    shine: flag(fill.shine),
    edge: flag(fill.edgeGlow),
    segments: fill.segments,
    shape: portrait.shape,
    tint: portrait.tint,
    status: status.shape,
    sgrid: flag(status.arrangement === "grid"),
    sborder: flag(status.border),
    mini: mini.bar,
    pip: mini.pip,
    mlabel: flag(mini.label),
    inkfill: flag(Boolean(font.color2)),
  };
  const shadows = [
    font.shadow ? "0 0.1em 0.2em #000" : "",
    font.glow > 0 ? glow(font.glow, font.glowColor) : "",
  ];
  const vars: Record<string, string> = {
    "--bb5e-font-display": face.family,
    "--bb5e-name-size": em(font.nameSize),
    "--bb5e-title-size": em(font.titleSize),
    "--bb5e-name-weight": font.bold && face.bold ? "700" : "400",
    "--bb5e-name-case": font.caps ? "uppercase" : "none",
    "--bb5e-spacing": em(font.spacing),
    "--bb5e-ink": font.color,
    "--bb5e-ink-fill": font.color2 ? `linear-gradient(${font.color}, ${font.color2})` : "none",
    "--bb5e-title": font.titleColor,
    "--bb5e-stroke": `${font.stroke}px`,
    "--bb5e-stroke-color": font.strokeColor,
    "--bb5e-name-shadow": shadows.filter(Boolean).join(", ") || "none",
    "--bb5e-gold": frame.color,
    "--bb5e-frame-width": em(frame.width),
    "--bb5e-frame-glow": glow(frame.glow, frame.glowColor),
    "--bb5e-frame-image": frame.style === "image" ? url(frame.image) : "none",
    "--bb5e-frame-slice": String(frame.slice),
    "--bb5e-fill": fillBackground(fill),
    "--bb5e-empty": fill.empty,
    "--bb5e-shield-fill": fill.shieldColor,
    "--bb5e-segment": `${fill.segmentEvery}%`,
    "--bb5e-edge": fill.colors[0] ?? "#ffffff",
    "--bb5e-trail": effects.trailColor,
    "--bb5e-trail-delay": ms(effects.trailDelay),
    "--bb5e-trail-speed": ms(effects.trailSpeed),
    "--bb5e-portrait-border": em(portrait.borderWidth),
    "--bb5e-portrait-color": portrait.borderColor,
    "--bb5e-portrait-glow": glow(portrait.glow, portrait.glowColor),
    "--bb5e-mini-fill": mini.color2 ? `linear-gradient(${mini.color}, ${mini.color2})` : mini.color,
    "--bb5e-mini-on": mini.color,
    "--bb5e-mini-empty": mini.empty,
    "--bb5e-mini-height": em(mini.height),
    "--bb5e-status-size": em(status.size),
    "--bb5e-width": em(bar.width),
    "--bb5e-height": em(bar.height),
    "--bb5e-card-width": em(card.width),
  };
  return {
    key: JSON.stringify([attrs, vars]),
    attrs,
    vars,
    customFont: face.custom,
    fill: { byHp: fill.byHp, colors: fill.colors },
    shield: fill.shield,
    statuses: {
      max: status.max,
      maxCard: status.maxCard,
      tip: { name: status.tipName, description: status.tipDescription, duration: status.tipDuration },
    },
    effects,
    motion: look.motion.params,
    portraitShake: portrait.shake,
  };
}
