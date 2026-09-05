// ==UserScript==
// @name         youtube-subtitles
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Turns YouTube auto-generated captions into stable movie-style subtitles.
// @author       You
// @license      GPL-3.0-or-later
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/youtube-subtitles.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/youtube-subtitles.user.js
// ==/UserScript==

/* AI AGENT NOTES — read before editing.
 *
 * What this does and why it works the way it does. YouTube's auto-generated
 * ("ASR") captions arrive as json3 over XHR from /api/timedtext?...&kind=asr.
 * Verified against a live player on 2026-09-05 (asr variant "gemini"), the
 * response has exactly two kinds of event that carry `segs`:
 *
 *   - events WITHOUT `aAppend` — one complete caption line each. 134 of these
 *     in the sample. This is the real text and it never gets revised.
 *   - events WITH `aAppend: 1` — roll-up scroll markers whose only segment is
 *     "\n". 133 of these in the sample, interleaved one-for-one.
 *
 * The word-by-word rolling the viewer sees is NOT revision. It is the player
 * revealing one line progressively using the per-segment `tOffsetMs` values,
 * with two lines on screen at once because consecutive lines overlap in time
 * (median gap between them was -1520 ms). So the whole fix is: keep the
 * non-append events, ignore `tOffsetMs` entirely, and paint each line whole.
 *
 * DO NOT "restore" tOffsetMs handling — it is the bug, not a missing feature.
 *
 * There are two separate ASR gates and both are needed. `kind=asr` on the
 * request URL decides whether a response becomes our cue source. The player's
 * getOption('captions','track').kind decides whether we draw, because a video
 * can carry both an ASR and a manual track: on one measured page YouTube
 * fetched the manual track and then the ASR one, so "the last response wins"
 * picks the wrong answer. getOption also catches the viewer switching tracks,
 * which does not always trigger a new request. Manually authored subtitles are
 * already stable and must be left to YouTube.
 *
 * The hook must stay at document-start. YouTube requests the caption track
 * once, early, and caches it; a hook installed at document-idle misses it and
 * the script silently does nothing until the next SPA navigation.
 *
 * DO NOT rewrite this to fetch the track itself. /api/timedtext is gated on a
 * `pot` proof-of-origin token that the player appends and that is not in the
 * baseUrl from ytInitialPlayerResponse. Measured 2026-09-05: every request
 * without it returns HTTP 200 with a ZERO-BYTE body — no error, no status code
 * to branch on — both from outside the browser and same-origin from inside the
 * page. Passively reading the player's own request is the only route that
 * works, which is why this is a hook and not a fetch.
 *
 * Styles are injected as a plain <style> element on purpose. Safari's
 * Userscripts app has no synchronous GM_* API, so GM_addStyle would be a
 * no-op there (this repo already hit that in h5player/build.sh edit 7).
 */

