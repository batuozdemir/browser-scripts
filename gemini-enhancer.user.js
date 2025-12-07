// ==UserScript==
// @name         Gemini Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.13
// @description  Enhancements for Google Gemini: Thinking Mode Toggle & Custom Keybindings (Cmd+Enter to send).
// @author       You
// @match        https://gemini.google.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/gemini-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/gemini-enhancer.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Configuration
    const SELECTORS = {
        // We know 'leading-actions-wrapper' exists and contains the Tools button.
        // We want to insert next to it.
        container: '.leading-actions-wrapper',
        triggerBtn: '[data-test-id="bard-mode-menu-button"]',
        optionThinking: '[data-test-id="bard-mode-option-thinkingwith3pro"]',
        optionFast: '[data-test-id="bard-mode-option-fast"]',
        toolsDrawer: 'toolbox-drawer',
        sendButton: 'button[aria-label="Send message"]'
    };

    // --- Feature 1: Keybindings (Cmd+Enter to Send, Enter to Newline) ---
    function handleInputKeydown(e) {
        // Ensure we are in the chat input (contenteditable)
        // Gemini uses a generic contenteditable div
        if (!e.target.isContentEditable) return;

        // CMD+ENTER (or CTRL+ENTER) -> Submit
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();

            const sendBtn = document.querySelector(SELECTORS.sendButton) ||
                document.querySelector('button[aria-label="Send"]');

            if (sendBtn) {
                if (!sendBtn.disabled) {
                    sendBtn.click();
                }
            } else {
                console.warn("Gemini Enhancer: Send button not found. Selector might need update.");
            }
            return;
        }

        // ENTER (No Modifiers) -> New Line
        if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();

            // Standard way to insert text in contenteditable
            // Note: execCommand is deprecated but still the most reliable cross-browser way for simple inserts
            // unless accessing internal component APIs.
            document.execCommand('insertText', false, '\n');
            return;
        }
    }

    // --- Feature 2: Mode Toggle Button ---
    const ICON_SVG = `
    <svg height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
        <path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-82v-78q-33-14-56.5-41.5T360-344v-28h80v28q0 17 11.5 28.5T480-304q17 0 28.5-11.5T520-344v-28h80v28q0 57-35.5 98.5T480-202v40h-40Z"/>
    </svg>`;

    // Inject custom styles to ensure visibility
    const style = document.createElement('style');
    style.textContent = `
        .gemini-enhancer-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 48px; /* Match standard toolbar height */
            padding: 0 12px;
            border-radius: 24px;
            color: var(--gem-sys-color-on-surface, #444746);
            cursor: pointer;
            background: transparent;
            border: 1px solid transparent;
            font-family: Google Sans, Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            margin-left: 8px;
            transition: background 0.2s;
        }
        .gemini-enhancer-btn:hover {
            background-color: rgba(0, 0, 0, 0.05);
        }
        /* Dark mode adjustment (heuristic) */
        @media (prefers-color-scheme: dark) {
            .gemini-enhancer-btn {
                color: #e3e3e3;
            }
            .gemini-enhancer-btn:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }
        }
    `;
    document.head.appendChild(style);

    function createToggleButton() {
        const btn = document.createElement('button');
        btn.className = "gemini-enhancer-btn";
        btn.id = "tm-mode-toggle-btn";
        btn.type = "button"; // Prevent form submission

        // Simple inner HTML
        btn.innerHTML = `
            <span style="display: flex; align-items: center; margin-right: 6px;">
                ${ICON_SVG}
            </span>
            <span>Mode</span>
        `;

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation(); // Stop bubbling
            toggleMode();
        };

        return btn;
    }

    function toggleMode() {
        const trigger = document.querySelector(SELECTORS.triggerBtn);
        if (!trigger) {
            console.error("Gemini Toggle: Mode dropdown trigger not found.");
            return;
        }

        // 1. Get current text to determine direction
        const currentText = trigger.innerText || "";
        const isCurrentlyThinking = currentText.includes("Thinking");

        // 2. Click the dropdown trigger to open the menu
        trigger.click();

        // 3. Wait for the Angular Material menu to render in the DOM
        setTimeout(() => {
            let targetSelector = isCurrentlyThinking ? SELECTORS.optionFast : SELECTORS.optionThinking;
            let targetOption = document.querySelector(targetSelector);

            if (targetOption) {
                targetOption.click();
                console.log(`Gemini Toggle: Switched to ${isCurrentlyThinking ? "Fast" : "Thinking"}`);
            } else {
                // Fallback: If the specific IDs change, try finding by text
                // This is a safety net
                const allItems = document.querySelectorAll('.mat-mdc-menu-item');
                for (let item of allItems) {
                    if (isCurrentlyThinking && item.innerText.includes("Fast")) {
                        item.click();
                        break;
                    } else if (!isCurrentlyThinking && item.innerText.includes("Thinking")) {
                        item.click();
                        break;
                    }
                }
                // Close menu if we failed to find target (clicking body usually closes it)
                if (!targetOption) document.body.click();
            }
        }, 50); // 50ms delay is usually sufficient for DOM rendering
    }

    function init() {
        console.log("Gemini Enhancer: Initializing...");

        // Hook Keybinds globally
        document.addEventListener('keydown', handleInputKeydown, true);

        // UI Injection Logic
        const injectButton = () => {
            const container = document.querySelector(SELECTORS.container);

            if (container && !document.getElementById('tm-mode-toggle-btn')) {
                console.log("Gemini Enhancer: Container found, injecting button...");
                const btn = createToggleButton();

                if (container) {
                    // Check if container has display:none or hidden
                    const style = window.getComputedStyle(container);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        console.warn("Gemini Enhancer: Target container is hidden!", container);
                    }
                }

                // Append as first child to be prominent, or last to be next to Tools
                // The snippet shows Tools is inside. Let's append to end to sit next to it.
                container.appendChild(btn);
                console.log("Gemini Enhancer: Button successfully injected into:", container);
            }
        };

        // 1. Immediate attempt
        injectButton();

        // 2. Observer for SPA changes (Model changes, Chat resets)
        const observer = new MutationObserver((mutations) => {
            // Check if our button was removed or if container appeared
            injectButton();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 3. Polling fallback (common for aggressive SPAs like Gemini)
        // Check every second for 10 seconds to ensure it catches late loads
        let checks = 0;
        const interval = setInterval(() => {
            injectButton();
            checks++;
            if (checks > 10 && document.getElementById('tm-mode-toggle-btn')) {
                clearInterval(interval);
            }
            if (checks > 60) clearInterval(interval); // Stop after 1 minute
        }, 1000);
    }

    // Start the script
    init();

})();