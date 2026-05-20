# GEMINI SYSTEM SPECIFICATION

## Project Overview
This repository contains a collection of userscripts designed to enhance Google's AI Studio (`aistudio.google.com`) and Gemini (`gemini.google.com`) web interfaces. These scripts automate configuration settings, add convenience features, and improve the writing experience.

## Agent Instructions
- When there is a change, new feature, bugfix, increase version number. (decide if it's by 0.01, 0.1 or 1 according to the size/impact of the change)
- Ask user for "Inspect" input when necessary.

## Artifacts

### 1. AI Studio Advanced Settings (`ai-studio.user.js`)
**Scope:** `https://aistudio.google.com/*`
**Purpose:** Automates the setup of the AI Studio environment, allowing reproducible "presets" via URL parameters or defaults.
**Key Features:**
- **Model Selection:** Automatically selects preferred models (e.g., Gemini 3 Pro) with fallback logic.
- **Thinking Budget:** Configures thinking/reasoning budget (Auto/Manual + Slider value).
- **Settings Injection:** Injects custom buttons into the UI for quick model/thinking switching.
- **System Prompt:** Automatically inserts a predefined system prompt.
- **Watchdog:** valid SPA navigation handling using `MutationObserver`.
- **URL Configuration:** Supports `?model=...`, `?budget=...`, `?yt_url=...` for deep-linking configurations.

### 2. Gemini Enhancer (`gemini-enhancer.user.js`) — v2.0
**Scope:** `https://gemini.google.com/*`
**Purpose:** Adds "pro" features and better input control to the standard Gemini chat interface.
**Key Features:**
- **Mode + Thinking Buttons:** 5 preset buttons below the input area:
    - `FL` — Flash-Lite + Extended Thinking
    - `F` — Flash + Standard Thinking
    - `FX` — Flash + Extended Thinking
    - `P` — Pro + Standard Thinking
    - `PX` — Pro + Extended Thinking
- **Two-Step Menu Navigation:** Each button performs: (1) open model menu → select model → close, (2) re-open menu → navigate to "Thinking level" submenu → select level.
- **Model Selector Fallback:** Primary selectors use hash-based `data-test-id` attributes (e.g., `bard-mode-option-56fdd199312815e2`). If those fail, falls back to matching menu item label text.
- **Input Keybindings:**
    - `Cmd+Enter` (or `Ctrl+Enter`): Submits the message (clicks the Send button).
    - `Enter` (without modifiers): Inserts a newline instead of submitting (prevents default behavior).
- **Temp Chat Support:**
    - Adds a dedicated "Temp" button to the toolbar.
    - Uses `button[aria-label="Temporary chat"]` selector.
    - Supports `?temp=true` URL parameter for instant temporary chat activation.
- **URL Parameters:**
    - `?model=flashlite|flash|pro` — auto-select model
    - `?thinking=standard|extended` — auto-set thinking level
    - `?temp=true` — activate temporary chat

### 3. Autoplay Bypass (`autoplay-bypass-ads.user.js`)
**Scope:** General / YouTube (presumed based on name)
**Purpose:** Simplistic script to bypass ads or manage autoplay (details pending file analysis, likely minor utility).

## Architecture & patterns
- **Technology:** Vanilla JavaScript intended for execution in a Userscript Manager (Tampermonkey).
- **DOM Interaction:** extensively uses `querySelector` and `MutationObserver` to handle the dynamic, single-page application (SPA) nature of Google's apps.
- **Event Simulation:** Simulates `click`, `input`, `mouseenter`, and `keydown` events to interact with Angular/Material components that rely on specific event sequences.
- **Robustness:** Includes finding elements by ID, text content fallback (`findMenuItemByLabel`), and waiting mechanisms (`waitForElement`) to handle network latency.

## ⚠️ Critical Gotchas
- **Hash-Based Model IDs:** Model options use hash-based `data-test-id` values (e.g., `bard-mode-option-56fdd199312815e2`) that may change when Google updates models. Always maintain `findMenuItemByLabel()` as a fallback.
- **Thinking Level is a Nested Submenu:** The thinking level selector is inside a nested `gem-menu-item[value="thinking_level"]` submenu within the model picker. It requires `mouseenter` + `click` to open, and a wait for the submenu overlay to render.
- **Temp Chat Button:** Now uses `button[aria-label="Temporary chat"]` (v2.0). The old `data-test-id="temp-chat-button"` selector no longer exists. Always use `isElementVisible()` before clicking.
- **Injection Point:** Buttons are injected into `.trailing-actions-wrapper` (below the input area), NOT `.leading-actions-wrapper` (which is now for the upload/tools menu).

## Configuration
- **Hardcoded Defaults:** Configuration objects (e.g., `DEFAULT_SETTINGS` in `ai-studio.user.js`) are defined at the top of the scripts for easy user modification.
- **Selectors:** All CSS selectors are centralized in a `SELECTORS` constant to ease maintenance when Google updates their UI class names.
