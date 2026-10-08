/* Tests for the pure helpers in youtube-summary.user.js.   Run: node youtube-summary.test.js */

var api = require('./youtube-summary.user.js');

var failures = 0;
function check (name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
}

console.log('clock');
check('under a minute', api.clock(7400) === '0:07', api.clock(7400));
check('minutes', api.clock(754000) === '12:34', api.clock(754000));
check('hours pad the minutes', api.clock(3723000) === '1:02:03', api.clock(3723000));

console.log('\ncaptionText');
var text = api.captionText([
  [0, 'hello'], [4000, 'and welcome'], [29999, 'still the first block'],
  [30000, 'second block'], [95000, 'after a long gap']
]);
var lines = text.split('\n');
check('one line per 30 s block', lines.length === 3, JSON.stringify(lines));
check('block text is joined in order', lines[0] === '[0:00] hello and welcome still the first block', lines[0]);
check('a gap starts a block at its own time', lines[2] === '[1:35] after a long gap', lines[2]);
check('no cues, no text', api.captionText([]) === '');

console.log('\nleadingTimestamp');
var t = api.leadingTimestamp('[12:30] Kurulum adımları');
check('m:ss', t && t.seconds === 750 && t.rest === ' Kurulum adımları', JSON.stringify(t));
t = api.leadingTimestamp('[1:02:03] Son');
check('h:mm:ss', t && t.seconds === 3723, JSON.stringify(t));
check('not at line start', api.leadingTimestamp('Bkz. [12:30]') === null);
check('plain text', api.leadingTimestamp('Bölümler') === null);

console.log('\n' + (failures ? failures + ' FAILING' : 'all tests passed') + '\n');
process.exit(failures ? 1 : 0);
