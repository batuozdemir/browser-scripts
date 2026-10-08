// ==UserScript==
// @name         youtube-summary
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  A Summarize button on YouTube: Claude Haiku summarizes the captions through Aperture, with clickable section timestamps.
// @author       You
// @license      GPL-3.0-or-later
// @match        https://www.youtube.com/*
// @run-at       document-start
// @inject-into  content
// @grant        GM.xmlHttpRequest
// @connect      aperture.ladon-minor.ts.net
// @downloadURL  https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/youtube-summary.user.js
// @updateURL    https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/youtube-summary.user.js
// ==/UserScript==

/* AI AGENT NOTES — read before editing.
 *
 * Needs youtube-subtitles.user.js installed and enabled. That script runs in
 * the page world, where it can hook the player's caption request; this one
 * runs in the content world, because Safari's Userscripts app only provides
 * GM.* there. The captions cross over by postMessage ('yts-transcript'), and
 * this script asks again ('yts-transcript-request') since either may start
 * first. DO NOT fetch the caption track here: /api/timedtext needs the
 * player's `pot` token and returns an empty body without it (see the notes in
 * youtube-subtitles.user.js).
 *
 * YouTube only requests captions once they are turned on. When none were
 * captured for this video, the button turns captions on, waits for the track,
 * and turns them back off.
 *
 * The request goes to Aperture, the tailnet's AI gateway, which knows the Mac
 * by its Tailscale identity: there is no API key anywhere in this file and
 * there must never be one. Even GM.xmlHttpRequest is CORS-checked on Safari:
 * it runs from the extension's background page. Aperture answers it only
 * because Batu's Aperture grant sets CORS for this extension's origin on
 * /v1/messages. A CORS refusal reaches this script as a bare onerror ("could not
 * reach Aperture"); the real message is in Develop -> Web Extension Background
 * Content -> Userscripts. Reinstalling Userscripts changes the origin and the
 * grant must follow. The HTTPS name works from the Mac (ipset:admin); other
 * owner devices are only granted tcp:80 in acl.hujson.
 * State: ~/Workspace/infra/tailscale/aperture/README.md.
 */

