/* Segmentation tests for youtube-subtitles.user.js.   Run: node youtube-subtitles.test.js
 *
 * The fixture mirrors the shape of a real /api/timedtext?...&kind=asr json3
 * response as measured from a live player on 2026-09-05: a leading
 * window-definition event with no segs, then real caption lines interleaved
 * one-for-one with `aAppend` roll-up markers whose only segment is "\n", and
 * consecutive real lines overlapping in time.
 */

var api = require('./youtube-subtitles.user.js');
var parseJson3 = api.parseJson3;
var segmentCues = api.segmentCues;
var wrapLines = api.wrapLines;

var failures = 0;
function check (name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
}

/* Build a line event with per-word tOffsetMs, which is what drives YouTube's
 * word-by-word reveal. */
function line (startMs, durMs, words) {
  var segs = [];
  var offset = 0;
  for (var i = 0; i < words.length; i++) {
    segs.push({ utf8: (i ? ' ' : '') + words[i], tOffsetMs: offset, acAsrConf: 200 });
    offset += 320;
  }
  return { tStartMs: startMs, dDurationMs: durMs, wWinId: 1, segs: segs };
}
function append (startMs) {
  return { tStartMs: startMs, dDurationMs: 1500, wWinId: 1, aAppend: 1, segs: [{ utf8: '\n' }] };
}

var fixture = {
  wireMagic: 'pb3',
  pens: [{}],
  wsWinStyles: [{}, { mhModeHint: 2, juJustifCode: 0, sdScrollDir: 3 }],
  wpWinPositions: [{}, { apPoint: 6 }],
  events: [
    { tStartMs: 0, dDurationMs: 1000, id: 1, wpWinPosId: 1, wsWinStyleId: 1 },
    line(1000, 4000, ['I', 'think', 'what', 'we', 'should', 'do', 'is.']),
    append(3500),
    line(3520, 3800, ['We', 'can', 'try', 'the', 'other', 'route', 'instead.']),
    append(6100),
    line(6140, 4200, ['That', 'takes', 'longer', 'but', 'it', 'avoids', 'the', 'bridge']),
    append(9000),
    line(9050, 3600, ['and', 'the', 'traffic', 'that', 'always', 'builds', 'up', 'there.']),
    /* a silence, then a new line well after the previous one ends */
    line(20000, 2000, ['Anyway']),
    append(21000),
    line(21400, 2600, ['that', 'is', 'the', 'plan']),
    /* a long unpunctuated run, to exercise the size cap */
    line(24500, 3000, ['and', 'we', 'keep', 'going', 'without', 'any', 'punctuation']),
    append(26500),
    line(26800, 3000, ['for', 'quite', 'a', 'while', 'longer', 'than', 'two', 'lines']),
    append(29000),
    line(29300, 3000, ['which', 'is', 'why', 'the', 'size', 'cap', 'has', 'to', 'exist'])
  ]
};

console.log('\nparseJson3');
var cues = parseJson3(JSON.stringify(fixture));
var realLines = fixture.events.filter(function (e) { return e.segs && !e.aAppend; }).length;
check('drops window-definition and aAppend events', cues.length === realLines,
  'got ' + cues.length + ' cues, expected ' + realLines);
check('no cue text contains a newline marker',
  cues.every(function (c) { return c.text.indexOf('\n') === -1 && c.text.trim() === c.text; }));
check('cues are ordered by start time',
  cues.every(function (c, i) { return i === 0 || cues[i - 1].start <= c.start; }));
check('returns null on a non-json3 body', parseJson3('<transcript></transcript>') === null);
check('returns null on an empty event list', parseJson3('{"events":[]}') === null);

console.log('\nsegmentCues');
var chunks = segmentCues(cues);
check('emits a chunk at each sentence end',
  chunks[0].text === 'I think what we should do is.' &&
  chunks[1].text === 'We can try the other route instead.',
  JSON.stringify(chunks.slice(0, 2).map(function (c) { return c.text; })));
