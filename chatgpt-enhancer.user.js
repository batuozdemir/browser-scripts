// ==UserScript==
// @name         ChatGPT Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  Enhancements for ChatGPT: intelligence preset buttons, temporary chat, URL params, auto-focus, and custom keybindings.
// @author       You
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/chatgpt-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/chatgpt-enhancer.user.js
// ==/UserScript==

// ┌──────────────────────────────────────────────────────────────────────┐
// │                        AI AGENT NOTES                                  │
// │  DO NOT REMOVE OR REFACTOR THE FOLLOWING FEATURES:                     │
// │                                                                        │
// │  1. INTELLIGENCE PRESET BUTTONS (I, M, H)                              │
// │     - Current inspected ChatGPT Plus DOM exposes Instant / Medium /     │
// │       High in data-testid="composer-intelligence-picker-content".       │
// │     - Rows are matched by visible text. Do not rely on radix/base-ui ids.│
// │                                                                        │
// │  2. LEFT CMD THINKING CYCLE + TEMPORARY CHAT (Temp)                     │
// │     - Double-press left Cmd cycles one step through Instant/Medium/High. │
// │     - Triple-press left Cmd skips two steps through Instant/Medium/High. │
// │     - Temp clicks button[aria-label="Turn on temporary chat"] or the     │
// │       matching off-state button when present.                            │
// │                                                                        │
// │  3. KEYBINDINGS                                                        │
// │     - Cmd/Ctrl+Enter sends via button[data-testid="send-button"].       │
// │     - Plain Enter inserts a newline; IME composition is preserved.       │
// │     - Right Option tap -> toggle Temporary Chat.                        │
// │                                                                        │
// │  4. URL PARAMS                                                         │
// │     - ?model=instant|medium|high                                        │
// │     - ?thinking=medium|high is an alias for intelligence level.          │
// │     - ?temp=1|true activates Temporary Chat if available.                │
// │                                                                        │
// │  GOTCHAS:                                                              │
// │   - ChatGPT uses generated radix ids; never select by those ids.         │
// │   - Menus render as portal/top-layer popovers. Use pointer/mouse events  │
// │     for automation; plain .click() may not commit selection immediately. │
// │   - Cmd-cycle hides menu visuals with opacity only; do not use           │
// │     visibility:hidden or pointer-events:none during row selection.       │
// └──────────────────────────────────────────────────────────────────────┘

