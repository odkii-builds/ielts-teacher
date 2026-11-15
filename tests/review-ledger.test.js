'use strict';
const test = require('node:test'), assert = require('node:assert');
const N = require('../backend/yc/ent');
const W = require('../backend/yc/sweep');
const DAY = 864e5, now = 20000 * DAY + 5000, base = () => ({ credits: 0, prem: 0, ban: 0, free: 1, day: 0, dcount: 0, note: '' });
const code = (c) => (e) => e.code === c;

test('charge: порядок списания Premium -> оплаченные -> бесплатная', () => {
  const p = Object.assign(base(), { prem: now + DAY, credits: 3 });
  assert.equal(N.charge(p, now, true), 'prem'); assert.equal(p.dcount, 1); assert.equal(p.credits, 3); assert.equal(p.free, 1);
  const c = Object.assign(base(), { credits: 2 });
  assert.equal(N.charge(c, now, true), 'credit'); assert.equal(c.credits, 1); assert.equal(c.free, 1);
  const f = base();
  assert.equal(N.charge(f, now, true), 'free'); assert.equal(f.free, 0);
  assert.throws(() => N.charge(f, now, true), code(402));
});
test('charge: бан, дневной лимит Premium, новый день обнуляет счётчик', () => {
  assert.throws(() => N.charge(Object.assign(base(), { ban: 1, credits: 5 }), now, true), code(403));
  const p = Object.assign(base(), { prem: now + 3 * DAY, day: N.dayOf(now), dcount: N.PREMIUM_DAILY });
  assert.throws(() => N.charge(p, now, true), code(429));
  assert.equal(N.charge(p, now + DAY, true), 'prem'); assert.equal(p.dcount, 1);
});
test('charge: бесплатная не выдаётся без подтверждённой почты, оплаченные работают', () => {
  const f = base();
  assert.throws(() => N.charge(f, now, false), code(402)); assert.equal(f.free, 1);
  assert.equal(N.charge(Object.assign(base(), { credits: 1 }), now, false), 'credit');
});
test('charge: баланс не уходит в минус', () => {
  const e = Object.assign(base(), { credits: 1, free: 0 });
  N.charge(e, now, true);
  assert.throws(() => N.charge(e, now, true), code(402)); assert.equal(e.credits, 0); assert.equal(e.free, 0);
});
test('giveBack: возвращается то, что было списано', () => {
  for (const mk of [() => Object.assign(base(), { prem: now + DAY }), () => Object.assign(base(), { credits: 1 }), base]) {
    const e = mk(), before = JSON.stringify(mk());
    const kind = N.charge(e, now, true); N.giveBack(e, kind, now);
    assert.equal(JSON.stringify(Object.assign(e, { day: 0 })), before);
  }
  const p = Object.assign(base(), { prem: now + DAY, day: N.dayOf(now), dcount: 0 });
  N.giveBack(p, 'prem', now); assert.equal(p.dcount, 0); // ниже нуля не опускаем
  const old = Object.assign(base(), { prem: now + DAY, day: N.dayOf(now) - 1, dcount: 4 });
  N.giveBack(old, 'prem', now); assert.equal(old.dcount, 4); // вчерашний счётчик не трогаем
});
test('overBudget и budgetMax', () => {
  assert.equal(N.overBudget(299, 300), false); assert.equal(N.overBudget(300, 300), true);
  assert.equal(N.budgetMax(undefined), 300); assert.equal(N.budgetMax('50'), 50); assert.equal(N.budgetMax('0'), 0);
  assert.equal(N.budgetMax('abc'), 300); assert.equal(N.budgetMax('-5'), 300);
});
test('freeOk: подтверждённая почта или аккаунт старше заданной даты', () => {
  assert.equal(N.freeOk({ vf: 1, created: 500 }, 0), true);
  assert.equal(N.freeOk({ vf: 0, created: 500 }, 0), false);
  assert.equal(N.freeOk({ vf: 0, created: 500 }, 1000), true);
  assert.equal(N.freeOk({ vf: 0, created: 1000 }, 1000), false);
  assert.equal(N.freeOk(null, 1000), false);
});
test('stale: только зависшие pending старше 3 минут', () => {
  const rows = [
    { id: 'a', status: 'pending', ts: now - W.STALE_MS - 1 }, { id: 'b', status: 'pending', ts: now - 1000 },
    { id: 'c', status: 'done', ts: 0 }, { id: 'd', status: 'refunded', ts: 0 },
  ];
  assert.deepEqual(W.stale(rows, now), ['a']);
});
test('refundPlan: возврат идемпотентен', () => {
  const ent = Object.assign(base(), { credits: 0 }), row = { id: 'r', kind: 'credit', status: 'pending', ts: 0 };
  const p1 = W.refundPlan(row, ent, now);
  assert.equal(p1.status, 'refunded'); assert.equal(p1.ent.credits, 1); assert.equal(ent.credits, 0); // исходный объект не меняется
  assert.equal(W.refundPlan(Object.assign({}, row, { status: p1.status }), p1.ent, now), null); // второй вызов ничего не меняет
  assert.equal(W.refundPlan(Object.assign({}, row, { status: 'done' }), ent, now), null);
  assert.equal(W.refundPlan(null, ent, now), null);
});
