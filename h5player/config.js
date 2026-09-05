/* h5player-lite config override — injected by build.sh immediately before
 * `async function initUiConfigManager`, in the same scope as `configManager`.
 *
 * Why the clearing step: ConfigManager.get() resolves localStorage -> GM storage
 * -> defaults, and getConfObj() syncs any stored key back into the live config
 * object on every call. setMemoryStorage writes the lowest (defaults) tier, so a
 * leftover stored value would win over everything below. We delete our three keys
 * from both tiers on every load before writing our values.
 *
 * Consequence: do NOT set these three keys from h5player's own config menu. The
 * menu writes the stored tiers, which are wiped on the next page load.
 *
 * GM_deleteValue is guarded because the Safari Userscripts app implements only
 * the async GM.* API; the sync GM_* set is absent there and the guard makes the
 * GM tier a no-op. Violentmonkey has the full sync set, so both tiers are live.
 */
;(function () {
  const KEYS = [
    '_h5player_hotkeys',
    '_h5player_ui_enable',
    '_h5player_enhance_allowCrossOriginControl'
  ]
  KEYS.forEach(function (k) {
    try { localStorage.removeItem(k) } catch (e) {}
    try { window.GM_deleteValue && window.GM_deleteValue(k) } catch (e) {}
  })

  /* Toolbar/menu off. */
  configManager.setMemoryStorage('ui.enable', false)

  /* Off so the cross-tab `videoDetected` listener cannot make h5player swallow
   * keypresses on pages that have no video of their own. Live on Violentmonkey,
   * dead code on Safari. */
  configManager.setMemoryStorage('enhance.allowCrossOriginControl', false)

  /* Replaces the entire default hotkey table. Turkish-Q layout; the `i` is the
   * dotted i on the home row, not the dotless one on the top row.
   * Known and accepted: `l` and `i` override YouTube's seek-forward-10s and
   * miniplayer while a video is present. */
  configManager.setMemoryStorage('hotkeys', [
    { desc: 'Slower (-0.2x)',      key: 'ç',       command: 'setPlaybackRateDown', args: -0.2 },
    { desc: 'Faster (+0.2x)',      key: '.',       command: 'setPlaybackRateUp',   args: 0.2 },
    { desc: '1x',                 key: 'l',       command: 'setPlaybackRatePlus', args: 1 },
    { desc: '1.5x',               key: 'ş',       command: 'setPlaybackRatePlus', args: 1.5 },
    { desc: '2x',                 key: 'i',       command: 'setPlaybackRatePlus', args: 2 },
    { desc: 'Toggle 1x / last',   key: 'z',       command: 'resetPlaybackRate' },
    { desc: 'Screenshot',         key: 'shift+s', command: 'capture' },
    { desc: 'Picture in picture', key: 'shift+p', command: 'togglePictureInPicture' },
    { desc: 'Resume progress',    key: 'shift+r', command: 'switchRestorePlayProgressStatus' },

    /* Normal fullscreen, not upstream's "web fullscreen" (which on YouTube maps to
     * the theater-mode button). On sites with a table entry this clicks the site's
     * own fullscreen button, so YouTube behaves exactly like its `f`. Elsewhere it
     * falls through to the fullscreen API on the video's container.
     * Bare `enter` is upstream's key for this and stays unbound on purpose: Enter
     * triggering fullscreen by accident is why this config override exists. */
    { desc: 'Fullscreen',         key: 'shift+enter',      command: 'setFullScreen' },

    /* Seek goes through the per-site TCC table (addCurrentTime/subtractCurrentTime),
     * so sites with their own seek handling are respected. Bound on shift+arrows
     * rather than bare arrows so the site keeps its native seek; the hotkey handler
     * bails on INPUT/TEXTAREA/SELECT/contenteditable, so shift+arrow text selection
     * is unaffected. */
    { desc: 'Forward 5s',         key: 'shift+arrowright', command: 'setCurrentTimeUp',   args: 5 },
    { desc: 'Back 5s',            key: 'shift+arrowleft',  command: 'setCurrentTimeDown', args: -5 }
  ])
})()
