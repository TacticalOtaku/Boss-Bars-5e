/**
 * The structural layouts (spec §9: not themed), separately for the boss bar and the elite card: each one a distinct
 * arrangement, sizes are the layout's S–XL parameter rather than layouts of their own. Names are literal i18n keys.
 */
export interface LayoutSpec {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export const BAR_LAYOUTS: LayoutSpec[] = [
  { id: "a", name: "BB5E.Look.Layout.A", params: {} },
  { id: "right", name: "BB5E.Look.Layout.Right", params: { portrait: "right" } },
  { id: "bare", name: "BB5E.Look.Layout.Bare", params: { portrait: "none", width: 44 } },
  {
    id: "medallion",
    name: "BB5E.Look.Layout.Medallion",
    params: { portrait: "medallion", name: "below", height: 1.25 },
  },
  { id: "crown", name: "BB5E.Look.Layout.Crown", params: { portrait: "top", width: 34 } },
  { id: "inside", name: "BB5E.Look.Layout.Inside", params: { name: "inside", height: 1.75 } },
  { id: "under", name: "BB5E.Look.Layout.Under", params: { name: "below", quote: "above" } },
  {
    id: "cinema",
    name: "BB5E.Look.Layout.Cinema",
    params: { portrait: "notch", quote: "below", width: 56, height: 1 },
  },
  {
    id: "minimal",
    name: "BB5E.Look.Layout.Minimal",
    params: { portrait: "none", bar: "thin", extras: "below", width: 40, height: 0.75 },
  },
];

export const CARD_LAYOUTS: LayoutSpec[] = [
  { id: "a", name: "BB5E.Look.Layout.A", params: {} },
  { id: "top", name: "BB5E.Look.Layout.Top", params: { icon: "top", name: "below", width: 9 } },
  { id: "tile", name: "BB5E.Look.Layout.Tile", params: { icon: "tile", name: "overlay", width: 9 } },
  { id: "row", name: "BB5E.Look.Layout.Row", params: { icon: "left", name: "beside", width: 10 } },
];
