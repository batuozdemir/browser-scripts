// ==UserScript==
// @name         Gemini Enhancer
// @namespace    http://tampermonkey.net/
// @version      3.2.0
// @description  Enhancements for Google Gemini: Model+Thinking Toggles, Temp Chat & Custom Keybindings.
// @author       You
// @match        https://gemini.google.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/gemini-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/gemini-enhancer.user.js
// ==/UserScript==

// ┌──────────────────────────────────────────────────────────────────────┐
// │                        AI AGENT NOTES                              │
// │  DO NOT REMOVE OR REFACTOR THE FOLLOWING FEATURES:                 │
// │                                                                    │
// │  1. TEMP CHAT (button[aria-label="Temporary chat"])                │
// │     - The temp chat button is in the sidebar nav area.             │
// │     - Always check visibility via isElementVisible() before        │
// │       assuming the button is clickable.                            │
// │     - Functions: activateTempChatFromUrl(), toggleTempChat()       │
// │     - Helper: isElementVisible()                                   │
// │                                                                    │
// │  2. KEYBINDINGS (Cmd/Ctrl+Enter to send, Enter for newline)       │
// │     - Must remain on all contenteditable fields.                   │
// │                                                                    │
// │  3. MODE+THINKING BUTTONS (F, FX, PX) + THINKING + TEMP CHAT     │
// │     - Injected below the input area in .trailing-actions-wrapper.  │
// │     - Must survive SPA navigation.                                 │
// │     - Each button selects a model AND a thinking level via         │
// │       two-step menu navigation.                                    │
// │                                                                    │
// │  4. AUTO-FOCUS INPUT FIELD                                         │
// │     - Focuses input and places cursor at end of existing text.     │
// └──────────────────────────────────────────────────────────────────────┘

