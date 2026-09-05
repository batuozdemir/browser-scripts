#!/usr/bin/env bash
#
# Build h5player-lite from upstream xxxily/h5player.
#
# Fetches upstream into a gitignored upstream/, applies the patch set, and writes
# h5player-lite.user.js. Every edit is anchored on a string verified to appear
# exactly once in upstream; a missing anchor or a duplicate aborts the build.
# That is the update-detection mechanism: when upstream changes shape, this fails
# loudly instead of producing a silently wrong file.
#
# Usage:  ./build.sh [--refetch]

set -euo pipefail
cd "$(dirname "$0")"

# --- Step 2: delete the ~40% UI block. Off until that session happens. --------
# Flip to 1 to enable. Requires nothing else; the edits are already written.
STRIP_UI=0
# ------------------------------------------------------------------------------

UPSTREAM_VERSION="4.3.5"      # expected upstream @version; build aborts on mismatch
PATCH="2"                     # our patch counter; bump on every rebuild, reset to 1 on rebase
UPSTREAM_URL="https://greasyfork.org/scripts/381682/code/script.user.js"
RAW_URL="https://raw.githubusercontent.com/batuozdemir/browser-scripts/main/h5player/h5player-lite.user.js"

SRC="upstream/h5player.user.js"
OUT="h5player-lite.user.js"

if [[ "${1:-}" == "--refetch" ]]; then rm -f "$SRC"; fi

if [[ ! -f "$SRC" ]]; then
  echo "==> fetching upstream"
  mkdir -p upstream
  curl -fsSL -o "$SRC" "$UPSTREAM_URL"
else
  echo "==> using cached $SRC (pass --refetch to re-download)"
fi

STRIP_UI="$STRIP_UI" UPSTREAM_VERSION="$UPSTREAM_VERSION" PATCH="$PATCH" \
RAW_URL="$RAW_URL" SRC="$SRC" OUT="$OUT" python3 - <<'PY'
import io, os, re, sys

SRC   = os.environ['SRC']
OUT   = os.environ['OUT']
UPV   = os.environ['UPSTREAM_VERSION']
PATCH = os.environ['PATCH']
RAW   = os.environ['RAW_URL']
STRIP = os.environ['STRIP_UI'] == '1'

def die(msg):
    sys.exit('BUILD FAILED: ' + msg)

src = io.open(SRC, encoding='utf-8').read()

# --- anchored replacement helper ---------------------------------------------
def cut(text, anchor, what):
    """Delete `anchor` (which must appear exactly once) from text."""
    n = text.count(anchor)
    if n != 1:
        die('anchor for %s matched %d times, expected exactly 1.\n'
            '  Upstream has changed shape. Re-derive this edit before rebuilding.\n'
            '  anchor: %r' % (what, n, anchor[:120]))
    return text.replace(anchor, '')

def cut_span(text, start, end, what):
    """Delete start..end inclusive; both markers must appear exactly once."""
    for m in (start, end):
        if text.count(m) != 1:
            die('span marker for %s matched %d times, expected exactly 1.\n'
                '  marker: %r' % (what, text.count(m), m[:120]))
    i = text.index(start)
    j = text.index(end, i)
    if j < i:
        die('span for %s: end marker precedes start marker' % what)
    return text[:i] + text[j + len(end):]

# --- version gate ------------------------------------------------------------
m = re.search(r'^// @version\s+(\S+)\s*$', src, re.M)
if not m:
    die('no @version line found in upstream')
if m.group(1) != UPV:
    die('upstream @version is %s, expected %s.\n'
        '  Upstream has been updated. Re-verify every anchor and the config paths\n'
        '  against the new source, then set UPSTREAM_VERSION=%s and PATCH=1.'
        % (m.group(1), UPV, m.group(1)))
print('==> upstream @version %s confirmed' % UPV)

