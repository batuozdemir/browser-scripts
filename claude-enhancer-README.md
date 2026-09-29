# Claude Enhancer (`claude-enhancer.user.js`)

A userscript (Tampermonkey / Violentmonkey) that adds one-click model/effort presets and an
incognito toggle (also on a right Cmd tap) to **claude.ai** (desktop layout). It is the
Claude counterpart of `gemini-enhancer.user.js`.

**Scope:** `https://claude.ai/*`
**Version:** 2.0.0

---

## Features

### 1. Model + Effort preset buttons (in the composer, right after the `+` button)
Each click opens the model picker out of sight, picks the model, then opens the nested
**Effort** submenu and picks the level.

| Button | Model  | Effort |
|--------|--------|--------|
| `S`    | Sonnet | Low    |
| `SM`   | Sonnet | Medium |
| `OM`   | Opus   | Medium |
| `OH`   | Opus   | High   |

On a Free plan (Opus unavailable) the buttons become `S`, `SM`, `SH` (Sonnet High) and
`SX` (Sonnet Max). The plan is read from the sidebar account button ("Name · Max"); if a
preset finds Opus missing or locked in the picker, the buttons switch to the Free set.

Models are matched by family (the picker's `data-model-id` prefix, `claude-opus-*`,
`claude-sonnet-*`), so version bumps don't break the buttons. A preset always picks the
model listed at the top level of the picker, so pressing `OM` in an old chat that runs
Opus 5 moves it to the current Opus.

A preset button **highlights** when the picker's label (e.g. "Model: Opus 5.5 Medium")
matches its family and effort, including changes you make through Claude's own menu.

### 2. Incognito (`Temp`), in the row under the composer, left of the model picker
Clicks Claude's own incognito control (`aria-label` "Use incognito" / "Exit incognito")
and highlights while you're in an incognito chat.

### 3. Keybindings
- **Enter** sends and **Shift+Enter** adds a newline: claude.ai's defaults, untouched.
- **Right Cmd tap** (press and release with no other key): toggle incognito.

These apply only in the main prompt box, not when editing an earlier message.

### 4. Auto-focus
Focuses the prompt box (cursor at the end) when the composer appears, and after a preset
or incognito toggle. It won't steal focus from another text field you're typing in.

### 5. URL parameters

| Param | Values | Effect |
|-------|--------|--------|
| `?model=`     | `opus` `sonnet` `haiku` `fable`                 | select model |
| `?effort=`    | `low` `medium` `high` `extra` (or `xhigh`) `max` | set effort |
| `?incognito=` | `1` `true`                                       | start incognito chat |

Example: `https://claude.ai/new?model=opus&effort=high`

### Removed in 2.0.0
claude.ai no longer has a separate **Thinking** switch: thinking is folded into the Effort
levels (Low, Medium, High, Extra, Max). The `T` button, the `Cmd/Ctrl+Shift+0` shortcut
and `?thinking=` were removed with it.

---

## Installation
1. Install Tampermonkey or Violentmonkey.
2. Add `claude-enhancer.user.js` as a new userscript (or open the raw file to let the
   manager prompt for install).
3. Reload claude.ai.

---

## Implementation notes / gotchas
- **Stable hooks used:** `data-testid` on the attach button (`chat-input-attach`), the
  editor (`chat-input`), send (`chat-input-send`) and the picker
  (`model-selector-dropdown`); `data-model-id` on model rows; `data-effort-id`
  (`low`, `medium`, `high`, `xhigh`, `max`) on effort rows. base-ui ids
  (`base-ui-_r_xx_`) change per render and are never used.
- **Open means `[data-open]`.** A closed menu can stay mounted with `data-closed` until
  its exit animation ends (indefinitely in a background tab), so the script never treats
  a bare `[role="menu"]` as open.
- **Two-step menu:** picking a model closes the picker, so the script re-opens it to reach
  the Effort submenu. If the model is already selected it skips that click and stays in the
  open menu.
- **Overlay hiding:** menus are portals marked `[data-cds-overlay]`; during automation
  they get `visibility:hidden` with transitions off. `.click()` still works on them.
- **Waiting:** menu steps wait with a short-lived `MutationObserver` (1.5 s cap), not
  fixed sleeps.
- **SPA survival:** one `MutationObserver` on `<body>` whose callback exits after a few
  `isConnected` checks unless our buttons were detached or the URL changed; re-injection is
  throttled to once per 150 ms. Highlights follow a separate observer on the picker's
  `aria-label`. No polling interval.

---

## Maintenance
If Claude changes its UI, the selectors are centralized in `SELECTORS` at the top of the
script. Re-inspect the testids above, the `data-model-id` / `data-effort-id` rows, the
incognito button's `aria-label`, and the `.ml-auto` wrapper around the model picker
(where `Temp` is inserted; it falls back to just before the picker).
