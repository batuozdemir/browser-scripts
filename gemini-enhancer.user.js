// ==UserScript==
// @name         Gemini Enhancer
// @namespace    http://tampermonkey.net/
// @version      2.0
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
// │  3. MODE+THINKING BUTTONS (FL, F, FX, P, PX) + TEMP CHAT BUTTON  │
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
        optionFlashLite: '[data-test-id="bard-mode-option-8c46e95b1a07cecc"]',
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

    // Fallback label map — used when hash-based selectors fail
    const MODEL_LABELS = {
        flashlite: 'Flash-Lite',
        flash: 'Flash',
        pro: 'Pro'
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
     * Waits for an element matching the selector to appear in the DOM.
     * @param {string} selector - CSS selector
     * @param {number} timeoutMs - Max wait time
     * @param {Element} [root=document] - Root element to search within
     * @returns {Promise<Element|null>}
     */
    function waitForElement(selector, timeoutMs = 3000, root = document) {
        return new Promise((resolve) => {
            const existing = root.querySelector(selector);
            if (existing) return resolve(existing);

            const observer = new MutationObserver(() => {
                const el = root.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(root === document ? document.body : root, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(root.querySelector(selector));
            }, timeoutMs);
        });
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

    // --- Feature 1: Keybindings (Cmd+Enter to Send, Enter to Newline) ---
    function handleInputKeydown(e) {
        if (!e.target.isContentEditable) return;

        // CMD+ENTER (or CTRL+ENTER) -> Submit
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();

            const sendBtn = document.querySelector(SELECTORS.sendButton) ||
                document.querySelector('button[aria-label="Send"]');

            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
            }
            return;
        }

        // ENTER (No Modifiers) -> New Line
        if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            document.execCommand('insertText', false, '\n');
            return;
        }
    }

    // --- Feature 2: Mode + Thinking Selection ---

    /**
     * Selects a model from the mode picker menu.
     * @param {string} modelKey - Key into SELECTORS (e.g., 'optionFlash') or a full selector string.
     * @returns {Promise<boolean>} true if model was selected successfully.
     */
    async function selectModel(modelKey) {
        const trigger = document.querySelector(SELECTORS.triggerBtn);
        if (!trigger) {
            console.error("Gemini Enhancer: Mode dropdown trigger not found.");
            return false;
        }

        console.log("Gemini Enhancer: Opening model menu...");
        trigger.click();

        // Wait for menu overlay to render
        await new Promise(r => setTimeout(r, 150));

        // Try primary selector
        const selector = SELECTORS[modelKey];
        let targetOption = selector ? document.querySelector(selector) : null;

        // Fallback: find by label text
        if (!targetOption) {
            const labelMap = {
                optionFlashLite: 'Flash-Lite',
                optionFlash: 'Flash',
                optionPro: 'Pro'
            };
            const label = labelMap[modelKey];
            if (label) {
                console.log(`Gemini Enhancer: Primary selector failed, trying label fallback: "${label}"`);
                targetOption = findMenuItemByLabel(label);
            }
        }

        if (targetOption) {
            targetOption.click();
            console.log(`Gemini Enhancer: Selected model ${modelKey}`);
            return true;
        } else {
            console.warn(`Gemini Enhancer: Model option ${modelKey} not found. Closing menu.`);
            document.body.click(); // Close menu
            return false;
        }
    }

    /**
     * Selects a thinking level from the nested submenu.
     * Must be called after the model menu is closed (selectModel() closes it).
     * @param {'standard'|'extended'} level
     * @returns {Promise<boolean>}
     */
    async function selectThinkingLevel(level) {
        const trigger = document.querySelector(SELECTORS.triggerBtn);
        if (!trigger) {
            console.error("Gemini Enhancer: Mode dropdown trigger not found for thinking level.");
            return false;
        }

        // Re-open the model menu
        console.log("Gemini Enhancer: Re-opening menu for thinking level...");
        trigger.click();
        await new Promise(r => setTimeout(r, 150));

        // Find and click the "Thinking level" submenu trigger
        let thinkingTrigger = document.querySelector(SELECTORS.thinkingLevelTrigger);

        // Fallback: find by label
        if (!thinkingTrigger) {
            thinkingTrigger = findMenuItemByLabel('Thinking level');
        }

        if (!thinkingTrigger) {
            console.warn("Gemini Enhancer: Thinking level trigger not found.");
            document.body.click();
            return false;
        }

        // Hover to open submenu (Angular Material uses mouseenter for nested menus)
        console.log("Gemini Enhancer: Opening thinking level submenu...");
        thinkingTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        thinkingTrigger.click();

        // Wait for submenu to render
        await new Promise(r => setTimeout(r, 250));

        // Find the level option by label text
        const levelLabel = level === 'extended' ? 'Extended' : 'Standard';
        const levelOption = findMenuItemByLabel(levelLabel);

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
     * @param {string} modelKey - SELECTORS key (e.g., 'optionFlash')
     * @param {'standard'|'extended'} thinkingLevel
     */
    async function setModeAndThinking(modelKey, thinkingLevel) {
        const modelSuccess = await selectModel(modelKey);
        if (!modelSuccess) return;

        // Brief pause to let the menu close and UI settle
        await new Promise(r => setTimeout(r, 300));

        await selectThinkingLevel(thinkingLevel);

        // Re-focus input after mode switch
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
        btn.click();

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
        btn.click();

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
                label: 'FL',
                modelKey: 'optionFlashLite',
                thinking: 'extended',
                title: 'Flash-Lite · Extended Thinking',
                path: 'M7 2v11h3v9l7-12h-4l4-8z' // Lightning Bolt
            },
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
                label: 'P',
                modelKey: 'optionPro',
                thinking: 'standard',
                title: 'Pro · Standard Thinking',
                path: 'M12 2L9.09 9.09 2 12l7.09 2.91L12 22l2.91-7.09L22 12l-7.09-2.91z' // Star
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
                setModeAndThinking(mode.modelKey, mode.thinking);
            };

            container.appendChild(btn);
        });

        // Splitter
        const splitter = document.createElement('div');
        splitter.className = 'gemini-mode-splitter';
        container.appendChild(splitter);

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
                'flashlite': 'optionFlashLite',
                'flash-lite': 'optionFlashLite',
                'flash': 'optionFlash',
                'pro': 'optionPro',
                // Legacy aliases
                'fast': 'optionFlash',
                'thinking': 'optionFlash'
            };
            const modelKey = modelMap[modelParam.toLowerCase()];
            if (modelKey) {
                const thinking = thinkingParam ? thinkingParam.toLowerCase() : 'standard';
                setTimeout(() => {
                    console.log(`Gemini Enhancer: Auto-selecting model '${modelParam}' with thinking '${thinking}' from URL`);
                    setModeAndThinking(modelKey, thinking);
                }, 1500);
            }
        } else if (thinkingParam) {
            // Only thinking level specified — just set thinking on current model
            setTimeout(() => {
                console.log(`Gemini Enhancer: Auto-selecting thinking level '${thinkingParam}' from URL`);
                selectThinkingLevel(thinkingParam.toLowerCase());
            }, 1500);
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
        console.log("Gemini Enhancer v2.0: Initializing...");

        // Hook Keybinds
        document.addEventListener('keydown', handleInputKeydown, true);

        // UI Injection Logic
        const findContainer = () => {
            // Primary: trailing actions wrapper (below input, contains model picker)
            let c = document.querySelector('.trailing-actions-wrapper');
            if (c) return c;

            // Fallback: find model picker's parent
            const modePicker = document.querySelector(SELECTORS.triggerBtn);
            if (modePicker) {
                const wrapper = modePicker.closest('.trailing-actions-wrapper') ||
                    modePicker.closest('.leading-actions-wrapper') ||
                    modePicker.parentElement?.parentElement;
                if (wrapper) return wrapper;
            }

            // Legacy fallback
            c = document.querySelector('.leading-actions-wrapper');
            if (c) return c;

            return null;
        };

        const injectButtons = () => {
            if (document.getElementById('tm-mode-group')) return;

            const container = findContainer();
            if (container) {
                const style = window.getComputedStyle(container);
                if (style.display === 'none' || style.visibility === 'hidden') return;

                const btnGroup = createModeButtons();

                // Insert at the beginning of the container (before model picker)
                const modelPickerContainer = container.querySelector('.model-picker-container');
                if (modelPickerContainer) {
                    container.insertBefore(btnGroup, modelPickerContainer);
                } else {
                    container.prepend(btnGroup);
                }

                console.log("Gemini Enhancer: Mode buttons injected.");
            }
        };

        // Create styles
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            .gemini-mode-group {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-right: 8px;
                padding-right: 8px;
                height: 32px;
                flex-shrink: 0;
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