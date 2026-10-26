/**
 * The 30 structural layouts (spec §9: not themed), each with its boss bar and elite card variant, built from the
 * layout parameters that exist (no new kinds of layout). Ids a, b and c are the mock-up's A, B and C and never
 * change; names are literal i18n keys.
 */
export interface LayoutSpec {
  id: string;
  name: string;
  bar: Record<string, unknown>;
  card: Record<string, unknown>;
}

export const LAYOUTS: LayoutSpec[] = [
  { id: "a", name: "BB5E.Look.Layout.A", bar: {}, card: {} },
  {
    id: "b",
    name: "BB5E.Look.Layout.B",
    bar: { bar: "ring", extras: "side", width: 32, height: 1 },
    card: { icon: "top", fill: "ring", name: "below", width: 7.5 },
  },
  {
    id: "c",
    name: "BB5E.Look.Layout.C",
    bar: { portrait: "notch", bar: "thin", quote: "below", width: 60, height: 0.625 },
    card: { icon: "tile", fill: "vertical", name: "overlay", statuses: "side", width: 8 },
  },
  {
    id: "compact",
    name: "BB5E.Look.Layout.Compact",
    bar: { width: 26, height: 0.875 },
    card: { width: 11 },
  },
  {
    id: "wide",
    name: "BB5E.Look.Layout.Wide",
    bar: { width: 56, height: 1.375 },
    card: { width: 18 },
  },
  {
    id: "right",
    name: "BB5E.Look.Layout.Right",
    bar: { portrait: "right" },
    card: { statuses: "side" },
  },
  {
    id: "bare",
    name: "BB5E.Look.Layout.Bare",
    bar: { portrait: "none", width: 44 },
    card: { icon: "top", name: "below", width: 9 },
  },
  {
    id: "medallion",
    name: "BB5E.Look.Layout.Medallion",
    bar: { portrait: "medallion", name: "below", height: 1.25 },
    card: { icon: "top", width: 8.5 },
  },
  {
    id: "crown",
    name: "BB5E.Look.Layout.Crown",
    bar: { portrait: "top", width: 34 },
    card: { icon: "top", name: "below", statuses: "below", width: 8 },
  },
  {
    id: "notch",
    name: "BB5E.Look.Layout.Notch",
    bar: { portrait: "notch", height: 1.25 },
    card: { icon: "tile", name: "overlay", width: 9 },
  },
  {
    id: "thin",
    name: "BB5E.Look.Layout.Thin",
    bar: { bar: "thin", width: 42 },
    card: { width: 12.5 },
  },
  {
    id: "segmented",
    name: "BB5E.Look.Layout.Segmented",
    bar: { bar: "segmented", height: 1.25 },
    card: { fill: "horizontal", width: 13 },
  },
  {
    id: "rows",
    name: "BB5E.Look.Layout.Rows",
    bar: { extras: "above", quote: "below", height: 1.375 },
    card: { name: "below", width: 12 },
  },
  {
    id: "inside",
    name: "BB5E.Look.Layout.Inside",
    bar: { name: "inside", height: 1.75 },
    card: { name: "overlay", width: 13 },
  },
  {
    id: "under",
    name: "BB5E.Look.Layout.Under",
    bar: { name: "below", quote: "above" },
    card: { name: "below", statuses: "side", width: 12 },
  },
  {
    id: "side",
    name: "BB5E.Look.Layout.Side",
    bar: { extras: "side", width: 46 },
    card: { statuses: "side", width: 16 },
  },
  {
    id: "badge",
    name: "BB5E.Look.Layout.Badge",
    bar: { extras: "portrait" },
    card: { icon: "left", fill: "ring", width: 10 },
  },
  {
    id: "medallion-thin",
    name: "BB5E.Look.Layout.MedallionThin",
    bar: { portrait: "medallion", name: "below", bar: "thin", width: 40 },
    card: { icon: "top", fill: "horizontal", width: 7 },
  },
  {
    id: "right-thin",
    name: "BB5E.Look.Layout.RightThin",
    bar: { portrait: "right", bar: "thin", quote: "below" },
    card: { statuses: "side", width: 13 },
  },
  {
    id: "minimal",
    name: "BB5E.Look.Layout.Minimal",
    bar: { portrait: "none", bar: "thin", extras: "below", width: 40, height: 0.75 },
    card: { icon: "left", name: "beside", width: 10 },
  },
  {
    id: "segmented-wide",
    name: "BB5E.Look.Layout.SegmentedWide",
    bar: { bar: "segmented", width: 56, height: 1.25 },
    card: { fill: "horizontal", width: 16 },
  },
  {
    id: "medallion-segments",
    name: "BB5E.Look.Layout.MedallionSegments",
    bar: { portrait: "medallion", name: "below", bar: "segmented" },
    card: { icon: "top", fill: "vertical", width: 7.5 },
  },
  {
    id: "crown-wide",
    name: "BB5E.Look.Layout.CrownWide",
    bar: { portrait: "top", width: 50, height: 1.25 },
    card: { icon: "top", name: "below", width: 10 },
  },
  {
    id: "notch-wide",
    name: "BB5E.Look.Layout.NotchWide",
    bar: { portrait: "notch", width: 64, height: 1 },
    card: { icon: "tile", name: "overlay", statuses: "side", width: 11 },
  },
  {
    id: "ring-compact",
    name: "BB5E.Look.Layout.RingCompact",
    bar: { bar: "ring", extras: "below", width: 24, height: 1 },
    card: { icon: "top", fill: "ring", name: "below", width: 6.5 },
  },
  {
    id: "colossus",
    name: "BB5E.Look.Layout.Colossus",
    bar: { width: 70, height: 2 },
    card: { width: 20 },
  },
  {
    id: "banner",
    name: "BB5E.Look.Layout.Banner",
    bar: { portrait: "none", name: "inside", width: 52, height: 1.75 },
    card: { icon: "tile", fill: "horizontal", name: "overlay", width: 14 },
  },
  {
    id: "right-inside",
    name: "BB5E.Look.Layout.RightInside",
    bar: { portrait: "right", name: "inside", height: 1.625 },
    card: { name: "overlay", statuses: "side", width: 14 },
  },
  {
    id: "voice",
    name: "BB5E.Look.Layout.Voice",
    bar: { quote: "side", width: 34 },
    card: { name: "beside", statuses: "below", width: 12 },
  },
  {
    id: "slim",
    name: "BB5E.Look.Layout.Slim",
    bar: { bar: "thin", width: 36, height: 0.5 },
    card: { fill: "vertical", width: 9 },
  },
];
