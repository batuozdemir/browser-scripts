// ==UserScript==
// @name         ChatGPT Enhancer
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Enhancements for ChatGPT: power preset buttons (Chat and Work), temporary chat, URL params, auto-focus, and custom keybindings.
// @author       You
// @license      GPL-3.0-or-later
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
// │  1. POWER PRESET BUTTONS                                               │
// │     - The model picker (button[aria-label="Select ChatGPT model"])     │
// │       holds a "Power" slider: menuitem[data-reasoning-slider].         │
// │     - Chat has 3 positions (Instant/Medium/High) -> buttons I M H.     │
// │     - Work has 5 positions (combined model+effort in "Default", or     │
// │       Light..Max for an explicit model) -> buttons 1..5.               │
// │     - The slider is driven with synthetic ArrowLeft/ArrowRight keydown │
// │       on the focused slider menuitem; that is what commits the value.  │
// │     - The menu opens on a synthetic pointerdown on the trigger.        │
// │     - Active state: Chat reads data-selected-reasoning-effort on the   │
// │       trigger; Work maps the trigger label to a position learned from  │
// │       the slider (kept in localStorage).                               │
// │                                                                        │
// │  2. TEMPORARY CHAT (Temp)                                              │
// │     - Temp clicks the "Temporary chat" / "Turn off temporary chat"     │
// │       button. A right Cmd tap toggles it too.                          │
// │                                                                        │
// │  3. KEYBINDINGS                                                        │
// │     - Enter sends, Shift+Enter newline: ChatGPT defaults, untouched.   │
// │     - Right Cmd tap -> toggle Temporary Chat. No model hotkeys.        │
// │                                                                        │
// │  4. URL PARAMS                                                         │
// │     - ?thinking=instant|medium|high (?model= too, but ChatGPT strips   │
// │       its own ?model param on load, so it is unreliable).              │
// │     - ?power=1..5 selects that slider position (1-based).              │
// │     - ?temp=1|true activates Temporary Chat.                           │
// │                                                                        │
// │  GOTCHAS:                                                              │
// │   - Never select by radix ids (radix-_r_xx_); they are generated.      │
// │   - While the menu is open the trigger label reads "Thinking effort"   │
// │     or "Select model"; only read the label with the menu closed.       │
// │   - Menu visuals are hidden with opacity only during automation.       │
// └──────────────────────────────────────────────────────────────────────┘

