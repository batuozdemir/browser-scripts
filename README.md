# Browser Scripts

A collection of userscripts for Firefox, Safari, Thorium, and other browsers.
Most enhance AI web interfaces; `h5player-lite` is a pruned build of a
third-party video speed controller.

| Script | Target | Purpose |
|--------|--------|---------|
| `ai-studio-enhancer.user.js` | `aistudio.google.com` | Model+thinking preset buttons (Lite/F/FX/P/PX), temp chat, and silent model/thinking/search/system-prompt automation via URL params |
| `gemini-enhancer.user.js` | `gemini.google.com` | Model+thinking preset buttons (FL/F/FX/P/PX), temp chat toggle, custom keybindings |
| `claude-enhancer.user.js` | `claude.ai` | Model+effort preset buttons (S/SM/OM/OH), incognito toggle (right Cmd tap), URL params |
| `chatgpt-enhancer.user.js` | `chatgpt.com` | Power preset buttons (Chat M/H, Work Sol 5.6/Sol 6.1/Astra 6 at Medium), temporary chat (right Cmd tap), URL params |
| `autoplay-bypass-ads.user.js` | streaming sites | Disables right-click block, clicks initial play, skips ad, plays the main video |
| `youtube-subtitles.user.js` | `youtube.com` | Replaces YouTube's rolling auto-captions with stable, movie-style subtitle chunks |
| `h5player/h5player-lite.user.js` | all sites | Video speed control. Pruned, reconfigured build of `xxxily/h5player` — see [`h5player/README.md`](h5player/README.md) |

This is intended for use with Tampermonkey, Greasemonkey, or other userscript managers in modern browsers.

---

## AI Studio (`ai-studio-enhancer.user.js`)

Adds combined model+thinking preset buttons and a temporary-chat toggle next to the **Tools** button under the prompt box, plus silent URL-param automation. Rewritten for the Gemini 3 redesign (level-based thinking; no temperature/budget slider).

### Preset buttons (left, next to "Tools")

| Button | Model family | Thinking |
|--------|--------------|----------|
| `Lite` | Flash-Lite | Minimal |
| `F` | Flash | Low |
| `FX` | Flash | High |
| `P` | Pro | Low |
| `PX` | Pro | High |

Each preset selects the **best available model of its family by version number** — `gemini-3.5-pro` outranks `gemini-3.1-pro`, which outranks `gemini-3.1-pro-preview` — so newer models are picked automatically without editing the script. The active preset is highlighted to match the current model + thinking level.

### Action buttons (right, near "Run")

- `Grd` — toggle Grounding with Google Search (highlighted when on).
- `Temp` — toggle Temporary Chat.
- `Save` — save the prompt.

### Always-on / convenience behaviors

- **Code execution** is kept enabled (re-enabled whenever found off).
- The **system prompt** is only applied when it's currently empty — it never overwrites instructions you've set.
- After any action the cursor returns to the prompt box.

### Installation

1. Install a userscript manager in your browser (Tampermonkey is recommended).
2. Create a new script and paste the contents of `ai-studio-enhancer.user.js`, or install directly from the script's `downloadURL` if hosted.
3. Enable the script and navigate to `https://aistudio.google.com/prompts/`.

Note: The script runs at `document-idle` and targets pages under `https://aistudio.google.com/prompts/*`.

### URL parameters

Applied silently on a fresh `/prompts/new_chat` (or whenever `?model=` is present):

- `model` — exact model id. Example: `model=gemini-3.1-pro-preview`. If omitted, defaults to the best Pro model.
- `thinking` — `minimal | low | medium | high`. Example: `thinking=high`.
- `search` — toggle Grounding with Google Search. Use `1`/`true`/`on` or `0`/`false`/`off`. (Legacy alias: `grounding`.)
- `sp` — system prompt (system instructions). URL-encode long text. If omitted, the embedded default system prompt is applied.

Example:

  https://aistudio.google.com/prompts/new_chat?model=gemini-3.1-pro-preview&thinking=high&search=1

