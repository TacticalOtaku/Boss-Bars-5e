import type { Category } from "../schema";

/** A shared preset of a behaviour category: themes pick one instead of each carrying a near copy. */
export interface ArchetypeSpec {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

/**
 * How bars come, go and change phase. Each differs in what a player can see: the entry, its pace, the defeat and
 * the phase change. The first one is the parameter defaults ("Classic RPG").
 */
export const MOTION_ARCHETYPES: ArchetypeSpec[] = [
  { id: "classic", name: "BB5E.Look.Motion.Classic", params: {} },
  {
    id: "swift",
    name: "BB5E.Look.Motion.Swift",
    params: { duration: 150, defeat: "dissolve", phaseCrack: true },
  },
  {
    id: "majestic",
    name: "BB5E.Look.Motion.Majestic",
    params: { enter: "expand", duration: 600, leave: "fade", phaseRefill: true, phasePalette: true },
  },
  {
    id: "smoulder",
    name: "BB5E.Look.Motion.Smoulder",
    params: { enter: "fade", duration: 450, defeat: "dissolve", phaseCrack: true, phaseBanner: false },
  },
  {
    id: "haunting",
    name: "BB5E.Look.Motion.Haunting",
    params: {
      enter: "fade",
      duration: 900,
      leave: "fade",
      defeat: "dissolve",
      phaseFlash: false,
      phasePalette: true,
    },
  },
  {
    id: "chronicle",
    name: "BB5E.Look.Motion.Chronicle",
    params: {
      enter: "type",
      duration: 600,
      leave: "fade",
      defeat: "fade",
      phaseFlash: false,
      phaseRefill: true,
    },
  },
  {
    id: "quiet",
    name: "BB5E.Look.Motion.Quiet",
    params: {
      enter: "fade",
      duration: 250,
      leave: "fade",
      defeat: "fade",
      phaseFlash: false,
      phaseBanner: false,
    },
  },
];

/**
 * How a hit, a heal and low HP play. Spark and trail colours stay empty: they follow the look (its frame light and
 * its lightest fill colour).
 */
export const HIT_ARCHETYPES: ArchetypeSpec[] = [
  { id: "classic", name: "BB5E.Look.Hit.Classic", params: {} },
  {
    id: "heavy",
    name: "BB5E.Look.Hit.Heavy",
    params: { bigThreshold: 15, healRise: false, trailDelay: 800, trailSpeed: 400 },
  },
  {
    id: "brittle",
    name: "BB5E.Look.Hit.Brittle",
    params: {
      damageShake: false,
      healRise: false,
      healWave: true,
      lowPulse: false,
      lowFlicker: true,
      trailDelay: 300,
      trailSpeed: 1200,
    },
  },
  {
    id: "snappy",
    name: "BB5E.Look.Hit.Snappy",
    params: {
      bigCrack: false,
      lowThreshold: 30,
      lowPulse: false,
      lowFlicker: true,
      trailDelay: 150,
      trailSpeed: 300,
      trailAccumulate: false,
    },
  },
  {
    id: "eerie",
    name: "BB5E.Look.Hit.Eerie",
    params: {
      damageShake: false,
      bigCrack: false,
      healWave: true,
      lowFlicker: true,
      trailDelay: 1200,
      trailSpeed: 1500,
    },
  },
  {
    id: "serene",
    name: "BB5E.Look.Hit.Serene",
    params: { damageShake: false, scaleByDamage: false, bigThreshold: 40, healWave: true },
  },
  {
    id: "quiet",
    name: "BB5E.Look.Hit.Quiet",
    params: {
      damageShake: false,
      damageFlash: false,
      sparks: false,
      bigCrack: false,
      healRise: false,
      lowPulse: false,
      trailDelay: 200,
      trailSpeed: 900,
      trailAccumulate: false,
    },
  },
];

/** How status icons sit under a bar and on a card. */
export const STATUS_ARCHETYPES: ArchetypeSpec[] = [
  { id: "classic", name: "BB5E.Look.Status.Classic", params: {} },
  { id: "round", name: "BB5E.Look.Status.Round", params: { shape: "circle", size: 1.4, max: 8, maxCard: 3 } },
  { id: "orbs", name: "BB5E.Look.Status.Orbs", params: { shape: "circle", border: false } },
  { id: "diamond", name: "BB5E.Look.Status.Diamond", params: { shape: "diamond", size: 1.3, max: 12 } },
  { id: "grid", name: "BB5E.Look.Status.Grid", params: { shape: "diamond", arrangement: "grid" } },
  { id: "plain", name: "BB5E.Look.Status.Plain", params: { shape: "plain" } },
  { id: "bare", name: "BB5E.Look.Status.Bare", params: { shape: "plain", border: false, size: 1.2 } },
];

export const ARCHETYPES = {
  motion: MOTION_ARCHETYPES,
  hpEffect: HIT_ARCHETYPES,
  statuses: STATUS_ARCHETYPES,
} as const satisfies Partial<Record<Category, ArchetypeSpec[]>>;

export type ArchetypeCategory = keyof typeof ARCHETYPES;