# --- Edit 1: metadata --------------------------------------------------------
# @author ankvps and the upstream @namespace are deliberately kept: this is a
# modified version of a GPL work and the original attribution stays.
mstart = '// ==UserScript==\n'
mend   = '// ==/UserScript==\n'
if src.count(mstart) != 1 or src.count(mend) != 1:
    die('metadata block delimiters are not unique')
i = src.index(mstart)
j = src.index(mend, i) + len(mend)
meta, body = src[i:j], src[j:]
head = src[:i]

lines, seen = [], {}
for ln in meta.split('\n'):
    key = None
    km = re.match(r'^// @(\S+)', ln)
    if km:
        key = km.group(1)
    if key and (key.startswith('name:') or key.startswith('description:')):
        continue                    # drop localized @name / @description variants
    if key == 'icon':
        continue                    # drop the ~9 KB base64 data-URI icon
    if key == 'description':
        ln = '// @description  Video speed control. Pruned build of xxxily/h5player.'
    elif key == 'name':
        ln = '// @name         h5player-lite'
    elif key == 'version':
        ln = '// @version      %s.%s' % (UPV, PATCH)
    elif key == 'downloadURL':
        ln = '// @downloadURL %s' % RAW
    elif key == 'updateURL':
        ln = '// @updateURL   %s' % RAW
    elif key == 'license':
        ln = '// @license      GPL-3.0-or-later'
    if key:
        seen[key] = seen.get(key, 0) + 1
    lines.append(ln)

for k in ('name', 'version', 'downloadURL', 'updateURL', 'license', 'author', 'namespace'):
    if seen.get(k, 0) != 1:
        die('metadata key @%s appeared %d times, expected exactly 1' % (k, seen.get(k, 0)))

src = head + '\n'.join(lines) + body
if '@icon' in src[:src.index(mend)]:
    die('@icon survived the metadata pass')
print('==> edit 1: metadata rewritten (@version %s.%s, @icon dropped)' % (UPV, PATCH))

# --- Edit 2: config override -------------------------------------------------
# Inserted immediately before initUiConfigManager, which follows the close of the
# `new ConfigManager({...})` literal and shares its scope, so `configManager` is
# in scope and nothing has read the config yet.
ANCHOR_CONF = 'async function initUiConfigManager'
if src.count(ANCHOR_CONF) != 1:
    die('config anchor matched %d times, expected exactly 1' % src.count(ANCHOR_CONF))
override = io.open('config.js', encoding='utf-8').read().rstrip('\n')
src = src.replace(ANCHOR_CONF, override + '\n\n' + ANCHOR_CONF)
print('==> edit 2: config override injected')

# --- Edits 3 and 4: STEP 2, gated on STRIP_UI --------------------------------
if STRIP:
    src = cut_span(src,
                   'const h5playerUI = function (window)',
                   '})();return h5playerUI};',
                   'edit 3 (h5playerUI body)')
    print('==> edit 3: h5playerUI deleted')

    UI_INIT = """  /* 注意：只有明确为fasle才隐藏GUI */
  if (configManager.get('ui.enable') !== false) {
    if (window.customElements && document.adoptedStyleSheets) {
      h5Player.UI = h5playerUI(windowSandbox);
      setTimeout(async () => {
        h5Player.UI.init();
      }, 400);
    } else {
      /* webkit内核建议73以上的浏览器才允许使用UI组件，否则兼容或性能都是很大的问题 */
      debug.warn('当前浏览器不支持customElements或adoptedStyleSheets，无法使用UI组件，建议使用Chrome 83+，Edge 83+');
    }
  } else {
    debug.warn('UI组件已被禁用', configManager.get('ui.enable'));
  }
"""
    src = cut(src, UI_INIT, 'edit 4 (UI init block)')
    print('==> edit 4: UI init block removed')
else:
    print('==> edits 3 and 4 skipped (STRIP_UI=0, step 2 not yet applied)')

