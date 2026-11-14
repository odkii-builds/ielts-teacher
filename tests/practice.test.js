const test = require('node:test');
const assert = require('node:assert');
const P = require('../app/js/practice.js');
const W = [{ t: 'tackle', ru: 'решать' }, { t: 'reliable', ru: 'надёжный' }, { t: 'contribute to', ru: 'вносить вклад' }, { t: 'awareness', ru: 'осведомлённость' }];
const ok = { v: 1, items: [
  { type: 'context', word: 'tackle', sentences: ['We must tackle climate change.', 'Tackling crime is hard.'] },
  { type: 'gap', text: 'A __1__ system could __2__ change.', answers: ['reliable', 'contribute to'], words: ['reliable', 'contribute to'] },
  { type: 'match_def', pairs: [['tackle', 'to deal with a problem'], ['reliable', 'can be trusted']] },
  { type: 'order', blocks: ['Better education', 'can', 'contribute to', 'raising', 'awareness'] },
  { type: 'choose', text: 'It raised public __1__.', options: ['awareness', 'reliable'], answers: ['awareness'] },
  { type: 'write', words: ['reliable', 'tackle'], min: 2 },
] };
test('prompt: слова и схема внутри', () => { const p = P.buildPrompt(W); assert.match(p, /tackle — решать/); assert.match(p, /"v":1/); assert.match(p, /ТОЛЬКО один JSON/); });
test('parse: корректный JSON проходит', () => { const r = P.parseImport(JSON.stringify(ok), W); assert.ok(r.ok); assert.equal(r.items.length, 6); assert.equal(r.skipped, 0); });
test('parse: markdown-обёртка и текст вокруг вычищаются', () => { const r = P.parseImport('Вот тест:\n```json\n' + JSON.stringify(ok) + '\n```\nУдачи!', W); assert.ok(r.ok); });
test('parse: чужое слово отбрасывается и считается', () => { const j = JSON.parse(JSON.stringify(ok)); j.items.push({ type: 'context', word: 'banana', sentences: ['A banana.'] }); const r = P.parseImport(JSON.stringify(j), W); assert.equal(r.items.length, 6); assert.equal(r.skipped, 1); });
test('parse: число пропусков должно совпасть с ответами', () => { const j = { v: 1, items: [{ type: 'gap', text: 'A __1__ and __2__.', answers: ['reliable'], words: ['reliable'] }] }; assert.equal(P.parseImport(JSON.stringify(j), W).ok, false); });
test('parse: битый JSON и неверная версия дают читаемую ошибку', () => { assert.match(P.parseImport('{oops', W).error, /JSON/); assert.match(P.parseImport('{"v":2,"items":[]}', W).error, /формату/); assert.equal(P.parseImport('привет', W).ok, false); });
test('parse: HTML остаётся обычным текстом', () => { const j = { v: 1, items: [{ type: 'context', word: 'tackle', sentences: ['<img src=x onerror=alert(1)> tackle it'] }] }; const r = P.parseImport(JSON.stringify(j), W); assert.equal(r.items[0].sentences[0], '<img src=x onerror=alert(1)> tackle it'); });
test('parse: order нужно 4–8 блоков, пары match уникальны', () => { const j = { v: 1, items: [{ type: 'order', blocks: ['tackle', 'it'] }, { type: 'match_def', pairs: [['tackle', 'a'], ['reliable', 'a']] }] }; assert.equal(P.parseImport(JSON.stringify(j), W).ok, false); });
test('parse: больше 40 заданий обрезается', () => { const it = ok.items[0]; const r = P.parseImport(JSON.stringify({ v: 1, items: Array(50).fill(it) }), W); assert.equal(r.items.length, 40); assert.equal(r.skipped, 10); });
