# Changelog

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
