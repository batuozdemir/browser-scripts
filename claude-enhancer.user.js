// ==UserScript==
// @name         Claude Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Enhancements for Claude.ai: Model+Effort+Thinking preset buttons, Thinking toggle, Incognito toggle & custom keybindings.
// @author       You
// @match        https://claude.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=claude.ai
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/claude-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/claude-enhancer.user.js
// ==/UserScript==

// ┌──────────────────────────────────────────────────────────────────────┐
// │                        AI AGENT NOTES                                  │
// │  DO NOT REMOVE OR REFACTOR THE FOLLOWING FEATURES:                     │
// │                                                                        │
// │  1. MODEL + EFFORT + THINKING PRESET BUTTONS (S, SX, O, OX)            │
// │     - Injected on the LEFT of the composer toolbar (after "Add files").│
// │     - Each opens the model menu, picks a model by VISIBLE TEXT         │
// │       (no stable testids exist), then opens the nested Effort submenu  │
// │       to set effort + the Thinking switch.                             │
// │     - Must survive SPA navigation (MutationObserver re-injects).       │
// │                                                                        │
// │  2. THINKING TOGGLE (T) + INCOGNITO (Temp) BUTTONS                     │
// │     - Injected on the RIGHT of the composer toolbar.                   │
// │     - T toggles the Thinking switch inside the Effort submenu.         │
// │     - Temp clicks button[aria-label="Use incognito"].                  │
// │                                                                        │
// │  3. KEYBINDINGS                                                        │
// │     - Enter AND Shift+Enter -> newline.                                │
// │     - Cmd/Ctrl+Enter -> send (button[aria-label="Send message"]).      │
// │     - Editor is TipTap/ProseMirror (data-testid="chat-input").         │
// │                                                                        │
// │  4. AUTO-FOCUS INPUT FIELD (cursor at end).                            │
// │                                                                        │
// │  GOTCHAS:                                                              │
// │   - Model rows have NO stable testid -> matched by family text         │
// │     (Opus/Sonnet/Haiku/Fable). base-ui ids (base-ui-_r_xx_) are        │
// │     per-render; never use them as selectors.                          │
// │   - Effort options DO have stable testids: effort-option-{low,medium,  │
// │     high,max}. The Thinking switch lives in the same submenu.          │
// │   - Menus render in .z-popover portals at body level -> query globally │
// │     and hide them during automation so they don't flicker.            │
// └──────────────────────────────────────────────────────────────────────┘

