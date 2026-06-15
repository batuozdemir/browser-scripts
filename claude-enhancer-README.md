# Claude Enhancer (`claude-enhancer.user.js`)

A Tampermonkey userscript that adds quick model/effort/thinking presets, a thinking
toggle, an incognito toggle, and saner keybindings to **claude.ai** — the Claude
counterpart of `gemini-enhancer.user.js`.

**Scope:** `https://claude.ai/*`
**Version:** 1.3

---

## Features

### 1. Model + Effort + Thinking preset buttons (left of the composer toolbar)
Four one-click presets. Each opens the model menu, selects the model, then opens the
nested **Effort** submenu to set effort and the **Thinking** switch:

| Button | Model | Effort | Thinking |
|--------|-------------|--------|----------|
| `S`    | Sonnet 4.6  | Low    | off |
| `SM`   | Sonnet 4.6  | Medium | off |
| `SMX`  | Sonnet 4.6  | Medium | on  |
| `SX`   | Sonnet 4.6  | High   | on  |
| `O`    | Opus 4.8    | Medium | off |
| `OX`   | Opus 4.8    | Max    | on  |

Models are matched by **family name** (Sonnet/Opus/Haiku/Fable), so version bumps
(e.g. "Sonnet 4.6" → "Sonnet 4.7") won't break the buttons.

A preset button **highlights** when the live model + effort match it (read from the model
trigger's `aria-label`, e.g. "Model: Sonnet 4.6 Low"). This also reflects changes you make
through Claude's own model menu. (Thinking state isn't exposed in that label, so the
highlight is based on model + effort only.)

**Keyboard shortcuts:**

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Shift+0` | toggle Thinking |

(Matched on physical key code, so they work on any keyboard layout.)

### 2. Thinking toggle (`T`) + Incognito (`Temp`) — right of the composer toolbar
- **`T`** — toggles the Thinking switch on/off (independent of the presets). Highlights
  when last set to on.
- **`Temp`** — toggles incognito chat (the control's `aria-label` swaps between
  "Use incognito" / "Exit incognito"); highlights while you're in an incognito chat.

### 3. Keybindings
- **Enter** and **Shift+Enter** → newline.
- **Cmd/Ctrl+Enter** → send (clicks `button[aria-label="Send message"]`).

The editor is TipTap/ProseMirror (`div[data-testid="chat-input"]`); plain Enter is
re-dispatched as Shift+Enter so Claude's default "Enter sends" never fires.

### 4. Auto-focus
Focuses the prompt box on load and places the cursor at the end of any existing text.

### 5. URL parameters
Deep-link a preset by appending query params to a claude.ai URL:

| Param | Values | Effect |
|-------|--------|--------|
| `?model=`     | `opus` `sonnet` `haiku` `fable` | select model |
| `?effort=`    | `low` `medium` `high` `max`     | set effort |
| `?thinking=`  | `on` `off` (`true`/`false`/`1`) | set thinking switch |
| `?incognito=` | `1` `true`                       | start incognito chat |

Example: `https://claude.ai/new?model=opus&effort=max&thinking=on`

---

## Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Add `claude-enhancer.user.js` as a new userscript (or open the raw file to let
   Tampermonkey prompt for install).
3. Reload claude.ai.

---

## Implementation notes / gotchas
- **No stable model testids.** Model rows are `div[role="menuitemradio"]` matched by
  visible text. base-ui ids (`base-ui-_r_xx_`) are per-render and must never be used as
  selectors.
- **Effort options have stable testids:** `effort-option-{low,medium,high,max}`. The
  **Thinking** switch (`[role="switch"][aria-label="Thinking"]`) lives in that same
  nested submenu.
- **Two-step menu navigation:** model selection closes the menu, so the script re-opens
  it to reach the Effort submenu. Within the submenu it sets the Thinking switch *before*
  clicking an effort option (the effort click closes the menu).
- **Overlay hiding:** menus render in `.z-popover` portals at `<body>` level. The script
  hides them (`visibility:hidden`) and kills transitions during automation so they don't
  flicker; `.click()` still works on hidden elements.
- **SPA survival:** a `MutationObserver` re-injects the buttons whenever they go missing
  (new chat, navigation), plus a 30s backup interval after load.
- **Fable 5** is skipped automatically if marked "Currently unavailable" (`aria-disabled`).

---

## Maintenance
If Claude updates its UI, the selectors most likely to need attention are centralized in
the `SELECTORS` and `EFFORT_TESTID` objects at the top of the script. Re-inspect:
- the composer toolbar container,
- `button[data-testid="model-selector-dropdown"]` and the model row text,
- `[data-testid="effort-menu-trigger"]` / `effort-option-*` / the Thinking switch,
- `button[aria-label="Use incognito"]`, `button[aria-label="Send message"]`,
- `div[data-testid="chat-input"]`.
