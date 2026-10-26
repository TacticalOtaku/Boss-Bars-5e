# Changelog

## 0.11.0

- The full catalog: 30 built-in looks — Classic RPG, Ash and Flame, Permafrost, Storm, Undead, Abyss, Inferno,
  Celestial Light, Forest Spirit, Poison Bog, Dragon Scale, The Deep, Gothic, Ancient Rus, Runestone, Desert King,
  Clockwork, Neon, Glitch, Astral, Shadow, Parchment and Ink, Minimal, Pixel, Nightmare, Crystal, Beast Fury, Royal
  Court, Plague and Rot, Steel and Blood. Each brings its own preset in all eight styled categories (240 presets,
  named after the theme), including live fills, sparks, phase change effects and the quote place.
- 30 structural layouts for the boss bar and 30 for the elite card: classic, HP ring, cinematic banner, compact, wide,
  portrait on the right or on top, no portrait, medallion, notched portrait, thin, segmented, two rows, name inside
  or below, extras on the side or on the portrait, colossus, banner, slim and more.
- 30 fonts with Cyrillic and Latin (SIL OFL 1.1, license texts in `fonts/`): Cormorant, Yeseva One, Philosopher,
  Jura, Triodion, Oranienbaum, Rubik Wet Paint, Cormorant Unicase, Kurale, Underdog, Alegreya SC, Viaoda Libre,
  Ponomar, Ruslan Display, Tektur, Forum, Exo 2, Russo One, Rubik Glitch, Prata, Shafarik, Marck Script, Unbounded,
  Press Start 2P, Bad Script, Playfair Display SC, Oi, Bona Nova SC, Neucha, Dela Gothic One. A font file is
  downloaded only when a bar in that font is shown.
- Permafrost now uses the medallion layout, so its live ice shows; Crystal takes the HP ring. Layouts with a
  medallion put the name under the bar.
- Saved profiles and ranks keep their looks: built-in ids did not change, data versions stay the same.

## 0.10.0

- Live fills on boss bars: liquid, energy, flame, ice and void are now drawn by WebGL2 shaders on the look's palette
  (2–5 colours), including the HP share, which catches up smoothly. One WebGL context serves every bar on the page
  (its frame is copied into each bar), so many bars never hit the browser's context limit.
- About 15 frames per second at rest, 60 while the fill catches up, none when no live bar is visible. Collapsed and
  leaving bars and background tabs are not drawn. Reduced motion shows a still frame.
- Without WebGL2, or when the GPU drops the context, a bar falls back to the CSS version of the same palette at once
  and goes live again when the context returns. Elite cards keep their CSS fills.
- Particles on the HUD: sparks fly from the fill's edge on damage (new HP effect options "Sparks on damage" and "Spark
  colour"; more sparks for bigger hits) and a defeated bar with the "dissolve" exit crumbles into ash. One canvas
  exists only while particles live, at most 200 at a time; none with reduced motion.
- Built-in looks: Permafrost gets icy sparks, Neon magenta ones, Classic RPG golden sparks.

## 0.9.0

- Boss music (profile tab "Music"): a track or a whole playlist (played in its own mode), a priority and a
  transition length (2 s by default); a phase can bring its own music ("On entering the phase"), which then stays.
- When the first boss with music is shown on the scene the players stand on, whatever plays fades out and is
  remembered with its place; the boss's music fades in. With several bosses the highest priority plays (then the
  larger bar, then the one shown first); a change of leader or a phase with music crossfades.
- When the last boss with music leaves (hidden, defeated, off the active scene), its music fades out and the
  remembered tracks resume from where they stopped. A hidden boss does not start its music.
- The module only touches what it started or stopped itself: tracks the GM starts or stops during the fight are left
  alone. Transitions change a track's `fade` only for the transition and put the original back, after a reload too.
- New hidden world setting `music` (data version 1) keeps what the module changed; profiles stay at version 2.

## 0.8.0

- Boss quotes (profile tab "Quotes", up to 30): a line over the bar when the bar is shown, a phase begins, HP falls
  below a share (once per fight), one hit takes at least a share, the boss is healed, its turn starts, it gains a
  status, a critical hit or a miss lands on it, it is defeated, or only by hand. Each quote has up to 10 variants
  (random or in turn), "at most once per N rounds", "once per fight" and an automatic or own duration.
- One quote at a time: defeat > phase entry > manual > the rest; a more important line on screen is not cut off.
  Cooldowns, "already said" and the variant cursor live in the scene, so a GM reload never repeats a line, and a
  player who reloads sees the rest of the current one.
- The active GM decides; quotes need a GM online. HP, healing, statuses, defeat and phases come from the data, the
  turn from the combat tracker, crits and misses from the chat: dnd5e attack rolls and Midi QOL cards (full
  automation). Crit and miss need the attacker to target the boss before rolling (see the README).
- `{name}` is the bar's name as players see it, `{attacker}` the attacker's token (crit and miss).
- "Active bosses": say a quote of the profile or your own line. The workshop's test console gets "Quote"; ▶ in the
  Quotes tab plays a line on the preview.
- The bar layout gains "Quote" (above, below, beside); the cinematic layout C puts it below.
- Data versions: the look library 3 (look presets now keep parameters they do not know); profiles 2 and scene
  instances 3 stay.

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
