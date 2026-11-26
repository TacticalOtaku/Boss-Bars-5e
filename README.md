<div align="center">

**English** · [Русский](README.ru.md)

# Boss Bars 5e

**RPG boss bars and elite cards for important enemies in Foundry VTT (D&D 5e)**

WebGL2 shader-drawn bars, multi-phase encounters, custom looks, boss quotes, music tracks, and per-client HUD positioning — without ever revealing exact HP numbers to players.

[![Release](https://img.shields.io/github/v/release/TacticalOtaku/Boss-Bars-5e?style=flat-square&label=Release&color=b8860b)](https://github.com/TacticalOtaku/Boss-Bars-5e/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/TacticalOtaku/Boss-Bars-5e/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/TacticalOtaku/Boss-Bars-5e/actions/workflows/ci.yml)
[![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-v14_%2814.367%29-ff6400?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e](https://img.shields.io/badge/D%26D_5e-5.3.3%2B-c62828?style=flat-square)](https://github.com/foundryvtt/dnd5e)
[![Languages](https://img.shields.io/badge/Languages-EN_%7C_RU-2e7d32?style=flat-square)](lang/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-3b82f6?style=flat-square)](LICENSE)

[Installation](#installation) · [Quick Start](#quick-start) · [Features](#features) · [Good to Know](#good-to-know) · [API](API.md) · [Development](#development)

</div>

---

## Installation

In Foundry VTT (**Setup → Add-on Modules → Install Module**), paste the **Manifest URL**:

```text
https://github.com/TacticalOtaku/Boss-Bars-5e/releases/latest/download/module.json
```

**Requirements:** Foundry VTT **14** (verified `14.367`), D&D 5e **`5.3.3+`**. **Midi QOL 14** is supported optionally, not required.  
**Manual install:** Download `boss-bars-5e-v<version>.zip` from [GitHub Releases](https://github.com/TacticalOtaku/Boss-Bars-5e/releases/latest) and extract it into `Data/modules/boss-bars-5e`.

---

## Quick Start

A boss gets a large bar over the scene with a portrait, name, title, HP fill with lingering damage trail, phases, quotes, dedicated music, and its own visual style. Lesser notable enemies get compact cards in an elite column sorted by rank. Players see how hurt an enemy is, never its HP numbers.

1. Right-click the **skull** button on a token's HUD (or choose **Boss Bars profile** in the actor sheet's `⋮` menu) and configure a profile: **Boss** or **Elite**, player-visible name, portrait, and **one bar per token** or **one per actor**.
2. Click the **skull** button to show or hide the bar. The **Boss Bars** button in Token Controls opens the **Hub** — a single window for active scene bars, all profiles, elite ranks, and the look library.
3. Fight. The fill follows HP directly from the actor's data regardless of what changed it.

Only GMs modify bars; when multiple GMs are connected, the active GM writes every change.

---

## Features

- **Boss bars:** Fill with lingering damage trail, temp HP shield, defeat banner/effect, and player-side collapse toggle. Multiple bosses stack cleanly.
- **Boss Bars Hub:** One GM window for everything: **On the scene** (show, hide, phases, counters, quotes, local HUD preferences), **Profiles** (search, drop an actor, or use the selected token), **Elite ranks**, and **Look library** (prompts before discarding unsaved edits).
- **Elite column:** Cards sorted by rank (name, color, icon size, visible parts in **Elite ranks**), **one per token** with numbered names or **one per actor** with `×N`, plus a `+N` overflow limit.
- **Statuses:** Token effect icons with tooltips; Midi QOL bookkeeping and DAE duplicates are filtered out. Hide extra effects by name or toggle custom boss statuses from the Hub.
- **Mini-bars:** Up to 6 per boss bar or elite card — temp HP, legendary actions and resistances, item uses, any `system.` path, or a manual counter. Each can be hidden from players individually.
- **Auto-show:** Automatically reveal when combat reaches round 1 and hide on combat end or defeat after a configurable delay.
- **Personal HUD layout:** Drag each boss bar individually or move the elite column as one unit. Positions save automatically per client and scene across reloads. Keyboard navigation: focus with `Tab`, move with arrow keys (`Shift` for `10 px`), `Home` to reset, `Esc` to cancel drag.
- **WebGL2 Look Engine:** 17 built-in looks (frame, fill, name, effects, statuses, extras, motion, layout), 9 bar layouts and 4 card layouts (`S`–`XL`), and 30 bundled Latin + Cyrillic fonts. Drawn via one shared WebGL2 shader with lit materials (`liquid`, `energy`, `flame`, `ice`, `void`, `gradient`), carved patterns, drifting motes, and spill-over hit/heal/phase/defeat/appear VFX (falls back automatically to CSS and 2D sparks when WebGL2 is unavailable). The Look library copies, edits, imports, and exports looks and presets with live previews.
- **Phases:** Up to 6 phases triggered at fight start, below an HP threshold, by a form switch (moving the bar to another actor's token), or manually. Each phase can override name, title, portrait, look, and music with a transition effect, showing either total HP with threshold ticks or refilling per phase.
- **Quotes:** Lines displayed over the bar on 11 triggers: shown, phase, HP below, big hit, healed, turn start, status added, critical hit, miss, defeat, or manual. Supports quote pools, random/cycle order, cooldowns, once-per-fight flags, priorities, and ad-hoc lines typed in the Hub.
- **Music:** Track or playlist per boss and per phase; existing music fades out and resumes after the fight.
- **Reduced motion:** Honors `prefers-reduced-motion` and Foundry's low-performance mode to disable shaking, particles, and animated fills.

---

## Good to Know

- **Console privacy:** Players never see enemy HP numbers, phase lists, or unspoken quotes in the UI, but actor data and flags exist on the client; players inspecting the browser console could still read raw actor data.
- **Crit & miss quotes:** `"critical hit on the boss"` and `"attack misses the boss"` triggers only fire when the attacker targeted the boss before rolling.
- **Music scope:** Music switches only on the scene currently active for players.

---

## API & Documentation

Macros and companion modules can control Boss Bars 5e via its public API and hooks — see [API.md](API.md).

| Document | Purpose |
| --- | --- |
| [API.md](API.md) | Public module API, hooks, and macro examples |
| [CHANGELOG.md](CHANGELOG.md) | Version-by-version release history |
| [GLOSSARY.md](GLOSSARY.md) | Domain terminology |
| [docs/spec.md](docs/spec.md) | Technical design specification |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Issue reporting guidelines |

---

## Development

Requires **Node.js 24+** (`npm ci`). GitHub Actions ([ci.yml](.github/workflows/ci.yml)) checks pushes to `main` on Node.js 24 and 26; tagged releases (`v*`) build and publish the archive and `module.json` via [release.yml](.github/workflows/release.yml).

```bash
npm ci               # Install dependencies
npm run check        # Typecheck, ESLint, Stylelint, Prettier, Vitest, Vite build, and HUD size check
npm run stand        # Launch local Vite preview stand
npm run deploy       # Deploy built module to Foundry Data/modules/boss-bars-5e
npm run package      # Package dist/boss-bars-5e-v<version>.zip from dist/module
npm run release      # Run check + package
```

---

## AI Disclosure

AI-assisted tools were used during development for tasks such as code drafting, refactoring, tests, documentation, and localization drafts. All architecture, code, behavior, user-facing copy, and Russian/English translations are reviewed, tested, and maintained by **TacticalOtaku**, who retains sole authorship and responsibility for the module.

All bundled package assets and user-facing materials comply with Foundry VTT's [AI Content Policy](https://foundryvtt.com/article/ai-policy/) — no pre-generated AI art, audio, or lore assets are included.

---

## Feedback & License

Pull Requests are disabled on this repository; bug reports and suggestions are welcome via [GitHub Issues](https://github.com/TacticalOtaku/Boss-Bars-5e/issues) (see [CONTRIBUTING.md](CONTRIBUTING.md)).

Released under the **GNU General Public License v3.0** ([LICENSE](LICENSE)). Bundled fonts in `fonts/` are licensed under the **SIL Open Font License 1.1** (license texts are included alongside each font).
