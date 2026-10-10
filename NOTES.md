# Userscripts: notes

Reference, open work and the next-session block for `tools/tampermonkey/`. The rules that cause harm if unknown are in `CLAUDE.md`. This is NOTES.md and not README.md because `README.md` is the public page of the GitHub repo (remote `origin`, raw URLs in it point at github.com).

## Scripts

| Script | Target | Purpose |
|--------|--------|---------|
| `claude-enhancer.user.js` | `claude.ai/*` | Model+effort preset buttons, incognito toggle (right Cmd tap) |
| `gemini-enhancer.user.js` | `gemini.google.com/*` | Model+thinking preset buttons, temp chat (right Cmd tap), keybindings |
| `ai-studio-enhancer.user.js` | `aistudio.google.com/prompts/*` | Combined model+thinking preset buttons (Lite/F/FX/P/PX) + temp chat + URL-param automation (model, thinking, search, system prompt) |
| `chatgpt-enhancer.user.js` | `chatgpt.com/*` | Power preset buttons (Chat M/H, Work Sol 5.6/Sol 6.1/Astra 6 at Medium), temp chat (right Cmd tap), URL-param automation |
| `autoplay-bypass-ads.user.js` | streaming sites | Right-click unblock, initial play click, ad skip |
| `youtube-subtitles.user.js` | `youtube.com/*` | Repaints captions (auto-generated merged into chunks, manual as they are) as stable movie-style subtitles; also passes every captured track to `youtube-summary` |
| `youtube-summary.user.js` | `youtube.com/*` | Summarize button next to Like: Haiku 5.5 through Aperture, structured Turkish Markdown summary in a panel above the description, clickable timestamps |

## Architecture Patterns

### SPA survival
Buttons are injected via `MutationObserver` that watches for the toolbar container to disappear/reappear on navigation. Older scripts (Gemini, AI Studio) add a backup `setInterval` for ~30 s after load; the ChatGPT and Claude scripts rely on a throttled observer alone.

### Menu automation (claude-enhancer, gemini-enhancer)
Both scripts use a **two-step menu** pattern:
1. Open model menu → select model (this closes the menu)
2. Re-open menu → navigate to nested submenu → set options → close

Menus render as `.z-popover` portals at `<body>` level. During automation they're hidden with `visibility:hidden` (so `.click()` still works without visual flicker).

### Selector stability notes
- **Claude:** model rows carry `data-model-id` (`claude-opus-*`, `claude-sonnet-*`); effort rows carry `data-effort-id` (`low/medium/high/xhigh/max`). An open menu is `[role=menu][data-open]`: closed menus stay mounted during their exit animation.
- **ChatGPT:** the picker is a "Power" slider (`[data-reasoning-slider]`), driven by synthetic arrow keys. ChatGPT keeps visited routes alive as hidden copies, so the DOM holds several composers; always scope to the visible one.
- **Gemini:** model options use hash-based `data-test-id` values (e.g. `bard-mode-option-56fdd199312815e2`) that can change on Google's end and also differ per account (two accounts showed two different sets on 2026-10-10, so `SELECTORS` lists both). Always keep `findMenuItemByLabel()` as a text-match fallback; it matches the label's end so `Flash` cannot hit `3.5 Flash-Lite`. Thinking is mid-rollout per account: the old UI has one `Extended thinking` toggle, the new one `Low`/`Medium`/`High` rows in the same flat menu, and the script handles both.
- **AI Studio:** all selectors centralized in `SELECTORS` const; re-inspect after Google UI updates.

## Testing in the cmux browser

Scripts can be checked live by reloading a signed-in cmux browser tab and injecting the file
with `cmux browser <surface> eval --script "$(cat x.user.js)"`. Traps found on 2026-09-29:

- chatgpt.com and claude.ai forbid `eval` in the page (CSP), so cmux silently retries in an
  isolated world. DOM events cross over fine, but page globals and `console list` do not, and
  `cmux browser wait --function` fails immediately instead of waiting: poll with `eval` instead.