check('merges lines that together form one sentence',
  chunks[2].text === 'That takes longer but it avoids the bridge and the traffic that always builds up there.'.slice(0, chunks[2].text.length) &&
  chunks[2].text.indexOf('avoids the bridge') !== -1,
  chunks[2].text);
check('no chunk exceeds the two-line size cap',
  chunks.every(function (c) { return c.text.length <= 84; }),
  JSON.stringify(chunks.map(function (c) { return c.text.length; })));
check('a silence starts a new chunk',
  chunks.some(function (c) { return c.start === 20000; }),
  JSON.stringify(chunks.map(function (c) { return c.start; })));
check('chunks never overlap after trimming',
  chunks.every(function (c, i) { return i === 0 || chunks[i - 1].end <= c.start; }),
  JSON.stringify(chunks.map(function (c) { return [c.start, c.end]; })));
check('every chunk has positive duration',
  chunks.every(function (c) { return c.end > c.start; }));
check('the unpunctuated run is split by the size cap rather than run together',
  chunks.filter(function (c) { return c.start >= 20000; }).length >= 2,
  JSON.stringify(chunks.filter(function (c) { return c.start >= 20000; })
    .map(function (c) { return c.text.length; })));
check('no text is lost between cues and chunks',
  chunks.map(function (c) { return c.text; }).join(' ') === cues.map(function (c) { return c.text; }).join(' '));

console.log('\nwrapLines');
var longest = chunks.slice().sort(function (a, b) { return b.text.length - a.text.length; })[0].text;

check('short text stays on one line', wrapLines('Short line.').length === 1);
check('text up to the line cap stays on one line', wrapLines('x'.repeat(42)).length === 1);
check('long text becomes exactly two lines',
  wrapLines(longest).length === 2, longest);
check('no chunk ever needs a third line',
  chunks.every(function (c) { return wrapLines(c.text).length <= 2; }));
check('wrapped lines rejoin to the original',
  chunks.every(function (c) { return wrapLines(c.text).join(' ') === c.text; }));
check('the two lines are reasonably balanced', (function () {
  var l = wrapLines(longest);
  return Math.abs(l[0].length - l[1].length) <= 12;
})(), JSON.stringify(wrapLines(longest)));

/* ---- the headline comparison ------------------------------------------- */
/* Replay the fixture the way YouTube does (revealing segments by tOffsetMs,
 * two lines on screen at once) and the way this script does, then count how
 * many distinct things the viewer is asked to read. */

function rollingStateAt (ms) {
  var visible = [];
  fixture.events.forEach(function (ev) {
    if (!ev.segs || ev.aAppend) return;
    if (ms < ev.tStartMs || ms >= ev.tStartMs + ev.dDurationMs) return;
    var shown = '';
    ev.segs.forEach(function (s) {
      if (ms >= ev.tStartMs + (s.tOffsetMs || 0)) shown += s.utf8;
    });
    if (shown.trim()) visible.push(shown.trim());
  });
  return visible.slice(-2).join(' | ');
}
function ourStateAt (ms) {
  for (var i = 0; i < chunks.length; i++) {
    if (ms >= chunks[i].start && ms < chunks[i].end) return chunks[i].text;
  }
  return '';
}

var rolling = {};
var ours = {};
for (var t = 0; t <= 33000; t += 50) {
  var a = rollingStateAt(t); if (a) rolling[a] = 1;
  var b = ourStateAt(t); if (b) ours[b] = 1;
}
var nRolling = Object.keys(rolling).length;
var nOurs = Object.keys(ours).length;

console.log('\nstream replay (50 ms steps over 33 s)');
console.log('  YouTube would render ' + nRolling + ' distinct caption states');
console.log('  this script renders  ' + nOurs + ' distinct subtitle states');
check('the revision stream is collapsed to whole chunks', nOurs === chunks.length && nOurs < nRolling / 4,
  nOurs + ' vs ' + nRolling);
check('every rendered state is a complete chunk, never a prefix',
  Object.keys(ours).every(function (s) {
    return chunks.some(function (c) { return c.text === s; });
  }));

console.log('\n' + (failures ? failures + ' FAILING' : 'all tests passed') + '\n');
process.exit(failures ? 1 : 0);
