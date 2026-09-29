// ==UserScript==
// @name         ChatGPT Enhancer
// @namespace    http://tampermonkey.net/
// @version      2.2.0
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
// │     - Chat: slider Instant/Medium/High; buttons M H only (no Instant). │
// │     - Work: buttons pick a model row in the same menu (the menu stays  │
// │       open), then set the slider to Medium (Light..Max, position 1).   │
// │     - The slider is driven with synthetic ArrowLeft/ArrowRight keydown │
// │       on the focused slider menuitem; that is what commits the value.  │
// │     - The menu opens on a synthetic pointerdown on the trigger.        │
// │     - Active state: Chat reads data-selected-reasoning-effort on the   │
// │       trigger; Work compares the trigger label ("GPT-6 Sol Medium").   │
// │     - Closing the menu hands focus back to the trigger a moment after  │
// │       we focus the editor (blue ring + "Thinking effort" tooltip);     │
// │       bounceTriggerFocus() sends it back to the editor.                │
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
        modelOption: '[role="menu"] [role="menuitemradio"]',
        tempChatButton: 'button[aria-label="Temporary chat"], button[aria-label="Turn off temporary chat"], button[aria-label*="temporary chat" i]',
        popover: '[data-radix-popper-content-wrapper]'
    };

    // position: 0-based slider step. Chat steps are Instant/Medium/High; with an explicit Work
    // model they are Light/Medium/High/Extra High/Max. Work `title` is the trigger label it produces.
    const CHAT_PRESETS = [
        { label: 'M', title: 'Medium', position: 1, efforts: ['medium'] },
        { label: 'H', title: 'High', position: 2, efforts: ['high'] }
    ];
    const WORK_PRESETS = [
        { label: 'Sol 5.6', title: 'GPT-5.6 Sol Medium', model: 'GPT-5.6 Sol', position: 1 },
        { label: 'Sol 6', title: 'GPT-6 Sol Medium', model: 'GPT-6 Sol', position: 1 },
        { label: 'Astra 6', title: 'GPT-6 Astra Medium', model: 'GPT-6 Astra', position: 1 }
    ];

    const URL_MODEL_ALIASES = { i: 0, instant: 0, fast: 0, m: 1, med: 1, medium: 1, h: 2, high: 2 };

    const WAIT = {
        menuMs: 1500,
        stepMs: 1000,
        startupMs: 15000
    };

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

    // "GPT-6 Sol Light" in Work, "Medium" in Chat. textContent of leaf spans avoids a forced layout.
    function readTriggerLabel(trigger) {
        const el = trigger?.querySelector(SELECTORS.triggerLabel);
        if (!el) return '';
        // Skip aria-hidden spans: Work keeps a hidden list of every effort name for width measurement.
        const leaves = Array.from(el.querySelectorAll('span'))
            .filter(s => !s.querySelector('span') && !s.closest('[aria-hidden="true"]'));
        return (leaves.length ? leaves.map(s => s.textContent.trim()).filter(Boolean).join(' ') : el.textContent).trim();
    }

    // Index of the active preset button without opening the menu, or -1.
    function currentPresetIndex() {
        const trigger = findTrigger();
        if (!trigger || trigger.getAttribute('aria-expanded') === 'true') return -1;
        if (isWorkMode()) {
            const label = readTriggerLabel(trigger);
            return WORK_PRESETS.findIndex(p => p.title === label);
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

    // Clicks the model row named `model`; the menu stays open and the slider re-renders for it.
    async function selectModel(model) {
        const row = Array.from(document.querySelectorAll(SELECTORS.modelOption))
            .find(r => r.textContent.trim().startsWith(model));
        if (!row) {
            console.warn(`[ChatGPT] Model "${model}" not found in the menu.`);
            return null;
        }
        if (row.getAttribute('aria-checked') !== 'true') row.click();
        return waitFor(() => row.getAttribute('aria-checked') === 'true' &&
            document.querySelector(SELECTORS.slider), WAIT.menuMs);
    }

    // Closing the menu returns focus to the trigger a moment after we focused the editor, which
    // draws a focus ring and opens the "Thinking effort" tooltip. Bounce it back once if it comes.
    function bounceTriggerFocus(trigger) {
        const onFocus = () => {
            trigger.blur();
            focusInputField();
        };
        trigger.addEventListener('focus', onFocus, { once: true });
        setTimeout(() => trigger.removeEventListener('focus', onFocus), WAIT.menuMs);
    }

    // Selects `model` if given, then moves the power slider to `target` (0-based).
    // Returns the final position.
    async function setPower(target, model = null) {
        if (busy) return null;
        const trigger = findTrigger();
        if (!trigger) {
            console.warn('[ChatGPT] Model picker not found.');
            return null;
        }
        busy = true;
        document.documentElement.classList.add('tm-chatgpt-hide-menus');
        try {
            let item = await openSlider(trigger);
            if (!item) {
                console.warn('[ChatGPT] Power slider did not open.');
                return null;
            }
            if (model) {
                item = await selectModel(model);
                if (!item) {
                    await closeMenu();
                    return null;
                }
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
            return value;
        } finally {
            document.documentElement.classList.remove('tm-chatgpt-hide-menus');
            busy = false;
            refresh();
            bounceTriggerFocus(trigger);
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

        (work ? WORK_PRESETS : CHAT_PRESETS).forEach((p, i) => {
            group.appendChild(makeButton(`tm-chatgpt-power-${i}`, p.label, p.title,
                () => setPower(p.position, p.model)));
        });
        group.appendChild(makeButton('tm-chatgpt-temp-btn', 'Temp', 'Toggle Temporary Chat', toggleTempChat));
        return group;
    }

    function updateButtonStates(group) {
        const active = currentPresetIndex();
        group.querySelectorAll('[id^="tm-chatgpt-power-"]').forEach((btn, i) => {
            btn.classList.toggle('tm-active', i === active);
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
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                refresh();
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
