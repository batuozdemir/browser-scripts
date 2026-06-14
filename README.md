# AI Interface Userscripts

A collection of Tampermonkey userscripts that enhance Google AI Studio, Gemini, and Claude.ai.

| Script | Target | Purpose |
|--------|--------|---------|
| `ai-studio-enhancer.user.js` | `aistudio.google.com` | Model+thinking preset buttons (Lite/F/FX/P/PX), temp chat, and silent model/thinking/search/system-prompt automation via URL params |
| `gemini-enhancer.user.js` | `gemini.google.com` | Model+thinking preset buttons (FL/F/FX/P/PX), temp chat toggle, custom keybindings |
| `claude-enhancer.user.js` | `claude.ai` | Model+effort+thinking preset buttons (S/SX/O/OX), thinking toggle, incognito toggle, custom keybindings |

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

- `Cmd/Ctrl+Enter` — send message
- `Enter` — newline

### URL parameters

- `?model=flashlite|flash|pro` — auto-select model
- `?thinking=standard|extended` — auto-set thinking level
- `?temp=true` — activate temporary chat

---

## Claude (`claude-enhancer.user.js`)

Adds quick-access preset buttons, thinking/incognito toggles, and saner keybindings to `claude.ai`. See `claude-enhancer-README.md` for full details.

### Preset buttons (left of composer toolbar)

| Button | Model | Effort | Thinking |
|--------|-------|--------|----------|
| `S` | Sonnet 4.6 | Low | off |
| `SX` | Sonnet 4.6 | High | on |
| `O` | Opus 4.8 | Medium | off |
| `OX` | Opus 4.8 | Max | on |

### Toggle buttons (right of composer toolbar)

- `T` — toggle Thinking on/off
- `Temp` — toggle Incognito chat

### Keybindings

- `Cmd/Ctrl+Enter` — send message
- `Enter` / `Shift+Enter` — newline

### URL parameters

- `?model=opus|sonnet|haiku|fable`
- `?effort=low|medium|high|max`
- `?thinking=on|off`
- `?incognito=1`

---

## License

Distributed under the LICENSE file in the repository root.
