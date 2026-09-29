// ==UserScript==
// @name         Claude Enhancer
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Enhancements for Claude.ai: Model+Effort preset buttons, Incognito toggle & custom keybindings.
// @author       You
// @license      GPL-3.0-or-later
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
// │  1. MODEL + EFFORT PRESET BUTTONS                                      │
// │     - Pro/Max plan: S, SM, OM, OH                                      │
// │     - Free plan:    S, SM, SH, SX  (Opus unavailable)                  │
// │     - Plan read from the sidebar user button ("Batu · Max"); also      │
// │       flipped to free if the Opus row is missing/disabled in the menu. │
// │     - Injected in the composer, right after the "+" (attach) button.   │
// │     - Each opens the model menu, picks a row by data-model-id prefix   │
// │       (claude-opus-*, claude-sonnet-*), then re-opens the menu, opens  │
// │       the nested Effort submenu and clicks [data-effort-id=...].       │
// │     - Must survive SPA navigation (MutationObserver re-injects).       │
// │                                                                        │
// │  2. INCOGNITO (Temp) BUTTON                                            │
// │     - Injected in the row under the composer, left of the model        │
// │       picker. Clicks button[aria-label="Use incognito"/"Exit ..."].    │
// │                                                                        │
// │  3. KEYBINDINGS                                                        │
// │     - Enter sends, Shift+Enter newline: claude.ai defaults, untouched. │
// │     - Right Cmd tap -> toggle Incognito (temp chat).                   │
// │     - Editor is TipTap/ProseMirror (data-testid="chat-input").         │
// │                                                                        │
// │  4. AUTO-FOCUS INPUT FIELD (cursor at end).                            │
// │                                                                        │
// │  REMOVED in 2.0.0: the Thinking switch no longer exists in claude.ai   │
// │  (thinking is folded into Effort), so the T button, Cmd+Shift+0 and    │
// │  ?thinking= are gone.                                                  │
// │                                                                        │
// │  GOTCHAS:                                                              │
// │   - base-ui ids (base-ui-_r_xx_) are per-render; never use them.       │
// │   - Effort ids: low, medium, high, xhigh (shown as "Extra"), max.      │
// │   - Menus are portals with [data-cds-overlay]. A closed menu can stay  │
// │     mounted (data-closed) until its exit animation ends, so "open"     │
// │     means [role=menu][data-open], never just [role=menu].              │
// │   - Menus are hidden during automation so they don't flicker.          │
// └──────────────────────────────────────────────────────────────────────┘