- A cmux tab that is not on screen reports `visibilityState=hidden`, so `requestAnimationFrame`
  never fires and nothing paints. Scripts that batch work in rAF look dead there. For tests
  only, prepend `var requestAnimationFrame = cb => setTimeout(cb, 16);` to the injected text.
  On youtube.com that global `var` did not take (2026-10-09); wrap the shim and the script in
  one function, `(function(){ var requestAnimationFrame = ...; <script> })()`, instead.
- `cmux browser press` takes no key combos ("Meta+Enter" is sent literally); use
  `keydown Meta`, `press Enter`, `keyup Meta`. `keydown MetaRight` gives the right Cmd key.
- ProseMirror strips unknown attributes from its editor root, so mark its parent to target it.
- Sending a real message is the only way to test Enter; do it in a temporary/incognito chat.
- Gemini in cmux was signed in on 2026-10-10 (Batu switches accounts there to reach the old or
  new thinking UI). The script's console log works on gemini.google.com, unlike chatgpt.com/claude.ai.
- The trap about Batu's real model settings is in `CLAUDE.md` under Traps.

## Script ideas Batu approved

Script ideas Batu approved on 2026-10-09, copied from the old card:

Ideas Batu approved on 2026-10-09, not built yet:

- **One new script for every page**: translate or explain the selected text (TR/EN) in a
  small box next to the selection, and summarize a long page or discussion (Hacker News,
  Reddit, GitHub issues). One script rather than two, since both run everywhere and share
  the Aperture call.
- **Shopping reviews**: on a product page, a button (never automatic) that pulls recurring
  complaints and praise out of the reviews. Can live in the same script, with per-site
  selectors.
- Turned down for now: a GitHub repo card, and cleaning up YouTube's auto-captions.

## Open work

The checks below need Batu or a real browser tab; nothing here is blocked on code. Versions and commit state were read from git on 2026-10-10.

