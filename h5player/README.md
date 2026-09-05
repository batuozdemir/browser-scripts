# h5player-lite

A pruned, reconfigured build of the **h5player** userscript, cut down to video
speed control.

## Modified version notice

This is a **modified version** of [`xxxily/h5player`](https://github.com/xxxily/h5player),
built from upstream version **4.3.5** (released 2026-03-23). Upstream is written
by ankvps and licensed GPL-3.0; this modified version is distributed under the
same license, GPL-3.0-or-later. The original `@author` and `@namespace` metadata
are preserved in the built file, and the upstream source is fetched unmodified
before patching.

Upstream source used:
`https://greasyfork.org/scripts/381682/code/script.user.js`

### Modifications made to upstream

1. **Metadata.** `@name` becomes `h5player-lite` and the localized `@name:xx`
   variants are removed. `@version` becomes `4.3.5.2`. `@downloadURL` and
   `@updateURL` point at this repository. `@license` is stated explicitly as
   `GPL-3.0-or-later`. The `@icon` line (a ~9 KB base64 data URI) and the
   localized `@description:xx` variants are dropped, and `@description` is
   replaced with a short English one.
2. **Configuration override.** A block is injected just before
   `initUiConfigManager` that replaces the entire default hotkey table with the
   nine bindings below, disables the on-screen UI (`ui.enable: false`), and
   disables cross-origin control (`enhance.allowCrossOriginControl: false`).
3. **Chinese i18n tables removed.** The `zhCN` and `zhTW` language tables and
   their four `messages` entries are deleted. `I18n.t()` resolves
   `_languages[locale]`, then falls back to `_languages['en']`, so a Chinese
   browser locale degrades cleanly to English instead of breaking. `enUS` and
   `ru` are untouched.
4. **Chinese text removed.** All remaining CJK characters are stripped: 841
   Chinese comment lines are dropped and the rest are removed in place. This is
   safe because CJK never appears in executable code upstream (no CJK
   identifiers, object keys or operators), so removing the characters cannot
   change program structure.
5. **UI removal** *(not yet applied — see "Step 2" below)*. The `h5playerUI`
   module and its init block are deleted from the built file.

Nothing else is changed. The per-site compatibility table, the playback-rate
enforcement, and all remaining upstream behavior are untouched.

**One deliberate exception to the Chinese strip.** Thirteen CJK strings survive,
all of them attribute-selector *values* in the per-site table, such as
`button[aria-label="全屏"]` for zhihu and `div[title="网页全屏"]` for iqiyi. Those
are functional: emptying them would produce a selector that matches nothing and
would silently break fullscreen detection on those (Chinese) sites. Everything
CJK that is prose has been removed; these thirteen are code. They are the only
CJK left in the file, and `build.sh` asserts that count so a future strip cannot
quietly widen. Say the word if you would rather have them gone too.

## Why

Upstream binds a large default hotkey table across every site. Two things made
that a problem: `Enter` toggles web fullscreen, and hotkeys fire on pages that
have no video at all.

The second one is worth spelling out, because it only happens on some setups.
`hasCrossOriginVideoDetected` is set from a cross-tab `videoDetected` message,
inside a handler guarded by `window.GM_addValueChangeListener &&`. On Safari's
Userscripts app that guard is false and the code is dead, but on Violentmonkey
the listener is live: a video playing in *any other tab* makes h5player claim
keypresses on a page with no player of its own. Setting
`enhance.allowCrossOriginControl: false` is what fixes that, and it is
load-bearing rather than cosmetic.

## Hotkeys

Turkish-Q layout. The `i` is the **dotted** i on the home row next to `ş`, not
the dotless one on the top row.

| Key | Action |
|---|---|
| `ç` | Slower (-0.2x) |
| `.` | Faster (+0.2x) |
| `l` | 1x |
| `ş` | 1.5x |
| `i` | 2x |
| `z` | Toggle 1x / last speed |
| `shift+s` | Screenshot |
| `shift+p` | Picture in picture |
| `shift+r` | Toggle resume-play-progress |

Known and accepted: while a video is present, `l` and `i` override YouTube's
own seek-forward-10s and miniplayer shortcuts. h5player binds on `document` in
the capture phase and calls `preventDefault()`, so it wins.

`enhance.blockSetPlaybackRate` is left at its upstream default of `true`. That
is what makes a chosen speed stick when a site tries to reset it.

## Do not use the built-in config menu for our three keys

On Violentmonkey, h5player shows a config menu that can write settings. **Do not
use it to change hotkeys, `ui.enable`, or `enhance.allowCrossOriginControl`.**

`ConfigManager.get()` resolves localStorage first, then GM storage, then
defaults, and `getConfObj()` syncs stored keys back into the live config object
on every call. Our values are written into the lowest tier, so anything stored
by the menu would silently win. To prevent that, the injected block **deletes**
these three keys from both storage tiers on every page load:

```
_h5player_hotkeys
_h5player_ui_enable
_h5player_enhance_allowCrossOriginControl
```

Any change made through the menu to those three is therefore erased on the next
load. Every other h5player setting is unaffected and the menu remains usable for
them. To change these three, edit `config.js` and rebuild.

## Building

```sh
./build.sh            # uses cached upstream/ if present
./build.sh --refetch  # re-download upstream first
```

`build.sh` fetches upstream into a gitignored `upstream/`, applies the patch
set, and writes `h5player-lite.user.js`.

Every edit is anchored on a string verified to appear **exactly once** in
upstream, and the build **aborts** if an anchor is missing or matches more than
once. The `@version` is checked against `UPSTREAM_VERSION` and the build aborts
on mismatch. That is the update-detection mechanism: when upstream changes, this
fails loudly instead of quietly producing a wrong file.

### Versioning

`@version` is `<upstream base>.<patch counter>`, currently `4.3.5.2`. Bump
`PATCH` in `build.sh` on every rebuild; reset it to `1` when rebasing onto a new
upstream version.

Never publish a bare upstream version (a rebuild would not trigger an update
check on installed copies), and never use a hyphenated or prerelease segment.
The Userscripts app's `isVersionNewer` splits on dots and compares segments as
integers, treating any non-numeric segment as `0`, so `4.3.5-lite` would parse
as `4.3.5.0` and silently break update comparison.

### Step 2: UI removal (not yet applied)

Edits 3 and 4 delete the `h5playerUI` module (about 40% of the file) and the
init block that would otherwise reference the deleted binding. They are written
and gated behind `STRIP_UI=0` at the top of `build.sh`; flip it to `1` to apply.

Verified by dry run against 4.3.5: the build succeeds, output drops from 474,351
to 255,056 bytes, and `node --check` passes. The six remaining textual matches
for `h5playerUI` are all benign: `h5playerUIProvider` is a separate identifier,
two are comments, and `h5playerUI: t.UI` is a debug-info property that reads an
attribute which simply stays `undefined` behind an existing guard.

## Install

The built script is served raw from this repository:

```
https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/h5player/h5player-lite.user.js
```

Opening that URL with a userscript manager installed offers it for install, and
`@updateURL` points at the same file so auto-update works.

On Safari with the Userscripts app, the file can also be dropped straight into
the app's scripts directory. The app names the installed file from `@name`,
which is why the localized `@name:xx` variants are removed.

**Disable the original h5player before enabling this one.** If both are active
they both bind hotkeys.