(function () {
    'use strict';

    if (window.self !== window.top) return;
    if (window.__claudeEnhancerLoaded) return;
    window.__claudeEnhancerLoaded = true;

    const LOG = '[ClaudeEnhancer]';

    // --- Configuration ---
    const SELECTORS = {
        // Composer: presets go right after the attach button's wrapper
        attachBtn: '[data-testid="chat-input-attach"]',
        inputField: '[data-testid="chat-input"]',

        // Model picker (row under the composer). aria-label: "Model: Opus 5.5 Medium"
        modelTrigger: '[data-testid="model-selector-dropdown"]',
        modelArea: '.ml-auto', // closest wrapper of the picker; Temp goes first in it
        openMenu: '[role="menu"][data-open]',
        modelRow: '[role="menuitemradio"][data-model-id]',
        submenuTrigger: '[role="menuitem"][aria-haspopup="menu"]',
        effortOption: (id) => `[role="menu"][data-open] [data-effort-id="${id}"]`,

        // Incognito: aria-label swaps between the two states
        incognitoBtn: 'button[aria-label="Use incognito"], button[aria-label="Exit incognito"]',
        incognitoActive: 'button[aria-label="Exit incognito"]',

        // Sidebar user button; its last text span is the plan name ("Max", "Pro", "Free")
        userMenuBtn: '[data-testid="user-menu-button"]',

        // Menu portals (hidden during automation)
        overlay: '[data-cds-overlay]'
    };

    // data-effort-id values, and the word the picker label shows for each
    const EFFORT_IDS = ['low', 'medium', 'high', 'xhigh', 'max'];
    const EFFORT_LABEL_TO_ID = { low: 'low', medium: 'medium', high: 'high', extra: 'xhigh', max: 'max' };
    const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'];

    const PRESETS_PRO = [
        { label: 'S',  model: 'sonnet', effort: 'low',    title: 'Sonnet · Low effort' },
        { label: 'SM', model: 'sonnet', effort: 'medium', title: 'Sonnet · Medium effort' },
        { label: 'OM', model: 'opus',   effort: 'medium', title: 'Opus · Medium effort' },
        { label: 'OH', model: 'opus',   effort: 'high',   title: 'Opus · High effort' }
    ];
    const PRESETS_FREE = [
        { label: 'S',  model: 'sonnet', effort: 'low',    title: 'Sonnet · Low effort' },
        { label: 'SM', model: 'sonnet', effort: 'medium', title: 'Sonnet · Medium effort' },
        { label: 'SH', model: 'sonnet', effort: 'high',   title: 'Sonnet · High effort' },
        { label: 'SX', model: 'sonnet', effort: 'max',    title: 'Sonnet · Max effort' }
    ];

    const MENU_TIMEOUT_MS = 1500;     // give up on a menu step after this
    const INJECT_THROTTLE_MS = 150;   // coalesce re-injection during bursts of DOM changes

    // --- Plan detection ---
    let freePlan = false;

    function readPlanFromUserButton() {
        const btn = document.querySelector(SELECTORS.userMenuBtn);
        if (!btn) return;
        const spans = btn.querySelectorAll('span');
        const last = spans.length ? spans[spans.length - 1].textContent.trim() : '';
        if (/^free\b/i.test(last)) freePlan = true;
    }

    const getPresets = () => (freePlan ? PRESETS_FREE : PRESETS_PRO);

    // --- Helpers ---

    /** Resolves with fn()'s first truthy value, re-checked on DOM changes; null on timeout. */
    function waitFor(fn, timeoutMs = MENU_TIMEOUT_MS) {
        return new Promise((resolve) => {
            const first = fn();
            if (first) return resolve(first);
            const obs = new MutationObserver(() => {
                const v = fn();
                if (v) done(v);
            });
            const timer = setTimeout(() => done(null), timeoutMs);
            function done(v) {
                obs.disconnect();
                clearTimeout(timer);
                resolve(v);
            }
            obs.observe(document.body, { childList: true, subtree: true, attributes: true });
        });
    }

    const getTrigger = () => document.querySelector(SELECTORS.modelTrigger);
    const isMenuOpen = (t) => !!t && t.getAttribute('aria-expanded') === 'true';

    /** The open top-level model menu (not a nested submenu). */
    function openModelMenu() {
        for (const m of document.querySelectorAll(SELECTORS.openMenu)) {
            if (!m.hasAttribute('data-nested') && m.querySelector(SELECTORS.modelRow)) return m;
        }
        return null;
    }

    /** Reads family + effort id from the picker label, e.g. "Model: Opus 5.5 Extra". */
    function getCurrentModelState() {
        const t = getTrigger();
        if (!t) return null;
        const words = (t.getAttribute('aria-label') || '').toLowerCase().split(/\s+/);
        const family = FAMILIES.find(f => words.includes(f)) || null;
        const effort = EFFORT_LABEL_TO_ID[words[words.length - 1]] || null;
        return { family, effort };
    }

    function findModelRow(menu, family) {
        for (const row of menu.querySelectorAll(SELECTORS.modelRow)) {
            if (row.getAttribute('aria-disabled') === 'true') continue;
            if (row.dataset.modelId.startsWith('claude-' + family)) return row;
        }
        return null;
    }

    function hideMenus(on) {
        document.documentElement.classList.toggle('tm-claude-hiding-menus', on);
    }

    // --- Menu automation ---

    async function openMenuViaTrigger() {
        const t = getTrigger();
        if (!t) return null;
        if (!isMenuOpen(t)) t.click();
        return waitFor(openModelMenu);
    }

    async function closeMenu() {
        const t = getTrigger();
        if (isMenuOpen(t)) {
            t.click();
            await waitFor(() => !isMenuOpen(getTrigger()));
        }
    }

    /** Picks a model family. Returns the still-open menu when the model was already
     *  current (no click needed), otherwise waits for the menu to close and re-opens it. */
    async function selectModel(family) {
        let menu = await openMenuViaTrigger();
        if (!menu) return null;
        const row = findModelRow(menu, family);
        if (!row) {
            // Opus missing or locked in the menu means a free plan
            if (family === 'opus' && !freePlan) {
                freePlan = true;
                rebuildLeftGroup();
            }
            console.warn(`${LOG} Model "${family}" not available.`);
            return null;
        }
        if (row.getAttribute('aria-checked') === 'true') return menu;
        row.click();
        await waitFor(() => !isMenuOpen(getTrigger()));
        return openMenuViaTrigger();
    }

    async function selectEffort(menu, effort) {
        const sub = [...menu.querySelectorAll(SELECTORS.submenuTrigger)];
        const trigger = sub.find(el => /effort/i.test(el.textContent)) || sub[0];
        if (!trigger) {
            console.warn(`${LOG} Effort submenu not found (model may not support effort).`);
            return false;
        }
        trigger.click();
        const opt = await waitFor(() => document.querySelector(SELECTORS.effortOption(effort)));
        if (!opt) {
            console.warn(`${LOG} Effort "${effort}" not found.`);
            return false;
        }
        if (opt.getAttribute('aria-checked') !== 'true') opt.click();
        return true;
    }

    let busy = false;

    async function applyPreset(model, effort) {
        if (busy) return;
        busy = true;
        hideMenus(true);
        try {
            // Always go through the menu: the label shows only the family, and an
            // older chat may sit on an older version (e.g. Opus 5 vs the listed Opus 5.5).
            const menu = model ? await selectModel(model) : await openMenuViaTrigger();
            if (menu && effort) await selectEffort(menu, effort);
        } catch (err) {
            console.error(`${LOG} Preset failed:`, err);
        } finally {
            await closeMenu();
            hideMenus(false);
            busy = false;
            updatePresetButtonStates();
            focusInputField();
        }
    }

    // --- Incognito ---
    const isIncognitoActive = () => !!document.querySelector(SELECTORS.incognitoActive);

    async function toggleIncognito() {
        const btn = document.querySelector(SELECTORS.incognitoBtn);
        if (!btn) {
            console.warn(`${LOG} Incognito button not found.`);
            return;
        }
        const was = isIncognitoActive();
        btn.click();
        await waitFor(() => isIncognitoActive() !== was);
        updateIncognitoButtonState();
        focusInputField();
    }

    function updateIncognitoButtonState() {
        const btn = document.getElementById('tm-claude-temp-btn');
        if (btn) btn.classList.toggle('tm-active', isIncognitoActive());
    }

    // --- Button highlights ---
    function updatePresetButtonStates() {
        const st = getCurrentModelState();
        getPresets().forEach((p, i) => {
            const btn = document.getElementById('tm-claude-preset-' + i);
            if (btn) btn.classList.toggle('tm-active', !!st && st.family === p.model && st.effort === p.effort);
        });
    }

    // --- Auto-focus input ---
    /** Focuses the composer, cursor at end. With `politely`, leaves focus alone when the
     *  user is typing in some other field (search box, rename, message edit). */
    function focusInputField(politely = false) {
        const editor = document.querySelector(SELECTORS.inputField);
        if (!editor) return;
        const a = document.activeElement;
        if (politely && a && a !== editor && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
        editor.focus();
        const sel = window.getSelection();
        if (sel) {
            sel.selectAllChildren(editor);
            sel.collapseToEnd();
        }
    }

    // --- Keybindings ---
    // Enter sends and Shift+Enter adds a newline: claude.ai's own defaults, left alone.

    // Right Cmd tap (keydown + keyup with nothing in between) -> toggle Incognito
    let rightCmdClean = false;

    function handleRightCmdKeydown(e) {
        if (e.repeat) return;
        rightCmdClean = e.code === 'MetaRight';
    }

    function handleRightCmdKeyup(e) {
        if (e.code === 'MetaRight' && rightCmdClean) {
            rightCmdClean = false;
            e.preventDefault();
            e.stopPropagation();
            toggleIncognito();
        }
    }

    // --- UI ---
    function makeButton(id, label, title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tm-claude-btn';
        btn.id = id;
        btn.title = title;
        btn.textContent = label;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        return btn;
    }

    function buildLeftGroup() {
        const group = document.createElement('div');
        group.id = 'tm-claude-left';
        group.className = 'tm-claude-group';
        getPresets().forEach((p, i) => {
            group.appendChild(makeButton('tm-claude-preset-' + i, p.label, p.title,
                () => applyPreset(p.model, p.effort)));
        });
        return group;
    }

    function buildRightGroup() {
        const group = document.createElement('div');
        group.id = 'tm-claude-right';
        group.className = 'tm-claude-group';
        group.appendChild(makeButton('tm-claude-temp-btn', 'Temp', 'Toggle Incognito chat (Right Option)',
            () => toggleIncognito()));
        return group;
    }

    let leftGroup = null;
    let rightGroup = null;
    let watchedTrigger = null;
    const triggerObserver = new MutationObserver(updatePresetButtonStates);

    function rebuildLeftGroup() {
        if (leftGroup) leftGroup.remove();
        leftGroup = null;
        injectButtons();
    }

    function injectButtons() {
        if (!(leftGroup && leftGroup.isConnected)) {
            const attach = document.querySelector(SELECTORS.attachBtn);
            if (attach && attach.parentElement) {
                readPlanFromUserButton();
                leftGroup = buildLeftGroup();
                attach.parentElement.insertAdjacentElement('afterend', leftGroup);
                focusInputField(true);
            }
        }

        const trigger = getTrigger();
        if (trigger && !(rightGroup && rightGroup.isConnected)) {
            rightGroup = buildRightGroup();
            const area = trigger.closest(SELECTORS.modelArea);
            if (area) area.insertBefore(rightGroup, area.firstChild);
            else trigger.parentElement.insertBefore(rightGroup, trigger);
        }

        // Follow the picker label so highlights also track changes made in Claude's own menu
        if (trigger && trigger !== watchedTrigger) {
            watchedTrigger = trigger;
            triggerObserver.disconnect();
            triggerObserver.observe(trigger, { attributes: true, attributeFilter: ['aria-label'] });
        }

        updatePresetButtonStates();
        updateIncognitoButtonState();
    }

    // Cheap early exit: only re-inject when one of our nodes (or the picker) was detached,
    // or the URL changed (incognito state lives in the page top bar, not in the composer).
    let injectTimer = null;
    let lastHref = location.href;

    function onMutations() {
        const hrefChanged = location.href !== lastHref;
        if (!hrefChanged && leftGroup && leftGroup.isConnected && rightGroup && rightGroup.isConnected
            && watchedTrigger && watchedTrigger.isConnected) return;
        if (injectTimer) return;
        injectTimer = setTimeout(() => {
            injectTimer = null;
            lastHref = location.href;
            injectButtons();
        }, INJECT_THROTTLE_MS);
    }

    // --- URL parameters: ?model= ?effort= ?incognito=1 ---
    async function handleUrlParams() {
        const params = new URLSearchParams(location.search);
        const modelParam = (params.get('model') || '').toLowerCase();
        let effortParam = (params.get('effort') || '').toLowerCase();
        if (effortParam === 'extra') effortParam = 'xhigh';

        const model = FAMILIES.includes(modelParam) ? modelParam : null;
        const effort = EFFORT_IDS.includes(effortParam) ? effortParam : null;

        if (model || effort) {
            if (await waitFor(getTrigger, 15000)) await applyPreset(model, effort);
        }
        if (params.get('incognito') === '1' || params.get('incognito') === 'true') {
            if (await waitFor(() => document.querySelector(SELECTORS.incognitoBtn), 15000)
                && !isIncognitoActive()) {
                await toggleIncognito();
            }
        }
    }

    // --- Styles ---
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .tm-claude-hiding-menus ${SELECTORS.overlay} {
                visibility: hidden !important;
                pointer-events: none !important;
            }
            .tm-claude-hiding-menus ${SELECTORS.overlay},
            .tm-claude-hiding-menus ${SELECTORS.overlay} * {
                transition: none !important;
                animation: none !important;
            }

            .tm-claude-group {
                display: flex;
                align-items: center;
                gap: 4px;
                flex-shrink: 0;
            }
            #tm-claude-left { margin-left: 4px; }
            #tm-claude-right { margin-right: 4px; }

            .tm-claude-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 26px;
                padding: 0 8px;
                border-radius: 8px;
                border: 1px solid rgba(128, 128, 128, 0.22);
                background-color: transparent;
                font-family: inherit;
                font-size: 12px;
                font-weight: 500;
                line-height: 1;
                color: inherit;
                opacity: 0.75;
                cursor: pointer;
                transition: background-color 0.15s ease, opacity 0.15s ease, border-color 0.15s ease;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .tm-claude-btn:hover {
                background-color: rgba(128, 128, 128, 0.15);
                opacity: 1;
                border-color: rgba(128, 128, 128, 0.4);
            }
            .tm-claude-btn.tm-active {
                opacity: 1;
                color: #c96442;
                border-color: #c96442;
            }
        `;
        document.head.appendChild(style);
    }

    // --- Init ---
    function init() {
        document.addEventListener('keydown', handleRightCmdKeydown, true);
        document.addEventListener('keyup', handleRightCmdKeyup, true);

        injectStyles();
        injectButtons();
        new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });

        handleUrlParams();
    }

    init();
})();
