# Changelog

## 0.4.0

- Layout mode (GM, from the "Active bosses" panel): drag the boss stack and the elite column on your own screen;
  they snap to the centre and edges and anchor to the nearest of 9 screen points by thirds. Arrows nudge the selected
  block (Shift: 10 px), Escape leaves.
- "Layout" panel: offsets, direction (down, up, in a row for bosses), visible cards, "players may collapse", world or
  scene layer (a scene overrides whole blocks, "Reset to world"), a mini-map of a player's screen 1366×768…3440×1440.
  Edits are a draft until saved.
- Blocks covering Foundry's UI (scene controls, navigation, players, hotbar, sidebar; notifications and the dnd5e
  calendar dashed; Carousel Combat Tracker) or going past the screen edge are highlighted; nothing is moved for you.
- Blocks are placed by anchor + offset × uiScale in pure CSS, so players on other resolutions or with the camera
  dock see them at the same anchors.
- Players may collapse the elite column to an "Elites · N" chip (per scene). The "Players may collapse boss bars"
  module setting moved into the layout (its value is carried over).

## 0.3.0

- Elite profile: the profile window switches between boss and elite; an elite picks a rank and shows a live card.
- Elite column (layout A rows) on the left, sorted by rank, then show order; each card shows only the parts its rank
  allows (icon always; name, fill). 12 cards are shown, the rest as "+N". GM sees HP numbers (tooltip on icon-only
  cards).
- "Elite ranks" editor (module settings and the panel): order with ↑↓, colour, name, parts, icon size, live card;
  four default ranks; removing a rank in use asks first, its elites take the weakest rank.
- One bar or card per actor (×N) for bosses and elites: unlinked tokens' HP are summed, a linked actor's counted once;
  players count only tokens they can see.
- Equal names on a scene are numbered ("Orc", "Orc 2"); hidden enemies are numbered last.
- "Active bosses" panel lists bosses and elites.
- Profiles and scene instances move to data version 2 (migrated on read); 0.2.0 leaves 0.3.0 data untouched.

## 0.2.0

- Boss profile on the world actor (name for players, title, portrait incl. GIF/WebP/webm, size), opened from the
  token HUD (GM) or the actor sheet's ⋮ menu.
- Boss bar in layout A, "Classic RPG" look: the fill follows the actor's HP data on every client, a damage trail
  catches up; HP numbers for the GM only.
- Several bosses stack; a hidden token's bar is hidden from players and dimmed for the GM; defeat (0 HP, dead
  status or defeated in the tracker) empties and dims the bar.
- Players may collapse a bar (world setting); the state is per scene and per client.
- "Active bosses" panel in the token controls: show, hide, hide all.
- Writes go through the active GM (`User#query` from other GMs); bars of deleted tokens and removed profiles are
  cleaned up automatically.

## 0.1.0

- Build skeleton: TypeScript, Vite, Vitest, SCSS, linters; `npm run check / deploy / release`.
- Module manifest for Foundry 14 and dnd5e 5.3.3, English and Russian.
- Empty overlay over the Foundry interface and a fixture stand (`npm run stand`).
