# Boss Bars 5e API

For macros and other modules. Foundry VTT 14, dnd5e 5.3.3.

```js
const api = game.modules.get("boss-bars-5e").api;
```

The object is frozen and set during `init`; `api.version` is `1`. When the HUD is ready, the hook
`boss-bars-5e.ready` fires with the API as its argument.

## Pointing at a bar

Methods that act on a shown boss bar or elite card take an `instance`, which can be:

- a token (a `TokenDocument` or a placeable `Token`, e.g. from `canvas.tokens.controlled`) — the bar or card that
  covers it;
- an entry returned by `getActive()`;
- the instance id from such an entry.

If nothing shown matches, the call fails with `BB5E.Error.NoInstance`.

## Methods

Every method except `getActive` is for GMs and returns a Promise. Writes resolve once the active GM has checked and
saved the change, so another GM can call them too; they fail if no GM is online.

| Method | What it does |
|---|---|
| `show(tokenOrActor, { sceneId? })` | Shows the bar or card of a token. An actor shows its tokens on the viewed scene (or `sceneId`): one bar for a "one per actor" profile, one per token otherwise. Something already shown is a success. The token's actor needs a Boss Bars profile |
| `hide(instance)` | Hides one bar or card |
| `hideAll(sceneId?)` | Hides everything on the viewed scene (or `sceneId`) |
| `setPhase(instance, phase)` | Moves a boss to a phase: its id or its number from 1. A form phase moves the bar to the form's token, as from the panel |
| `say(instance, quoteOrText)` | A string equal to a quote id of the profile says that quote (next line of its pool, no cooldown); anything else is shown as your own text (up to 200 characters) |
| `playEffect(instance, effect)` | Plays `"damage"`, `"heal"`, `"phase"` or `"defeat"` on every client, changing nothing. Elite cards play only `"damage"` and `"heal"`. `"defeat"` shows the defeat banner (and ash for a "dissolve" look); the bar stays |
| `setCounter(instance, miniBarId, value)` | Sets a counter mini-bar (an integer, clamped to its maximum) |
| `toggleStatus(instance, statusId, on?)` | Switches a custom status of the boss profile; without `on` it flips |
| `getActive(sceneId?)` | What this client's HUD shows on the viewed scene (or `sceneId`), see below. Synchronous, read only, also for players |
| `openEditor(actor)` | Opens the hub on the Boss Bars profile of an actor (a new one if it has none) |
| `openPanel()` | Opens the hub on "On the scene" |
| `layoutMode(on?)` | Opens (`true`) or closes (`false`) the client-local HUD preferences/reset panel, flips it without an argument; resolves to the new state |

Ids of phases, quotes, counters and custom statuses are internal: read them from a GM's `getActive()`.

### Errors

A refused call shows a notification and rejects with an `Error` whose `code` is the reason and whose `message` is
its translation:

| `code` | Reason |
|---|---|
| `BB5E.Error.NotGM` | Called by a player (nothing is sent) |
| `BB5E.Error.NoGM` | No GM is online to write the change |
| `BB5E.Error.NoInstance` | No such bar or card is shown |
| `BB5E.Error.NoToken` | The actor has no token on the scene |
| `BB5E.Error.NoProfile` | The token's actor has no Boss Bars profile |
| `BB5E.Error.NoSuchPhase` | The boss has no such phase (or no phases) |
| `BB5E.Error.NoQuote` | The boss has no such quote |
| `BB5E.Error.NoCounter` | The profile has no such counter mini-bar |
| `BB5E.Error.NoSuchStatus` | The boss has no such custom status |
| `BB5E.Error.Cancelled` | A `preShow` / `preHide` hook returned `false` |
| `BB5E.Error.Invalid` | A bad argument, or the stored data is unreadable |
| `BB5E.Error.NewerData` | The scene was saved by a newer Boss Bars 5e version and is left alone |

### `getActive` entries

An array of frozen objects, boss bars first, then elite cards:

