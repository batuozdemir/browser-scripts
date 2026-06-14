# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

A collection of Tampermonkey userscripts that enhance AI web interfaces. No build step — files are plain `.user.js` scripts installed directly into a userscript manager.

| Script | Target | Purpose |
|--------|--------|---------|
| `claude-enhancer.user.js` | `claude.ai/*` | Model/effort/thinking preset buttons, incognito toggle, keybindings |
| `gemini-enhancer.user.js` | `gemini.google.com/*` | Model+thinking preset buttons, temp chat, keybindings |
| `ai-studio-enhancer.user.js` | `aistudio.google.com/prompts/*` | Combined model+thinking preset buttons (Lite/F/FX/P/PX) + temp chat + URL-param automation (model, thinking, search, system prompt) |

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
- After any change: bump `@version`, ensure no debug `console.log` remains, and verify the IIFE/singleton guard is intact.
- When needed, update `README.md`