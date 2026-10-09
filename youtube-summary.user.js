// ==UserScript==
// @name         youtube-summary
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  A Summarize button next to Like on YouTube: Claude Haiku summarizes the captions through Aperture into a structured panel with clickable section timestamps.
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
 *
 * The summary is model output rendered as Markdown. It is turned into DOM
 * nodes by parseMarkdown/parseInline and textContent only, never innerHTML:
 * that keeps model output from becoming markup, and YouTube enforces Trusted
 * Types, which makes innerHTML with a plain string throw anyway.
 */

(function () {
  'use strict';

  var APERTURE_URL = 'https://aperture.ladon-minor.ts.net/v1/messages';
  var MODEL = 'claude-haiku-5-5';
  var BLOCK_MS = 30000;          // one timestamp per this much of the video
  var CAPTURE_WAIT_MS = 8000;    // how long to wait for a track after turning captions on

  var PROMPT =
    'You summarize a YouTube video from its captions, in Turkish, as Markdown that is easy ' +
    'to scan. Cover what the video actually says, not just its topic: the arguments, ' +
    'examples, numbers, steps and advice. The length follows the video: a short clip gets ' +
    'a short summary, a long talk gets a full one.\n\n' +
    'Use exactly this structure:\n\n' +
    'First line: one plain sentence saying what the video is about, with no heading.\n\n' +
    '## Öne çıkanlar\n' +
    'Three to six bullets ("- "), the points worth remembering if someone reads nothing ' +
    'else. Each is one concrete sentence.\n\n' +
    '## Bölüm bölüm\n' +
    'One "### " heading per main section, in order, four to ten depending on the length. ' +
    'The heading starts with the timestamp where the section starts, copied exactly as it ' +
    'appears in the captions in square brackets, then a short title, for example ' +
    '"### [12:30] Kurulum adımları". Under it, two to five bullets with what is said there. ' +
    'A bullet may have sub-bullets indented by two spaces for steps or lists of items.\n\n' +
    'Put the key term of a bullet in **bold**, at most once per bullet. No other headings, ' +
    'no tables, no links, no code blocks, no closing remarks. Use only what is in the ' +
    'captions. Captions may be auto-generated, so read past recognition errors rather than ' +
    'repeating them.';
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

  /* The Markdown subset the prompt asks for, nothing more:
   *   {type:'heading', level, text} | {type:'para', text} |
   *   {type:'list', ordered, items: [{text, children: [list]}]}
   * Nesting follows indentation; a line deeper than its list's first item
   * opens a sub-list. */
  function parseMarkdown (src) {
    var blocks = [];
    var para = null;
    var stack = [];   // open lists, innermost last: {indent, list}

    function closeLists () { stack = []; }
    function closePara () { para = null; }

    var lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) { closePara(); continue; }

      var h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) {
        closePara(); closeLists();
        blocks.push({ type: 'heading', level: h[1].length, text: h[2] });
        continue;
      }

      var li = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
      if (li) {
        closePara();
        var indent = li[1].replace(/\t/g, '  ').length;
        var ordered = !li[2];
        while (stack.length && indent < stack[stack.length - 1].indent) stack.pop();
        var top = stack[stack.length - 1];
        if (!top || (indent > top.indent && top.list.items.length)) {
          var list = { type: 'list', ordered: ordered, items: [] };
          if (top) top.list.items[top.list.items.length - 1].children.push(list);
          else blocks.push(list);
          stack.push({ indent: indent, list: list });
          top = stack[stack.length - 1];
        }
        top.list.items.push({ text: li[4], children: [] });
        continue;
      }

      if (stack.length && /^\s/.test(line)) {
        /* An indented continuation of the last bullet. */
        var items = stack[stack.length - 1].list.items;
        items[items.length - 1].text += ' ' + line.trim();
        continue;
      }
      closeLists();
      if (para) para.text += ' ' + line.trim();
      else { para = { type: 'para', text: line.trim() }; blocks.push(para); }
    }
    return blocks;
  }

  /* Inline Markdown -> [{type:'text'|'strong'|'em'|'code', text|children} |
   * {type:'time', text, seconds}]. A [label](url) link keeps only its label:
   * the prompt asks for none and a model-written URL is not worth following. */
  var INLINE = /(\*\*|__)(.+?)\1|\*(?!\s)([^*]+?)\*|`([^`]+)`|\[((?:\d+:)?\d{1,2}:\d{2})\]|\[([^\]]+)\]\([^)]*\)/g;

  function parseInline (text) {
    var out = [];
    var last = 0;
    var re = new RegExp(INLINE.source, 'g');   // own copy: this recurses
    var m;
    text = String(text);
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
      if (m[2] !== undefined) out.push({ type: 'strong', children: parseInline(m[2]) });
      else if (m[3] !== undefined) out.push({ type: 'em', children: parseInline(m[3]) });
      else if (m[4] !== undefined) out.push({ type: 'code', text: m[4] });
      else if (m[5] !== undefined) out.push({ type: 'time', text: m[5], seconds: leadingTimestamp(m[0]).seconds });
      else out.push({ type: 'text', text: m[6] });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
    return out;
  }

  if (typeof window === 'undefined') {
    module.exports = {
      clock: clock, captionText: captionText, leadingTimestamp: leadingTimestamp,
      parseMarkdown: parseMarkdown, parseInline: parseInline,
      PROMPT: PROMPT, LANGUAGE_REMINDER: LANGUAGE_REMINDER
    };
    return;
  }

  /* ---- browser ---------------------------------------------------------- */

  if (window.self !== window.top) return;
  if (window.__youtubeSummaryLoaded) return;
  window.__youtubeSummaryLoaded = true;

  var SELECTORS = {
    video: '#movie_player video',
    player: '#movie_player',
    ccButton: '#movie_player .ytp-subtitles-button',
    actionButtons: 'ytd-watch-flexy ytd-watch-metadata #top-level-buttons-computed',
    likeDislike: 'segmented-like-dislike-button-view-model',
    aboveTheFold: 'ytd-watch-flexy ytd-watch-metadata #above-the-fold',
    description: ':scope > #bottom-row'
  };
  var LOG = '[YTSummary]';

  var transcripts = {};   // videoId -> message from youtube-subtitles
  var states = {};        // videoId -> {status: 'loading'|'done'|'error', phase, text, error}
  var waiting = null;     // resolves when a transcript for this video arrives
  var button = null;
  var panel = null;
  var open = false;       // the panel is wanted for the current video
  var openFor = '';       // the video it was opened on
  var shownState = null;  // the state object the panel body was last built from

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
      max_tokens: 8000,
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
            reject(new Error('Model özetlemeyi reddetti.'));
          } else {
            resolve((d.content || []).filter(function (b) { return b.type === 'text'; })
              .map(function (b) { return b.text; }).join('').trim());
          }
        },
        onerror: function () { reject(new Error('Aperture\'a ulaşılamadı. Tailscale açık mı?')); },
        ontimeout: function () { reject(new Error('Aperture zamanında yanıt vermedi.')); }
      });
    });
  }

  function start (id) {
    var state = states[id] = { status: 'loading', phase: 'Altyazılar alınıyor…' };
    render();
    loadTranscript().then(function (transcript) {
      if (!transcript) throw new Error('Bu videoda altyazı bulunamadı. youtube-subtitles açık mı?');
      state.phase = 'Claude özetliyor…';
      render();
      return summarize(transcript);
    }).then(function (text) {
      states[id] = { status: 'done', text: text };
      log('summarized ' + id);
    }).catch(function (err) {
      states[id] = { status: 'error', error: String(err.message || err) };
      log('failed: ' + err);
    }).then(render);
  }

  /* -- UI ----------------------------------------------------------------- */

  var ICONS = {
    sparkle: ['M10 2.5l1.95 5.55L17.5 10l-5.55 1.95L10 17.5l-1.95-5.55L2.5 10l5.55-1.95z',
      'M18.5 14.5l.85 2.15 2.15.85-2.15.85-.85 2.15-.85-2.15-2.15-.85 2.15-.85z'],
    copy: ['M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'],
    check: ['M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'],
    refresh: ['M17.65 6.35A7.96 7.96 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.78-4.22L13 11h7V4l-2.35 2.35z'],
    close: ['M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z']
  };

  function icon (name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'yts-icon yts-icon-' + name);
    ICONS[name].forEach(function (d) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function el (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function injectStyle () {
    var style = document.createElement('style');
    style.textContent = [
      /* YouTube's own theme tokens, so both themes follow its setting; the
       * fallbacks are its light values. */
      ':root{--yts-text:var(--yt-sys-color-baseline--text-primary,#0f0f0f);',
      '--yts-text2:var(--yt-sys-color-baseline--text-secondary,#606060);',
      '--yts-chip:var(--yt-sys-color-baseline--additive-background,rgba(0,0,0,.05));',
      '--yts-chip-hover:var(--yt-sys-color-baseline--mono-tonal-hover,rgba(0,0,0,.1));',
      '--yts-link:var(--yt-sys-color-baseline--call-to-action,#065fd4);',
      '--yts-link-bg:color-mix(in srgb,var(--yts-link) 14%,transparent);',
      '--yts-on-link:var(--yt-sys-color-baseline--text-primary-inverse,#fff);',
      '--yts-err:var(--yt-sys-color-baseline--error-indicator,#c30027);',
      '--yts-accent:linear-gradient(180deg,#ff7a59,#9b7bf7)}',

      '.yts-icon{width:20px;height:20px;fill:currentColor;flex:none}',
      '.yts-icon-sparkle path:first-child{fill:#ff8a5c}.yts-icon-sparkle path:last-child{fill:#9b7bf7}',

      /* the button, matched to YouTube's tonal action buttons */
      '#yts-sum-btn{display:inline-flex;align-items:center;gap:6px;height:40px;margin-left:8px;padding:0 16px 0 12px;',
      'border:0;border-radius:20px;background:var(--yts-chip);color:var(--yts-text);font:500 14px/40px Roboto,Arial,sans-serif;',
      'white-space:nowrap;cursor:pointer;transition:background .15s}',
      '#yts-sum-btn:hover,#yts-sum-btn[aria-expanded=true]{background:var(--yts-chip-hover)}',
      /* YouTube spaces its buttons with "previous sibling is a button +" rules,
       * so the one after ours loses its gap unless it is given back here. */
      '#yts-sum-btn+*{margin-left:8px}',
      '#yts-sum-btn.yts-busy .yts-icon{animation:yts-pulse .8s ease-in-out infinite alternate}',
      '@keyframes yts-pulse{to{opacity:.3;transform:scale(.8)}}',

      /* the panel, matched to the description box below it */
      '#yts-sum-panel{margin-top:12px;padding:12px 16px 16px;border-radius:12px;background:var(--yts-chip);',
      'color:var(--yts-text);font:400 14px/20px Roboto,Arial,sans-serif;animation:yts-in .2s ease-out}',
      '#yts-sum-panel[hidden]{display:none}',
      '@keyframes yts-in{from{opacity:0;transform:translateY(-4px)}}',
      '.yts-head{display:flex;align-items:center;gap:8px;min-height:32px}',
      '.yts-title{font:600 16px/22px "YouTube Sans",Roboto,Arial,sans-serif}',
      '.yts-meta{color:var(--yts-text2);font-size:12px}',
      '.yts-tools{margin-left:auto;display:flex;gap:2px}',
      '.yts-tool{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:50%;background:none;',
      'color:var(--yts-text2);cursor:pointer}',
      '.yts-tool:hover{background:var(--yts-chip-hover);color:var(--yts-text)}',
      '.yts-tool .yts-icon{width:18px;height:18px}',

      '.yts-body{margin-top:4px}',
      '.yts-body>p:first-child{font-size:15px;line-height:22px;margin:4px 0 0}',
      '.yts-body p{margin:8px 0}',
      '.yts-body h2{margin:20px 0 8px;font:500 12px/16px Roboto,Arial,sans-serif;letter-spacing:.06em;',
      'text-transform:uppercase;color:var(--yts-text2)}',
      '.yts-body h3,.yts-body h4{margin:0;font:600 15px/22px Roboto,Arial,sans-serif}',
      '.yts-body ul,.yts-body ol{margin:4px 0;padding-left:20px}',
      '.yts-body li{margin:5px 0;padding-left:2px}',
      '.yts-body li::marker{color:var(--yts-text2)}',
      '.yts-body li li{margin:3px 0;color:var(--yts-text2)}',
      '.yts-body strong{font-weight:600}',
      '.yts-body code{font:13px ui-monospace,Menlo,monospace;background:var(--yts-chip);padding:1px 4px;border-radius:4px}',

      '.yts-time{display:inline-block;padding:0 6px;border-radius:4px;background:var(--yts-link-bg);color:var(--yts-link);',
      'font:500 12px/20px Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums;cursor:pointer;vertical-align:1px}',
      '.yts-time:hover{text-decoration:underline}',
      'h3 .yts-time,h4 .yts-time{margin-right:8px;font-size:13px;line-height:22px;vertical-align:0}',

      /* one block per section; the playing one is marked */
      '.yts-chapter{position:relative;margin:2px -10px;padding:8px 10px 6px;border-radius:8px;transition:background .2s}',
      '.yts-chapter::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:2px;',
      'background:var(--yts-accent);opacity:0;transition:opacity .2s}',
      '.yts-chapter.yts-now{background:var(--yts-chip)}',
      '.yts-chapter.yts-now::before{opacity:1}',
      '.yts-chapter.yts-now .yts-time{background:var(--yts-link);color:var(--yts-on-link)}',
      '.yts-chapter>ul{margin-top:2px}',

      /* loading and error */
      '.yts-phase{margin:6px 0 12px;color:var(--yts-text2)}',
      '.yts-skel{height:12px;margin:10px 0;border-radius:6px;background:linear-gradient(90deg,var(--yts-chip) 0,',
      'var(--yts-chip-hover) 40%,var(--yts-chip) 80%) 0 0/300% 100%;animation:yts-shimmer 1.4s ease-in-out infinite}',
      '@keyframes yts-shimmer{from{background-position:100% 0}to{background-position:-100% 0}}',
      '.yts-error{margin:6px 0 10px;color:var(--yts-err)}',
      '.yts-retry{height:32px;padding:0 14px;border:0;border-radius:16px;background:var(--yts-chip-hover);',
      'color:var(--yts-text);font:500 14px Roboto,Arial,sans-serif;cursor:pointer}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function seek (seconds) {
    var video = document.querySelector(SELECTORS.video);
    if (!video) return;
    video.currentTime = seconds;
    if (video.paused) video.play();
    var player = document.querySelector(SELECTORS.player);
    if (player && player.getBoundingClientRect().bottom < 80) window.scrollTo({ top: 0, behavior: 'smooth' });
    markNow();
  }

  function renderInline (parent, tokens) {
    tokens.forEach(function (t) {
      if (t.type === 'text') parent.appendChild(document.createTextNode(t.text));
      else if (t.type === 'code') parent.appendChild(el('code', '', t.text));
      else if (t.type === 'time') {
        var a = el('a', 'yts-time', t.text);
        a.setAttribute('role', 'button');
        a.title = t.text + ' anına git';
        a.addEventListener('click', function (e) { e.preventDefault(); seek(t.seconds); });
        parent.appendChild(a);
      } else {
        var n = el(t.type === 'strong' ? 'strong' : 'em');
        renderInline(n, t.children);
        parent.appendChild(n);
      }
    });
  }

  function renderList (list) {
    var n = el(list.ordered ? 'ol' : 'ul');
    list.items.forEach(function (item) {
      var li = el('li');
      var stamp = leadingTimestamp(item.text);
      if (stamp) li.dataset.start = stamp.seconds;
      renderInline(li, parseInline(item.text));
      item.children.forEach(function (c) { li.appendChild(renderList(c)); });
      n.appendChild(li);
    });
    return n;
  }

  /* A heading that starts with a timestamp opens a section block that holds
   * everything up to the next heading of the same or a higher level. */
  function renderMarkdown (text) {
    var root = el('div', 'yts-body');
    var into = root;
    var chapterLevel = 0;
    parseMarkdown(text).forEach(function (b) {
      if (b.type === 'heading') {
        if (chapterLevel && b.level <= chapterLevel) { into = root; chapterLevel = 0; }
        var h = el('h' + Math.min(Math.max(b.level, 2), 4));
        renderInline(h, parseInline(b.text));
        var stamp = leadingTimestamp(b.text);
        if (stamp) {
          var chapter = el('div', 'yts-chapter');
          chapter.dataset.start = stamp.seconds;
          root.appendChild(chapter);
          into = chapter;
          chapterLevel = b.level;
        }
        into.appendChild(h);
      } else if (b.type === 'para') {
        var p = el('p');
        renderInline(p, parseInline(b.text));
        into.appendChild(p);
      } else {
        into.appendChild(renderList(b));
      }
    });
    return root;
  }

  /* Mark the section the video is in now: the last one that has started. */
  function markNow () {
    if (!panel || panel.hidden) return;
    var video = document.querySelector(SELECTORS.video);
    if (!video) return;
    var marks = panel.querySelectorAll('[data-start]');
    var now = null;
    for (var i = 0; i < marks.length; i++) {
      if (+marks[i].dataset.start <= video.currentTime + 0.5) now = marks[i];
    }
    for (var j = 0; j < marks.length; j++) marks[j].classList.toggle('yts-now', marks[j] === now);
  }

  function tool (name, label, onClick) {
    var b = el('button', 'yts-tool');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.appendChild(icon(name));
    b.addEventListener('click', onClick);
    return b;
  }

  function buildPanel (state) {
    var head = el('div', 'yts-head');
    head.appendChild(icon('sparkle'));
    head.appendChild(el('span', 'yts-title', 'Özet'));
    head.appendChild(el('span', 'yts-meta', 'Claude Haiku'));
    var tools = el('div', 'yts-tools');
    if (state.status === 'done') {
      var copy = tool('copy', 'Kopyala', function () {
        navigator.clipboard.writeText(state.text).then(function () {
          copy.replaceChildren(icon('check'));
          setTimeout(function () { copy.replaceChildren(icon('copy')); }, 1500);
        });
      });
      tools.appendChild(copy);
      tools.appendChild(tool('refresh', 'Yeniden özetle', function () { start(videoId()); }));
    }
    tools.appendChild(tool('close', 'Kapat', function () { open = false; render(); }));
    head.appendChild(tools);
    panel.replaceChildren(head);

    if (state.status === 'loading') {
      panel.appendChild(el('div', 'yts-phase', state.phase));
      [92, 78, 85, 60].forEach(function (w) {
        var bar = el('div', 'yts-skel');
        bar.style.width = w + '%';
        panel.appendChild(bar);
      });
    } else if (state.status === 'error') {
      panel.appendChild(el('div', 'yts-error', state.error));
      var retry = el('button', 'yts-retry', 'Tekrar dene');
      retry.type = 'button';
      retry.addEventListener('click', function () { start(videoId()); });
      panel.appendChild(retry);
    } else {
      panel.appendChild(renderMarkdown(state.text));
    }
  }

  /* Draw the button and the panel from the current video's state. */
  function render () {
    var state = states[videoId()];
    if (button) {
      var busy = !!state && state.status === 'loading';
      button.classList.toggle('yts-busy', busy);
      button.lastChild.textContent = busy ? 'Özetleniyor…' : 'Özetle';
      button.setAttribute('aria-expanded', String(open && !!state));
    }
    if (!panel) return;
    panel.hidden = !(open && state);
    if (panel.hidden) return;
    if (shownState !== state || state.status === 'loading') buildPanel(state);
    shownState = state;
    markNow();
  }

  function onClick () {
    var id = videoId();
    if (open) { open = false; render(); return; }
    open = true;
    openFor = id;
    if (!states[id] || states[id].status === 'error') start(id);
    else render();
  }

  /* YouTube rebuilds the action row and navigates without reloading, so the
   * button and panel are put back whenever they are missing. */
  function ensure () {
    if (location.pathname !== '/watch' || !videoId()) return;
    var row = document.querySelector(SELECTORS.actionButtons);
    var fold = document.querySelector(SELECTORS.aboveTheFold);
    if (!row || !fold) return;

    if (!button) {
      button = el('button');
      button.id = 'yts-sum-btn';
      button.type = 'button';
      button.title = 'Videoyu Claude ile özetle';
      button.appendChild(icon('sparkle'));
      button.appendChild(el('span', '', 'Özetle'));
      button.addEventListener('click', onClick);
    }
    if (button.parentNode !== row) {
      var like = row.querySelector(SELECTORS.likeDislike);
      row.insertBefore(button, like ? like.nextSibling : row.firstChild);
      render();
    }

    if (!panel) {
      panel = el('div');
      panel.id = 'yts-sum-panel';
      panel.hidden = true;
    }
    if (panel.parentNode !== fold) {
      fold.insertBefore(panel, fold.querySelector(SELECTORS.description));
      render();
    }

    var video = document.querySelector(SELECTORS.video);
    if (video && !video.__ytsWatched) {
      video.__ytsWatched = true;
      video.addEventListener('timeupdate', markNow);
    }
  }

  var queued = false;
  function queueEnsure () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; ensure(); });
  }

  injectStyle();
  /* Only a new video closes the panel, not every yt-navigate-finish. */
  document.addEventListener('yt-navigate-finish', function () {
    if (videoId() !== openFor) open = false;
    ensure();
    render();
  });
  new MutationObserver(queueEnsure).observe(document.documentElement, { childList: true, subtree: true });
  log('ready');
})();