(function () {
  'use strict';

  var APERTURE_URL = 'https://aperture.ladon-minor.ts.net/v1/messages';
  var MODEL = 'claude-haiku-5-5';
  var BLOCK_MS = 30000;          // one timestamp per this much of the video
  var CAPTURE_WAIT_MS = 8000;    // how long to wait for a track after turning captions on

  var PROMPT =
    'You summarize a YouTube video from its captions. Write in Turkish. Plain text: ' +
    'no Markdown, no # headings, no ** bold. Start with a summary of three to five ' +
    'sentences. Then a line with the single word "Bölümler", then the main sections in ' +
    'order, one per line: the timestamp where the section starts, copied exactly as it ' +
    'appears in the captions in square brackets, then a short title, for example ' +
    '"[12:30] Kurulum adımları". Four to ten sections depending on the length. Use only ' +
    'what is in the captions. Captions may be auto-generated, so read past recognition ' +
    'errors rather than repeating them.';
  var LANGUAGE_REMINDER = 'Özetin tamamını ve bölüm başlıklarını Türkçe yaz; altyazı başka bir dilde olsa bile.';

  /* ---- pure (unit-tested by youtube-summary.test.js) -------------------- */

  function clock (ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  /* [[startMs, text], ...] -> "[m:ss] text" lines, one per BLOCK_MS of video.
   * A timestamp per caption line would multiply the tokens for no gain. */
  function captionText (cues) {
    var lines = [];
    var cur = null;
    for (var i = 0; i < cues.length; i++) {
      var start = cues[i][0];
      var text = cues[i][1];
      if (!cur || start - cur.start >= BLOCK_MS) {
        if (cur) lines.push('[' + clock(cur.start) + '] ' + cur.parts.join(' '));
        cur = { start: start, parts: [] };
      }
      cur.parts.push(text);
    }
    if (cur) lines.push('[' + clock(cur.start) + '] ' + cur.parts.join(' '));
    return lines.join('\n');
  }

  /* "[1:02:03] title" -> {seconds: 3723, rest: " title"}, or null. */
  function leadingTimestamp (line) {
    var m = /^\s*\[(?:(\d+):)?(\d{1,2}):(\d{2})\](.*)$/.exec(line);
    if (!m) return null;
    return { seconds: (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]), rest: m[4] };
  }

  if (typeof window === 'undefined') {
    module.exports = { clock: clock, captionText: captionText, leadingTimestamp: leadingTimestamp, PROMPT: PROMPT, LANGUAGE_REMINDER: LANGUAGE_REMINDER };
    return;
  }

  /* ---- browser ---------------------------------------------------------- */

  if (window.self !== window.top) return;
  if (window.__youtubeSummaryLoaded) return;
  window.__youtubeSummaryLoaded = true;

  var SELECTORS = {
    video: '#movie_player video',
    ccButton: '#movie_player .ytp-subtitles-button'
  };
  var LOG = '[YTSummary]';

  var transcripts = {};   // videoId -> message from youtube-subtitles
  var summaries = {};     // videoId -> summary text, so reopening is instant
  var waiting = null;     // resolves when a transcript for this video arrives
  var button = null;
  var panel = null;
  var busy = false;

  function log (msg) { console.log(LOG, msg); }
  function videoId () { return new URLSearchParams(location.search).get('v') || ''; }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window || !d || d.source !== 'yts-transcript' || !d.videoId) return;
    transcripts[d.videoId] = d;
    if (waiting && d.videoId === videoId()) waiting();
  });

  function askForTranscript () {
    window.postMessage({ source: 'yts-transcript-request' }, location.origin);
  }

  function arrival (ms) {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () { waiting = null; resolve(); }, ms);
      waiting = function () { clearTimeout(timer); waiting = null; resolve(); };
    });
  }

  /* Captions are only requested once they are on. Turn them on, wait for the
   * track, and put the button back the way it was. */
  function loadTranscript () {
    var id = videoId();
    if (transcripts[id]) return Promise.resolve(transcripts[id]);
    askForTranscript();
    return arrival(400).then(function () {
      if (transcripts[id]) return transcripts[id];
      var cc = document.querySelector(SELECTORS.ccButton);
      if (!cc || cc.getAttribute('aria-pressed') === 'true') return null;
      cc.click();
      return arrival(CAPTURE_WAIT_MS).then(function () {
        if (cc.getAttribute('aria-pressed') === 'true') cc.click();
        return transcripts[id] || null;
      });
    });
  }

  function summarize (transcript) {
    var title = document.title.replace(/ - YouTube$/, '');
    var body = {
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: PROMPT,
      messages: [{
        role: 'user',
        /* The language rule is repeated after the captions: on a real 14-minute
         * English video the summary paragraph came out in English while the
         * sections were Turkish, the long caption text outweighing the system
         * prompt (seen 2026-10-09). */
        content: 'Video title: ' + title + '\n<captions>\n' + captionText(transcript.cues) +
          '\n</captions>\n\n' + LANGUAGE_REMINDER
      }]
    };
    return new Promise(function (resolve, reject) {
      GM.xmlHttpRequest({
        method: 'POST',
        url: APERTURE_URL,
        headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
        data: JSON.stringify(body),
        timeout: 120000,
        onload: function (r) {
          var d;
          try { d = JSON.parse(r.responseText); } catch (e) { d = null; }
          if (r.status !== 200 || !d) {
            reject(new Error('Aperture ' + r.status + ': ' + String(r.responseText).slice(0, 200)));
          } else if (d.stop_reason === 'refusal') {
            reject(new Error('the model declined'));
          } else {
            resolve((d.content || []).filter(function (b) { return b.type === 'text'; })
              .map(function (b) { return b.text; }).join('').trim());
          }
        },
        onerror: function () { reject(new Error('could not reach Aperture (is Tailscale on?)')); },
        ontimeout: function () { reject(new Error('Aperture did not answer in time')); }
      });
    });
  }

  /* -- UI ----------------------------------------------------------------- */

  function injectStyle () {
    var style = document.createElement('style');
    style.textContent =
      '#yts-sum-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;padding:9px 16px;' +
      'border:0;border-radius:18px;background:#0f0f0f;color:#fff;font:500 14px Roboto,Arial,sans-serif;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer}' +
      '#yts-sum-btn[disabled]{opacity:.6;cursor:default}' +
      '#yts-sum-panel{position:fixed;right:20px;bottom:68px;z-index:2147483000;width:min(440px,calc(100vw - 40px));' +
      'max-height:70vh;overflow:auto;padding:16px 18px;border-radius:12px;background:#fff;color:#0f0f0f;' +
      'font:14px/1.5 Roboto,Arial,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.3);white-space:pre-wrap}' +
      'html[dark] #yts-sum-panel{background:#212121;color:#f1f1f1}' +
      '#yts-sum-panel .yts-sum-close{float:right;border:0;background:none;color:inherit;font-size:18px;' +
      'line-height:1;cursor:pointer;margin:-4px -6px 0 8px}' +
      '#yts-sum-panel a{color:#3ea6ff;cursor:pointer;text-decoration:none}' +
      '#yts-sum-panel a:hover{text-decoration:underline}' +
      '#yts-sum-panel .yts-sum-err{color:#d6453d}';
    (document.head || document.documentElement).appendChild(style);
  }

  function seek (seconds) {
    var video = document.querySelector(SELECTORS.video);
    if (video) video.currentTime = seconds;
  }

  function showPanel (text, isError) {
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'yts-sum-panel';
      document.body.appendChild(panel);
    }
    panel.textContent = '';
    var close = document.createElement('button');
    close.className = 'yts-sum-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', hidePanel);
    panel.appendChild(close);

    /* Text only, never markup: the summary is model output. */
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var stamp = leadingTimestamp(lines[i]);
      var row = document.createElement('div');
      if (isError) row.className = 'yts-sum-err';
      if (stamp) {
        var link = document.createElement('a');
        link.textContent = lines[i].slice(0, lines[i].length - stamp.rest.length);
        link.addEventListener('click', seek.bind(null, stamp.seconds));
        row.appendChild(link);
        row.appendChild(document.createTextNode(stamp.rest));
      } else {
        row.textContent = lines[i] || ' ';
      }
      panel.appendChild(row);
    }
    panel.style.display = '';
  }

  function hidePanel () { if (panel) panel.style.display = 'none'; }

  function onClick () {
    if (busy) return;
    if (panel && panel.style.display !== 'none') { hidePanel(); return; }
    var id = videoId();
    if (summaries[id]) { showPanel(summaries[id]); return; }

    busy = true;
    button.disabled = true;
    button.textContent = 'Özetleniyor…';
    loadTranscript().then(function (transcript) {
      if (!transcript) throw new Error('Bu videoda altyazı bulunamadı. youtube-subtitles açık mı?');
      return summarize(transcript);
    }).then(function (summary) {
      if (videoId() !== id) return;
      summaries[id] = summary;
      showPanel(summary);
      log('summarized ' + id);
    }).catch(function (err) {
      if (videoId() === id) showPanel(String(err.message || err), true);
      log('failed: ' + err);
    }).then(function () {
      busy = false;
      button.disabled = false;
      button.textContent = 'Özetle';
    });
  }

  /* The button only belongs on watch pages; YouTube navigates without reloading. */
  function sync () {
    var watching = location.pathname === '/watch' && !!videoId();
    if (watching && !button && document.body) {
      button = document.createElement('button');
      button.id = 'yts-sum-btn';
      button.type = 'button';
      button.textContent = 'Özetle';
      button.addEventListener('click', onClick);
      document.body.appendChild(button);
    }
    if (button) button.style.display = watching ? '' : 'none';
    hidePanel();
  }

  injectStyle();
  document.addEventListener('yt-navigate-finish', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  log('ready');
})();