(function () {
    'use strict';

    // Singleton guard - prevent double execution on SPA navigation
    if (window.__claudeEnhancerLoaded) {
        console.log("Claude Enhancer: Already loaded, skipping duplicate injection.");
        return;
    }
    window.__claudeEnhancerLoaded = true;

    // --- Configuration ---
    const SELECTORS = {
        // Composer toolbar (injection container)
        toolbar: 'div.relative.flex.gap-2.w-full.items-center',
        addFilesBtn: 'button[aria-label="Add files, connectors, and more"]',

        // Model picker
        modelTrigger: 'button[data-testid="model-selector-dropdown"]',
        // Model rows: role="menuitemradio" matched by visible family text (see below)
        menu: '[role="menu"]',
        modelRow: '[role="menuitemradio"]',

        // Effort nested submenu (lives inside the open model menu)
        effortTrigger: '[data-testid="effort-menu-trigger"]',
        // effort-option-{low,medium,high,max}
        thinkingSwitch: '[role="switch"][aria-label="Thinking"]',

        // Incognito (temp chat)
        incognitoBtn: 'button[aria-label="Use incognito"]',

        // Overlay portals (hidden during automation)
        popover: '.z-popover',

        // Input + Send
        inputField: 'div[contenteditable="true"][data-testid="chat-input"]',
        sendButton: 'button[aria-label="Send message"]'
    };

    const EFFORT_TESTID = {
        low: 'effort-option-low',
        medium: 'effort-option-medium',
        high: 'effort-option-high',
        max: 'effort-option-max'
    };

    // Preset buttons (left side). Models matched by family word (version-proof).
    const PRESETS = [
        { label: 'S',  model: 'Sonnet', effort: 'low',    thinking: false, title: 'Sonnet · Low · Thinking off' },
        { label: 'SX', model: 'Sonnet', effort: 'high',   thinking: true,  title: 'Sonnet · High · Thinking on' },
        { label: 'O',  model: 'Opus',   effort: 'medium', thinking: false, title: 'Opus · Medium · Thinking off' },
        { label: 'OX', model: 'Opus',   effort: 'max',    thinking: true,  title: 'Opus · Max · Thinking on' }
    ];

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // --- Helpers ---

    function isElementVisible(el) {
        if (!el) return false;
        if (el.offsetParent === null) {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'sticky') {
                return style.display !== 'none' && style.visibility !== 'hidden';
            }
            return false;
        }
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    /** Polls for an element matching selector. 10ms intervals for near-instant response. */
    function waitForSelector(selector, timeoutMs = 400) {
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

    /** Finds a non-disabled model row whose visible name starts with the given family word. */
    function findModelRow(family) {
        const rows = document.querySelectorAll(SELECTORS.modelRow);
        const want = family.toLowerCase();
        for (const row of rows) {
            if (row.getAttribute('aria-disabled') === 'true') continue;
            const nameEl = row.querySelector('.font-ui') || row;
            const name = (nameEl.textContent || '').trim().toLowerCase();
            if (name.startsWith(want) || name.includes(want)) return row;
        }
        return null;
    }

    function isModelMenuOpen() {
        const t = document.querySelector(SELECTORS.modelTrigger);
        return !!(t && t.getAttribute('aria-expanded') === 'true');
    }

    function closeMenus() {
        // base-ui closes menus on outside pointerdown / Escape
        document.body.click();
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true
        }));
    }

    // --- Overlay hiding (so menus don't visibly flash during automation) ---
    function hideMenuOverlays() {
        document.body.classList.add('claude-enhancer-hiding-menus');
    }
    function showMenuOverlays() {
        document.body.classList.remove('claude-enhancer-hiding-menus');
    }

    // --- Menu navigation primitives ---

    async function ensureModelMenuOpen() {
        if (isModelMenuOpen()) return true;
        const trigger = document.querySelector(SELECTORS.modelTrigger);
        if (!trigger) {
            console.error("Claude Enhancer: Model trigger not found.");
            return false;
        }
        trigger.click();
        const menu = await waitForSelector(SELECTORS.menu, 500);
        return !!menu;
    }

    async function selectModel(family) {
        if (!(await ensureModelMenuOpen())) return false;

        let row = null;
        for (let i = 0; i < 40; i++) {
            row = findModelRow(family);
            if (row) break;
            await sleep(10);
        }
        if (!row) {
            console.warn(`Claude Enhancer: Model "${family}" not found in menu.`);
            return false;
        }
        row.click();
        console.log(`Claude Enhancer: Selected model ${family}`);
        return true;
    }

    /** Opens the nested Effort submenu (requires the model menu to be open). */
    async function openEffortSubmenu() {
        if (!(await ensureModelMenuOpen())) return false;

        const trigger = await waitForSelector(SELECTORS.effortTrigger, 500);
        if (!trigger) {
            console.warn("Claude Enhancer: Effort submenu trigger not found.");
            return false;
        }
        if (trigger.getAttribute('aria-expanded') !== 'true') {
            trigger.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
            trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            trigger.click();
        }
        // Wait for any effort option to render
        const ok = await waitForSelector(`[data-testid="${EFFORT_TESTID.low}"]`, 500);
        return !!ok;
    }

    async function selectEffort(level) {
        const testid = EFFORT_TESTID[level];
        if (!testid) return false;
        const opt = await waitForSelector(`[data-testid="${testid}"]`, 400);
        if (!opt) {
            console.warn(`Claude Enhancer: Effort option "${level}" not found.`);
            return false;
        }
        opt.click();
        console.log(`Claude Enhancer: Selected effort ${level}`);
        return true;
    }

    function readThinkingState() {
        const sw = document.querySelector(SELECTORS.thinkingSwitch);
        if (!sw) return null;
        return sw.getAttribute('aria-checked') === 'true';
    }

    /** Sets the Thinking switch to a desired boolean (requires the Effort submenu open). */
    async function setThinking(desired) {
        const sw = await waitForSelector(SELECTORS.thinkingSwitch, 400);
        if (!sw) {
            console.warn("Claude Enhancer: Thinking switch not found.");
            return false;
        }
        const current = sw.getAttribute('aria-checked') === 'true';
        if (current !== desired) {
            sw.click();
            console.log(`Claude Enhancer: Thinking -> ${desired ? 'on' : 'off'}`);
        }
        return true;
    }

    // --- Combined preset: model + effort + thinking ---
    async function applyPreset(model, effort, thinking) {
        hideMenuOverlays();
        try {
            await selectModel(model);          // may close the menu
            await sleep(60);

            if (await openEffortSubmenu()) {
                // Set thinking FIRST (switch keeps the submenu open),
                // then effort (clicking a radio closes the menu).
                if (typeof thinking === 'boolean') await setThinking(thinking);
                if (effort) await selectEffort(effort);
            }
        } finally {
            closeMenus();
            showMenuOverlays();
        }
        focusInputField();
    }

    // --- Thinking toggle (T button) ---
    let lastThinkingIntent = null; // optimistic state for button highlight

    async function toggleThinking() {
        hideMenuOverlays();
        let result = null;
        try {
            if (await openEffortSubmenu()) {
                const cur = readThinkingState();
                const next = cur === null ? true : !cur;
                await setThinking(next);
                result = next;
            }
        } finally {
            closeMenus();
            showMenuOverlays();
        }
        if (result !== null) {
            lastThinkingIntent = result;
            updateThinkingButtonState();
        }
        focusInputField();
        return result;
    }

    function updateThinkingButtonState() {
        const btn = document.getElementById('tm-claude-thinking-btn');
        if (btn) btn.classList.toggle('tm-active', lastThinkingIntent === true);
    }

    // --- Incognito (temp chat) ---
    let isIncognitoActivating = false;

    async function toggleIncognito() {
        if (isIncognitoActivating) return false;
        isIncognitoActivating = true;
        try {
            let btn = document.querySelector(SELECTORS.incognitoBtn);
            for (let i = 0; i < 40 && !(btn && isElementVisible(btn)); i++) {
                await sleep(50);
                btn = document.querySelector(SELECTORS.incognitoBtn);
            }
            if (btn && isElementVisible(btn)) {
                btn.click();
                console.log("Claude Enhancer: Toggled incognito.");
                return true;
            }
            console.error("Claude Enhancer: Incognito button not found.");
            return false;
        } finally {
            isIncognitoActivating = false;
        }
    }

    // --- Auto-focus input ---
    async function focusInputField(maxAttempts = 20, delay = 150) {
        for (let i = 0; i < maxAttempts; i++) {
            const editor = document.querySelector(SELECTORS.inputField);
            if (editor) {
                editor.focus();
                const selection = window.getSelection();
                if (selection) {
                    selection.selectAllChildren(editor);
                    selection.collapseToEnd();
                }
                return;
            }
            await sleep(delay);
        }
    }

    // --- Keybindings ---
    // Enter & Shift+Enter -> newline ; Cmd/Ctrl+Enter -> send.
    function handleInputKeydown(e) {
        const t = e.target;
        if (!t || !t.isContentEditable) return;
        if (e.key !== 'Enter' || e.isComposing) return;

        // Cmd/Ctrl+Enter -> send
        if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            const sendBtn = document.querySelector(SELECTORS.sendButton);
            if (sendBtn && !sendBtn.disabled) sendBtn.click();
            return;
        }

        // Shift+Enter -> let ProseMirror's default hard break happen (newline)
        if (e.shiftKey) return;

        // Plain Enter -> convert to a Shift+Enter (newline) so Claude doesn't send
        e.preventDefault();
        e.stopPropagation();
        t.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            shiftKey: true, bubbles: true, cancelable: true
        }));
    }

    // --- UI: button builders ---
    function makeButton({ id, label, title, onClick }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tm-claude-btn';
        if (id) btn.id = id;
        btn.title = title;
        btn.textContent = label;
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        };
        return btn;
    }

    function buildLeftGroup() {
        const group = document.createElement('div');
        group.id = 'tm-claude-left';
        group.className = 'tm-claude-group';
        PRESETS.forEach(p => {
            group.appendChild(makeButton({
                label: p.label,
                title: p.title,
                onClick: () => applyPreset(p.model, p.effort, p.thinking)
            }));
        });
        return group;
    }

    function buildRightGroup() {
        const group = document.createElement('div');
        group.id = 'tm-claude-right';
        group.className = 'tm-claude-group';
        group.appendChild(makeButton({
            id: 'tm-claude-thinking-btn',
            label: 'T',
            title: 'Toggle Thinking',
            onClick: () => toggleThinking()
        }));
        group.appendChild(makeButton({
            label: 'Temp',
            title: 'Toggle Incognito chat',
            onClick: () => toggleIncognito()
        }));
        return group;
    }

    // --- Injection ---
    function injectButtons() {
        const toolbar = document.querySelector(SELECTORS.toolbar);
        if (!toolbar) return;

        // LEFT group: into the empty slot right after the "Add files" group
        if (!document.getElementById('tm-claude-left')) {
            const left = buildLeftGroup();
            const addBtn = toolbar.querySelector(SELECTORS.addFilesBtn);
            const leadingGroup = addBtn ? addBtn.closest('div.relative.shrink-0') : null;
            const slot = leadingGroup && leadingGroup.nextElementSibling;
            if (slot && slot.matches('div.flex.flex-row.items-center')) {
                slot.appendChild(left);
            } else if (leadingGroup) {
                leadingGroup.insertAdjacentElement('afterend', left);
            } else {
                toolbar.insertBefore(left, toolbar.firstChild);
            }
        }

        // RIGHT group: just before the model-selector wrapper
        if (!document.getElementById('tm-claude-right')) {
            const right = buildRightGroup();
            const modelTrigger = toolbar.querySelector(SELECTORS.modelTrigger);
            const modelGroup = modelTrigger
                ? modelTrigger.closest('div.flex.items-center.gap-2.min-w-0')
                : null;
            if (modelGroup && modelGroup.parentElement === toolbar) {
                toolbar.insertBefore(right, modelGroup);
            } else {
                toolbar.appendChild(right);
            }
            updateThinkingButtonState();
        }
    }

    // --- URL parameters ---
    let urlParamsHandled = false;
    function checkUrlParams() {
        if (urlParamsHandled) return;
        urlParamsHandled = true;

        const params = new URLSearchParams(window.location.search);
        const modelParam = params.get('model');
        const effortParam = params.get('effort');
        const thinkingParam = params.get('thinking');
        const incognitoParam = params.get('incognito');

        const MODEL_MAP = {
            opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable'
        };

        const model = modelParam ? MODEL_MAP[modelParam.toLowerCase()] : null;
        const effort = effortParam && EFFORT_TESTID[effortParam.toLowerCase()]
            ? effortParam.toLowerCase() : null;
        let thinking;
        if (thinkingParam != null) {
            const v = thinkingParam.toLowerCase();
            thinking = (v === 'on' || v === 'true' || v === '1');
        }

        if (model || effort || thinking !== undefined) {
            setTimeout(async () => {
                // Wait for the toolbar to exist before driving menus
                await waitForSelector(SELECTORS.modelTrigger, 8000);
                if (model) {
                    await applyPreset(model, effort, thinking);
                } else {
                    // No model: only adjust effort/thinking on the current model
                    hideMenuOverlays();
                    try {
                        if (await openEffortSubmenu()) {
                            if (thinking !== undefined) await setThinking(thinking);
                            if (effort) await selectEffort(effort);
                        }
                    } finally {
                        closeMenus();
                        showMenuOverlays();
                    }
                    focusInputField();
                }
            }, 1200);
        }

        if (incognitoParam === '1' || incognitoParam === 'true') {
            (async () => {
                await waitForSelector(SELECTORS.incognitoBtn, 8000);
                await toggleIncognito();
            })();
        }
    }

    // --- Styles ---
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .claude-enhancer-hiding-menus ${SELECTORS.popover} {
                visibility: hidden !important;
                pointer-events: none !important;
            }
            .claude-enhancer-hiding-menus ${SELECTORS.popover},
            .claude-enhancer-hiding-menus ${SELECTORS.popover} * {
                transition: none !important;
                animation: none !important;
            }

            .tm-claude-group {
                display: flex;
                align-items: center;
                gap: 4px;
                flex-shrink: 0;
            }

            .tm-claude-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                height: 28px;
                padding: 0 9px;
                border-radius: 8px;
                border: 1px solid rgba(128, 128, 128, 0.22);
                background-color: transparent;
                font-family: var(--font-ui, 'Söhne', ui-sans-serif, system-ui, sans-serif);
                font-size: 12px;
                font-weight: 500;
                line-height: 1;
                color: inherit;
                opacity: 0.75;
                cursor: pointer;
                transition: background-color 0.15s ease, opacity 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .tm-claude-btn:hover {
                background-color: rgba(128, 128, 128, 0.15);
                opacity: 1;
                border-color: rgba(128, 128, 128, 0.4);
            }
            .tm-claude-btn:active {
                transform: scale(0.96);
            }
            .tm-claude-btn.tm-active {
                opacity: 1;
                color: var(--cds-fill-accent, #c96442);
                border-color: var(--cds-fill-accent, #c96442);
            }
        `;
        document.head.appendChild(style);
    }

    // --- Init ---
    function init() {
        console.log("Claude Enhancer v1.0: Initializing...");

        document.addEventListener('keydown', handleInputKeydown, true);

        injectStyles();
        injectButtons();

        const observer = new MutationObserver(() => injectButtons());
        observer.observe(document.body, { childList: true, subtree: true });

        const interval = setInterval(injectButtons, 2000);
        setTimeout(() => clearInterval(interval), 30000);

        checkUrlParams();
        focusInputField();
    }

    init();
})();
