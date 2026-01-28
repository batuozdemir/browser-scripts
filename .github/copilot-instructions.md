# USERSCRIPT SPECIALIST INSTRUCTIONS

**Context**: Violentmonkey (Chrome/Firefox), Userscripts (Safari).
**Priority**: Performance, Cross-Browser Compatibility, and DOM Stability.

## 1. THE METADATA BLOCK (CRITICAL)
The metadata block is the build config. Treat it with extreme precision.
*   **Permissions**: Practice "Least Privilege". Only add `// @grant` for APIs actually used. Use `none` if possible.
*   **Matching**: Prefer specific `// @match` over `@include`. Avoid broad wildcards unless strictly necessary.
*   **Run-At**: Default to `// @run-at document-end` for static sites. Use `document-start` only if intercepting network requests or avoiding FOUC (Flash of Unstyled Content).
*   **Versioning**: Increment `// @version` on **every** logic change (Format: `x.y.z`).

## 2. DOM INTERACTION STRATEGY
Modern sites are SPAs (Single Page Apps). `window.onload` is dead.
*   **No Fixed Delays**: **NEVER** use `setTimeout` with magic numbers to wait for elements.
*   **MutationObserver**: Use `MutationObserver` to detect dynamic content injection.
*   **waitForElement Pattern**: Implement a robust utility to await elements:
    ```javascript
    function waitForElm(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) return resolve(document.querySelector(selector));
            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
    ```

## 3. CROSS-BROWSER COMPATIBILITY (Safari & VM)
*   **unsafeWindow**: Handle `unsafeWindow` carefully. It behaves differently in Violentmonkey vs. Safari.
    *   *Rule*: If you need to access page-context variables, check availability: `const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;`
*   **Clipboard**: Safari strictly blocks clipboard access outside direct user events. Wrap `GM_setClipboard` in click handlers.
*   **iframes**: Userscripts run in iframes by default. If your logic is main-page only, add this guard clause at the top:
    ```javascript
    if (window.top !== window.self) return;
    ```

## 4. STYLING
*   **Injection**: Don't manually create `<style>` tags and append them. Use `// @grant GM_addStyle` (or `GM.addStyle` for GM4 polyfills).
*   **Scoped CSS**: Use specific IDs or obscure class names to prevent bleeding into the site's native styles.

## 5. STORAGE & STATE
*   **Preference**: Use `GM_getValue` / `GM_setValue` for persistence across sessions.
*   **Serialization**: Remember that `GM` storage handles serialization automatically (unlike `localStorage` which needs `JSON.parse`).
*   **Async Note**: `GM.*` (GM4) APIs are async. Violentmonkey (GM 3 style) is sync.
    *   *Default*: Write synchronous code (GM 3 style) unless specifically targeting GM4-only environments.

## 6. DEBUGGING & LOGGING
*   **Prefixing**: All console logs must be prefixed with the script name: `console.log('[MyScript]', 'Status update');`.
*   **Cleanliness**: Remove debug logs before marking a task as "Done".

## 7. CODE STRUCTURE
*   **Isolation**: Wrap the entire script in an **IIFE** (Immediately Invoked Function Expression) to prevent polluting the global scope.
    ```javascript
    (function() {
        'use strict';
        // Your code here
    })();
    ```