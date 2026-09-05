# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

A collection of userscripts. Two kinds of file live here, and they are edited
very differently:

**Hand-written scripts** (repo root). Plain `.user.js` files installed directly
into a userscript manager. No build step. Edit them in place.

| Script | Target | Purpose |
|--------|--------|---------|
| `claude-enhancer.user.js` | `claude.ai/*` | Model/effort/thinking preset buttons, incognito toggle, keybindings |
| `gemini-enhancer.user.js` | `gemini.google.com/*` | Model+thinking preset buttons, temp chat, keybindings |
| `ai-studio-enhancer.user.js` | `aistudio.google.com/prompts/*` | Combined model+thinking preset buttons (Lite/F/FX/P/PX) + temp chat + URL-param automation (model, thinking, search, system prompt) |
| `chatgpt-enhancer.user.js` | `chatgpt.com/*` | Intelligence preset buttons, left-Cmd reasoning cycle, temp chat, URL-param automation, keybindings |
| `autoplay-bypass-ads.user.js` | streaming sites | Right-click unblock, initial play click, ad skip |
| `youtube-subtitles.user.js` | `youtube.com/*` | Repaints auto-generated captions as stable movie-style subtitle chunks |

`youtube-subtitles.user.js` is the one hand-written script with tests:
`node youtube-subtitles.test.js`. Its pure segmentation functions are exported
when `window` is undefined, which is the only reason the file is requireable
from Node — keep that guard if you refactor. It is also the only script here at
`@run-at document-start`, and that is load-bearing: YouTube fetches the caption
track once and caches it, so a later hook sees nothing. Read the `AI AGENT
NOTES` banner in the file before changing any caption logic.

**Generated build** (`h5player/`). `h5player-lite.user.js` is a patched build of
third-party upstream `xxxily/h5player` and is **generated, not authored**.

- **Never hand-edit `h5player/h5player-lite.user.js`.** Change `h5player/config.js`
  or `h5player/build.sh` and re-run `./build.sh`; the built file is committed as
  an artifact so the raw URL works.
- The build anchors every edit on a string that must appear exactly once upstream
  and aborts otherwise. If a build fails on an anchor or the version gate, upstream
  has changed: re-derive the edits against the new source, do not loosen the anchor.
- Bump `PATCH` in `build.sh` on every rebuild (reset to `1` when rebasing onto a
  new upstream version). Never a bare upstream version, never a hyphenated segment.
- Read `h5player/README.md` before touching anything in that directory.

## License

The whole repository is **GPL-3.0-or-later** (it was MIT until h5player-lite, a
derivative of the GPL-3.0 `xxxily/h5player`, was added). Every `.user.js` carries
`@license GPL-3.0-or-later` in its metadata block; keep it there on new scripts.
`h5player/README.md` carries the GPL section 5 modification notice and must stay
accurate if the patch set changes.

## Code Conventions

All scripts follow these rules (from `.github/copilot-instructions.md`):

- **IIFE wrapper:** every script is wrapped in `(function() { 'use strict'; })();`
- **No `setTimeout` magic numbers** for waiting — use `MutationObserver` / `waitForElement` patterns
- **Centralized selectors:** all CSS selectors live in a `SELECTORS` (or `SELECTORS` + `EFFORT_TESTID`) const at the top of the file
- **Log prefix:** all `console.log` calls must use `[ScriptName]` prefix
- **`@grant none`** unless a GM API is actually used
- **Version bump** on every logic change (`x.y.z`; magnitude reflects impact)
- **Singleton guard** for SPA re-entry (e.g. `window.__geminiEnhancerLoaded`)
- **Main-page guard** for scripts that must not run in iframes: `if (window.self !== window.top) return;`

## Architecture Patterns

### SPA survival
Buttons are injected via `MutationObserver` that watches for the toolbar container to disappear/reappear on navigation. A backup `setInterval` fires for ~30 s after load as a safety net.

### Menu automation (claude-enhancer, gemini-enhancer)
Both scripts use a **two-step menu** pattern:
1. Open model menu → select model (this closes the menu)
2. Re-open menu → navigate to nested submenu → set options → close

Menus render as `.z-popover` portals at `<body>` level. During automation they're hidden with `visibility:hidden` (so `.click()` still works without visual flicker).

### Selector stability notes
- **Claude:** model rows have **no stable testid** — match by family text (`Opus`/`Sonnet`/`Haiku`/`Fable`). Effort options *do* have stable testids: `effort-option-{low,medium,high,max}`.
- **Gemini:** model options use hash-based `data-test-id` values (e.g. `bard-mode-option-56fdd199312815e2`) that can change on Google's end. Always keep `findMenuItemByLabel()` as a text-match fallback.
- **AI Studio:** all selectors centralized in `SELECTORS` const; re-inspect after Google UI updates.

## Agent Workflow Notes

- When a selector breaks, ask the user for "Inspect" input (right-click → Inspect on the target element) rather than guessing.
- The in-file `AI AGENT NOTES` banners at the top of each script list features that must not be removed or refactored — read them before editing.
- After any change to a hand-written script: bump `@version`, ensure no debug `console.log` remains, and verify the IIFE/singleton guard is intact. For `h5player/`, bump `PATCH` in `build.sh` and rebuild instead.
- When needed, update `README.md`