(function () {
    'use strict';

    // Main-page guard: never run inside iframes.
    if (window.self !== window.top) return;

    // Singleton guard: survive SPA re-entry without double-binding.
    if (window.__chatgptEnhancerLoaded) {
        console.log("[ChatGPT] Already loaded, skipping duplicate injection.");
        return;
    }
    window.__chatgptEnhancerLoaded = true;

    const SELECTORS = {
        // Composer / injection anchors
        inputField: '#prompt-textarea[contenteditable="true"], div.ProseMirror[contenteditable="true"][aria-label*="Chat"]',
        sendButton: 'button[data-testid="send-button"], #composer-submit-button, button[aria-label="Send prompt"]',
        composerForm: 'form',
        intelligenceTrigger: 'button.__composer-pill[aria-haspopup="menu"], button[aria-haspopup="menu"][data-tone="neutral"]',
        intelligenceContent: '[data-testid="composer-intelligence-picker-content"]',
        intelligenceRows: '[data-testid="composer-intelligence-picker-content"] [role="menuitemradio"], [data-testid="composer-intelligence-picker-content"] [role="menuitem"]',
        intelligenceLabel: 'span.truncate, span',

        // Temporary Chat
        tempChatButton: 'button[aria-label="Turn on temporary chat"], button[aria-label="Turn off temporary chat"], button[aria-label*="temporary chat" i]',
        tempChatIndicator: '[data-testid="temporary-chat-label"]',

        // Overlays / portals hidden during automation
        popover: '[popover], [role="menu"], [data-radix-popper-content-wrapper], [data-testid="composer-intelligence-picker-content"]'
    };

    const PRESETS = [
        { id: 'instant', label: 'I', title: 'Instant intelligence', labels: ['Instant'] },
        { id: 'medium', label: 'M', title: 'Medium reasoning', labels: ['Medium'] },
        { id: 'high', label: 'H', title: 'High reasoning', labels: ['High'] }
    ];

    const URL_MODEL_ALIASES = {
        i: 'instant',
        fast: 'instant',
        fastest: 'instant',
        instant: 'instant',
        m: 'medium',
        med: 'medium',
        medium: 'medium',
        h: 'high',
        high: 'high'
    };

    const THINKING_ALIASES = {
        medium: 'medium',
        high: 'high'
    };

    const WAIT = {
        pollMs: 10,
        shortMs: 300,
        menuMs: 800,
        startupMs: 8000,
        focusAttempts: 20,
        focusDelayMs: 150,
        tempAttempts: 60,
        tempDelayMs: 50,
        backupIntervalMs: 2000,
        backupDurationMs: 30000,
        highlightDelayMs: 250,
        cmdMultiPressMs: 450
    };

    let tempChatBusy = false;
    let urlParamsHandled = false;
    let urlAutomationCancelled = false;
    let lastAppliedPresetId = null;
    let leftCmdClean = false;
    let leftCmdPressCount = 0;
    let leftCmdPressTimer = null;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function isElementVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function waitForSelector(selector, timeoutMs = WAIT.shortMs) {
        return new Promise(resolve => {
            const found = document.querySelector(selector);
            if (found) {
                resolve(found);
                return;
            }

            const start = Date.now();
            const iv = setInterval(() => {
                const el = document.querySelector(selector);
                if (el || Date.now() - start > timeoutMs) {
                    clearInterval(iv);
                    resolve(el || null);
                }
            }, WAIT.pollMs);
        });
    }

    // --- Right Option tap -> toggle Temporary Chat ---
    // A "tap" = keydown + keyup of right Alt with no other key pressed in between.
    let rightAltClean = false;

    function handleRightOptionKeydown(e) {
        if (e.repeat) return;
        if (e.code === 'AltRight') {
            rightAltClean = true;
            return;
        }
        // Any other key while Alt held -> not a clean tap
        if (rightAltClean) rightAltClean = false;
    }

    function handleRightOptionKeyup(e) {
        if (e.code === 'AltRight' && rightAltClean) {
            rightAltClean = false;
            e.preventDefault();
            e.stopPropagation();
            console.log('[ChatGPT] Right Option tap -> toggling Temporary Chat.');
            toggleTempChat();
        }
    }

    function normalizeText(text) {
        return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function readRowLabel(row) {
        if (!row) return '';
        const labelEl = row.querySelector(SELECTORS.intelligenceLabel);
        return (labelEl || row).textContent || '';
    }

    function findIntelligenceTrigger() {
        const triggers = Array.from(document.querySelectorAll(SELECTORS.intelligenceTrigger))
            .filter(isElementVisible);

        return triggers.find(trigger => {
            const text = normalizeText(trigger.textContent);
            return PRESETS.some(preset => preset.labels.some(label => text.includes(label.toLowerCase())));
        }) || triggers.find(trigger => trigger.getAttribute('aria-expanded') === 'true') || null;
    }

    function findComposerForm() {
        const input = document.querySelector(SELECTORS.inputField);
        return input?.closest(SELECTORS.composerForm) || null;
    }

    function findInjectionAnchor() {
        const trigger = findIntelligenceTrigger();
        if (trigger) {
            const wrapper = trigger.closest('div.relative') || trigger.parentElement;
            if (wrapper?.parentElement) {
                return { parent: wrapper.parentElement, before: wrapper };
            }
        }

        const sendButton = document.querySelector(SELECTORS.sendButton);
        const sendWrapper = sendButton?.parentElement;
        if (sendWrapper?.parentElement) {
            return { parent: sendWrapper.parentElement, before: sendWrapper };
        }

        const form = findComposerForm();
        return form ? { parent: form, before: null } : null;
    }

    function closeMenus() {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true
        }));
        document.body.click();
    }

    function suppressMenuVisuals() {
        document.body.classList.add('chatgpt-enhancer-suppress-menus');
    }

    function restoreMenuVisuals() {
        document.body.classList.remove('chatgpt-enhancer-suppress-menus');
    }

    function dispatchPointerMouseSequence(el) {
        if (!el) return false;

        el.scrollIntoView({ block: 'center', inline: 'center' });
        if (typeof el.focus === 'function') el.focus({ preventScroll: true });

        const rect = el.getBoundingClientRect();
        const eventInit = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            button: 0,
            buttons: 1
        };

        if (window.PointerEvent) {
            el.dispatchEvent(new PointerEvent('pointerdown', {
                ...eventInit,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        if (window.PointerEvent) {
            el.dispatchEvent(new PointerEvent('pointerup', {
                ...eventInit,
                buttons: 0,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }
        el.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('click', { ...eventInit, buttons: 0 }));
        return true;
    }

    function isIntelligenceMenuOpen() {
        const trigger = findIntelligenceTrigger();
        return !!(trigger && trigger.getAttribute('aria-expanded') === 'true');
    }

    async function ensureIntelligenceMenuOpen() {
        if (isIntelligenceMenuOpen()) return true;

        const trigger = findIntelligenceTrigger();
        if (!trigger) {
            console.warn("[ChatGPT] Intelligence picker trigger not found.");
            return false;
        }

        dispatchPointerMouseSequence(trigger);

        const start = Date.now();
        while (Date.now() - start <= WAIT.menuMs) {
            if (isIntelligenceMenuOpen() && document.querySelector(SELECTORS.intelligenceContent)) return true;
            await sleep(WAIT.pollMs);
        }

        return !!document.querySelector(SELECTORS.intelligenceContent);
    }

    function getEnabledIntelligenceRows() {
        return Array.from(document.querySelectorAll(SELECTORS.intelligenceRows))
            .filter(row => row.getAttribute('aria-disabled') !== 'true')
            .filter(row => !row.hasAttribute('disabled'));
    }

    function findIntelligenceRowByLabels(labels) {
        const wanted = labels.map(normalizeText);
        const rows = getEnabledIntelligenceRows();

        return rows.find(row => {
            const text = normalizeText(readRowLabel(row));
            return wanted.some(label => text === label || text.includes(label));
        }) || null;
    }

    function isRowSelected(row) {
        return row?.getAttribute('aria-checked') === 'true' ||
            row?.getAttribute('aria-selected') === 'true' ||
            row?.getAttribute('data-state') === 'checked';
    }

    function getPresetById(id) {
        return PRESETS.find(preset => preset.id === id) || null;
    }

    function getCurrentIntelligenceLabel() {
        const trigger = findIntelligenceTrigger();
        if (!trigger) return '';
        return normalizeText(trigger.textContent);
    }

    function getPresetIdFromText(text) {
        const normalized = normalizeText(text);
        return PRESETS.find(preset => preset.labels.some(label => normalized.includes(normalizeText(label))))?.id || null;
    }

    async function waitForIntelligenceSelection(preset) {
        for (let i = 0; i < 40; i++) {
            const current = getCurrentIntelligenceLabel();
            if (current && preset.labels.some(label => current.includes(normalizeText(label)))) {
                return true;
            }

            const row = findIntelligenceRowByLabels(preset.labels);
            if (row && isRowSelected(row)) {
                return true;
            }

            await sleep(WAIT.pollMs);
        }

        return false;
    }

    async function selectIntelligencePreset(presetId) {
        const preset = getPresetById(presetId);
        if (!preset) return false;

        try {
            if (!(await ensureIntelligenceMenuOpen())) return false;

            let row = null;
            for (let i = 0; i < 40; i++) {
                row = findIntelligenceRowByLabels(preset.labels);
                if (row) break;
                await sleep(WAIT.pollMs);
            }

            if (!row) {
                console.warn(`[ChatGPT] Intelligence option "${preset.title}" not found; skipping.`);
                return false;
            }

            if (!isRowSelected(row)) {
                dispatchPointerMouseSequence(row);
                await waitForIntelligenceSelection(preset);
                console.log(`[ChatGPT] Selected ${preset.title}.`);
            }

            lastAppliedPresetId = preset.id;
            return true;
        } finally {
            closeMenus();
            setTimeout(updateButtonStates, WAIT.highlightDelayMs);
            focusInputField();
        }
    }

    async function cycleThinking(step = 1, suppressVisuals = false) {
        if (suppressVisuals) suppressMenuVisuals();
        try {
            if (!(await ensureIntelligenceMenuOpen())) return false;

            let rowsByPreset = new Map();
            for (let i = 0; i < 40; i++) {
                rowsByPreset = new Map();
                getEnabledIntelligenceRows().forEach(row => {
                    const label = normalizeText(readRowLabel(row));
                    const presetId = getPresetIdFromText(label);
                    if (presetId && !rowsByPreset.has(presetId)) rowsByPreset.set(presetId, row);
                });
                if (rowsByPreset.size) break;
                await sleep(WAIT.pollMs);
            }

            if (!rowsByPreset.size) {
                console.warn("[ChatGPT] No intelligence rows found for thinking toggle.");
                return false;
            }

            const availablePresetIds = PRESETS.map(preset => preset.id).filter(id => rowsByPreset.has(id));
            const selectedRow = Array.from(rowsByPreset.values()).find(isRowSelected);
            const selectedId = getPresetIdFromText(readRowLabel(selectedRow)) || getPresetIdFromText(getCurrentIntelligenceLabel());
            const currentIndex = Math.max(0, availablePresetIds.indexOf(selectedId));
            const nextId = availablePresetIds[(currentIndex + step) % availablePresetIds.length];
            const next = rowsByPreset.get(nextId);
            const nextLabel = readRowLabel(next).trim();
            dispatchPointerMouseSequence(next);
            const nextPreset = getPresetById(nextId);
            if (nextPreset) await waitForIntelligenceSelection(nextPreset);
            lastAppliedPresetId = nextId;
            console.log(`[ChatGPT] Cycled intelligence to ${nextLabel}.`);
            return true;
        } finally {
            closeMenus();
            if (suppressVisuals) restoreMenuVisuals();
            setTimeout(updateButtonStates, WAIT.highlightDelayMs);
            focusInputField();
        }
    }

    function flushLeftCmdPresses() {
        const count = leftCmdPressCount;
        leftCmdPressCount = 0;
        leftCmdPressTimer = null;

        if (count === 2) {
            urlAutomationCancelled = true;
            cycleThinking(1, true);
        } else if (count >= 3) {
            urlAutomationCancelled = true;
            cycleThinking(2, true);
        }
    }

    function handleGlobalKeydown(e) {
        if (e.repeat) return;
        if (e.code === 'MetaLeft') {
            leftCmdClean = true;
            return;
        }
        // Any other key while left Cmd held or pressed -> invalidate
        if (leftCmdClean) {
            leftCmdClean = false;
        }
        if (leftCmdPressCount > 0) {
            leftCmdPressCount = 0;
            if (leftCmdPressTimer) {
                clearTimeout(leftCmdPressTimer);
                leftCmdPressTimer = null;
            }
        }
    }

    function handleGlobalKeyup(e) {
        if (e.code === 'MetaLeft' && leftCmdClean) {
            leftCmdClean = false;
            leftCmdPressCount++;
            if (leftCmdPressTimer) clearTimeout(leftCmdPressTimer);
            leftCmdPressTimer = setTimeout(flushLeftCmdPresses, WAIT.cmdMultiPressMs);
        }
    }

    async function focusInputField(maxAttempts = WAIT.focusAttempts, delay = WAIT.focusDelayMs) {
        for (let i = 0; i < maxAttempts; i++) {
            const editor = document.querySelector(SELECTORS.inputField);
            if (editor && isElementVisible(editor)) {
                editor.focus();
                const selection = window.getSelection();
                if (selection) {
                    selection.selectAllChildren(editor);
                    selection.collapseToEnd();
                }
                return true;
            }
            await sleep(delay);
        }
        return false;
    }

    function getCaretOffset() {
        const editor = document.querySelector(SELECTORS.inputField);
        const sel = window.getSelection();
        if (!editor || !sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) return -1;

        const range = sel.getRangeAt(0);
        const pre = range.cloneRange();
        pre.selectNodeContents(editor);
        pre.setEnd(range.endContainer, range.endOffset);
        return pre.toString().length;
    }

    function setCaretOffset(offset) {
        const editor = document.querySelector(SELECTORS.inputField);
        const sel = window.getSelection();
        if (!editor || !sel) return;

        editor.focus();
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
        let remaining = offset;
        let node = walker.nextNode();
        let target = null;
        let targetOffset = 0;

        while (node) {
            const len = node.textContent.length;
            if (remaining <= len) {
                target = node;
                targetOffset = remaining;
                break;
            }
            remaining -= len;
            node = walker.nextNode();
        }

        const range = document.createRange();
        if (target) {
            range.setStart(target, targetOffset);
        } else {
            range.selectNodeContents(editor);
            range.collapse(false);
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    async function preserveCaretAcrossRerender(startOffset) {
        if (startOffset < 0) return;
        let best = startOffset;
        for (let i = 0; i < 14; i++) {
            await sleep(50);
            const cur = getCaretOffset();
            if (cur > best) {
                best = cur;
            } else if (cur <= 0 && best > 0) {
                setCaretOffset(best);
            }
        }
    }

    function findVisibleTempChatButton() {
        const btn = document.querySelector(SELECTORS.tempChatButton);
        return btn && isElementVisible(btn) ? btn : null;
    }

    function isTempChatActive() {
        return !!document.querySelector(SELECTORS.tempChatIndicator) ||
            normalizeText(document.querySelector(SELECTORS.tempChatButton)?.getAttribute('aria-label')).includes('turn off');
    }

    async function toggleTempChat() {
        if (tempChatBusy) return false;
        tempChatBusy = true;

        try {
            let btn = findVisibleTempChatButton();
            for (let i = 0; i < WAIT.tempAttempts && !btn; i++) {
                await sleep(WAIT.tempDelayMs);
                btn = findVisibleTempChatButton();
            }

            if (!btn) {
                console.warn("[ChatGPT] Temporary Chat button not found.");
                return false;
            }

            const caret = getCaretOffset();
            btn.click();
            preserveCaretAcrossRerender(caret);
            setTimeout(updateButtonStates, WAIT.highlightDelayMs);
            console.log("[ChatGPT] Toggled Temporary Chat.");
            return true;
        } finally {
            tempChatBusy = false;
        }
    }

    async function activateTempChatFromUrl() {
        if (isTempChatActive()) return true;
        return toggleTempChat();
    }

    function handleInputKeydown(e) {
        const target = e.target;
        if (!target || !target.isContentEditable) return;
        if (e.key !== 'Enter' || e.isComposing) return;

        if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();

            const sendBtn = document.querySelector(SELECTORS.sendButton);
            if (sendBtn && !sendBtn.disabled) sendBtn.click();
            return;
        }

        if (e.shiftKey || e.altKey) return;

        e.preventDefault();
        e.stopPropagation();
        target.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            shiftKey: true,
            bubbles: true,
            cancelable: true
        }));
    }

    function makeButton({ id, label, title, onClick }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = id;
        btn.className = 'tm-chatgpt-btn';
        btn.title = title;
        btn.textContent = label;
        btn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            urlAutomationCancelled = true;
            onClick();
        });
        return btn;
    }

    function buildButtonGroup() {
        const group = document.createElement('div');
        group.id = 'tm-chatgpt-group';
        group.className = 'tm-chatgpt-group';

        PRESETS.forEach(preset => {
            group.appendChild(makeButton({
                id: `tm-chatgpt-preset-${preset.id}`,
                label: preset.label,
                title: preset.title,
                onClick: () => selectIntelligencePreset(preset.id)
            }));
        });

        group.appendChild(makeButton({
            id: 'tm-chatgpt-temp-btn',
            label: 'Temp',
            title: 'Toggle Temporary Chat',
            onClick: () => toggleTempChat()
        }));

        return group;
    }

    function updateButtonStates() {
        const current = getCurrentIntelligenceLabel();

        PRESETS.forEach(preset => {
            const btn = document.getElementById(`tm-chatgpt-preset-${preset.id}`);
            if (!btn) return;

            const textMatches = current && preset.labels.some(label => current.includes(normalizeText(label)));
            btn.classList.toggle('tm-active', textMatches || (!current && lastAppliedPresetId === preset.id));
        });

        const tempBtn = document.getElementById('tm-chatgpt-temp-btn');
        if (tempBtn) tempBtn.classList.toggle('tm-active', isTempChatActive());
    }

    function injectButtons() {
        if (document.getElementById('tm-chatgpt-group')) {
            updateButtonStates();
            return;
        }

        const anchor = findInjectionAnchor();
        if (!anchor?.parent) return;

        const group = buildButtonGroup();
        if (anchor.before) {
            anchor.parent.insertBefore(group, anchor.before);
        } else {
            anchor.parent.appendChild(group);
        }

        updateButtonStates();
    }

    function normalizeUrlPreset(value, aliases) {
        if (!value) return null;
        return aliases[normalizeText(value).replace(/\s+/g, '-')] || null;
    }

    function isTruthyParam(value) {
        if (value == null) return false;
        return ['1', 'true', 'on', 'yes'].includes(normalizeText(value));
    }

    function checkUrlParams() {
        if (urlParamsHandled) return;
        urlParamsHandled = true;

        const params = new URLSearchParams(window.location.search);
        const modelPreset = normalizeUrlPreset(params.get('model'), URL_MODEL_ALIASES);
        const thinkingPreset = normalizeUrlPreset(params.get('thinking'), THINKING_ALIASES);
        const presetId = modelPreset || thinkingPreset;

        if (presetId) {
            (async () => {
                const trigger = await waitForSelector(SELECTORS.intelligenceTrigger, WAIT.startupMs);
                if (urlAutomationCancelled) {
                    console.log("[ChatGPT] URL intelligence selection cancelled by user action.");
                    return;
                }
                if (!trigger) {
                    console.warn("[ChatGPT] Intelligence picker never appeared; skipping URL model selection.");
                    return;
                }
                await selectIntelligencePreset(presetId);
            })();
        }

        if (isTruthyParam(params.get('temp'))) {
            (async () => {
                await waitForSelector(SELECTORS.tempChatButton, WAIT.startupMs);
                if (!urlAutomationCancelled) await activateTempChatFromUrl();
            })();
        }
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .chatgpt-enhancer-suppress-menus ${SELECTORS.popover
                .split(',')
                .map(selector => selector.trim())
                .join(',\n.chatgpt-enhancer-suppress-menus ')} {
                opacity: 0 !important;
                transition: none !important;
                animation: none !important;
            }

            .tm-chatgpt-group {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-inline-end: 6px;
                flex-shrink: 0;
            }

            .tm-chatgpt-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 28px;
                min-width: 28px;
                padding: 0 8px;
                border-radius: 8px;
                border: 1px solid rgba(128, 128, 128, 0.22);
                background-color: transparent;
                color: inherit;
                font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 12px;
                font-weight: 500;
                line-height: 1;
                white-space: nowrap;
                opacity: 0.74;
                cursor: pointer;
                flex-shrink: 0;
                transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease, transform 0.1s ease;
            }

            .tm-chatgpt-btn:hover {
                background-color: rgba(128, 128, 128, 0.14);
                border-color: rgba(128, 128, 128, 0.42);
                opacity: 1;
            }

            .tm-chatgpt-btn:active {
                transform: scale(0.96);
            }

            .tm-chatgpt-btn.tm-active {
                color: var(--text-primary, currentColor);
                border-color: var(--text-primary, rgba(16, 163, 127, 0.9));
                background-color: rgba(16, 163, 127, 0.12);
                opacity: 1;
            }

            @media (max-width: 640px) {
                .tm-chatgpt-group {
                    gap: 3px;
                    margin-inline-end: 4px;
                }

                .tm-chatgpt-btn {
                    min-width: 26px;
                    height: 26px;
                    padding: 0 6px;
                    font-size: 11px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        console.log("[ChatGPT] v1.1.1 initializing.");

        document.addEventListener('keydown', handleGlobalKeydown, true);
        document.addEventListener('keyup', handleGlobalKeyup, true);
        document.addEventListener('keydown', handleInputKeydown, true);
        document.addEventListener('keydown', handleRightOptionKeydown, true);
        document.addEventListener('keyup', handleRightOptionKeyup, true);

        injectStyles();
        injectButtons();

        const observer = new MutationObserver(() => injectButtons());
        observer.observe(document.body, { childList: true, subtree: true });

        const interval = setInterval(injectButtons, WAIT.backupIntervalMs);
        setTimeout(() => clearInterval(interval), WAIT.backupDurationMs);

        checkUrlParams();
        focusInputField();
    }

    init();
})();
