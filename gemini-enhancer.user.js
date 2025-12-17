// ==UserScript==
// @name         Gemini Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.21
// @description  Enhancements for Google Gemini: Fast/Thinking/Pro Toggles & Custom Keybindings.
// @author       You
// @match        https://gemini.google.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/gemini-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/gemini-enhancer.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Configuration
    const SELECTORS = {
        container: '.leading-actions-wrapper',
        triggerBtn: '[data-test-id="bard-mode-menu-button"]',
        // Updated Selectors based on user request (12/2025)
        optionFast: '[data-test-id="bard-mode-option-fast"]',
        optionThinking: '[data-test-id="bard-mode-option-thinking"]',
        optionPro: '[data-test-id="bard-mode-option-pro"]',

        toolsDrawer: 'toolbox-drawer',
        sendButton: 'button[aria-label="Send message"]'
    };

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

    // --- Feature 2: Mode Selection Buttons (F, T, P) ---

    function createModeButtons() {
        const container = document.createElement('div');
        container.className = "gemini-mode-group";
        container.id = "tm-mode-group";

        const modes = [
            { label: 'F', selector: SELECTORS.optionFast, title: 'Fast' },
            { label: 'T', selector: SELECTORS.optionThinking, title: 'Thinking' },
            { label: 'P', selector: SELECTORS.optionPro, title: 'Pro' }
        ];

        modes.forEach(mode => {
            const btn = document.createElement('button');
            btn.className = "gemini-mode-btn";
            btn.textContent = mode.label;
            btn.title = mode.title;
            btn.type = "button";

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setMode(mode.selector);
            };

            container.appendChild(btn);
        });

        return container;
    }

    function setMode(targetSelector) {
        const trigger = document.querySelector(SELECTORS.triggerBtn);
        if (!trigger) {
            console.error("Gemini Enhancer: Mode dropdown trigger not found.");
            return;
        }

        console.log("Gemini Enhancer: Opening menu...");
        trigger.click();

        // Wait for Angular Material menu overlay
        setTimeout(() => {
            const targetOption = document.querySelector(targetSelector);
            if (targetOption) {
                targetOption.click();
                console.log(`Gemini Enhancer: Selected mode ${targetSelector}`);
            } else {
                console.warn(`Gemini Enhancer: Target option ${targetSelector} not found. Closing menu.`);
                // Close menu by clicking body (standard behavior)
                document.body.click();
            }
        }, 50); // Short delay for DOM render
    }

    function init() {
        console.log("Gemini Enhancer: Initializing...");

        // Hook Keybinds
        document.addEventListener('keydown', handleInputKeydown, true);

        // UI Injection Logic
        const findContainer = () => {
            // Attempt 1: The specific wrapper
            let c = document.querySelector('.leading-actions-wrapper');
            if (c) return c;

            // Attempt 2: "Tools" button parent or similar
            const toolsBtn = document.querySelector('button[aria-label="Extensions"]') ||
                document.querySelector('button[aria-label="Upload image"]') ||
                document.querySelector('[data-test-id="bard-mode-menu-button"]')?.parentElement;

            if (toolsBtn) return toolsBtn.parentElement;
            return null;
        };

        const injectButtons = () => {
            if (document.getElementById('tm-mode-group')) return;

            const container = findContainer();
            if (container) {
                // Check visibility
                const style = window.getComputedStyle(container);
                if (style.display === 'none' || style.visibility === 'hidden') return;

                const btnGroup = createModeButtons();
                container.appendChild(btnGroup);
                console.log("Gemini Enhancer: Mode buttons injected.");
            }
        };

        // Create styles
        const style = document.createElement('style');
        style.textContent = `
            .gemini-mode-group {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-left: 12px;
                padding-left: 12px;
                border-left: 1px solid rgba(128, 128, 128, 0.3);
                height: 32px;
            }

            .gemini-mode-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px; 
                height: 28px;
                border-radius: 50%; /* Circle */
                border: 1px solid rgba(128, 128, 128, 0.2); 
                background-color: transparent;
                
                font-family: 'Google Sans', Roboto, sans-serif;
                font-size: 13px;
                font-weight: 600;
                color: inherit;
                opacity: 0.6;
                cursor: pointer;
                transition: all 0.2s;
            }

            .gemini-mode-btn:hover {
                background-color: rgba(128, 128, 128, 0.15);
                opacity: 1;
                transform: scale(1.05);
            }
            
            .gemini-mode-btn:active {
                transform: scale(0.95);
            }
        `;
        document.head.appendChild(style);
        injectButtons();

        // Watch for SPA changes
        const observer = new MutationObserver(() => injectButtons());
        observer.observe(document.body, { childList: true, subtree: true });

        // Backup interval
        const interval = setInterval(injectButtons, 2000);
        setTimeout(() => clearInterval(interval), 30000);
    }

    init();

})();