(function () {
    'use strict';

    // Main-page guard: never run inside iframes.
    if (window.self !== window.top) return;

    // Singleton guard: survive SPA re-entry without double-binding.
    if (window.__chatgptEnhancerLoaded) return;
    window.__chatgptEnhancerLoaded = true;

    const SELECTORS = {
        inputField: '.ProseMirror[contenteditable="true"]',
        trigger: 'button[aria-label="Select ChatGPT model"], button[data-codex-intelligence-trigger]',
        triggerLabel: '[class*="ModelPickerTriggerLabel"]',
        menu: '[role="menu"]',
        slider: '[role="menu"] [data-reasoning-slider]',
        sliderThumb: '[role="slider"]',
        tempChatButton: 'button[aria-label="Temporary chat"], button[aria-label="Turn off temporary chat"], button[aria-label*="temporary chat" i]',
        popover: '[data-radix-popper-content-wrapper]'
    };

    const CHAT_PRESETS = [
        { label: 'I', title: 'Instant', efforts: ['none', 'minimal'] },
        { label: 'M', title: 'Medium', efforts: ['medium'] },
        { label: 'H', title: 'High', efforts: ['high'] }
    ];
    const WORK_POSITIONS = 5;

    const URL_MODEL_ALIASES = { i: 0, instant: 0, fast: 0, m: 1, med: 1, medium: 1, h: 2, high: 2 };

    const WAIT = {
        menuMs: 1500,
        stepMs: 1000,
        startupMs: 15000
    };

    const STORAGE_KEY = 'tm-chatgpt-work-positions';

    let busy = false;
    let urlAutomationCancelled = false;
    let rightCmdClean = false;
    let lastStateKey = '';

    // --- Helpers ---

    // Resolves with fn()'s first truthy value, re-checking on DOM mutations; null on timeout.
    function waitFor(fn, timeoutMs) {
        return new Promise(resolve => {
            const first = fn();
            if (first) return resolve(first);
            let timer = null;
            const obs = new MutationObserver(() => {
                const v = fn();
                if (!v) return;
                obs.disconnect();
                clearTimeout(timer);
                resolve(v);
            });
            obs.observe(document.body, { childList: true, subtree: true, attributes: true });
            timer = setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
        });
    }

    function isVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    // ChatGPT keeps visited routes alive as hidden (display:none) copies, so there are several
    // composers in the DOM. Everything is scoped to the one that is visible.
    let cachedTrigger = null;
    function findTrigger() {
        if (cachedTrigger?.isConnected && cachedTrigger.offsetParent !== null) return cachedTrigger;
        cachedTrigger = Array.from(document.querySelectorAll(SELECTORS.trigger)).find(isVisible) || null;
        return cachedTrigger;
    }

    function findEditor() {
        return findTrigger()?.closest('form')?.querySelector(SELECTORS.inputField) ||
            Array.from(document.querySelectorAll(SELECTORS.inputField)).find(isVisible) || null;
    }

    function findVisible(selector) {
        return Array.from(document.querySelectorAll(selector)).find(isVisible) || null;
    }

    function isWorkMode() {
        return /work/i.test(findEditor()?.getAttribute('aria-label') || '');
    }

    function presetCount() {
        return isWorkMode() ? WORK_POSITIONS : CHAT_PRESETS.length;
    }

    // "GPT-6 Sol Light" in Work, "Medium" in Chat. textContent of leaf spans avoids a forced layout.
    function readTriggerLabel(trigger) {
        const el = trigger?.querySelector(SELECTORS.triggerLabel);
        if (!el) return '';
        // Skip aria-hidden spans: Work keeps a hidden list of every effort name for width measurement.
        const leaves = Array.from(el.querySelectorAll('span'))
            .filter(s => !s.querySelector('span') && !s.closest('[aria-hidden="true"]'));
        return (leaves.length ? leaves.map(s => s.textContent.trim()).filter(Boolean).join(' ') : el.textContent).trim();
    }

    function readSettledTriggerLabel() {
        return waitFor(() => {
            const l = readTriggerLabel(findTrigger());
            return l && !/thinking effort|select model/i.test(l) ? l : null;
        }, WAIT.menuMs);
    }

    function loadWorkPositions() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
    }

    function rememberWorkPosition(label, position) {
        if (!label || position == null) return;
        const map = loadWorkPositions();
        if (map[label] === position) return;
        map[label] = position;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* storage blocked */ }
    }

    // Current slider position without opening the menu, or -1 if unknown.
    function currentPosition() {
        const trigger = findTrigger();
        if (!trigger || trigger.getAttribute('aria-expanded') === 'true') return -1;
        if (isWorkMode()) {
            const pos = loadWorkPositions()[readTriggerLabel(trigger)];
            return pos == null ? -1 : pos;
        }
        const effort = trigger.dataset.selectedReasoningEffort;
        return CHAT_PRESETS.findIndex(p => p.efforts.includes(effort));
    }

    // --- Menu automation ---

    function pressKey(el, key) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
    }

    function readSliderValue(item) {
        const v = item?.querySelector(SELECTORS.sliderThumb)?.getAttribute('aria-valuenow');
        return v == null ? null : Number(v);
    }

    async function openSlider(trigger) {
        const existing = document.querySelector(SELECTORS.slider);
        if (existing) return existing;
        const rect = trigger.getBoundingClientRect();
        trigger.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
            button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true
        }));
        return waitFor(() => document.querySelector(SELECTORS.slider), WAIT.menuMs);
    }

    async function closeMenu() {
        const target = document.querySelector(SELECTORS.menu) || document.activeElement || document.body;
        pressKey(target, 'Escape');
        await waitFor(() => !document.querySelector(SELECTORS.menu), WAIT.menuMs);
    }

    // Moves the power slider to `target` (0-based). Returns the final position.
    async function setPower(target) {
        if (busy) return null;
        const trigger = findTrigger();
        if (!trigger) {
            console.warn('[ChatGPT] Model picker not found.');
            return null;
        }
        busy = true;
        document.documentElement.classList.add('tm-chatgpt-hide-menus');
        try {
            const item = await openSlider(trigger);
            if (!item) {
                console.warn('[ChatGPT] Power slider did not open.');
                return null;
            }
            const max = Number(item.querySelector(SELECTORS.sliderThumb)?.getAttribute('aria-valuemax'));
            let value = readSliderValue(item);
            const goal = Math.max(0, Math.min(max, target));

            item.focus();
            while (value !== goal) {
                const key = goal > value ? 'ArrowRight' : 'ArrowLeft';
                const before = value;
                pressKey(item, key);
                if (await waitFor(() => readSliderValue(item) !== before, WAIT.stepMs) === null) break;
                value = readSliderValue(item);
            }
            await closeMenu();
            if (isWorkMode()) {
                // The trigger label settles after close; learn label -> position for highlighting.
                rememberWorkPosition(await readSettledTriggerLabel(), value);
            }
            return value;
        } finally {
            document.documentElement.classList.remove('tm-chatgpt-hide-menus');
            busy = false;
            refresh();
            focusInputField();
        }
    }

    // --- Temporary chat ---

    function isTempChatActive() {
        return /temporary-chat=true/.test(location.search) ||
            !!findVisible('button[aria-label="Turn off temporary chat"]');
    }

    function toggleTempChat() {
        const btn = findVisible(SELECTORS.tempChatButton);
        if (!btn) {
            console.warn('[ChatGPT] Temporary Chat button not found.');
            return false;
        }
        btn.click();
        focusInputField();
        return true;
    }

    // --- Focus ---

    async function focusInputField() {
        const editor = await waitFor(findEditor, WAIT.menuMs);
        if (!editor) return false;
        editor.focus();
        const sel = window.getSelection();
        if (sel) {
            sel.selectAllChildren(editor);
            sel.collapseToEnd();
        }
        return true;
    }

    // --- Keybindings ---
    // Enter/Shift+Enter keep ChatGPT's defaults. A right Cmd tap (nothing pressed in between)
    // toggles Temporary Chat.

    function handleGlobalKeydown(e) {
        if (e.repeat) return;
        rightCmdClean = e.code === 'MetaRight';
    }

    function handleGlobalKeyup(e) {
        if (e.code === 'MetaRight' && rightCmdClean) {
            rightCmdClean = false;
            e.preventDefault();
            toggleTempChat();
        }
    }

    // --- Buttons ---

    function makeButton(id, label, title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = id;
        btn.className = 'tm-chatgpt-btn';
        btn.title = title;
        btn.textContent = label;
        // pointerdown + preventDefault keeps focus (and the caret) in the editor.
        btn.addEventListener('pointerdown', e => e.preventDefault());
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            urlAutomationCancelled = true;
            onClick();
        });
        return btn;
    }

    function buildGroup(work) {
        const group = document.createElement('div');
        group.id = 'tm-chatgpt-group';
        group.className = 'tm-chatgpt-group';
        group.dataset.mode = work ? 'work' : 'chat';

        const count = work ? WORK_POSITIONS : CHAT_PRESETS.length;
        for (let i = 0; i < count; i++) {
            const label = work ? String(i + 1) : CHAT_PRESETS[i].label;
            const title = work ? `Power ${i + 1}` : CHAT_PRESETS[i].title;
            group.appendChild(makeButton(`tm-chatgpt-power-${i}`, label, title, () => setPower(i)));
        }
        group.appendChild(makeButton('tm-chatgpt-temp-btn', 'Temp', 'Toggle Temporary Chat', toggleTempChat));
        return group;
    }

    function updateButtonStates(group) {
        const pos = currentPosition();
        const work = group.dataset.mode === 'work';
        const learned = work ? loadWorkPositions() : null;
        group.querySelectorAll('[id^="tm-chatgpt-power-"]').forEach((btn, i) => {
            btn.classList.toggle('tm-active', i === pos);
            if (work) {
                const name = Object.keys(learned).find(k => learned[k] === i);
                btn.title = name ? `Power ${i + 1}: ${name}` : `Power ${i + 1}`;
            }
        });
        const temp = group.querySelector('#tm-chatgpt-temp-btn');
        temp.classList.toggle('tm-active', isTempChatActive());
        temp.hidden = !findVisible(SELECTORS.tempChatButton) && !isTempChatActive();
    }

    // Injects or updates the button group; cheap no-op when nothing relevant changed.
    function refresh() {
        const trigger = findTrigger();
        if (!trigger) return;
        const work = isWorkMode();
        let group = document.getElementById('tm-chatgpt-group');

        if (group && (group.dataset.mode === 'work') !== work) {
            group.remove();
            group = null;
        }
        const anchor = trigger.parentElement;
        if (!group || group.parentElement !== anchor.parentElement) {
            group?.remove();
            group = buildGroup(work);
            anchor.parentElement.insertBefore(group, anchor);
            lastStateKey = '';
        }

        if (trigger.getAttribute('aria-expanded') === 'true') return;
        const stateKey = [readTriggerLabel(trigger), trigger.dataset.selectedReasoningEffort,
            isTempChatActive(), !!findVisible(SELECTORS.tempChatButton)].join('|');
        if (stateKey === lastStateKey) return;
        lastStateKey = stateKey;
        updateButtonStates(group);
    }

    // Learns Work label -> position when the user moves the slider by hand and closes the menu.
    async function learnManualSlider(value) {
        if (busy || value == null || !isWorkMode()) return;
        rememberWorkPosition(await readSettledTriggerLabel(), value);
        lastStateKey = '';
        refresh();
    }

    // --- URL params ---

    async function checkUrlParams() {
        const params = new URLSearchParams(location.search);
        const model = (params.get('model') || params.get('thinking') || '').toLowerCase();
        const power = parseInt(params.get('power'), 10);
        const target = Number.isInteger(power) && power >= 1 ? power - 1 : URL_MODEL_ALIASES[model];
        const wantTemp = ['1', 'true', 'on', 'yes'].includes((params.get('temp') || '').toLowerCase());
        if (target == null && !wantTemp) return;

        if (!(await waitFor(findTrigger, WAIT.startupMs)) || urlAutomationCancelled) return;
        if (wantTemp && !isTempChatActive()) {
            toggleTempChat();
            await waitFor(isTempChatActive, WAIT.menuMs);
        }
        if (target != null && !urlAutomationCancelled) await setPower(target);
    }

    // --- Styles ---

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .tm-chatgpt-hide-menus ${SELECTORS.popover} {
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
                font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                white-space: nowrap;
                opacity: 0.74;
                cursor: pointer;
                flex-shrink: 0;
                transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
            }
            .tm-chatgpt-btn[hidden] { display: none; }
            .tm-chatgpt-btn:hover {
                background-color: rgba(128, 128, 128, 0.14);
                border-color: rgba(128, 128, 128, 0.42);
                opacity: 1;
            }
            .tm-chatgpt-btn.tm-active {
                color: var(--text-primary, currentColor);
                border-color: rgba(16, 163, 127, 0.9);
                background-color: rgba(16, 163, 127, 0.14);
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    // --- Init ---

    function init() {
        document.addEventListener('keydown', handleGlobalKeydown, true);
        document.addEventListener('keyup', handleGlobalKeyup, true);

        injectStyles();
        refresh();

        // One rAF-batched pass per burst of mutations keeps streaming replies cheap.
        let scheduled = false;
        let openSliderValue = null;
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                refresh();
                const item = findTrigger()?.getAttribute('aria-expanded') === 'true' &&
                    document.querySelector(SELECTORS.slider);
                if (item) {
                    openSliderValue = readSliderValue(item);
                } else if (openSliderValue != null) {
                    learnManualSlider(openSliderValue);
                    openSliderValue = null;
                }
            });
        }).observe(document.body, { childList: true, subtree: true, attributes: true, 
            // class/style/hidden: kept-alive routes are shown again by an attribute flip, not new nodes.
            attributeFilter: ['aria-expanded', 'aria-valuenow', 'data-selected-reasoning-effort', 'aria-label', 'class', 'style', 'hidden']
        });

        checkUrlParams();
        focusInputField();
    }

    init();
})();
