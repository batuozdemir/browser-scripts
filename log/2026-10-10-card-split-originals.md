# 2026-10-10: tampermonkey card split, original lines that were corrected

On 2026-10-10 the old card (11,203 characters) was split into a short `CLAUDE.md`, `NOTES.md` and this log. Four lines pointed at paths that do not resolve from the repo root, so the card now carries corrected wording. The originals are kept here unchanged.

**Generated build** (`h5player/`). `h5player-lite.user.js` is a patched build of
  or `h5player/build.sh` and re-run `./build.sh`; the built file is committed as
- Bump `PATCH` in `build.sh` on every rebuild (reset to `1` when rebasing onto a
- After any change to a hand-written script: bump `@version`, ensure no debug `console.log` remains, and verify the IIFE/singleton guard is intact. For `h5player/`, bump `PATCH` in `build.sh` and rebuild instead.

Corrections: `h5player-lite.user.js` and `build.sh` live in `h5player/`, and `./build.sh` is run from that directory.