### Customization

- Change the default model family or system prompt via the `DEFAULT_SETTINGS` object near the top of the script.
- Adjust the preset buttons via the `PRESETS` array.

### Troubleshooting

- Console logs are prefixed with `[AIStudio]`.
- If selectors break after an AI Studio UI update, the relevant ones live in the `SELECTORS` const at the top of the script.

---

## Gemini (`gemini-enhancer.user.js`)

Adds quick-access preset buttons, temp chat toggle, and saner keybindings to `gemini.google.com`.

### Preset buttons

| Button | Model | Thinking |
|--------|-------|----------|
| `FL` | Flash-Lite | Extended |
| `F` | Flash | Standard |
| `FX` | Flash | Extended |
| `P` | Pro | Standard |
| `PX` | Pro | Extended |

A `Temp` button toggles Temporary Chat.

### Keybindings

- `Enter` or `Cmd/Ctrl+Enter` — send message
- `Shift+Enter` — newline
- Right `Cmd` tap — toggle Temporary Chat

### URL parameters

- `?model=flashlite|flash|pro` — auto-select model
- `?thinking=standard|extended` — auto-set thinking level
- `?temp=true` — activate temporary chat

---

## Claude (`claude-enhancer.user.js`)

Adds model/effort preset buttons and an incognito toggle to `claude.ai`. See `claude-enhancer-README.md` for full details.

### Preset buttons (in the composer, after the `+` button)

| Button | Model | Effort |
|--------|-------|--------|
| `S` | Sonnet | Low |
| `SM` | Sonnet | Medium |
| `OM` | Opus | Medium |
| `OH` | Opus | High |

Free plan: `S`, `SM`, `SH` (Sonnet High), `SX` (Sonnet Max). claude.ai no longer has a separate Thinking switch (thinking is part of Effort), so the old `T` button is gone.

### Toggle button (left of the model picker)

- `Temp` — toggle Incognito chat

### Keybindings

