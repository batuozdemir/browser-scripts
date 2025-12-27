// ==UserScript==
// @name         Gemini Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.27
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

        // Temp Chat Feature
        tempChatTrigger: 'button[data-test-id="temp-chat-button"]',
        tempChatIndicator: '.temporary-chat-card',

        // Sidebar Handling
        sidebarMenuButton: 'button[data-test-id="side-nav-menu-button"]',

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

    // --- Feature 2: Mode Selection Buttons (F, T, P) + Temp Chat ---

    /**
     * Toggles the Temporary Chat feature.
     * Safely handles cases where the sidebar is closed (hiding the button).
     * Uses CSS masking to make the sidebar operation invisible/instant.
     */
    async function toggleTempChat() {
        console.log("Gemini Enhancer: Attempting to toggle Temp Chat...");

        // Helper to find the actual Temp Chat Trigger button
        const findTempBtn = () => document.querySelector(SELECTORS.tempChatTrigger);
        let btn = findTempBtn();

        let sidebarWasClosed = false;

        // If button not visible, it's likely because the Sidebar is closed.
        if (!btn) {
            console.log("Gemini Enhancer: Temp chat button not found. Checking Sidebar...");
            const menuBtn = document.querySelector(SELECTORS.sidebarMenuButton);

            if (menuBtn) {
                console.log("Gemini Enhancer: Opening Sidebar (Silently) to find button...");

                // 1. Enter Silent Mode (Hide Sidebar & Disable Transitions)
                document.body.classList.add('gemini-silent-toggle');

                menuBtn.click();
                sidebarWasClosed = true;

                // 2. Poll for the button (Robust Wait)
                // We poll for up to 2 seconds
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 50));
                    btn = findTempBtn();
                    if (btn) break;
                }
            } else {
                console.warn("Gemini Enhancer: Cannot find Sidebar Menu button.");
            }
        }

        if (!btn) {
            console.error("Gemini Enhancer: Still cannot find Temp Chat button. Aborting.");
            // Cleanup if we messed up
            if (sidebarWasClosed) {
                const menuBtn = document.querySelector(SELECTORS.sidebarMenuButton);
                if (menuBtn) menuBtn.click();

                // Remove silent class after a slight delay
                setTimeout(() => document.body.classList.remove('gemini-silent-toggle'), 100);
            }
            return;
        }

        // 3. Click the Temp Chat Button (Toggle ON or OFF)
        console.log("Gemini Enhancer: Clicking Temp Chat button.");
        btn.click();

        // 4. Wait a small bit to ensure click registered
        await new Promise(r => setTimeout(r, 100));

        // 5. Restore Sidebar State if we opened it
        if (sidebarWasClosed) {
            console.log("Gemini Enhancer: Restoring sidebar state (Closing)...");
            const menuBtn = document.querySelector(SELECTORS.sidebarMenuButton);
            if (menuBtn) {
                menuBtn.click();
            }
            // Keep silent mode on until the "close" operation is likely done
            setTimeout(() => {
                document.body.classList.remove('gemini-silent-toggle');
            }, 300);
        }
    }

    function createModeButtons() {
        const container = document.createElement('div');
        container.className = "gemini-mode-group";
        container.id = "tm-mode-group";

        const modes = [
            {
                label: 'F',
                selector: SELECTORS.optionFast,
                title: 'Fast',
                path: 'M7 2v11h3v9l7-12h-4l4-8z' // Lightning Bolt
            },
            {
                label: 'T',
                selector: SELECTORS.optionThinking,
                title: 'Thinking',
                path: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z' // Lightbulb Outline
            },
            {
                label: 'P',
                selector: SELECTORS.optionPro,
                title: 'Pro',
                path: 'M12 2L9.09 9.09 2 12l7.09 2.91L12 22l2.91-7.09L22 12l-7.09-2.91z' // Star/Sparkle
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
                setMode(mode.selector);
            };

            container.appendChild(btn);
        });

        // Splitter
        const splitter = document.createElement('div');
        splitter.style.width = '1px';
        splitter.style.height = '16px';
        splitter.style.backgroundColor = 'rgba(128, 128, 128, 0.3)';
        splitter.style.margin = '0 4px';
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

    // --- Feature 3: URL Parameters ---
    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);

        // ?model=fast|thinking|pro
        const modelParam = params.get('model');
        if (modelParam) {
            // Delay slightly to ensure UI is ready
            setTimeout(() => {
                const map = {
                    'fast': SELECTORS.optionFast,
                    'thinking': SELECTORS.optionThinking,
                    'pro': SELECTORS.optionPro
                };
                if (map[modelParam.toLowerCase()]) {
                    console.log(`Gemini Enhancer: Auto-selecting model '${modelParam}' from URL`);
                    setMode(map[modelParam.toLowerCase()]);
                }
            }, 1000); // 1s wait for initial load
        }

        // ?temp=1|true
        const tempChatParam = params.get('temp');
        if (tempChatParam === '1' || tempChatParam === 'true') {
            const maxAttempts = 50; // 5 seconds
            let attempts = 0;

            const pollInterval = setInterval(() => {
                attempts++;

                // Wait for App to be somewhat ready (Sidebar toggle available)
                const appReady = document.querySelector(SELECTORS.sidebarMenuButton);

                if (appReady) {
                    clearInterval(pollInterval);
                    // Check if already active to avoid toggling OFF if user manually enabled it quickly
                    if (!document.querySelector(SELECTORS.tempChatIndicator)) {
                        console.log("Gemini Enhancer: Triggering Temp Chat from URL...");
                        toggleTempChat();
                    }
                } else if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                }
            }, 100);
        }
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
                gap: 6px;
                margin-left: 12px;
                padding-left: 12px;
                border-left: 1px solid rgba(128, 128, 128, 0.3);
                height: 32px;
            }

            .gemini-mode-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px; /* Space between icon and text */
                height: 30px;
                padding: 0 10px;
                border-radius: 15px; /* Pill shape */
                border: 1px solid rgba(128, 128, 128, 0.2);
                background-color: transparent;

                font-family: 'Google Sans', Roboto, sans-serif;
                font-size: 13px;
                font-weight: 500;
                color: inherit;
                opacity: 0.7;
                cursor: pointer;
                transition: all 0.2s;
            }

            .gemini-mode-btn svg {
                width: 18px;
                height: 18px;
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

            /* Silent Toggle (Hides Sidebar Transitions) */
            body.gemini-silent-toggle mat-sidenav {
                visibility: hidden !important;
                transition: none !important;
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

        // Check URL Params
        checkUrlParams();
    }

    init();

})();