const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('../app/js/engine.js');
const L = JSON.parse(fs.readFileSync(path.join(__dirname, '../app/data/listening.json'), 'utf8'));

test('листенинг: 4 части по 10 вопросов, нумерация 1..40 без дыр', () => {
  for (const t of L.tests) {
    assert.strictEqual(t.parts.length, 4);
    const ns = [];
    t.parts.forEach((p) => { assert.ok(p.script.length > 5, 'есть скрипт'); p.groups.forEach((g) => g.items.forEach((it) => ns.push(it.n))); });
    assert.deepStrictEqual(ns, Array.from({ length: 40 }, (_, i) => i + 1));
    t.parts.forEach((p) => assert.strictEqual(p.groups.reduce((a, g) => a + g.items.length, 0), 10));
  }
});

test('листенинг: ответы согласованы с вариантами и проверяются', () => {
  for (const t of L.tests) t.parts.forEach((p) => p.groups.forEach((g) => g.items.forEach((it) => {
    assert.ok(it.why, 'q' + it.n + ' без пояснения');
    if (g.type === 'mcq') assert.ok(it.opts.some((o) => o[0] === it.a), 'q' + it.n);
    if (g.type === 'mi') assert.ok(g.options.some((o) => o[0] === it.a), 'q' + it.n);
    if (g.type === 'sc') assert.ok(E.checkAnswer(it, it.a[0]), 'q' + it.n);
    if (g.plan) assert.ok(g.plan.spots.some((s) => s.l === it.a), 'на плане нет буквы ' + it.a);
  })));
});

test('листенинг: ответы на пропуски действительно звучат в скрипте', () => {
  const t = L.tests[0]; const heard = (p) => p.script.map((l) => l[1]).join(' ').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  const numw = { 5: 'five', 28: 'twenty-eight', 70: 'seventy', 100: 'hundred', 40: 'forty' };
  [t.parts[0], t.parts[3]].forEach((p) => p.groups[0].items.forEach((it) => {
    const ok = it.a.some((a) => heard(p).includes(String(a).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim())) || it.a.some((a) => /^[\d. :]+$/.test(a));
    assert.ok(ok, 'ответ «' + it.a[0] + '» не найден в скрипте (q' + it.n + ')');
  }));
  assert.ok(numw);
});