(function () {
    'use strict';

    // Singleton guard - prevent double execution on SPA navigation
    if (window.__geminiEnhancerLoaded) {
        console.log("Gemini Enhancer: Already loaded, skipping duplicate injection.");
        return;
    }
    window.__geminiEnhancerLoaded = true;

    // Configuration
    const SELECTORS = {
        // Injection point: below the input area, trailing side
        container: '.trailing-actions-wrapper',

        // Model picker trigger (unchanged)
        triggerBtn: '[data-test-id="bard-mode-menu-button"]',

        // Model options (hash-based IDs — may change when Google updates models)
        optionFlash: '[data-test-id="bard-mode-option-56fdd199312815e2"]',
        optionPro: '[data-test-id="bard-mode-option-e6fa609c3fa255c0"]',

        // Thinking level submenu
        thinkingLevelTrigger: 'gem-menu-item[value="thinking_level"]',

        // Temp Chat
        tempChatTrigger: 'button[aria-label="Temporary chat"]',

        // Input & Send
        sendButton: 'button[aria-label="Send message"]',
        inputField: 'rich-textarea .ql-editor[contenteditable="true"]'
    };

    /**
     * Checks if a DOM element is visible and interactable.
     */
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

    /**
     * Finds a menu item by its label text content (fallback for hash-based selectors).
     * Searches within currently visible overlay/menu panels.
     * @param {string} labelText - The text to match (trimmed)
     * @returns {Element|null}
     */
    function findMenuItemByLabel(labelText) {
        const items = document.querySelectorAll('gem-menu-item .label');
        for (const label of items) {
            if (label.textContent.trim().toLowerCase().includes(labelText.toLowerCase())) {
                return label.closest('gem-menu-item');
            }
        }
        return null;
    }

    // --- Feature 0: Auto-Focus Input Field ---
    /**
     * Focuses the text input field. Polls until the element is available.
     * @param {number} maxAttempts - Maximum number of polling attempts.
     * @param {number} delay - Delay in ms between attempts.
     */
    async function focusInputField(maxAttempts = 20, delay = 150) {
        for (let i = 0; i < maxAttempts; i++) {
            const editor = document.querySelector(SELECTORS.inputField);
            if (editor) {
                editor.focus();
                // Move cursor to end of existing text (contenteditable div)
                const selection = window.getSelection();
                if (selection) {
                    selection.selectAllChildren(editor);
                    selection.collapseToEnd();
                }
                console.log('Gemini Enhancer: Input field focused (cursor at end).');
                return;
            }
            await new Promise(r => setTimeout(r, delay));
        }
        console.warn('Gemini Enhancer: Could not find input field to focus.');
    }

    // --- Caret preservation (for actions that re-render the input) ---

    /**
     * Returns the caret's character offset within the input field, or -1 if the
     * caret/selection isn't currently inside the editor.
     */
    function getCaretOffset() {
        const editor = document.querySelector(SELECTORS.inputField);
        const sel = window.getSelection();
        if (!editor || !sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
            return -1;
        }
        const range = sel.getRangeAt(0);
        const pre = range.cloneRange();
        pre.selectNodeContents(editor);
        pre.setEnd(range.endContainer, range.endOffset);
        return pre.toString().length;
    }

    /** Places the caret at `offset` characters into the input field. */
    function setCaretOffset(offset) {
        const editor = document.querySelector(SELECTORS.inputField);
        if (!editor) return;
        editor.focus();
        const sel = window.getSelection();
        if (!sel) return;

        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
        let remaining = offset, node = walker.nextNode(), target = null, targetOffset = 0;
        while (node) {
            const len = node.textContent.length;
            if (remaining <= len) { target = node; targetOffset = remaining; break; }
            remaining -= len;
            node = walker.nextNode();
        }

        const range = document.createRange();
        if (target) {
            range.setStart(target, targetOffset);
        } else {
            range.selectNodeContents(editor);
            range.collapse(false); // past end -> clamp to end
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * Keeps the caret pinned across an action that re-renders the input (e.g. the
     * Temp Chat toggle, which otherwise snaps the caret to the start a few hundred
     * ms later). Watches for ~700ms: tracks the furthest-forward caret position so
     * continued typing isn't clobbered, and only corrects when the editor snaps the
     * caret back to the start (or loses focus).
     * @param {number} startOffset - caret offset captured before the action.
     */
    async function preserveCaretAcrossRerender(startOffset) {
        if (startOffset < 0) return;
        let best = startOffset;
        for (let i = 0; i < 14; i++) {
            await new Promise(r => setTimeout(r, 50));
            const cur = getCaretOffset();
            if (cur > best) {
                best = cur; // user moved forward / typed more — respect it
            } else if (cur <= 0 && best > 0) {
                setCaretOffset(best); // snapped to start or lost focus — restore
            }
        }
    }

    // --- Feature 1: Keybindings (Cmd+Enter to Send, Enter to Newline) ---
    function handleInputKeydown(e) {
        const t = e.target;
        if (!t || !t.isContentEditable) return;
        // Ignore Enter while an IME/autocomplete composition is active, otherwise
        // confirming a composition would be hijacked into a newline.
        if (e.key !== 'Enter' || e.isComposing) return;

        // CMD+ENTER (or CTRL+ENTER) -> Submit
        if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();

            const sendBtn = document.querySelector(SELECTORS.sendButton) ||
                document.querySelector('button[aria-label="Send"]');

            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
            }
            return;
        }

        // SHIFT/ALT+ENTER -> let Gemini's default newline happen.
        if (e.shiftKey || e.altKey) return;

        // Plain ENTER -> New Line (instead of sending)
        e.preventDefault();
        e.stopPropagation();
        document.execCommand('insertText', false, '\n');
    }

    // --- Feature 2: Mode + Thinking Selection ---

    /**
     * Aggressively hides the CDK overlay container so menus are completely invisible
     * during programmatic model/thinking selection. Uses both inline styles (immediate)
     * and a CSS class (catches overlays created mid-operation).
     */
    // Nest-safe hide depth: hides while > 0. Lets an outer scope (e.g. the
    // initial URL automation) hold the overlay hidden across several inner
    // hide/show pairs so the menu never flashes in the gaps between steps.
    let menuHideDepth = 0;

    // Overlay elements hidden inline as a backup to the CSS class (catches any
    // element already present when hiding starts). Top-layer [popover] submenus
    // are included so they can't leak a paint frame.
    const OVERLAY_HIDE_SELECTOR = '.cdk-overlay-container, .cdk-overlay-pane, ' +
        '.cdk-overlay-connected-position-bounding-box, .cdk-overlay-popover, [popover]';

    function hideMenuOverlays() {
        menuHideDepth++;
        document.body.classList.add('gemini-enhancer-hiding-menus');
        document.querySelectorAll(OVERLAY_HIDE_SELECTOR).forEach(el => {
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
        });
    }

    function showMenuOverlays() {
        menuHideDepth = Math.max(0, menuHideDepth - 1);
        if (menuHideDepth > 0) return; // still held by an outer scope
        document.body.classList.remove('gemini-enhancer-hiding-menus');
        document.querySelectorAll(OVERLAY_HIDE_SELECTOR).forEach(el => {
            el.style.removeProperty('visibility');
            el.style.removeProperty('opacity');
            el.style.removeProperty('pointer-events');
        });
    }

    /** Polls until the mode picker menu is closed (or timeout). */
    async function waitForModeMenuClosed(timeoutMs = 400) {
        const start = Date.now();
        while (isModeMenuOpen() && Date.now() - start < timeoutMs) {
            await new Promise(r => setTimeout(r, 10));
        }
    }

    /**
     * Polls for an element matching selector to appear, with a tight timeout.
     * Uses 10ms intervals for near-instant response.
     * @param {string} selector
     * @param {number} timeoutMs
     * @returns {Promise<Element|null>}
     */
    function waitForSelector(selector, timeoutMs = 300) {
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

    /** True when the mode picker menu is currently open. */
    function isModeMenuOpen() {
        const trigger = document.querySelector(SELECTORS.triggerBtn);
        return !!(trigger && trigger.getAttribute('aria-expanded') === 'true');
    }

    /**
     * Opens the mode picker menu if it isn't already open. Idempotent: avoids a
     * blind trigger.click() that would *close* an already-open menu.
     * @returns {boolean} false if the trigger doesn't exist.
     */
    function ensureModeMenuOpen() {
        const trigger = document.querySelector(SELECTORS.triggerBtn);
        if (!trigger) return false;
        if (trigger.getAttribute('aria-expanded') !== 'true') {
            trigger.click();
        }
        return true;
    }

    /**
     * Selects a model from the mode picker menu.
     * Menu overlays are hidden during the operation.
     * @param {string} modelKey - Key into SELECTORS (e.g., 'optionFlash').
     * @returns {Promise<boolean>} true if model was selected successfully.
     */
    async function selectModel(modelKey) {
        if (!ensureModeMenuOpen()) {
            console.error("Gemini Enhancer: Mode dropdown trigger not found.");
            return false;
        }

        // Wait for menu to render (poll for the option)
        const selector = SELECTORS[modelKey];
        let targetOption = selector ? await waitForSelector(selector, 300) : null;

        // Fallback: find by label text
        if (!targetOption) {
            await new Promise(r => setTimeout(r, 50));
            const labelMap = {
                optionFlash: 'Flash',
                optionPro: 'Pro'
            };
            const label = labelMap[modelKey];
            if (label) {
                targetOption = findMenuItemByLabel(label);
            }
        }

        if (targetOption) {
            targetOption.click();
            console.log(`Gemini Enhancer: Selected model ${modelKey}`);
            return true;
        } else {
            console.warn(`Gemini Enhancer: Model option ${modelKey} not found. Closing menu.`);
            document.body.click();
            return false;
        }
    }

    /**
     * Selects a thinking level from the nested submenu.
     * Must be called after the model menu is closed (selectModel() closes it).
     * Menu overlays are hidden during the operation.
     * @param {'standard'|'extended'} level
     * @returns {Promise<boolean>}
     */
    async function selectThinkingLevel(level) {
        // Re-open the model menu (idempotent — won't close it if already open).
        if (!ensureModeMenuOpen()) {
            console.error("Gemini Enhancer: Mode dropdown trigger not found for thinking level.");
            return false;
        }

        // Wait for thinking level trigger to appear
        let thinkingTrigger = await waitForSelector(SELECTORS.thinkingLevelTrigger, 300);

        // Fallback: find by label
        if (!thinkingTrigger) {
            await new Promise(r => setTimeout(r, 50));
            thinkingTrigger = findMenuItemByLabel('Thinking level');
        }

        if (!thinkingTrigger) {
            console.warn("Gemini Enhancer: Thinking level trigger not found.");
            document.body.click();
            return false;
        }

        // Hover to open submenu (Angular Material uses mouseenter for nested menus)
        thinkingTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        thinkingTrigger.click();

        // Wait for submenu to render, then find the level option by label
        const levelLabel = level === 'extended' ? 'Extended' : 'Standard';
        let levelOption = null;
        for (let i = 0; i < 30; i++) {
            levelOption = findMenuItemByLabel(levelLabel);
            if (levelOption) break;
            await new Promise(r => setTimeout(r, 10));
        }

        if (levelOption) {
            levelOption.click();
            console.log(`Gemini Enhancer: Selected thinking level: ${levelLabel}`);
            return true;
        } else {
            console.warn(`Gemini Enhancer: Thinking level "${levelLabel}" not found.`);
            document.body.click();
            return false;
        }
    }

    /**
     * Combined: select a model AND a thinking level.
     * Hides all menu overlays during the entire operation so the user
     * never sees the menus flash open/close.
     * @param {string} modelKey - SELECTORS key (e.g., 'optionFlash')
     * @param {'standard'|'extended'} thinkingLevel
     */
    async function setModeAndThinking(modelKey, thinkingLevel) {
        hideMenuOverlays();
        try {
            const modelSuccess = await selectModel(modelKey);
            if (!modelSuccess) return;

            // Brief pause to let the menu close and UI settle
            await new Promise(r => setTimeout(r, 80));

            await selectThinkingLevel(thinkingLevel);
        } finally {
            showMenuOverlays();
        }

        // Re-focus input after mode switch
        focusInputField();
    }

    /**
     * Toggles thinking between standard and extended on the current model.
     * Opens the mode menu, inspects the current thinking level, and selects
     * the opposite one — all with overlays hidden to prevent visual flicker.
     */
    async function toggleThinking() {
        hideMenuOverlays();
        try {
            // Open menu to inspect current thinking state
            if (!ensureModeMenuOpen()) {
                console.error("Gemini Enhancer: Mode dropdown trigger not found for thinking toggle.");
                return;
            }

            // Wait for thinking level trigger
            let thinkingTrigger = await waitForSelector(SELECTORS.thinkingLevelTrigger, 300);
            if (!thinkingTrigger) {
                await new Promise(r => setTimeout(r, 50));
                thinkingTrigger = findMenuItemByLabel('Thinking level');
            }

            if (!thinkingTrigger) {
                console.warn("Gemini Enhancer: Thinking level trigger not found.");
                document.body.click();
                return;
            }

            // Open the thinking submenu
            thinkingTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            thinkingTrigger.click();

            // Wait for submenu items to render, then detect current state
            let standardItem = null, extendedItem = null;
            for (let i = 0; i < 30; i++) {
                standardItem = findMenuItemByLabel('Standard');
                extendedItem = findMenuItemByLabel('Extended');
                if (standardItem && extendedItem) break;
                await new Promise(r => setTimeout(r, 10));
            }

            if (!standardItem || !extendedItem) {
                console.warn("Gemini Enhancer: Could not find Standard/Extended options.");
                document.body.click();
                return;
            }

            // Detect which is currently active (aria-checked or similar attribute)
            const isExtended = extendedItem.getAttribute('aria-checked') === 'true' ||
                extendedItem.classList.contains('selected');

            // Toggle: if extended → standard, if standard → extended
            const target = isExtended ? standardItem : extendedItem;
            const targetLabel = isExtended ? 'Standard' : 'Extended';
            target.click();
            console.log(`Gemini Enhancer: Toggled thinking to ${targetLabel}`);
        } finally {
            showMenuOverlays();
        }

        // Re-focus input after toggle
        focusInputField();
    }

    // --- Feature 3: Temp Chat ---

    // Global lock to prevent concurrent temp chat activation attempts
    let isTempChatActivating = false;

    /** Helper to find the temp chat button only if it's VISIBLE */
    function findVisibleTempBtn() {
        const el = document.querySelector(SELECTORS.tempChatTrigger);
        return (el && isElementVisible(el)) ? el : null;
    }

    /**
     * Toggles the Temporary Chat feature (for toolbar button click).
     */
    async function toggleTempChat() {
        if (isTempChatActivating) {
            console.log("Gemini Enhancer: Temp Chat activation already in progress, skipping.");
            return false;
        }

        isTempChatActivating = true;
        console.log("Gemini Enhancer: Attempting to toggle Temp Chat...");

        // Wait for the button to appear (up to 3s)
        let btn = findVisibleTempBtn();
        if (!btn) {
            for (let i = 0; i < 60; i++) {
                btn = findVisibleTempBtn();
                if (btn) break;
                await new Promise(r => setTimeout(r, 50));
            }
        }

        if (!btn) {
            console.error("Gemini Enhancer: Cannot find Temp Chat button. Aborting.");
            isTempChatActivating = false;
            return false;
        }

        console.log("Gemini Enhancer: Clicking Temp Chat button...");
        const caret = getCaretOffset();
        btn.click();
        preserveCaretAcrossRerender(caret); // keep the user's cursor in place

        isTempChatActivating = false;
        return true;
    }

    /**
     * Activates Temporary Chat (one-way, for URL parameter use).
     * Will NOT click if already on a temp chat (checks icon state).
     */
    async function activateTempChatFromUrl() {
        if (isTempChatActivating) {
            console.log("Gemini Enhancer: Temp Chat activation already in progress.");
            return false;
        }

        isTempChatActivating = true;
        console.log("Gemini Enhancer: Activating Temp Chat from URL...");

        // Wait for button to appear
        let btn = null;
        for (let i = 0; i < 60; i++) {
            btn = findVisibleTempBtn();
            if (btn) break;
            await new Promise(r => setTimeout(r, 50));
        }

        if (!btn) {
            console.error("Gemini Enhancer: Cannot find Temp Chat button.");
            isTempChatActivating = false;
            return false;
        }

        console.log("Gemini Enhancer: Clicking Temp Chat button...");
        const caret = getCaretOffset();
        btn.click();
        preserveCaretAcrossRerender(caret); // keep the user's cursor in place

        console.log("Gemini Enhancer: Temp Chat activated via URL.");
        isTempChatActivating = false;
        return true;
    }

    // --- Feature 4: Mode Buttons UI ---

    function createModeButtons() {
        const container = document.createElement('div');
        container.className = "gemini-mode-group";
        container.id = "tm-mode-group";

        const modes = [
            {
                label: 'F',
                modelKey: 'optionFlash',
                thinking: 'standard',
                title: 'Flash · Standard Thinking',
                path: 'M7 2v11h3v9l7-12h-4l4-8z' // Lightning Bolt
            },
            {
                label: 'FX',
                modelKey: 'optionFlash',
                thinking: 'extended',
                title: 'Flash · Extended Thinking',
                path: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z' // Lightbulb
            },
            {
                label: 'PX',
                modelKey: 'optionPro',
                thinking: 'extended',
                title: 'Pro · Extended Thinking',
                path: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z' // Lightbulb
            }
        ];

        modes.forEach(mode => {
            const btn = document.createElement('button');
            btn.className = "gemini-mode-btn";
            btn.title = mode.title;
            btn.type = "button";

            // Icon
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("fill", "currentColor");
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", mode.path);
            svg.appendChild(path);
            btn.appendChild(svg);

            // Label
            const span = document.createElement('span');
            span.textContent = mode.label;
            btn.appendChild(span);

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // User made an explicit choice — cancel any pending URL automation
                // so ?model= can't clobber this selection a moment later.
                urlModelActionCancelled = true;
                setModeAndThinking(mode.modelKey, mode.thinking);
            };

            container.appendChild(btn);
        });

        // Splitter
        const splitter = document.createElement('div');
        splitter.className = 'gemini-mode-splitter';
        container.appendChild(splitter);

        // Thinking Toggle Button
        const thinkBtn = document.createElement('button');
        thinkBtn.className = "gemini-mode-btn";
        thinkBtn.title = "Toggle Thinking (Standard ↔ Extended)";
        thinkBtn.type = "button";

        // Brain/Thinking Icon (lightbulb outline)
        const thinkSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        thinkSvg.setAttribute("viewBox", "0 0 24 24");
        thinkSvg.setAttribute("fill", "currentColor");
        const thinkPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        thinkPath.setAttribute("d", "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z");
        thinkSvg.appendChild(thinkPath);
        thinkBtn.appendChild(thinkSvg);

        const thinkSpan = document.createElement('span');
        thinkSpan.textContent = "Thinking";
        thinkBtn.appendChild(thinkSpan);

        thinkBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await toggleThinking();
        };
        container.appendChild(thinkBtn);

        // Temp Chat Button
        const tempBtn = document.createElement('button');
        tempBtn.className = "gemini-mode-btn";
        tempBtn.title = "Toggle Temporary Chat";
        tempBtn.type = "button";

        // Temp Chat Icon (History Toggle / Clock-ish)
        const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        tempSvg.setAttribute("viewBox", "0 0 24 24");
        tempSvg.setAttribute("fill", "currentColor");
        const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tempPath.setAttribute("d", "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z");
        tempSvg.appendChild(tempPath);
        tempBtn.appendChild(tempSvg);

        const tempSpan = document.createElement('span');
        tempSpan.textContent = "Temp";
        tempBtn.appendChild(tempSpan);

        tempBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTempChat();
        };
        container.appendChild(tempBtn);

        return container;
    }

    // --- Feature 5: URL Parameters ---
    let urlParamsHandled = false;
    // Set true when the user clicks a preset button — cancels any pending
    // ?model= URL automation so it can't override the user's explicit choice.
    let urlModelActionCancelled = false;

    function checkUrlParams() {
        if (urlParamsHandled) {
            console.log("Gemini Enhancer: URL params already handled, skipping.");
            return;
        }
        urlParamsHandled = true;

        const params = new URLSearchParams(window.location.search);

        // ?model=flashlite|flash|pro
        const modelParam = params.get('model');
        // ?thinking=standard|extended
        const thinkingParam = params.get('thinking');

        if (modelParam) {
            const modelMap = {
                'flash': 'optionFlash',
                'pro': 'optionPro',
                // Legacy aliases
                'fast': 'optionFlash',
                'thinking': 'optionFlash'
            };
            const modelKey = modelMap[modelParam.toLowerCase()];
            if (modelKey) {
                const thinking = thinkingParam ? thinkingParam.toLowerCase() : 'standard';
                // Fire as soon as the mode trigger exists (near-instant) rather than
                // a fixed delay, and bail out if the user already clicked a preset.
                // Hold the overlay hidden for the whole operation so no menu flashes.
                (async () => {
                    hideMenuOverlays();
                    try {
                        const trigger = await waitForSelector(SELECTORS.triggerBtn, 8000);
                        if (urlModelActionCancelled) {
                            console.log("Gemini Enhancer: URL model selection cancelled by user preset click.");
                            return;
                        }
                        if (!trigger) {
                            console.warn("Gemini Enhancer: Mode trigger never appeared; skipping URL model selection.");
                            return;
                        }
                        console.log(`Gemini Enhancer: Auto-selecting model '${modelParam}' with thinking '${thinking}' from URL`);
                        await setModeAndThinking(modelKey, thinking);
                        await waitForModeMenuClosed();
                    } finally {
                        showMenuOverlays();
                    }
                })();
            }
        } else if (thinkingParam) {
            // Only thinking level specified — just set thinking on current model.
            (async () => {
                hideMenuOverlays();
                try {
                    const trigger = await waitForSelector(SELECTORS.triggerBtn, 8000);
                    if (urlModelActionCancelled) {
                        console.log("Gemini Enhancer: URL thinking selection cancelled by user preset click.");
                        return;
                    }
                    if (!trigger) {
                        console.warn("Gemini Enhancer: Mode trigger never appeared; skipping URL thinking selection.");
                        return;
                    }
                    console.log(`Gemini Enhancer: Auto-selecting thinking level '${thinkingParam}' from URL`);
                    await selectThinkingLevel(thinkingParam.toLowerCase());
                    await waitForModeMenuClosed();
                } finally {
                    showMenuOverlays();
                }
                focusInputField();
            })();
        }

        // ?temp=1|true
        const tempChatParam = params.get('temp');
        if (tempChatParam === '1' || tempChatParam === 'true') {
            (async function attemptTempChatActivation() {
                const maxAttempts = 10;
                const baseDelay = 500;

                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    const tempBtn = document.querySelector(SELECTORS.tempChatTrigger);
                    if (!tempBtn) {
                        console.log(`Gemini Enhancer: Waiting for app to load (attempt ${attempt + 1})...`);
                        await new Promise(r => setTimeout(r, baseDelay));
                        continue;
                    }

                    console.log(`Gemini Enhancer: Attempting Temp Chat activation (attempt ${attempt + 1}/${maxAttempts})...`);
                    const success = await activateTempChatFromUrl();

                    if (success) {
                        console.log("Gemini Enhancer: Temp Chat activated successfully via URL.");
                        return;
                    }

                    const delay = baseDelay + (attempt * 200);
                    console.log(`Gemini Enhancer: Activation attempt failed. Waiting ${delay}ms before retry...`);
                    await new Promise(r => setTimeout(r, delay));
                }

                console.warn("Gemini Enhancer: Failed to activate Temp Chat after all attempts.");
            })();
        }
    }

    // --- Initialization ---

    function init() {
        console.log("Gemini Enhancer v3.2.0: Initializing...");

        // Hook Keybinds
        document.addEventListener('keydown', handleInputKeydown, true);

        // UI Injection Logic — inject as a separate row inside .input-area,
        // AFTER .text-input-field, so it never squeezes the single-line input.
        const findInputArea = () => {
            // Primary: the .input-area container
            const inputArea = document.querySelector('.input-area');
            if (inputArea) return inputArea;

            // Fallback: find via text-input-field parent
            const textField = document.querySelector('.text-input-field');
            if (textField?.parentElement) return textField.parentElement;

            return null;
        };

        const injectButtons = () => {
            if (document.getElementById('tm-mode-group')) return;

            const inputArea = findInputArea();
            if (!inputArea) return;

            const style = window.getComputedStyle(inputArea);
            if (style.display === 'none' || style.visibility === 'hidden') return;

            const btnGroup = createModeButtons();

            // Insert after .text-input-field (before leading/trailing wrappers)
            const textField = inputArea.querySelector('.text-input-field');
            if (textField?.nextSibling) {
                inputArea.insertBefore(btnGroup, textField.nextSibling);
            } else {
                inputArea.appendChild(btnGroup);
            }

            console.log("Gemini Enhancer: Mode buttons injected.");
        };

        // Create styles
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            /* Hide menu overlays during programmatic model/thinking selection.
               Uses visibility:hidden + opacity:0 (NOT off-screen repositioning,
               which causes a reflow that paints a frame before hiding). Layout
               boxes are preserved so .click() and getBoundingClientRect still work.
               The thinking submenu renders as a top-layer [popover] element, so it
               is targeted explicitly alongside the container/panes/bounding-box.
               Kills all transitions/animations so menus appear/disappear instantly. */
            .gemini-enhancer-hiding-menus .cdk-overlay-container,
            .gemini-enhancer-hiding-menus .cdk-overlay-pane,
            .gemini-enhancer-hiding-menus .cdk-overlay-connected-position-bounding-box,
            .gemini-enhancer-hiding-menus .cdk-overlay-popover,
            .gemini-enhancer-hiding-menus [popover] {
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
            .gemini-enhancer-hiding-menus .cdk-overlay-container *,
            .gemini-enhancer-hiding-menus .cdk-overlay-container {
                transition: none !important;
                animation: none !important;
            }

            .gemini-mode-group {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 4px 0 2px;
                height: 32px;
                flex-shrink: 0;
                order: -1;
            }

            .gemini-mode-splitter {
                width: 1px;
                height: 16px;
                background-color: rgba(128, 128, 128, 0.3);
                margin: 0 4px;
                flex-shrink: 0;
            }

            .gemini-mode-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 3px;
                height: 28px;
                padding: 0 8px;
                border-radius: 14px;
                border: 1px solid rgba(128, 128, 128, 0.2);
                background-color: transparent;

                font-family: 'Google Sans', Roboto, sans-serif;
                font-size: 12px;
                font-weight: 500;
                color: inherit;
                opacity: 0.7;
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
                flex-shrink: 0;
            }

            .gemini-mode-btn svg {
                width: 16px;
                height: 16px;
                flex-shrink: 0;
            }

            .gemini-mode-btn:hover {
                background-color: rgba(128, 128, 128, 0.15);
                opacity: 1;
                border-color: rgba(128, 128, 128, 0.4);
            }

            .gemini-mode-btn:active {
                transform: scale(0.96);
            }
        `;
        document.head.appendChild(styleEl);
        injectButtons();

        // Watch for SPA changes
        const observer = new MutationObserver(() => injectButtons());
        observer.observe(document.body, { childList: true, subtree: true });

        // Backup interval
        const interval = setInterval(injectButtons, 2000);
        setTimeout(() => clearInterval(interval), 30000);

        // Check URL Params
        checkUrlParams();

        // Auto-focus input field on load
        focusInputField();
    }

    init();

})();