'use strict';
const test = require('node:test'), assert = require('node:assert');
const R = require('../backend/yc/review');
const essay = 'Nowadays, many people argue that university education must be free. Many students can not study because tuition fees are very expensive, and their parents has not enough money. If the government pay for education, this students would improve their life. ' + 'word '.repeat(30);
const raw = JSON.stringify({
  band: 6.2, criteria: { TR: 6, CC: 6, LR: 5.5, GRA: 5.5 }, pull_down: [{ title: 'Грамматика', text: 'a' }, { title: 'Позиция', text: 'b' }, { title: 'x', text: 'c' }],
  errors: [
    { para: 1, wrong: 'can not', right: 'cannot', type: 'SP', rule: 'слитно' },
    { para: 2, wrong: 'parents has', right: 'parents have', type: 'GRA', rule: 'согласование' },
    { para: 2, wrong: 'this students', right: 'these students', type: 'GRA', rule: 'мн. число' },
    { para: 1, wrong: 'выдуманная цитата', right: 'x', type: 'GRA', rule: 'нет в тексте' },
    { para: 1, wrong: 'same', right: 'same', type: 'GRA', rule: 'ничего не меняет' },
  ],
  weakest_para: 2, weakest_fixed: 'fixed', paras: [{ title: 'Абзац 1', note: 'n' }], band7_text: ['p1', 'p2'], band8_para: 'b8', vocab: [['a', 'b']], plan: [{ title: 't', gain: 'g', time: '5 минут' }],
});
test('check: длина текста', () => {
  assert.ok(R.check('t2', 'too short'));
  assert.equal(R.check('t2', essay), '');
  assert.ok(R.check('t2', 'word '.repeat(700)));
});
test('shape: band шагом 0.5, цитаты проверяются по тексту, типы ошибок считаются', () => {
  const f = R.shape(raw, essay);
  assert.equal(f.band, 6); assert.equal(f.errors.length, 3);
  assert.deepEqual(f.error_types.map((x) => x.count), [2, 1]);
});
test('shape: JSON в обёртке и мусор не ломают разбор', () => {
  assert.equal(R.shape('```json\n' + raw + '\n```', essay).errors.length, 3);
  assert.throws(() => R.shape('не json', essay));
});
test('shape: HTML остаётся строкой, нечисловые значения заменяются', () => {
  const f = R.shape(JSON.stringify({ band: 'abc', criteria: { TR: 'x' }, errors: [] }), essay);
  assert.equal(typeof f.band, 'number'); assert.equal(f.errors.length, 0);
});
test('trim: бесплатная версия не содержит платных частей', () => {
  const t = R.trim(R.shape(raw, essay)), s = JSON.stringify(t);
  assert.equal(t.tier, 'free'); assert.equal(t.errors.length, 2); assert.equal(t.total_errors, 3);
  assert.ok(!s.includes('p1') && !s.includes('b8') && !s.includes('can not'));
  assert.equal(t.pull_down.length, 2);
});
test('messages: эссе внутри тегов, ключей и почты нет', () => {
  const m = R.messages('t2', 'Q?', essay, 7.5);
  assert.ok(m[1].content.includes('<essay>') && m[1].content.includes('Band 7.5'));
});