- **youtube-summary 2.0.1 (Safari), first real use.** 2.0.1 (commit ae136f3, pushed, copied into Safari's Userscripts folder) puts the button next to Like and renders a structured Markdown summary in a panel above the description. Turkish-only holds on a real English video: the 14-minute Tim Urban TED talk came back fully Turkish (request body sent to Aperture by curl, 2026-10-09). It was tested in the cmux browser with a stubbed GM call. Not yet seen: the real Safari `GM.xmlHttpRequest` run of 2.0.1 and the real light theme (only simulated). Next script ideas (page helper, reviews button) are under "Script ideas Batu approved" above.
- **Enhancers, first real use (task from 2026-09-30).** chatgpt-enhancer 2.2.0, claude-enhancer 2.1.0 and gemini-enhancer 3.7.0 were pushed on 2026-09-29 (Enter sends everywhere; right Cmd tap toggles temp or incognito in all three). 2.2.0 came from Batu's first real-use feedback: Chat M/H only, Work Sol 5.6/Sol 6/Astra 6 at Medium, and no focus ring or "Thinking effort" tooltip after a preset click (verified only in a hidden cmux tab). Still to confirm in real use: those 2.2.0 changes; whether a preset click flashes the menu or tooltip for a frame on a visible page; Gemini's right Cmd tap while signed in (the cmux tab was signed out when this was written, so only the call was seen; it was signed in on 2026-10-10); Claude's Free-plan presets (Batu's account is Max). Done: chatgpt-enhancer 2.2.1 swapped the Work "Sol 6" preset for "Sol 6.1" (GPT-6.1 Sol) on 2026-09-30, pushed and copied into Safari, and Batu confirmed it works in real use. gemini-enhancer 3.8.0 (2026-10-10, pushed and copied into Safari) supports both thinking UIs, the old Extended toggle and the new Low/Medium/High; it was tested live on a new-UI account only, the old-UI path is unverified, and Batu will report it if it misbehaves. Violentmonkey self-updates; on Safari Batu has to press Update in the Userscripts app.
- **youtube-subtitles 1.3.0 (Safari): see a manual track in a real tab.** Batu reported on 2026-10-09 that auto-captions show as movie subtitles in Safari but https://www.youtube.com/watch?v=DxsqywdrezY showed tiny ones: that video's default track is a manually authored one, which 1.2.0 deliberately left to YouTube's small renderer. 1.3.0 (commit 2a46248) draws manual tracks in the same overlay too (not merged, shown as authored) and follows track switches. Verified in the cmux browser on that video (manual and ASR, both ways) and copied into Safari's Userscripts folder (`diff` identical). Push state: the task list said committed locally and not pushed (Violentmonkey on 1.2.0). On 2026-10-10 the local `origin/main` ref equals HEAD 8c17428, which contains 2a46248, so 1.3.0 has been pushed since (a push updates that ref; no fetch was done). So no push needs Batu's go any more; what remains is to see that Violentmonkey reports `@version` 1.3.0. Known cost: overlapping manual cues show only the latest, and top-positioned manual cues now sit at the bottom. First check: open that video in Safari with captions on and look. If nothing appears, read the console for `[YTSubs] captured ... manual:en lines`; no such line means the track came from cache and the page needs a reload. Tuning knobs, all near the top of the file: chunk length `MAX_CHUNK_CHARS`/`MAX_CHUNK_MS`/`SPLIT_GAP_MS`, size the `0.038` multiplier in `scaleFont()`, outline weight the `.045em`/`.032em` offsets in `injectStyle()`.
- **h5player-lite, two things left untested on purpose** (from 2026-09-05). Netflix: Batu almost never uses it and chose to skip the check; if playback or speed breaks there, look at the `netflix.com` entry in the per-site TCC table (`playbackRate: true` is a deliberate guard against five upstream issues, do not remove it to "fix" something else). Browser coverage: Batu confirmed the hotkeys good on both 4.3.5.2 and 4.3.5.3 without saying which browsers. The cross-tab check only exercises the GM-storage clear and `allowCrossOriginControl: false` on Violentmonkey (Thorium/Firefox); on Safari that code path is dead. If hotkeys ever fire on a page with no video, re-run that check specifically in Thorium or Firefox before touching anything. The current version is 4.3.5.7 and only the Safari copy was confirmed installed by hash (`41810e80`); Thorium and Firefox pull it from the raw URL on Violentmonkey's own schedule and were not observed doing so (the raw URL was still serving 4.3.5.6 minutes after the push, which is GitHub's CDN cache and clears itself). Check that `@version` in the Violentmonkey dashboard reads 4.3.5.7 before trusting a hotkey result from those two. All twelve bound hotkeys are confirmed in-browser by Batu (`shift+enter` fullscreen and the `shift+arrowright/left` seek keys on 4.3.5.7, the other nine on earlier builds), so what is left is only which browsers, and Netflix.
- **Open question for Batu, asked on 2026-09-05 and not answered: `.meta.js` for Safari updates.** Safari's Userscripts app documents `@updateURL` as ending in `.meta.js` (metadata block only) with `@downloadURL` ending in `.user.js`. Both `youtube-subtitles` and `h5player-lite` point the two at the same `.user.js`, which is what Violentmonkey and Tampermonkey want. The offer was to generate a `.meta.js` per script and repoint `@updateURL`, doing both scripts together so the repo stays consistent. Not started, and not obviously worth it: the app's own README calls its update process not correctly implemented (upstream issue #248), and the Safari copy is hand-deployed by `cp` anyway, so the whole path may be moot. Decide before touching it. The current behavior is recorded in `README.md` (Updating) and `h5player/README.md` (Install).

## Next session starts here

2026-10-10. Nothing is in progress in the repo. Start with Batu's Safari checks in this order: youtube-subtitles 1.3.0 on https://www.youtube.com/watch?v=DxsqywdrezY with captions on, then a real youtube-summary run with the light theme, then confirm Violentmonkey shows `@version` 1.3.0 for youtube-subtitles. Ask Batu the open `.meta.js` question only if Safari updating comes up again.
