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

console.log('\nparseMarkdown');
var blocks = api.parseMarkdown([
  'Video bir şeyi anlatıyor',
  've ikinci satır.',
  '',
  '## Öne çıkanlar',
  '- Birinci **madde**',
  '- İkinci madde',
  '',
  '### [1:30] Kurulum',
  '- Adımlar:',
  '  - indir',
  '  - kur',
  '- Son madde',
  '1. sıralı'
].join('\n'));
check('paragraph lines join', blocks[0].type === 'para' && blocks[0].text === 'Video bir şeyi anlatıyor ve ikinci satır.', JSON.stringify(blocks[0]));
check('h2', blocks[1].type === 'heading' && blocks[1].level === 2 && blocks[1].text === 'Öne çıkanlar', JSON.stringify(blocks[1]));
check('list of two', blocks[2].type === 'list' && blocks[2].items.length === 2, JSON.stringify(blocks[2]));
check('h3 keeps its timestamp', blocks[3].level === 3 && blocks[3].text === '[1:30] Kurulum', JSON.stringify(blocks[3]));
var nested = blocks[4];
check('indented bullets nest under the previous item',
  nested.items.length === 3 && nested.items[0].children[0].items.length === 2 &&
  nested.items[0].children[0].items[1].text === 'kur', JSON.stringify(nested));
check('a numbered line joins the same list', nested.items[2].text === 'sıralı', JSON.stringify(nested.items));
check('blank and heading-only input', api.parseMarkdown('\n\n').length === 0);

console.log('\nparseInline');
var toks = api.parseInline('Bkz. **kalın [2:05] yazı** ve *eğik*, `kod`, [link](https://x) [1:02:03]');
var types = toks.map(function (x) { return x.type; }).join(',');
check('token order', types === 'text,strong,text,em,text,code,text,text,text,time', types);
check('nested time inside bold', toks[1].children[1].type === 'time' && toks[1].children[1].seconds === 125, JSON.stringify(toks[1]));
check('link keeps only its label', toks[7].text === 'link', JSON.stringify(toks[7]));
check('h:mm:ss time', toks[9].seconds === 3723, JSON.stringify(toks[9]));
check('lone asterisks stay text', api.parseInline('2 * 3 = 6').map(function (x) { return x.text; }).join('') === '2 * 3 = 6');

console.log('\n' + (failures ? failures + ' FAILING' : 'all tests passed') + '\n');
process.exit(failures ? 1 : 0);