- `Enter` sends and `Shift+Enter` adds a newline (claude.ai's defaults, untouched)
- Right `Cmd` tap — toggle Incognito

### URL parameters

- `?model=opus|sonnet|haiku|fable`
- `?effort=low|medium|high|extra|max`
- `?incognito=1`

---

## ChatGPT (`chatgpt-enhancer.user.js`)

Adds power preset buttons for both the Chat and Work tabs, a Temporary Chat toggle, URL-param automation, auto-focus, and saner keybindings to `chatgpt.com`.

### Preset buttons

ChatGPT's model picker is a "Power" slider. The buttons move it to a position.

| Tab | Buttons | Positions |
|-----|---------|-----------|
| Chat | `M` `H` | Medium / High |
| Work | `Sol 5.6` `Sol 6.1` `Astra 6` | Picks GPT-5.6 Sol, GPT-6.1 Sol or GPT-6 Astra in the menu, then sets the slider to Medium. |

The active button is highlighted. After a click, focus goes back to the message box.

### Controls

- `Temp` — toggle Temporary Chat (hidden where ChatGPT offers no temporary chat).
- Right `Cmd` tap — toggle Temporary Chat.

### Keybindings

- `Enter` sends and `Shift+Enter` adds a newline (ChatGPT's defaults, untouched)

### URL parameters

- `?thinking=instant|medium|high` — Chat power level
- `?power=1..5` — slider position (1-based), either tab
- `?temp=1` — Temporary Chat
- `?model=` is also read, but ChatGPT uses that parameter itself and strips it on load, so prefer `?thinking=`.

### Troubleshooting

- Warnings are prefixed with `[ChatGPT]`.
- ChatGPT keeps visited routes alive as hidden copies, so the DOM holds several composers; the script always works on the visible one.
- If the buttons stop working after a UI update, re-inspect `button[aria-label="Select ChatGPT model"]` and the `[data-reasoning-slider]` menu row and update the centralized `SELECTORS` const.

---

## YouTube subtitles (`youtube-subtitles.user.js`)

Makes YouTube's **auto-generated** captions behave like normal movie subtitles:
one stable block of text that appears whole and stays put, instead of a line
that grows word by word and scrolls. Manually authored subtitles are already
stable and are left completely alone.

### How it works

YouTube delivers auto-captions as json3 over XHR from `/api/timedtext`. That
response already contains complete caption lines; the word-by-word effect is the
player revealing each line progressively using per-word `tOffsetMs` offsets,
with two lines on screen at once because consecutive lines overlap in time.

So the script watches for that response, keeps the real lines, throws the
per-word offsets away, merges lines into sentence-shaped chunks, hides YouTube's
own caption layer and draws its own. Because a chunk is shown from the moment
its first word is spoken, **nothing is delayed** — the full sentence simply
arrives where the first word used to.

Chunks break at sentence-ending punctuation, or when they would exceed two lines
(84 characters), 7 seconds, or a 1.2 s silence. Long chunks wrap onto two
balanced lines. Playback position drives everything, so seeking, pausing and
speed changes need no special handling.

### Appearance

Styled like a desktop player (mpv, VLC, IINA) rather than like YouTube: white
Helvetica Neue on a black outline, no background box, sized at 3.8% of player
height. The outline offsets are in `em`, so it tracks the font instead of going
spindly in fullscreen and clotted in a small player. To retune, edit the
`#yts-overlay` rules in `injectStyle()` and the multiplier in `scaleFont()`.

### Behavior

- Engages only while the **active** track is auto-generated. Switching to a
  manual track hands captions straight back to YouTube.
- Hides itself during ads, and while captions are toggled off.
- Follows SPA navigation, fullscreen, and player resizing (the font scales with
  player height, and the text lifts clear of the control bar while it is up).

### Installation (Safari / Tampermonkey)

1. Install a userscript manager: Tampermonkey, or the **Userscripts** app on
   Safari.
2. Open the raw file and the manager will offer to install it:
   `https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/youtube-subtitles.user.js`
   On Safari with the Userscripts app you can instead drop the file into
   `~/Library/Containers/com.userscripts.macos.Userscripts-Extension/Data/Documents/scripts/`.
3. Reload YouTube and turn captions on.

`@run-at document-start` matters: the caption track is fetched once and cached,
so the script has to be running before the player asks for it. If subtitles do
not appear, reload the page rather than toggling captions.

### Updating

Violentmonkey and Tampermonkey refresh from the raw URL on their own schedule.
**Safari's Userscripts app does not**: it checks periodically and then offers an
Update button you have to press, and its own README flags the update process as
not correctly implemented. See the Install section of
[`h5player/README.md`](h5player/README.md) for the details and the metadata-shape
caveat. Bump `@version` on every change, and re-copy the file to Safari by hand
rather than assuming it refreshed.

### Tests

`node youtube-subtitles.test.js` runs the segmentation suite against a fixture
shaped like a real ASR response, and replays the stream both ways to show the
revision count collapsing.

### Troubleshooting

- Console logs are prefixed with `[YTSubs]`.
- Nothing appears: confirm the track really is "English (auto-generated)". A
  video carrying a manual track of the same language is left to YouTube.

---

## h5player-lite (`h5player/h5player-lite.user.js`)

A pruned build of [`xxxily/h5player`](https://github.com/xxxily/h5player) cut
down to video speed control: the default hotkey table is replaced, the on-screen
UI is disabled, and cross-origin control is turned off so hotkeys stop firing on
pages with no video.

Built by `h5player/build.sh`, which fetches upstream, verifies its version, and
applies anchored edits. Full details, the hotkey table, and the GPL modification
notice are in [`h5player/README.md`](h5player/README.md).

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE).

`h5player/h5player-lite.user.js` is a modified version of `xxxily/h5player`,
which is GPL-3.0; the modifications are documented in
[`h5player/README.md`](h5player/README.md) as GPL section 5 requires.
