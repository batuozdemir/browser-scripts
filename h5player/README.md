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
   variants are removed. `@version` becomes `4.3.5.6`. `@downloadURL` and
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
5. **UI removal.** The `h5playerUI` module and the init block that binds it
   are deleted from the built file, which is what `ui.enable: false` in edit 2
   would otherwise only hide at runtime. This is about 46% of the bytes.
6. **Web fullscreen always uses h5player's own mode.** `setWebFullScreen` asks
   the per-site table first and only falls back to h5player's CSS full-page mode
   when no site task ran. `const isDo = TCC.doTask('webFullScreen')` is replaced
   with `const isDo = false`, so every site takes the fallback and no site's own
   button is clicked. See "Web fullscreen" below for why.
7. **Web-fullscreen CSS injected without `GM_addStyle`.** Upstream injects the
   `_webfullscreen_` rules only through `window.GM_addStyle`, guarded by its own
   presence. Safari's Userscripts app has no synchronous `GM_*` set, so on Safari
   the stylesheet never landed and edit 6's full-page mode was inert. Replaced
   with a plain `<style>` element, which needs no manager API.

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
| `shift+enter` | Web fullscreen |
| `shift+right` | Forward 5s |
| `shift+left` | Back 5s |

Known and accepted: while a video is present, `l` and `i` override YouTube's
own seek-forward-10s and miniplayer shortcuts. h5player binds on `document` in
the capture phase and calls `preventDefault()`, so it wins.

`enhance.blockSetPlaybackRate` is left at its upstream default of `true`. That
is what makes a chosen speed stick when a site tries to reset it.

Web fullscreen and seek were added in 4.3.5.4. `shift+enter` is upstream's own
binding for web fullscreen; bare `enter`, upstream's *device* fullscreen, stays
unbound deliberately, since it was the reason this config override exists at all.

**Web fullscreen is h5player's own, on every site (4.3.5.5).** Upstream resolves
this key through the per-site table first, and on YouTube that entry is
`webFullScreen: 'button.ytp-size-button'`, which is the *theater mode* button, so
the key produced theater mode rather than a full-window video. Edit 7 forces the
fallback path instead: `player._fullPageScreen_`, a `FullScreen(player, true)`
created next to the hotkey runner for every player h5player initialises. It
applies `_webfullscreen_` (`position: fixed`, 100% width and height, black
background, `z-index: 999999`), so the video fills the browser window on any
site, identically. This is not OS fullscreen, and it is not the site's own
button. The 16 per-site `webFullScreen` entries stay in the file but are now
unreachable; `exitWebFullScreen` was already only a table key that nothing
invoked.

That change alone was not enough, and 4.3.5.6 finishes it. `enter()` in page mode
only adds the `_webfullscreen_` classes, it never calls the fullscreen API, so it
is entirely dependent on those CSS rules being present. Upstream injected them
through `window.GM_addStyle` and nothing else, behind a `&& window.GM_addStyle`
guard, so on Safari the rules silently never arrived and the key looked dead
rather than erroring. Edit 7 injects them with a plain `<style>` element instead.
One unrelated `GM_addStyle` call survives in the `iqiyi.com` site handler and is
left as upstream wrote it.
Seek is on `shift+arrows` rather than bare arrows so a site keeps its native
5-second seek, and it routes through the per-site TCC table
(`addCurrentTime`/`subtractCurrentTime`) so sites with custom seek handling are
respected. `shift+arrow` text selection is unaffected: the hotkey handler returns
early on `INPUT`, `TEXTAREA`, `SELECT` and `contenteditable` targets.

Upstream commands that remain deliberately unbound, all still present in the file
and rebindable from `config.js`: media download, zoom/pan/mirror/rotate, freeze
frame, the brightness/contrast/saturation/hue/blur filters, next video, and
volume. Volume boost above 100% (`enhance.allowAcousticGain`, up to 6x through a
GainNode) additionally defaults to `false`.

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

`@version` is `<upstream base>.<patch counter>`, currently `4.3.5.6`. Bump
`PATCH` in `build.sh` on every rebuild; reset it to `1` when rebasing onto a new
upstream version.

Never publish a bare upstream version (a rebuild would not trigger an update
check on installed copies), and never use a hyphenated or prerelease segment.
The Userscripts app's `isVersionNewer` splits on dots and compares segments as
integers, treating any non-numeric segment as `0`, so `4.3.5-lite` would parse
as `4.3.5.0` and silently break update comparison.

### UI removal (`STRIP_UI`)

Edits 3 and 4 delete the `h5playerUI` module and the init block that would
otherwise reference the deleted binding. They are gated behind `STRIP_UI` at the
top of `build.sh`, set to `1` since 4.3.5.3 (see Versioning for the current version); setting it back to `0` builds the
UI-bearing file again without any other change.

Applied against upstream 4.3.5 the output drops from 474,351 to 255,056 bytes,
46% smaller, and `node --check` passes. Four textual matches for `h5playerUI`
survive and all are benign: three are `h5playerUIProvider`, a separate
identifier whose definition is outside the deleted span, and the fourth is
`h5playerUI: t.UI` in `printPlayerInfo`, a debug-info property that reads an
attribute which stays `undefined` now that nothing assigns `h5Player.UI`. Every
other `t.UI` use in the file is already guarded by `t.UI &&`, so they all
short-circuit. (An earlier dry run counted six matches rather than four; the two
extra were Chinese comments, which edit 6 removes outright.)

## Install

The built script is served raw from this repository:

```
https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/h5player/h5player-lite.user.js
```

Opening that URL with a userscript manager installed offers it for install, and
`@updateURL` points at the same file so auto-update works.

On Safari with the Userscripts app, the file can also be dropped straight into
the app's scripts directory. The app names the installed file from `@name`,
which is why the localized `@name:xx` variants are removed:

```
~/Library/Containers/com.userscripts.macos.Userscripts-Extension/Data/Documents/scripts/
```

Note for agents: that path is **outside the Bash sandbox's write allowlist**,
which covers the working tree only. A plain `cp` there fails with `Operation not
permitted`, and there is no in-sandbox workaround, so the copy needs
`dangerouslyDisableSandbox` (keep the escaped command to just the `cp`). The
alternative is a permanent write rule for that directory in `.claude/settings.json`,
which has not been added.

**Disable the original h5player before enabling this one.** If both are active
they both bind hotkeys.
