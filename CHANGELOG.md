# Changelog

## 0.7.0

- Boss phases (profile tab "Phases", up to 6): the first is the start of the fight, later ones begin below an HP
  threshold, as a form or by hand. Thresholds only go forward; one hit through several lands on the last, as one
  change. The active GM changes the phase exactly once (reloads and a second GM client included) and catches up on
  what happened while no GM was online. A wounded boss shows up straight in its phase.
- Forms: at 0 HP before a form the bar moves onto the nearest token of the form's actor on the scene (one per actor:
  onto all its tokens), keeping the boss's profile, name and look; HP, mini-bars and statuses come from the new token.
  Without such a token the form waits: the GM is told, the bar stays (not defeated, not auto-hidden), and "Bind
  selected token" in "Active bosses" finishes it.
- Entering a phase may change the label ("Phase II" by default), name, title, portrait and single look categories;
  the changes add up from phase to phase. "Play" shows a phase's entry on the tab's preview.
- Fill with phases (Main tab): segments (the bar is all HP, ticks at the thresholds, "Ticks for players" on by
  default) or refill (the bar is the HP of the current phase). The fill preset's segments gain "At phase thresholds"
  (gaps instead of thin ticks).
- Phase change effect in the "Appearance and exit" category: frame crack, flash, refill sweep, palette blend, banner
  with the phase name (Classic RPG: flash and banner). Reduced motion keeps the flash, the blend and the banner.
- "Active bosses": pick a boss's phase (picking is not healing: a boss at 0 HP stays defeated), see a waiting form and
  bind the selected token. The workshop's test console gets "Next phase".
- Fixed: removing a category override in the workshop did not stick (profile writes merged into the stored flag);
  profiles are now written whole.
- Data versions: scene instances 3 and the look library 2, so 0.6.0 leaves 0.7.0 data untouched. Profiles stay at 2.

## 0.6.0

- Look engine: a look is one preset per category — layout (bar and card), font, frame, fill and colour, HP change
  effect, appearance and exit, portrait, mini-bar and status style. Bosses pick a look and may override single
  categories; elites wear their rank's look. The default is "Classic RPG".
- Built-in looks "Classic RPG", "Permafrost" and "Neon" with the bar and card layouts A (classic), B (HP ring around
  the portrait, icon cards with a ring) and C (cinematic banner, portrait tiles). The other themes come with 1.0.
- Rendered in CSS: portrait placement and shape, bar shape (thick, thin, segmented, ring), name and extras placement,
  frames (classic, double, inset, own 9-slice image) and corner ornaments, solid, gradient and texture fills, colour
  by % HP, segments, gloss and edge glow, two-colour names, outline and glow. Live fills show their palette with a
  moving sheen until the WebGL fills arrive.
- Effects: shake and flash scaled by damage, crack on heavy damage, rise and wave on healing, pulse or flicker at low
  HP, a configurable damage trail, entries (slide, open from the centre, fade, typed name) and exits (dissolve or a
  "Defeated" banner). Reduced motion keeps only opacity changes.
- "Looks and presets" library (module settings and the panel): search, built-in / own filter, copy, edit own presets
  with live previews, delete, JSON import and export (256 KB limit), preview sheet per category.
- "Look workshop" (boss profile, Main tab): pick the look and overrides with a live bar and a test console, copy the
  look, apply to the profile. Ranks get a look picker.
- Fonts Cormorant, Philosopher and Russo One (OFL 1.1, latin and cyrillic) load only when shown. GM fonts (woff2),
  frame images and fill textures through the FilePicker.
- Status limits and the temp HP shield moved into the look (Classic RPG keeps 10 / 4 and the shield). Ranks move to
  data version 2 (0.5.0 leaves 0.6.0 ranks untouched).

## 0.5.0

- Auto-show (profile tab "Auto-show"): the active GM shows enemies when combat reaches round 1 and hides them after a
  delay when combat ends or when they fall (0 HP, the dead status or defeated in the tracker; ×N: all tokens).
  Healed before the delay, an enemy stays shown. Defaults: show off, both hides on, 3 s.
- Statuses on the boss bar (10) and on elite cards whose rank shows statuses (4), the rest as "+N": the effects
  Foundry draws on the token, without Midi QOL bookkeeping (reaction, bonus action, flanking) or DAE's dependent
  duplicates; DAE stacks as a badge. Tooltip: name, remaining time, description as text.
- Hide statuses per profile by condition or effect name; bosses get custom statuses (icon, name, description),
  switched on per boss from the "Active bosses" panel.
- Mini-bars (up to 6 per profile): temporary HP, legendary actions and resistances, item uses, a number by `system.`
  path, or a GM counter set with ± in the panel. Bar or pips, "visible to players"; the GM sees numbers, players never
  do; ×N sums them. Elite cards show them when the rank shows the fill.
- Temporary HP shield: a blue segment right after the fill (players see it without numbers).
- The new profile and instance fields are optional: data versions stay at 2, and 0.4.0 leaves them untouched.

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
