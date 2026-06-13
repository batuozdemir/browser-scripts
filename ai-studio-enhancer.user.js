// ==UserScript==
// @name         AI Studio Enhancer
// @namespace    http://tampermonkey.net/
// @version      9.2
// @description  Combined model+thinking preset buttons, temporary chat, and silent URL-param automation (model/thinking/search/system-prompt) for Google AI Studio. Rewritten for the Gemini 3 redesign.
// @author       You
// @match        https://aistudio.google.com/prompts/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/ai-studio-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/ai-studio-enhancer.user.js
// ==/UserScript==

// ┌──────────────────────────────────────────────────────────────────────┐
// │                        AI AGENT NOTES                                  │
// │  DO NOT REMOVE OR REFACTOR THE FOLLOWING FEATURES:                     │
// │                                                                        │
// │  1. COMBINED MODEL+THINKING PRESET BUTTONS (Lite, F, FX, P, PX)        │
// │     - Injected inside <ms-prompt-box-tools>, after the "Tools" button. │
// │     - Each opens the model picker, selects the BEST available model    │
// │       of its family (Pro / Flash / Flash-Lite) by VERSION NUMBER, then │
// │       sets the Thinking level. Higher versions auto-win with no script │
// │       update (gemini-3.5-pro > gemini-3.1-pro > gemini-3.1-pro-preview)│
// │     - Live highlight (tm-active) reflects the current model+thinking.  │
// │                                                                        │
// │  2. RIGHT-SIDE BUTTONS (near the Run button): Grd / Temp / Save        │
// │     - Grd toggles button[aria-label="Grounding with Google Search"]    │
// │       (highlighted when on).                                          │
// │     - Temp / Save open the "View more actions" (more_vert) menu and    │
// │       click button[data-test-incognito-toggle] / [data-test-manual-    │
// │       save] respectively.                                             │
// │                                                                        │
// │  3. CODE EXECUTION IS ALWAYS-ON                                        │
// │     - enforceCodeExecution() re-enables button[aria-label="Code        │
// │       execution"] whenever it's found off (on init + every preset).    │
// │                                                                        │
// │  4. SYSTEM PROMPT IS ONLY SET WHEN EMPTY                               │
// │     - Detected via the card subtitle (placeholder text == empty).      │
// │     - The panel is a cdk-overlay dialog; we wait for it to fully       │
// │       unmount before un-hiding overlays so it never flashes.           │
// │                                                                        │
// │  5. SILENT URL-PARAM AUTOMATION (on /new_chat or when ?model= present) │
// │     - ?model=<exact-id>  ?thinking=minimal|low|medium|high             │
// │       ?search=1|0        ?sp=<encoded system prompt>                   │
// │     - Overlays are hidden during automation (zero-flash).             │
// │     - Every action returns the cursor to the prompt box (focusPrompt). │
// │                                                                        │
// │  GOTCHAS:                                                              │
// │   - Model rows: button[id="model-carousel-row-models/<modelId>"].      │
// │     Pick by family + version, NOT by a hardcoded id.                   │
// │   - Thinking is a mat-select[aria-label="Thinking Level"] with options │
// │     Minimal / Low / Medium / High (no token budget any more).          │
// │   - Menus/panels render in .cdk-overlay-container / ms-sliding-right-  │
// │     panel; hidden via the body.aistudio-automating class so .click()   │
// │     still works without visual flicker.                               │
// └──────────────────────────────────────────────────────────────────────┘

