# GEMINI SYSTEM SPECIFICATION

## Project Overview
This repository contains a collection of userscripts designed to enhance Google's AI Studio (`aistudio.google.com`) and Gemini (`gemini.google.com`) web interfaces. These scripts automate configuration settings, add convenience features, and improve the writing experience.

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

### 2. Gemini Enhancer (`gemini-enhancer.user.js`)
**Scope:** `https://gemini.google.com/*`
**Purpose:** Adds "pro" features and better input control to the standard Gemini chat interface.
**Key Features:**
- **Mode Toggle:** Adds a button to the toolbar to toggle between "Thinking" (Pro) and "Fast" (Flash) models.
- **Input Keybindings:**
    - `Cmd+Enter` (or `Ctrl+Enter`): Submits the message (clicks the Send button).
    - `Enter` (without modifiers): Inserts a newline instead of submitting (prevents default behavior).

### 3. Autoplay Bypass (`autoplay-bypass-ads.user.js`)
**Scope:** General / YouTube (presumed based on name)
**Purpose:** Simplistic script to bypass ads or manage autoplay (details pending file analysis, likely minor utility).

## Architecture & patterns
- **Technology:** Vanilla JavaScript intended for execution in a Userscript Manager (Tampermonkey).
- **DOM Interaction:** extensively uses `querySelector` and `MutationObserver` to handle the dynamic, single-page application (SPA) nature of Google's apps.
- **Event Simulation:** Simulates `click`, `input`, and `keydown` events to interact with Angular/Material components that rely on specific event sequences.
- **Robustness:** Includes finding elements by ID, text content fallback, and waiting mechanisms (`waitForElement`) to handle network latency.

## Configuration
- **Hardcoded Defaults:** Configuration objects (e.g., `DEFAULT_SETTINGS` in `ai-studio.user.js`) are defined at the top of the scripts for easy user modification.
- **Selectors:** All CSS selectors are centralized in a `SELECTORS` constant to ease maintenance when Google updates their UI class names.