# --- Edit 5: drop the Chinese i18n tables ------------------------------------
# I18n.t() looks up _languages[_locale], then falls back to _languages['en']
# (defaultLanguage) via `|| {}`, so removing the zh tables and their `messages`
# entries degrades cleanly to English even on a zh-locale browser. enUS and ru
# are left alone. Nothing else references zhCN/zhTW.
def cut_object(text, decl, what):
    """Delete a top-level `var X = {` ... `\n};\n` declaration."""
    if text.count(decl) != 1:
        die('%s: declaration %r matched %d times, expected 1'
            % (what, decl, text.count(decl)))
    i = text.index(decl)
    end = text.index('\n};\n', i) + len('\n};\n')
    return text[:i] + text[end:]

src = cut_object(src, 'var zhCN = {', 'edit 5 (zhCN table)')
src = cut_object(src, 'var zhTW = {', 'edit 5 (zhTW table)')
src = cut(src, "  'zh-CN': zhCN,\n  zh: zhCN,\n  'zh-HK': zhTW,\n  'zh-TW': zhTW,\n",
          'edit 5 (messages entries)')
for dead in ('zhCN', 'zhTW'):
    # comments may still mention them; edit 6 drops those. Only live code matters.
    live = [l for l in src.split('\n')
            if re.search(r'\b%s\b' % dead, l)
            and not re.match(r'^\s*(//|\*|/\*)', l)]
    if live:
        die('edit 5: %s is still referenced in live code: %r' % (dead, live[:3]))
print('==> edit 5: zhCN/zhTW i18n tables removed')

# --- Edit 6: strip the remaining CJK -----------------------------------------
# Verified against 4.3.5: CJK never appears in executable code (no CJK
# identifiers, object keys or operators), so removing the characters cannot
# change program structure. The one exception is CJK inside an attribute-selector
# value, e.g. 'button[aria-label="全屏"]' in the per-site table, which IS
# functional. Those are protected; everything else is prose.
CJK = r'[　-〿㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]'

lines = src.split('\n')

# 6a. drop comment-only lines carrying CJK. Verified safe on 4.3.5: no line both
#     opens a block comment and carries code after it closes, and the only
#     multi-line-template lines that start with // or * contain no CJK.
kept = [l for l in lines
        if not (re.match(r'^\s*(//|\*|/\*)', l) and re.search(CJK, l))]
dropped = len(lines) - len(kept)

# 6b. protect functional CJK (attribute-selector values) behind sentinels
protected, out = [], []
def stash(m):
    protected.append(m.group(0))
    return '\x00P%d\x00' % (len(protected) - 1)
body_text = re.sub(r'=\s*"[^"\n]*%s[^"\n]*"' % CJK, stash, '\n'.join(kept))

# 6c. strip CJK, touching ONLY lines that actually contain it, and tidy the
#     husks that leaves. Lines without CJK are passed through byte-for-byte.
out = []
for l in body_text.split('\n'):
    if not re.search(CJK, l):
        out.append(l)
        continue
    l = re.sub(CJK, '', l)
    if re.match(r'^\s*(//|\*)\s*$', l):
        continue                       # comment line emptied by the strip
    out.append(re.sub(r'\s*//\s*$', '', l))   # trailing comment left empty
result = '\n'.join(out)

# 6d. restore the protected selectors
for i, orig in enumerate(protected):
    result = result.replace('\x00P%d\x00' % i, orig)

leftover = re.findall(CJK, result)
if len(leftover) != sum(len(re.findall(CJK, p)) for p in protected):
    die('edit 6: unexpected CJK remains after the strip')
src = result
print('==> edit 6: CJK stripped (%d comment lines dropped, %d functional '
      'selectors preserved)' % (dropped, len(protected)))

io.open(OUT, 'w', encoding='utf-8').write(src)
print('==> wrote %s (%d bytes)' % (OUT, len(src.encode('utf-8'))))
PY

if command -v node >/dev/null 2>&1; then
  node --check "$OUT" && echo "==> syntax OK"
else
  echo "==> node not found, skipping syntax check"
fi