(function () {
    'use strict';

    // Main-page guard: never run inside AI Studio's iframes.
    if (window.self !== window.top) return;

    // Singleton guard: survive SPA re-entry without double-binding.
    if (window.__aiStudioEnhancerLoaded) {
        console.log("[AIStudio] Already loaded, skipping duplicate injection.");
        return;
    }
    window.__aiStudioEnhancerLoaded = true;

    // ===================================================================
    // === CONFIGURATION & CONSTANTS
    // ===================================================================

    const SELECTORS = {
        // Model picker
        MODEL_CARD: 'button.model-selector-card',
        MODEL_NAME: '[data-test-id="model-name"]', // subtitle, e.g. "gemini-3.5-flash"
        MODEL_OPTION_PREFIX: 'model-carousel-row-models/',
        MODEL_OPTION: 'button[id^="model-carousel-row-models/"]',

        // Thinking level (mat-select)
        THINKING_SELECT: 'mat-select[aria-label="Thinking Level"]',
        THINKING_VALUE: 'mat-select[aria-label="Thinking Level"] .mat-mdc-select-min-line',
        THINKING_PANEL_OPTION: 'div[role="listbox"][aria-label="Thinking Level"] mat-option',
        THINKING_OPTION_TEXT: '.mdc-list-item__primary-text',

        // Grounding switch
        GROUNDING_SWITCH: 'button[role="switch"][aria-label="Grounding with Google Search"]',

        // Code execution switch (enforced ON)
        CODE_EXEC_SWITCH: 'button[role="switch"][aria-label="Code execution"]',

        // System instructions
        SYS_CARD: 'button[data-test-system-instructions-card]',
        SYS_CARD_SUBTITLE: 'button[data-test-system-instructions-card] .subtitle',
        SYS_TEXTAREA: 'textarea[aria-label="System instructions"]',
        SYS_CLOSE: 'button[data-test-close-button], button[aria-label="Close panel"]',
        SYS_PANEL: '.ms-sliding-right-panel-dialog',

        // Prompt input + injection anchors
        PROMPT_AREA: 'textarea[aria-label="Enter a prompt"]',
        TOOLS_CONTAINER: 'ms-prompt-box-tools',
        TOOLS_BUTTON: 'ms-prompt-box-tools button[aria-label="Open tools menu"]',
        RUN_BUTTON: 'ms-run-button',

        // Temporary chat (incognito) + Save — both live in the "More actions" menu
        MORE_ACTIONS_BTN: 'button[aria-label="View more actions"]',
        INCOGNITO_TOGGLE: 'button[data-test-incognito-toggle]',
        SAVE_BTN: 'button[data-test-manual-save]',

        // Overlays
        OVERLAY_BACKDROP: '.cdk-overlay-backdrop',

        // SPA
        NEW_CHAT_LINK: 'a[href="/prompts/new_chat"]'
    };

    // Each preset = one model family + one thinking level, applied in a single click.
    const PRESETS = [
        { id: 'lite', label: 'Lite', family: 'flash-lite', thinking: 'Minimal', title: 'Flash-Lite · Minimal thinking' },
        { id: 'f',    label: 'F',    family: 'flash',      thinking: 'Low',     title: 'Flash · Low thinking' },
        { id: 'fx',   label: 'FX',   family: 'flash',      thinking: 'High',    title: 'Flash · High thinking' },
        { id: 'p',    label: 'P',    family: 'pro',        thinking: 'Low',     title: 'Pro · Low thinking' },
        { id: 'px',   label: 'PX',   family: 'pro',        thinking: 'High',    title: 'Pro · High thinking' }
    ];

    const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'];

    // The system-instructions card shows this subtitle ONLY when no instructions are set.
    const SYS_EMPTY_SUBTITLE = 'Optional tone and style instructions for the model';

    const DEFAULT_SETTINGS = {
        family: 'pro', // fresh /new_chat defaults to the best Pro model
        sp: `You are a concise, expert-level assistant. Provide precise, actionable answers.

### Interaction Rules
- **Clarify first**: If a request is ambiguous, ask targeted questions.
- **Inference rule**: If ambiguity is minor, state your assumption and proceed.
- **Offer alternatives**: Briefly note valid options and trade-offs.
- **Explain reasoning**: Give short rationale, especially for technical or code tasks.
- **Handle impossibility**: If a solution is impossible, state it clearly and propose the closest feasible alternative.
- **Verification rule**: For destructive or system-level operations, suggest a quick test or dry-run first.
- **Propose next step**: End with a concrete suggestion framed as a question.

### Response Formatting
- **Start with a 1–2 sentence summary** of key insights.
- **Break down** complex problems into clear, numbered steps.
- Use **lists** for steps or trade-offs and **tables** for structured comparisons.
- Use **decision matrices** when presenting multiple options (Pros / Cons / When to use).
- Suggest **external tools or references** when relevant.
- Keep explanations **tight and non-redundant**.
- **Summarize prior context** briefly before modifying work in iterative tasks.

### Code Rules
- Follow **DRY**, write **clean, readable, performant** code.
- Use consistent **typing and formatting** (e.g., Prettier).
- Prefer **copy-pasteable terminal commands** over shell scripts when feasible.
- When editing existing code, rewrite only changed sections with minimal context.
- Add **concise comments** explaining logic or key parameters.

### Tone & Behavior
- Be **direct, professional, and confident**.
- Never mention being an AI.
- Never apologize.
- If unknown, say **“I don’t know with certainty. You could verify by…”**
- Avoid disclaimers, cultural/political commentary, or moral reasoning.
- **Blunt clarity > diplomatic vagueness.**

**Core Principle:**
Be fast, factual, and structured. Focus on delivering maximum value with minimal noise.`
    };

    // State
    let isBusy = false;
    let lastUrl = location.href;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // ===================================================================
    // === UTILITIES
    // ===================================================================

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /** Polls for an element matching selector (10ms intervals). */
    function waitForSelector(selector, timeoutMs = 3000) {
        return new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const start = Date.now();
            const iv = setInterval(() => {
                const found = document.querySelector(selector);
                if (found || Date.now() - start > timeoutMs) {
                    clearInterval(iv);
                    resolve(found || null);
                }
            }, 10);
        });
    }

    /** Classify a model id into a preset family (or null). */
    function classifyModel(id) {
        if (!id) return null;
        if (/flash-lite/.test(id)) return 'flash-lite';
        if (/image|robotics/.test(id)) return null; // image/robotics aren't text-chat presets
        if (/pro/.test(id)) return 'pro';
        if (/flash/.test(id)) return 'flash';
        return null;
    }

    /** Parse a sortable [major, minor] version from a model id ("latest" aliases rank lowest). */
    function parseVersion(id) {
        const m = id.match(/gemini-(\d+)(?:\.(\d+))?/);
        if (!m) return [0, 0];
        return [parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0];
    }

    /** Ranking key: higher version wins; stable release beats preview at the same version. */
    function modelRank(id) {
        const [maj, min] = parseVersion(id);
        const stable = /preview/.test(id) ? 0 : 1;
        return maj * 1000 + min * 10 + stable;
    }

    /** Among the currently-rendered model options, return the best id for a family. */
    function findBestModelId(family) {
        const opts = document.querySelectorAll(SELECTORS.MODEL_OPTION);
        let best = null, bestRank = -1;
        for (const opt of opts) {
            const id = opt.id.slice(SELECTORS.MODEL_OPTION_PREFIX.length);
            if (classifyModel(id) !== family) continue;
            const rank = modelRank(id);
            if (rank > bestRank) { bestRank = rank; best = id; }
        }
        return best;
    }

    function getCurrentModelId() {
        const el = document.querySelector(SELECTORS.MODEL_NAME);
        return el ? el.textContent.trim() : null;
    }

    function getCurrentThinking() {
        const el = document.querySelector(SELECTORS.THINKING_VALUE);
        return el ? el.textContent.trim().toLowerCase() : null;
    }

    function closeOverlays() {
        const backdrop = document.querySelector(SELECTORS.OVERLAY_BACKDROP);
        if (backdrop) backdrop.click();
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true
        }));
    }

    // --- Zero-flash automation: hide overlays/panels while driving menus ---
    function setAutomating(on) {
        document.body.classList.toggle('aistudio-automating', on);
        isBusy = on;
    }

    async function focusPrompt(maxAttempts = 20, delay = 120) {
        for (let i = 0; i < maxAttempts; i++) {
            const el = document.querySelector(SELECTORS.PROMPT_AREA);
            if (el) {
                el.focus();
                const len = el.value.length;
                try { el.setSelectionRange(len, len); } catch (_) { /* noop */ }
                return;
            }
            await sleep(delay);
        }
    }

    // ===================================================================
    // === ACTIONS
    // ===================================================================

    /** Opens the model picker, clicks the option matching `predicate(id)`, then closes. */
    async function pickModel(predicate, describe) {
        const card = document.querySelector(SELECTORS.MODEL_CARD);
        if (!card) { console.warn("[AIStudio] Model card not found."); return false; }

        card.click();
        const firstOpt = await waitForSelector(SELECTORS.MODEL_OPTION, 3000);
        if (!firstOpt) {
            console.warn("[AIStudio] Model picker did not open.");
            closeOverlays();
            return false;
        }
        await sleep(20); // let the full list render

        const target = predicate();
        let ok = false;
        if (target) {
            const btn = document.getElementById(SELECTORS.MODEL_OPTION_PREFIX + target);
            if (btn) {
                btn.click();
                ok = true;
                console.log(`[AIStudio] Selected model ${target}`);
            }
        }
        if (!ok) console.warn(`[AIStudio] No model found for ${describe}`);

        await sleep(30);
        closeOverlays();
        return ok;
    }

    async function selectModelFamily(family) {
        if (classifyModel(getCurrentModelId()) === family) return true; // already there
        return pickModel(() => findBestModelId(family), `family "${family}"`);
    }

    async function selectModelId(id) {
        if (getCurrentModelId() === id) return true;
        return pickModel(() => {
            // Honor the exact id if present, else fall back to its family's best.
            return document.getElementById(SELECTORS.MODEL_OPTION_PREFIX + id)
                ? id
                : findBestModelId(classifyModel(id));
        }, `id "${id}"`);
    }

    async function setThinkingLevel(level) {
        const want = String(level).toLowerCase();
        if (!THINKING_LEVELS.includes(want)) return false;
        if (getCurrentThinking() === want) return true;

        const select = document.querySelector(SELECTORS.THINKING_SELECT);
        if (!select) { console.warn("[AIStudio] Thinking select not found."); return false; }

        select.click();
        const firstOpt = await waitForSelector(SELECTORS.THINKING_PANEL_OPTION, 2000);
        if (!firstOpt) { closeOverlays(); return false; }

        const opts = document.querySelectorAll(SELECTORS.THINKING_PANEL_OPTION);
        for (const opt of opts) {
            const txt = opt.querySelector(SELECTORS.THINKING_OPTION_TEXT)?.textContent.trim().toLowerCase();
            if (txt === want) {
                opt.click();
                console.log(`[AIStudio] Thinking -> ${level}`);
                await sleep(20);
                return true;
            }
        }
        closeOverlays();
        return false;
    }

    function getGroundingState() {
        const sw = document.querySelector(SELECTORS.GROUNDING_SWITCH);
        return sw ? sw.getAttribute('aria-checked') === 'true' : null;
    }

    /** Toggles or sets the Google Search grounding switch. Pass a boolean to force a state. */
    async function setGrounding(desired) {
        const sw = document.querySelector(SELECTORS.GROUNDING_SWITCH);
        if (!sw) { console.warn("[AIStudio] Grounding switch not found."); return false; }
        const cur = sw.getAttribute('aria-checked') === 'true';
        const target = (typeof desired === 'boolean') ? desired : !cur;
        if (cur !== target) {
            sw.click();
            console.log(`[AIStudio] Grounding -> ${target ? 'on' : 'off'}`);
        }
        return true;
    }

    /** Code execution is always-on: turn it back on whenever it's found off. */
    function enforceCodeExecution() {
        const sw = document.querySelector(SELECTORS.CODE_EXEC_SWITCH);
        if (sw && sw.getAttribute('aria-checked') === 'false') {
            sw.click();
            console.log("[AIStudio] Code execution -> on (enforced).");
        }
    }

    /** Closes the system-instructions dialog and waits for it to fully unmount (no slide-out flash). */
    async function closeSysPanel() {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (!document.querySelector(SELECTORS.SYS_PANEL)) return;
            const closeBtn = document.querySelector(SELECTORS.SYS_CLOSE);
            if (closeBtn) closeBtn.click(); else closeOverlays();
            for (let i = 0; i < 30; i++) {
                if (!document.querySelector(SELECTORS.SYS_PANEL)) return;
                await sleep(20);
            }
        }
        closeOverlays(); // last resort
    }

    /** Sets the system prompt ONLY when it's currently empty; never disturbs existing instructions. */
    async function setSystemPrompt(text) {
        const card = document.querySelector(SELECTORS.SYS_CARD);
        if (!card) { console.warn("[AIStudio] System instructions card not found."); return false; }

        // Empty <=> the card still shows the placeholder subtitle. Skip without opening the panel.
        const subtitle = card.querySelector('.subtitle')?.textContent.trim();
        if (subtitle !== SYS_EMPTY_SUBTITLE) return true;

        card.click();
        const textarea = await waitForSelector(SELECTORS.SYS_TEXTAREA, 3000);
        if (!textarea) { await closeSysPanel(); return false; }

        if (textarea.value.trim() === '') {
            textarea.value = text;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            console.log("[AIStudio] System prompt set (was empty).");
        }
        await closeSysPanel();
        return true;
    }

    // --- Combined preset: model family + thinking level ---
    async function applyPreset(family, thinking) {
        if (isBusy) return;
        setAutomating(true);
        try {
            await selectModelFamily(family);
            await sleep(40);
            await setThinkingLevel(thinking);
            enforceCodeExecution();
        } catch (e) {
            console.error("[AIStudio] applyPreset error:", e);
        } finally {
            setAutomating(false);
            setTimeout(updateHighlights, 300);
            focusPrompt();
        }
    }

    // --- Grounding quick-toggle (Grd button) ---
    async function toggleGrounding() {
        await setGrounding();
        setTimeout(updateHighlights, 100);
        focusPrompt();
    }

    /** Opens the "More actions" menu and clicks one of its items, then closes & refocuses. */
    let isMenuActionBusy = false;
    async function clickMoreActionsItem(itemSelector, describe) {
        if (isMenuActionBusy) return;
        isMenuActionBusy = true;
        try {
            const moreBtn = document.querySelector(SELECTORS.MORE_ACTIONS_BTN);
            if (!moreBtn) { console.warn("[AIStudio] 'More actions' button not found."); return; }
            moreBtn.click();
            const item = await waitForSelector(itemSelector, 2000);
            if (item) {
                item.click();
                console.log(`[AIStudio] ${describe}`);
            } else {
                closeOverlays();
            }
        } finally {
            isMenuActionBusy = false;
            focusPrompt();
        }
    }

    const toggleTemporaryChat = () => clickMoreActionsItem(SELECTORS.INCOGNITO_TOGGLE, "Toggled temporary chat.");
    const savePrompt = () => clickMoreActionsItem(SELECTORS.SAVE_BTN, "Saved prompt.");

    // ===================================================================
    // === URL-PARAM AUTOMATION
    // ===================================================================

    function truthy(v) {
        if (v == null) return undefined;
        const s = v.toLowerCase();
        return (s === '1' || s === 'true' || s === 'on' || s === 'yes');
    }

    // Set synchronously (before any await) so overlapping triggers — init, the
    // watchdog URL-change, and the new_chat click listener — can't run concurrently.
    let mainLogicBusy = false;

    async function runMainLogic() {
        if (isBusy || mainLogicBusy) return;
        if (!location.href.includes('/new_chat') && !location.search.includes('model=')) return;
        mainLogicBusy = true;

        try {
            const params = new URLSearchParams(window.location.search);
            const modelParam = params.get('model');
            const thinkingParam = params.get('thinking');
            const searchParam = truthy(params.get('search') ?? params.get('grounding'));
            const sp = params.has('sp') ? decodeURIComponent(params.get('sp')) : DEFAULT_SETTINGS.sp;

            // Wait for the panel to exist before driving it.
            const ready = await waitForSelector(SELECTORS.MODEL_CARD, 8000);
            if (!ready) return;

            setAutomating(true);
            try {
                if (modelParam) {
                    await selectModelId(modelParam);
                } else {
                    await selectModelFamily(DEFAULT_SETTINGS.family);
                }
                await sleep(40);

                if (thinkingParam) await setThinkingLevel(thinkingParam);
                if (searchParam !== undefined) await setGrounding(searchParam);
                enforceCodeExecution();
                await setSystemPrompt(sp);
            } catch (e) {
                console.error("[AIStudio] Automation error:", e);
            } finally {
                setAutomating(false);
                setTimeout(updateHighlights, 300);
                focusPrompt();
            }
        } finally {
            mainLogicBusy = false;
        }
    }

    // ===================================================================
    // === UI INJECTION & HIGHLIGHTING
    // ===================================================================

    function makeButton({ id, label, title, onClick }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = id;
        btn.className = 'tm-aistudio-btn';
        btn.title = title;
        btn.textContent = label;
        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
        return btn;
    }

    // LEFT group: model+thinking presets, after the "Tools" button.
    function buildLeftGroup() {
        const group = document.createElement('div');
        group.id = 'tm-aistudio-left';
        group.className = 'tm-aistudio-group';
        PRESETS.forEach(p => group.appendChild(makeButton({
            id: 'tm-aistudio-' + p.id,
            label: p.label,
            title: p.title,
            onClick: () => applyPreset(p.family, p.thinking)
        })));
        return group;
    }

    // RIGHT group: Grd / Temp / Save, near the Run button.
    function buildRightGroup() {
        const group = document.createElement('div');
        group.id = 'tm-aistudio-right';
        group.className = 'tm-aistudio-group';
        group.appendChild(makeButton({
            id: 'tm-aistudio-grd', label: 'Grd', title: 'Toggle Grounding with Google Search',
            onClick: () => toggleGrounding()
        }));
        group.appendChild(makeButton({
            id: 'tm-aistudio-temp', label: 'Temp', title: 'Toggle temporary chat',
            onClick: () => toggleTemporaryChat()
        }));
        group.appendChild(makeButton({
            id: 'tm-aistudio-save', label: 'Save', title: 'Save prompt',
            onClick: () => savePrompt()
        }));
        return group;
    }

    let codeExecEnforcedOnce = false;

    function injectButtons() {
        // LEFT: presets inside ms-prompt-box-tools, after the Tools button.
        if (!document.getElementById('tm-aistudio-left')) {
            const container = document.querySelector(SELECTORS.TOOLS_CONTAINER);
            if (container) {
                const left = buildLeftGroup();
                const toolsBtn = container.querySelector('button[aria-label="Open tools menu"]');
                if (toolsBtn) toolsBtn.insertAdjacentElement('afterend', left);
                else container.appendChild(left);
            }
        }

        // RIGHT: Grd/Temp/Save just before the Run button.
        if (!document.getElementById('tm-aistudio-right')) {
            const runBtn = document.querySelector(SELECTORS.RUN_BUTTON);
            if (runBtn && runBtn.parentElement) {
                runBtn.parentElement.insertBefore(buildRightGroup(), runBtn);
            } else {
                const container = document.querySelector(SELECTORS.TOOLS_CONTAINER);
                if (container) {
                    const right = buildRightGroup();
                    right.style.marginLeft = 'auto';
                    container.appendChild(right);
                }
            }
        }

        // Code execution stays on once the panel is available.
        if (!codeExecEnforcedOnce && document.querySelector(SELECTORS.CODE_EXEC_SWITCH)) {
            enforceCodeExecution();
            codeExecEnforcedOnce = true;
        }

        updateHighlights();
    }

    /** Highlight the preset whose family + thinking match the live UI, plus Grd when grounding is on. */
    function updateHighlights() {
        const family = classifyModel(getCurrentModelId());
        const thinking = getCurrentThinking();
        PRESETS.forEach(p => {
            const btn = document.getElementById('tm-aistudio-' + p.id);
            if (!btn) return;
            const match = family === p.family && thinking === p.thinking.toLowerCase();
            btn.classList.toggle('tm-active', match);
        });
        const grd = document.getElementById('tm-aistudio-grd');
        if (grd) grd.classList.toggle('tm-active', getGroundingState() === true);
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            body.aistudio-automating .cdk-overlay-container,
            body.aistudio-automating ms-sliding-right-panel {
                visibility: hidden !important;
                pointer-events: none !important;
            }
            body.aistudio-automating .cdk-overlay-container *,
            body.aistudio-automating ms-sliding-right-panel * {
                transition: none !important;
                animation: none !important;
            }

            .tm-aistudio-group {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-left: 6px;
            }
            .tm-aistudio-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 28px;
                padding: 0 10px;
                border-radius: 16px;
                border: 1px solid var(--color-neutral-30, rgba(128,128,128,0.3));
                background-color: transparent;
                color: var(--mat-sys-on-surface, inherit);
                font-family: inherit;
                font-size: 12px;
                font-weight: 500;
                line-height: 1;
                cursor: pointer;
                opacity: 0.8;
                transition: background-color 0.15s ease, opacity 0.15s ease, border-color 0.15s ease;
                white-space: nowrap;
            }
            .tm-aistudio-btn:hover {
                opacity: 1;
                background-color: rgba(128,128,128,0.15);
            }
            .tm-aistudio-btn.tm-active {
                opacity: 1;
                color: var(--mat-sys-primary, #5e97f6);
                border-color: var(--mat-sys-primary, #5e97f6);
            }
        `;
        document.head.appendChild(style);
    }

    // ===================================================================
    // === WATCHDOG (SPA SUPPORT)
    // ===================================================================

    function startWatchdog() {
        const handle = debounce(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                if (location.href.includes('/new_chat')) {
                    setTimeout(runMainLogic, 500);
                }
            }
            injectButtons();
        }, 200);

        const observer = new MutationObserver(handle);
        observer.observe(document.body, { childList: true, subtree: true });

        // Safety-net re-injection for ~30s after load.
        const iv = setInterval(injectButtons, 2000);
        setTimeout(() => clearInterval(iv), 30000);
    }

    function setupGlobalListeners() {
        document.body.addEventListener('click', (e) => {
            if (e.target.closest(SELECTORS.NEW_CHAT_LINK)) {
                setTimeout(runMainLogic, 500);
            }
        }, true);
    }

    // ===================================================================
    // === INIT
    // ===================================================================

    function init() {
        console.log("[AIStudio] Enhancer v9.2: initializing...");
        injectStyles();
        setupGlobalListeners();
        startWatchdog();
        injectButtons();
        runMainLogic();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