```js
{
  id: "wLZUph61BPBCMjPb",   // instance id
  sceneId: "n1n1NloBexVDQ22F",
  kind: "boss",             // or "elite"
  tokenId: "eFYBIJQGmtd4f4Bf", // null for a "one per actor" bar
  actorId: null,            // set for a "one per actor" bar
  label: "Ashen Dragon",    // the name players see, numbered like on screen
  fraction: 0.62,           // HP share as shown, null when unknown
  defeated: false,
  phase: { label: "Phase II" }, // bosses only; null without phases
  quote: "Kneel!",          // bosses only: the quote on screen, or null
}
```

A GM's entries also carry `hp` (`value`, `max`, `temp`), `phase.id`, `phase.waiting` (a form waits for its token),
`phases` (`id`, `label`), `quotes` (`id`, `trigger`), `counters` (`id`, `label`, `value`, `max`) and, for bosses,
`statuses` (`id`, `label`, `active`). A player's entries never include bars of hidden tokens, HP numbers, the phase
list or a waiting form.

## Hooks

| Hook | Where | Argument |
|---|---|---|
| `boss-bars-5e.ready` | every client, once the HUD is up | the API |
| `boss-bars-5e.preShow` | the active GM, before a bar is saved | `{ sceneId, tokenId, actorId, kind }` |
| `boss-bars-5e.preHide` | the active GM, before a bar is removed | `{ id, sceneId, kind }` |
| `boss-bars-5e.show` | every client, after a bar or card appears | `{ id, sceneId, kind }` |
| `boss-bars-5e.hide` | every client, after it is gone | `{ id, sceneId, kind }` |
| `boss-bars-5e.phaseChange` | every client | `{ id, sceneId, kind, phase, previous }` |
| `boss-bars-5e.quote` | every client, when a quote appears | `{ id, sceneId, kind, text }` |
| `boss-bars-5e.defeated` | every client, when a bar or card falls | `{ id, sceneId, kind }` |

- `preShow` and `preHide` run for every source: the API, the panel and token HUD buttons, automatic show and hide
  in combat. Return `false` to keep the change from being written. `hideAll` asks `preHide` for each bar and hides
  the rest. Removing bars of deleted tokens does not ask.
- `phase` and `previous` are `{ label }`, plus `id` for GMs. A bar shown straight into a phase (a wounded boss)
  fires `show` only. A form moving the bar to another token is not a `hide` and `show`.
- Defeat follows the auto-hide rule: 0 HP, the defeated status or a defeated combatant, but not while a form phase
  is still ahead. Nothing fires for what was already defeated when the page loaded.
- Players get these hooks only for bars and cards their HUD shows.

## Macros

Show the boss of each selected token:

```js
const api = game.modules.get("boss-bars-5e").api;
for (const token of canvas.tokens.controlled) await api.show(token);
```

Move the selected boss to its second phase:

```js
const api = game.modules.get("boss-bars-5e").api;
const [token] = canvas.tokens.controlled;
if (token) await api.setPhase(token, 2);
```

Make the selected boss say something (a quote id from `getActive()` works too):

```js
const api = game.modules.get("boss-bars-5e").api;
const [token] = canvas.tokens.controlled;
if (token) await api.say(token, "You will kneel before the ash!");
```

Hide every bar and card on the viewed scene:

```js
await game.modules.get("boss-bars-5e").api.hideAll();
```

List phase and quote ids of the shown bosses in the console:

```js
for (const entry of game.modules.get("boss-bars-5e").api.getActive()) {
  console.log(entry.label, entry.phases, entry.quotes);
}
```

## Hook examples

Keep bars hidden while a cut-scene runs (in a world script or another module):

```js
let cutScene = false;
Hooks.on("boss-bars-5e.preShow", () => !cutScene);
```

Play a sound for everyone when a boss changes phase:

```js
Hooks.on("boss-bars-5e.phaseChange", ({ kind }) => {
  if (kind === "boss") foundry.audio.AudioHelper.play({ src: "sounds/drums.wav" }, false);
});
```
