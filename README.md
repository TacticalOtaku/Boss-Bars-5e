# Boss Bars 5e

RPG boss bars and elite cards for important enemies in Foundry VTT (D&D 5e).

A boss gets a large bar over the scene: portrait, name, title, an HP fill with a damage trail, phases, quotes, its
own music and a look of its own. Lesser but notable enemies get compact cards in an elite column, sorted by rank.
Players see how hurt an enemy is, never its HP numbers.

- Foundry VTT 14 (verified 14.367), dnd5e 5.3.3; Midi QOL 14 is supported, not required.
- Languages: English, Russian.

## Quick start

1. Right-click the skull button on a token's HUD (or use **Boss Bars profile** in the actor sheet's ⋮ menu) and set up a
   profile: boss or elite, the name players see, portrait, one bar per token or one per actor.
2. Click the skull button to show or hide the bar. The **Active bosses** button in the token controls opens the GM
   panel for the whole scene.
3. Fight. The fill follows HP from the actor's data, whatever changed it.

Only GMs change bars; when several GMs are online, the active GM writes every change.

## Features

- **Boss bars.** Fill with a lingering damage trail, temp HP shield, defeat banner or effect, collapse for players.
  Several bosses stack.
- **Elite column.** Cards by rank (editor in the module settings: name, colour, icon size, which parts show), "one
  per token" with numbered names or "one per actor" with ×N, a "+N" limit.
- **Statuses.** The token's effect icons with tooltips; Midi QOL bookkeeping and DAE duplicates are left out. Hide
  more by name, or add custom boss statuses switched on from the panel.
- **Mini-bars.** Up to six under a boss bar or inside a card: temp HP, legendary actions and resistances, item uses,
  any `system.` path, or a manual counter. Each can be hidden from players.
- **Auto-show.** Show when combat reaches round 1, hide when it ends or when the enemy falls, after a delay.
- **Layout mode.** From the panel: drag the boss stack and the elite column, with guides, anchors to nine points,
  a warning when a block covers Foundry's own UI or leaves the screen, and screen size previews. Saves for the world or for one scene.
- **Looks.** 17 built-in looks (frame, fill, name, effects, statuses, extras, motion, layout), 9 bar layouts and
  4 card layouts with sizes S to XL, 30 fonts with Latin and Cyrillic. Boss bars, elite card plates and portrait
  frames are drawn by one WebGL2 shader: lit materials (liquid, energy, flame, ice, void, gradient), carved patterns,
  drifting motes, and hit, heal, phase, defeat and appear effects that spill past the bar. Without WebGL2 they fall
  back to CSS. The library (module settings) copies, edits, imports and exports looks and presets; the workshop in
  the profile overrides single categories with a live preview.
- **Phases.** Up to six: start of the fight, below an HP threshold, a form (the bar moves to another actor's token)
  or by hand. Each can change the name, title, portrait, look and music, with a phase change effect. The bar shows
  all HP with threshold ticks, or refills per phase.
- **Quotes.** Lines over the bar on eleven triggers: shown, phase, HP below, a big hit, healed, its turn, a status,
  a critical hit, a miss, defeat, or only by hand. Pools, order, cooldowns, once per fight, priorities; the GM can
  also type a line in the panel.
- **Music.** A track or playlist per boss and per phase: what plays fades out and resumes after the fight.
- **Reduced motion.** `prefers-reduced-motion` and Foundry's low performance mode turn off shaking, particles and
  moving fills.
- **API and hooks** for macros and other modules: see [API.md](API.md).

## Good to know

- Players never see enemy HP numbers, phase lists or quotes before they are said, but the profile (phases, quotes)
  and HP live in the actor's flags and data: a player can read them through the browser console. The module only
  does not show them.
- The "critical hit on the boss" and "attack misses the boss" quotes work only when the attacker targeted the boss
  before rolling. A target picked after the roll is not known.
- Music switches only on the scene the players stand on (the active scene).

## License

MIT. Fonts in `fonts/` are under the SIL Open Font License 1.1 (license texts next to them).
