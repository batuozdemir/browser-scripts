// ==UserScript==
// @name         Gemini Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.17
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
    // SVG Icon is now created via DOM methods to satisfy Trusted Types


    // Style injection moved to init for centralized management


    function createToggleButton() {
        const btn = document.createElement('button');
        btn.className = "gemini-enhancer-btn";
        btn.id = "tm-mode-toggle-btn";
        btn.type = "button"; // Prevent form submission

        // Create Icon Wrapper
        const iconSpan = document.createElement('span');
        iconSpan.style.display = 'flex';
        iconSpan.style.alignItems = 'center';
        iconSpan.style.marginRight = '6px';

        // Create SVG using DOM methods to avoid innerHTML (TrustedHTML policy)
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("height", "24");
        svg.setAttribute("viewBox", "0 -960 960 960");
        svg.setAttribute("width", "24");
        svg.setAttribute("fill", "currentColor");

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-82v-78q-33-14-56.5-41.5T360-344v-28h80v28q0 17 11.5 28.5T480-304q17 0 28.5-11.5T520-344v-28h80v28q0 57-35.5 98.5T480-202v40h-40Z");

        svg.appendChild(path);
        iconSpan.appendChild(svg);

        // Create Text
        const textSpan = document.createElement('span');
        textSpan.textContent = "Mode";

        btn.appendChild(iconSpan);
        btn.appendChild(textSpan);

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
        const validPaths = [
            '/app',
            '/u/',
            '/chat'
        ];

        // Simple check to ensure we are on a relevant page
        if (!validPaths.some(path => window.location.pathname.includes(path)) && window.location.pathname !== '/') {
            // console.log("Gemini Enhancer: Not on a chat page?", window.location.pathname);
        }

        const findContainer = () => {
            // Attempt 1: The specific wrapper we used before
            let c = document.querySelector('.leading-actions-wrapper');
            if (c) return c;

            // Attempt 2: "Tools" button parent (the drawer toggle)
            const toolsBtn = document.querySelector('button[aria-label="Extensions"]') ||
                document.querySelector('button[aria-label="Upload image"]') ||
                document.querySelector('[data-test-id="bard-mode-menu-button"]')?.parentElement; // The mode toggle itself if it exists (we want to be near it)

            if (toolsBtn) {
                // Usually the button is in a flex container. We want that container.
                return toolsBtn.parentElement;
            }

            // Attempt 3: Look for the input area's top toolbar (where the mode switcher usually lives in new UI)
            // This is harder without a specific class. 
            // Only return if we are confident.
            return null;
        };

        const injectButton = () => {
            // Check if button already exists
            if (document.getElementById('tm-mode-toggle-btn')) return;

            const container = findContainer();

            if (container) {
                console.log("Gemini Enhancer: Container found:", container);

                // Debug: Check visibility
                const style = window.getComputedStyle(container);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    console.warn("Gemini Enhancer: Container is hidden, searching for better candidate...");
                    return; // Don't inject into hidden container
                }

                const btn = createToggleButton();

                // Append to end to be on the right side of Tools
                container.appendChild(btn);
                console.log("Gemini Enhancer: Button injected.");
            } else {
                // Rate limited logging
                if (Math.random() < 0.05) console.log("Gemini Enhancer: Container not found yet.");
            }
        };

        // Create styles with better visibility
        const style = document.createElement('style');
        style.textContent = `
            .gemini-enhancer-btn {
                display: flex;
                align-items: center;
                height: 40px; /* Match standard pill height */
                padding: 0 16px; 
                margin-left: 8px; /* Spacing from Tools */
                border-radius: 20px;
                border: 1px solid transparent; 
                background-color: transparent;
                /* Force standard dark mode colors if variables fail */
                color: #e3e3e3; 
                fill: #e3e3e3; /* For SVG */
                
                font-family: 'Google Sans', Roboto, sans-serif;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .gemini-enhancer-btn:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }
            
            /* Light mode override only if explicitly detected */
            @media (prefers-color-scheme: light) {
                 .gemini-enhancer-btn {
                    color: #444746;
                    fill: #444746;
                 }
                 .gemini-enhancer-btn:hover {
                    background-color: rgba(0, 0, 0, 0.05);
                 }
            }
        `;
        document.head.appendChild(style);
        injectButton();

        // Run on mutations
        const observer = new MutationObserver((mutations) => {
            // throttle?
            injectButton();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Periodic check for slower loads
        const interval = setInterval(injectButton, 2000);
        setTimeout(() => clearInterval(interval), 30000); // Stop after 30s
    }

    // Start the script
    init();

})();