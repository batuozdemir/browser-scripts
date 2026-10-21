# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- path-lint-exempt: .user.js xxxily/h5player console.log .github/copilot-instructions.md -- file-name pattern, GitHub repo slug, code identifier, and a cited upstream rules file that is not in this repo -->

## Repository Overview

A collection of userscripts. Two kinds of file live here, and they are edited
very differently:

status: every script is committed on main (2026-10-12): youtube-subtitles 1.3.0, youtube-summary 2.0.1, chatgpt-enhancer 2.2.2 (button row fix, 2026-10-21, in Safari), claude-enhancer 2.1.1 (Temp placement fix, in Safari), gemini-enhancer 3.8.0, h5player-lite 4.3.5.7; all pushed to origin/main on 2026-10-21; real-use checks in Safari are still open, see `NOTES.md` "Open work".

**Hand-written scripts** (repo root). Plain `.user.js` files installed directly
into a userscript manager. No build step. Edit them in place.

The two YouTube scripts are the hand-written ones with tests:
`node youtube-subtitles.test.js` and `node youtube-summary.test.js`. `youtube-summary`
depends on `youtube-subtitles` (page world, owns the caption hook) and talks to it by
`postMessage`; read the banners in both before changing that handshake. Its pure segmentation functions are exported
when `window` is undefined, which is the only reason the file is requireable
from Node — keep that guard if you refactor. It is also the only script here at
`@run-at document-start`, and that is load-bearing: YouTube fetches the caption
track once and caches it, so a later hook sees nothing. Read the `AI AGENT
NOTES` banner in the file before changing any caption logic.

**Generated build** (`h5player/`). `h5player/h5player-lite.user.js` is a patched build of
third-party upstream `xxxily/h5player` and is **generated, not authored**.

- **Never hand-edit `h5player/h5player-lite.user.js`.** Change `h5player/config.js`
  or `h5player/build.sh` and re-run `h5player/build.sh`; the built file is committed as
  an artifact so the raw URL works.
- The build anchors every edit on a string that must appear exactly once upstream
  and aborts otherwise. If a build fails on an anchor or the version gate, upstream
  has changed: re-derive the edits against the new source, do not loosen the anchor.
- Bump `PATCH` in `h5player/build.sh` on every rebuild (reset to `1` when rebasing onto a
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

## Before doing X, read Y

- Before changing menu automation, selectors or SPA handling in an enhancer, read `NOTES.md` "Architecture patterns" (SPA survival, two-step menus, per-site selector stability).
- Before testing a script in the cmux browser, read `NOTES.md` "Testing in the cmux browser".
- Before proposing or building a new script, read `NOTES.md` "Script ideas Batu approved".
- Before touching a script, find the table row for it in `NOTES.md` "Scripts".
- Open work and the first checks for the next session are in `NOTES.md` "Open work" and "Next session starts here".

Traps (2026-09-29, testing in the cmux browser):

- The cmux tab runs on Batu's real account: every preset click in a test changes his saved
  model/effort. Note what it was before and put it back, or tell him what it is now.

## Agent Workflow Notes

- When a selector breaks, ask the user for "Inspect" input (right-click → Inspect on the target element) rather than guessing.
- The in-file `AI AGENT NOTES` banners at the top of each script list features that must not be removed or refactored — read them before editing.
- After any change to a hand-written script: bump `@version`, ensure no debug `console.log` remains, and verify the IIFE/singleton guard is intact. For `h5player/`, bump `PATCH` in `h5player/build.sh` and rebuild instead.
- When needed, update `README.md`
- **Never tell Batu a pushed change reached Safari.** Safari's Userscripts app does
  not update silently: it offers an Update button he has to press, and its own
  README calls the update process not correctly implemented. Pushing is not
  deploying. Copy the file into the app's scripts directory (that `cp` needs
  `dangerouslyDisableSandbox`; see `h5player/README.md`) and verify with `diff`.
  Violentmonkey on Thorium/Firefox is the only manager here that self-updates.

## LLM calls through Aperture (keyless)

When a new or changed script would be better with an LLM step (summarize, translate,
classify, rewrite what is on the page), say so to Batu and propose it. Batu asked for this
on 2026-10-09. Scripts call Aperture, the tailnet AI gateway, never a provider directly. Aperture knows
the caller from the Mac's Tailscale identity, so **no API key ever goes into a script**.
Endpoint `https://aperture.ladon-minor.ts.net/v1/messages` (Anthropic messages format), model
`claude-haiku-5-5`, the only Claude model Aperture serves today. State and how the config
is changed: `~/Workspace/infra/tailscale/aperture/README.md`.

A page `fetch` cannot reach it (Aperture sends no CORS headers, measured 2026-10-09): use
`GM.xmlHttpRequest` with `@connect aperture.ladon-minor.ts.net`. Use the HTTPS name, not
`http://100.78.187.17`. **On Safari the request is CORS-checked** (it comes from the
extension's background page, origin `safari-web-extension://<uuid>`); Aperture answers
only because Batu's grant sets CORS for that one origin on `/v1/messages`. A new endpoint
path or a reinstalled Userscripts (new UUID) means updating that grant in
`infra/tailscale/aperture/config.hujson`. A failed CORS check shows up in the script only
as GM's onerror; the real reason is in Develop → Web Extension Background Content →
Userscripts. On
Safari's Userscripts app (Batu watches and browses there) GM.* exists only with
`@inject-into content`, so a script that also needs the page world is split in two and
talks by `postMessage`, the way `youtube-summary` does. `youtube-summary.user.js` is the
first script built this way and the reference for the next one.
