'use strict';
const test = require('node:test'), assert = require('node:assert');
const { hit, key, LIMITS } = require('../backend/yc/ratelimit');
test('hit: лимит окна', () => {
  let st = null;
  for (let i = 0; i < 3; i++) { const r = hit(st, 1000, 3, 60000); st = r.state; assert.ok(r.ok); }
  assert.equal(hit(st, 2000, 3, 60000).ok, false);
  assert.equal(hit(st, 70000, 3, 60000).ok, true); // новое окно
});
test('hit: новое окно начинает счёт с единицы', () => {
  const r = hit({ w: 0, n: 99 }, 60000, 3, 60000);
  assert.deepEqual(r.state, { w: 1, n: 1 }); assert.ok(r.ok);
});
test('key: почта и адрес не хранятся в открытом виде, регистр не важен', () => {
  const k = key('login', ['1.2.3.4', 'User@Gmail.com']);
  assert.ok(/^login:[0-9a-f]{32}$/.test(k)); assert.ok(!/gmail|1\.2\.3\.4/i.test(k));
  assert.equal(k, key('login', ['1.2.3.4', 'user@gmail.com']));
  assert.notEqual(k, key('login', ['1.2.3.5', 'user@gmail.com']));
  assert.notEqual(key('a', ['b|c']), key('a', ['b', 'c']));
});
test('LIMITS: все нужные действия описаны', () => {
  for (const n of ['login', 'signup_code_email', 'signup_code_ip', 'review', 'promo_check', 'checkout', 'groq_ping']) { assert.ok(LIMITS[n][0] > 0 && LIMITS[n][1] >= 60000, n); }
});
