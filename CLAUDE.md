# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A collection of standalone vanilla HTML/CSS/JS mini web projects (Korean UI text). Each project is a single self-contained `index.html` file — no build step, no dependencies, no package manager, no bundler. `bara-aje-app/` is the one exception (see below).

| Folder | Description |
| --- | --- |
| `art-playground/` | Generative art canvas (flow field, spirograph, orbiting particles) controlled by sliders; supports PNG export |
| `beat-sequencer/` | 16-step drum sequencer using Web Audio API oscillators/noise buffers for on-the-fly drum synthesis (no audio files) |
| `number-puzzle/` | 2048 clone, keyboard arrows / touch swipe controls |
| `pomodoro-tracker/` | Pomodoro timer integrated with a to-do list |
| `bara-aje-app/` | Private family PWA (메신저/추억사진/캘린더) for 4 members, backed by Firebase (Auth + Firestore) and Cloudinary (photo storage) |

## Running

There is no dev server or build process. Open a project's `index.html` directly in a browser:

```bash
start art-playground/index.html   # Windows
open art-playground/index.html    # macOS
```

No install, lint, test, or build commands exist in this repo — each project is a single file edited and reloaded directly in the browser.

## Architecture notes

- Each project folder is fully independent: one `index.html` containing inline `<style>` and `<script>` — no shared code, assets, or components between projects. Changes to one project never affect another.
- All persistence is client-side via `localStorage`, scoped per project with versioned keys:
  - `number-puzzle`: `puzzle2048_best` (high score)
  - `pomodoro-tracker`: `pomo_tasks_v1` (tasks), `pomo_stats_v1` (daily/total pomodoro counts)
  - `beat-sequencer`: `beatpattern_v1` (saved step pattern + BPM, via explicit save/load buttons rather than auto-save)
- `beat-sequencer` synthesizes all drum sounds (kick/snare/hihat/clap/tom) at runtime with `AudioContext` oscillators and generated noise buffers — there are no audio asset files. Playback uses a lookahead scheduler pattern (`scheduler()` + `setTimeout`) rather than a naive `setInterval` per step, to keep timing accurate.
- `art-playground` and `number-puzzle` render via `<canvas>`/absolutely-positioned DOM tiles respectively, driven by `requestAnimationFrame` loops reading current slider/select values on each frame — there is no separate state-diffing layer.
- Dark-themed UI conventions are consistent across projects but implemented independently in each file's `<style>` block via CSS custom properties (`--bg`, `--panel`, `--accent`, etc.) — there is no shared stylesheet or design-token file.

### `bara-aje-app/` (exception to the single-file convention)

Unlike the other projects, `bara-aje-app/` is split into multiple files (`index.html`, `css/style.css`, `js/*.js`) because it has real backend state (auth, realtime chat, shared calendar/photos) shared live across 4 family members' devices — a single inline file would be unmanageable and a shared backend can't be done with pure static files + `localStorage` like the other projects.

- **Backend**: Firebase Auth + Firestore (config in `js/firebase-config.js`, safe to expose client-side — access is controlled by `firestore.rules`, not by hiding the config). Photo files are hosted on Cloudinary (unsigned upload preset), not Firebase Storage, to avoid requiring a billing card on the Firebase project.
- **Login**: not public signup — a fixed picker of 4 known family members, each backed by a synthetic Firebase Auth email (e.g. `dad@ourfamily.local`) and a 4-digit PIN. First PIN entry for a given profile creates that member's account on the spot.
- **JS modules loaded via CDN `<script type="module">` imports** (`https://www.gstatic.com/firebasejs/...`) — no npm/bundler, consistent with the rest of the repo's no-build-step philosophy.
- **PWA**: `manifest.json` + `sw.js` (app-shell cache only; Firestore/Cloudinary requests pass through uncached). `sw.js` caches specific file paths by name — after adding/removing/renaming any shell file (new `js/*.js` module, etc.), bump `CACHE_NAME` in `sw.js` and update `SHELL_FILES`, otherwise the service worker will keep serving stale cached files to already-installed clients.
- Firestore security rules live in `firestore.rules` in this folder but are **not** auto-deployed — there's no Firebase CLI login configured, so rule changes must be pasted manually into the Firebase console (Firestore Database → Rules → paste → Publish) by whoever owns the `bara-aje-app` Firebase project.