(function () {
  'use strict';

  /* ---- segmentation (pure, unit-tested by test-segmentation.js) ---------- */

  var MAX_LINE_CHARS = 42;    // one rendered line
  var MAX_CHUNK_CHARS = 84;   // two rendered lines
  var MAX_CHUNK_MS = 7000;    // never hold one chunk longer than this
  var SPLIT_GAP_MS = 1200;    // silence this long ends a chunk

  /* json3 -> [{start, end, text}], one entry per real caption line. */
  function parseJson3 (text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return null; }
    if (!data || !Array.isArray(data.events)) return null;

    var cues = [];
    for (var i = 0; i < data.events.length; i++) {
      var ev = data.events[i];
      /* No segs: window-definition event. aAppend: roll-up scroll marker. */
      if (!ev.segs || ev.aAppend || typeof ev.tStartMs !== 'number') continue;

      var out = '';
      for (var j = 0; j < ev.segs.length; j++) out += ev.segs[j].utf8 || '';
      out = out.replace(/\s+/g, ' ').trim();
      if (!out) continue;

      cues.push({ start: ev.tStartMs, end: ev.tStartMs + (ev.dDurationMs || 0), text: out });
    }
    cues.sort(function (a, b) { return a.start - b.start; });
    return cues.length ? cues : null;
  }

  /* Merge lines into sentence-shaped chunks that fit two rendered lines.
   * A chunk is emitted at sentence-ending punctuation, or when it would
   * outgrow the size/time caps, or across a silence. */
  function segmentCues (cues) {
    var chunks = [];
    var cur = null;

    for (var i = 0; i < cues.length; i++) {
      var cue = cues[i];

      if (cur) {
        var merged = cur.text + ' ' + cue.text;
        if (merged.length > MAX_CHUNK_CHARS ||
            cue.start - cur.start > MAX_CHUNK_MS ||
            cue.start - cur.end > SPLIT_GAP_MS) {
          chunks.push(cur);
          cur = null;
        } else {
          cur.text = merged;
          cur.end = Math.max(cur.end, cue.end);
        }
      }

      if (!cur) cur = { start: cue.start, end: cue.end, text: cue.text };

      if (/[.!?…]["'”’)\]]?$/.test(cur.text)) {
        chunks.push(cur);
        cur = null;
      }
    }
    if (cur) chunks.push(cur);

    /* Roll-up lines linger on screen long after their words are spoken, which
     * is why consecutive cues overlap. The honest end of a chunk is where the
     * next one starts. */
    for (var k = 0; k < chunks.length - 1; k++) {
      var nextStart = chunks[k + 1].start;
      if (nextStart > chunks[k].start && nextStart < chunks[k].end) chunks[k].end = nextStart;
    }
    return chunks;
  }

  /* One line if it fits, otherwise two balanced ones. MAX_CHUNK_CHARS is two
   * times MAX_LINE_CHARS, so a third line is never needed. */
  function wrapLines (text) {
    if (text.length <= MAX_LINE_CHARS) return [text];

    var words = text.split(' ');
    var target = text.length / 2;
    var best = 0;
    var bestScore = Infinity;
    var len = 0;

    for (var i = 0; i < words.length - 1; i++) {
      len += words[i].length + (i ? 1 : 0);
      var score = Math.abs(len - target);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return [words.slice(0, best + 1).join(' '), words.slice(best + 1).join(' ')];
  }

  /* Node (test harness) stops here; everything below needs a document. */
  if (typeof window === 'undefined') {
    module.exports = { parseJson3: parseJson3, segmentCues: segmentCues, wrapLines: wrapLines };
    return;
  }

  /* ---- browser ---------------------------------------------------------- */

  if (window.__youtubeSubtitlesLoaded) return;
  window.__youtubeSubtitlesLoaded = true;

  /* No top-frame guard on purpose: every /embed/ iframe has its own player and
   * its own overlay, and there is nothing global to double-bind. */

  var SELECTORS = {
    player: '.html5-video-player',
    video: 'video',
    ccButton: '.ytp-subtitles-button',
    nativeCaptions: '.ytp-caption-window-container'
  };
  var HIDE_NATIVE_CLASS = 'yts-hide-native';
  var LOG = '[YTSubs]';

  var TRACK_POLL_MS = 500;

  var chunks = [];
  var cueLang = '';        // language of the cues we are holding
  var capturedAsr = false; // last timedtext response was an ASR one
  var nativeHidden = false;
  var overlay = null;
  var playerEl = null;
  var resizeObs = null;
  var lastText = null;
  var lastHref = '';
  var lastVideoId = '';
  var trackCheckedAt = 0;
  var trackIsOurs = false;

  function log (msg) { console.log(LOG, msg); }

  /* -- capture ------------------------------------------------------------ */

  /* YouTube requests timedtext over XHR (confirmed live). fetch is wrapped too
   * as a cheap safety net in case that ever moves. */
  function installCaptureHook (onCapture) {
    function urlOf (v) {
      try { return typeof v === 'string' ? v : (v && v.url) || ''; } catch (e) { return ''; }
    }
    function isTimedText (u) { return u.indexOf('/api/timedtext') !== -1; }

    var proto = window.XMLHttpRequest.prototype;
    var open = proto.open;
    var send = proto.send;

    proto.open = function (method, url) {
      this.__ytsUrl = urlOf(url);
      return open.apply(this, arguments);
    };
    proto.send = function () {
      var xhr = this;
      if (xhr.__ytsUrl && isTimedText(xhr.__ytsUrl)) {
        xhr.addEventListener('load', function () {
          try { onCapture(xhr.__ytsUrl, xhr.responseText); } catch (e) { log('capture failed: ' + e); }
        });
      }
      return send.apply(this, arguments);
    };

    var origFetch = window.fetch;
    if (!origFetch) return;
    window.fetch = function (input) {
      var promise = origFetch.apply(this, arguments);
      var url = urlOf(input);
      if (isTimedText(url)) {
        promise.then(function (res) {
          res.clone().text().then(function (body) { onCapture(url, body); }, function () {});
        }, function () {});
      }
      return promise;
    };
  }

  function param (url, name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(url);
    return m ? decodeURIComponent(m[1]) : '';
  }

  /* Only ASR responses become our cue source. A manually authored track is
   * already stable and is left entirely to YouTube. */
  function onTimedText (url, body) {
    capturedAsr = param(url, 'kind') === 'asr';
    if (!capturedAsr) return;

    var cues = parseJson3(body);
    if (!cues) return;

    chunks = segmentCues(cues);
    cueLang = param(url, 'tlang') || param(url, 'lang');
    trackCheckedAt = 0;
    lastText = null;
    log('captured ' + cues.length + ' ASR lines (' + cueLang + ') -> ' + chunks.length + ' subtitle chunks');
  }

  /* Which track is on screen right now. The captured request URL only says what
   * was downloaded; a video can carry both an ASR and a manual track, and the
   * player may hold either. getOption is the authoritative answer, so it also
   * catches the user switching tracks with no new request. Returns null when
   * the API is unavailable, in which case the caller falls back to the URL. */
  function activeTrackIsOurs (player) {
    var api = player.getOption ? player : document.getElementById('movie_player');
    if (!api || typeof api.getOption !== 'function') return null;
    var track;
    try { track = api.getOption('captions', 'track'); } catch (e) { return null; }
    if (!track || typeof track !== 'object') return null;
    if (track.kind !== 'asr') return false;
    /* On a translated track the player reports the SOURCE language in
     * languageCode and the target in translationLanguage, which is the one
     * that matches the request's tlang. Comparing languageCode alone rejects
     * every translated track. */
    var active = (track.translationLanguage && track.translationLanguage.languageCode) ||
                 track.languageCode;
    /* Holding cues for a different language means the switch has happened but
     * its track has not arrived yet — let YouTube draw until it does. */
    return !cueLang || !active || active === cueLang;
  }

  function hideNative (yes) {
    if (yes === nativeHidden) return;
    nativeHidden = yes;
    document.documentElement.classList.toggle(HIDE_NATIVE_CLASS, yes);
  }

  function release () {
    chunks = [];
    cueLang = '';
    capturedAsr = false;
    lastText = null;
    trackCheckedAt = 0;
    trackIsOurs = false;
    hideNative(false);
    if (overlay) {
      overlay.textContent = '';
      overlay.style.display = 'none';
    }
  }

  /* -- render ------------------------------------------------------------- */

  function injectStyle () {
    var style = document.createElement('style');
    style.textContent =
      '#yts-overlay{position:absolute;left:0;right:0;bottom:5%;z-index:30;display:flex;' +
      'flex-direction:column;align-items:center;pointer-events:none;text-align:center;' +
      'padding:0 6%;line-height:1.25;letter-spacing:.01em;font-weight:500;' +
      'transition:bottom .15s ease;' +
      'font-family:"Helvetica Neue",Helvetica,Arial,"Liberation Sans",sans-serif}' +
      /* lift clear of the control bar while it is showing */
      '.html5-video-player:not(.ytp-autohide) #yts-overlay{bottom:13%}' +
      /* No box: white glyphs on a black outline, the way mpv/VLC draw them.
       * The offsets are in em so the outline tracks the font size instead of
       * going spindly in fullscreen and clotted in a small player. */
      '#yts-overlay .yts-line{color:#fff;text-shadow:' +
      '.045em 0 .01em #000,-.045em 0 .01em #000,0 .045em .01em #000,0 -.045em .01em #000,' +
      '.032em .032em .01em #000,-.032em .032em .01em #000,' +
      '.032em -.032em .01em #000,-.032em -.032em .01em #000,' +
      '0 .03em .12em rgba(0,0,0,.85)}' +
      'html.' + HIDE_NATIVE_CLASS + ' ' + SELECTORS.nativeCaptions + '{display:none!important}';
    /* document.head is null this early at document-start. */
    (document.head || document.documentElement).appendChild(style);
  }

  function scaleFont (player) {
    if (!overlay) return;
    overlay.style.fontSize = Math.max(13, Math.round(player.clientHeight * 0.038)) + 'px';
  }

  function ensureOverlay (player) {
    if (overlay && overlay.parentElement === player) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'yts-overlay';
    overlay.style.display = 'none';
    player.appendChild(overlay);
    lastText = null;

    if (resizeObs) resizeObs.disconnect();
    resizeObs = new ResizeObserver(function () { scaleFont(player); });
    resizeObs.observe(player);
    scaleFont(player);
    return overlay;
  }

  function getPlayer () {
    if (playerEl && playerEl.isConnected) return playerEl;
    playerEl = document.querySelector(SELECTORS.player);
    return playerEl;
  }

  function findChunk (ms) {
    var lo = 0;
    var hi = chunks.length - 1;
    var found = null;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (chunks[mid].start <= ms) { found = chunks[mid]; lo = mid + 1; } else { hi = mid - 1; }
    }
    return found && ms < found.end ? found : null;
  }

  function paint (player, text) {
    var box = ensureOverlay(player);
    if (text === lastText) return;
    lastText = text;

    box.textContent = '';
    if (!text) { box.style.display = 'none'; return; }

    var lines = wrapLines(text);
    for (var i = 0; i < lines.length; i++) {
      var span = document.createElement('span');
      span.className = 'yts-line';
      span.textContent = lines[i];
      box.appendChild(span);
    }
    box.style.display = '';
  }

  /* Driven off currentTime rather than wall clock, so seeking, pausing and
   * playback-rate changes all come out right for free. */
  function tick () {
    window.requestAnimationFrame(tick);

    if (location.href !== lastHref) {
      lastHref = location.href;
      var id = new URLSearchParams(location.search).get('v') || location.pathname;
      if (id !== lastVideoId) {
        lastVideoId = id;
        release();
      }
    }

    var player = getPlayer();
    if (!player) { lastText = null; return; }

    if (!chunks.length) { hideNative(false); paint(player, ''); return; }

    /* Re-asking the player which track is live on every frame is wasteful and
     * the answer only changes when the viewer changes it. */
    var now = performance.now();
    if (now - trackCheckedAt > TRACK_POLL_MS) {
      trackCheckedAt = now;
      var live = activeTrackIsOurs(player);
      trackIsOurs = live === null ? capturedAsr : live;
    }
    if (!trackIsOurs) { hideNative(false); paint(player, ''); return; }

    /* Ads run through the same <video>; its currentTime is not ours. */
    if (player.classList.contains('ad-showing')) { hideNative(false); paint(player, ''); return; }

    var button = player.querySelector(SELECTORS.ccButton);
    if (button && button.getAttribute('aria-pressed') !== 'true') {
      hideNative(false); paint(player, ''); return;
    }

    var video = player.querySelector(SELECTORS.video);
    if (!video) { paint(player, ''); return; }

    hideNative(true);
    var chunk = findChunk(video.currentTime * 1000);
    paint(player, chunk ? chunk.text : '');
  }

  installCaptureHook(onTimedText);
  injectStyle();
  window.requestAnimationFrame(tick);
  log('ready');
})();
