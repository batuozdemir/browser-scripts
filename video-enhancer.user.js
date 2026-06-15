// ==UserScript==
// @name         Universal Video Speed Controller (./ç) - Ultimate
// @namespace    https://violentmonkey.github.io
// @version      2.1
// @description  Controls video speed. Bypasses iframes, shadow DOMs, and custom players (VK, Twitter, Reddit).
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/video-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/refs/heads/main/video-enhancer.user.js
// ==/UserScript==

// ┌──────────────────────────────────────────────────────────────────────┐
// │                        AI AGENT NOTES                                  │
// │  DO NOT REMOVE OR REFACTOR THE FOLLOWING FEATURES:                     │
// │                                                                        │
// │  1. IFRAME COMMUNICATION                                               │
// │     - This script MUST run in iframes to bypass cross-origin security. │
// │     - Do NOT add a main-page-only guard (window.self !== window.top).  │
// │     - Communication happens via postMessage ('VM_SPEED_CHANGE').       │
// │                                                                        │
// │  2. SHADOW DOM TRAVERSAL                                               │
// │     - Deep search function (getAllVideos) is required to bypass custom │
// │       players that hide the <video> tag inside shadow roots.           │
// └──────────────────────────────────────────────────────────────────────┘

(function () {
    'use strict';

    // Singleton guard - prevent double execution
    if (window.__videoEnhancerLoaded) {
        console.log("[VideoEnhancer] Already loaded, skipping duplicate injection.");
        return;
    }
    window.__videoEnhancerLoaded = true;

    const SELECTORS = {
        indicatorId: 'vm-speed-indicator',
        video: 'video',
        iframe: 'iframe'
    };

    // 1. Create or update the center overlay
    function showIndicator(speed, targetVideo = null) {
        let indicator = document.getElementById(SELECTORS.indicatorId);
        const container = document.fullscreenElement || document.body;

        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = SELECTORS.indicatorId;
            indicator.style.cssText = `
                position: fixed;
                background: rgba(0, 0, 0, 0.25); 
                backdrop-filter: blur(2px); 
                color: rgba(255, 255, 255, 0.9);
                padding: 10px 20px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 18px; 
                font-weight: 600;
                text-align: center;
                z-index: 2147483647;
                pointer-events: none; 
                transition: opacity 0.15s ease-in-out, top 0.1s, left 0.1s, transform 0.1s;
                opacity: 0;
                margin: 0;
            `;
            container.appendChild(indicator);
        } else if (indicator.parentElement !== container) {
            container.appendChild(indicator);
        }

        if (targetVideo && !document.fullscreenElement) {
            const rect = targetVideo.getBoundingClientRect();
            indicator.style.top = `${rect.top + (rect.height / 2)}px`;
            indicator.style.left = `${rect.left + (rect.width / 2)}px`;
            indicator.style.transform = 'translate(-50%, -50%)';
        } else {
            indicator.style.top = '33%';
            indicator.style.left = '50%';
            indicator.style.transform = 'translate(-50%, -50%)';
        }

        indicator.textContent = `${speed.toFixed(2)}x`;
        indicator.style.opacity = '1';

        clearTimeout(window.vmSpeedTimeout);
        window.vmSpeedTimeout = setTimeout(() => {
            indicator.style.opacity = '0';
        }, 800);
    }

    // 2. Deep search tool to bypass "Shadow DOM" hiding
    function getAllVideos(root = document) {
        let videos = Array.from(root.querySelectorAll(SELECTORS.video));
        try {
            const elements = root.querySelectorAll('*');
            for (let el of elements) {
                if (el.shadowRoot) {
                    videos = videos.concat(getAllVideos(el.shadowRoot));
                }
            }
        } catch (e) { } // Ignore DOM errors
        return videos;
    }

    // 3. Actually change the speed of any videos found in the current frame
    function changeSpeedInFrame(key) {
        const videos = getAllVideos();
        if (videos.length === 0) return false;

        let updatedSpeed = 1.0;
        let changed = false;
        let largestVideo = null;
        let maxArea = 0;

        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            
            try {
                const rect = video.getBoundingClientRect();
                const area = rect.width * rect.height;
                if (area > maxArea) {
                    maxArea = area;
                    largestVideo = video;
                }
            } catch (e) {}

            let currentSpeed = video.playbackRate;

            if (key === '.') currentSpeed += 0.25;
            else if (key === 'ç') currentSpeed -= 0.25;

            currentSpeed = Math.max(0.25, Math.min(currentSpeed, 16));
            video.playbackRate = Math.round(currentSpeed * 100) / 100;
            updatedSpeed = video.playbackRate;
            changed = true;
        }

        if (changed) {
            console.log(`[VideoEnhancer] Speed changed to ${updatedSpeed}x`);
            showIndicator(updatedSpeed, largestVideo);
        }
        return changed;
    }

    // 4. Send message to all iframes (bypasses cross-origin limits)
    function broadcastToIframes(key) {
        const frames = document.querySelectorAll(SELECTORS.iframe);
        frames.forEach(frame => {
            try {
                // Whisper over the security wall
                frame.contentWindow.postMessage({ type: 'VM_SPEED_CHANGE', key: key }, '*');
            } catch (err) { }
        });
    }

    // --- MAIN EVENT LISTENERS ---

    // Listen for physical keyboard presses
    window.addEventListener('keydown', function (e) {
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

        const key = e.key.toLowerCase();
        if (key !== '.' && key !== 'ç') return;

        // Stop the website from doing its own thing with these keys
        e.preventDefault();
        e.stopPropagation();

        // If we are currently stuck inside a smaller iframe, tell the top website window
        if (window.top !== window) {
            try {
                window.top.postMessage({ type: 'VM_SPEED_CHANGE_TOP', key: key }, '*');
            } catch (err) { }
        } else {
            // We are the top window, broadcast down to all iframes
            broadcastToIframes(key);
        }

        // Change speed for any videos right here in this specific frame
        changeSpeedInFrame(key);
    }, true);

    // Listen for the secret messages from other frames
    window.addEventListener('message', function (e) {
        if (!e.data) return;

        if (e.data.type === 'VM_SPEED_CHANGE_TOP' && window.top === window) {
            // The top window heard from an iframe, now it tells everyone
            changeSpeedInFrame(e.data.key);
            broadcastToIframes(e.data.key);
        } else if (e.data.type === 'VM_SPEED_CHANGE') {
            // An iframe heard from the top window, change speed!
            changeSpeedInFrame(e.data.key);
            // Forward the message down again just in case there are iframes inside iframes
            broadcastToIframes(e.data.key);
        }
    });

    console.log("[VideoEnhancer] Initialized.");

})();