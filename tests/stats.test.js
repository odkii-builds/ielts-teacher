const test = require('node:test');
const assert = require('node:assert');
const { fillDays, dayNum } = require('../backend/yc/stats.js');
const now = Date.UTC(2026, 10, 14, 20, 0, 0); // 14.11 20:00 UTC = 15.11 23:00 по Москве
test('stats: последний день по Москве, пропуски нулями', () => {
  const t = dayNum(now);
  const r = fillDays([{ d: t, c: 5 }, { d: t - 2, c: 3 }], now, 4);
  assert.deepStrictEqual(r.map((x) => x.n), [0, 3, 0, 5]);
  assert.equal(r[3].day, '2026-11-14');
});
test('stats: регистрация в 23:30 UTC попадает в следующий московский день', () => {
  const ts = Date.UTC(2026, 10, 14, 23, 30);
  assert.equal(dayNum(ts), dayNum(Date.UTC(2026, 10, 15, 0, 1)));
});
