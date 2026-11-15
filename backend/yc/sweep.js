'use strict';
/* Реестр разборов (таблица reviews): каждая списанная проверка записывается как pending, затем done или refunded.
 * Если функция упала после списания, зависшая запись возвращает проверку пользователю. Возврат идемпотентен. */
const N = require('./ent');
const STALE_MS = 180000; // разбор длится до 45 с; через 3 минуты pending считается потерянным
const stale = (rows, now) => rows.filter((r) => r.status === 'pending' && now - r.ts > STALE_MS).map((r) => r.id);
// Что сделать при возврате: null, если возвращать нечего (нет записи или она уже закрыта)
const refundPlan = (row, ent, now) => (row && row.status === 'pending' ? { status: 'refunded', ent: N.giveBack(Object.assign({}, ent), row.kind, now) } : null);

const P = (uid, id) => { const { TypedValues } = require('./index')._; return { $u: TypedValues.utf8(uid), $i: TypedValues.utf8(id) }; };
const SET = 'DECLARE $u AS Utf8; DECLARE $i AS Utf8; DECLARE $s AS Utf8; UPDATE reviews SET status = $s WHERE uid = $u AND id = $i;';
const GET = 'DECLARE $u AS Utf8; DECLARE $i AS Utf8; SELECT kind, status, ts FROM reviews WHERE uid = $u AND id = $i;';
const rowOf = (r) => (r ? { kind: r.kind, status: r.status, ts: N.num(r.ts) } : null);

// Вернуть проверку по записи. true, если возврат сделан сейчас; false, если запись уже закрыта.
async function refundRow(uid, id) {
  const { inTx, TypedValues } = require('./index')._;
  return inTx(async (run) => {
    const plan = refundPlan(rowOf((await run(GET, P(uid, id)))[0]), await N.getEnt(uid, run), Date.now());
    if (!plan) return false;
    await N.putEnt(uid, plan.ent, run);
    await run(SET, { ...P(uid, id), $s: TypedValues.utf8(plan.status) });
    return true;
  });
}
// Отметить разбор выполненным. false, если запись уже не pending (например, её успели вернуть как зависшую).
async function finishRow(uid, id) {
  const { inTx, TypedValues } = require('./index')._;
  return inTx(async (run) => {
    const row = rowOf((await run(GET, P(uid, id)))[0]);
    if (!row || row.status !== 'pending') return false;
    await run(SET, { ...P(uid, id), $s: TypedValues.utf8('done') });
    return true;
  });
}
// Зависшие разборы одного пользователя (вызывается в начале каждого разбора)
async function sweepUser(uid) {
  const { q, TypedValues } = require('./index')._, now = Date.now();
  const rows = await q('DECLARE $u AS Utf8; DECLARE $s AS Utf8; SELECT id, status, ts FROM reviews WHERE uid = $u AND status = $s;', { $u: TypedValues.utf8(uid), $s: TypedValues.utf8('pending') });
  let n = 0;
  for (const id of stale(rows.map((r) => ({ id: r.id, status: r.status, ts: N.num(r.ts) })), now)) if (await refundRow(uid, id)) n++;
  return n;
}
// Все зависшие разборы (вызывается таймером раз в 5 минут)
async function sweepStale() {
  const { q, TypedValues } = require('./index')._, now = Date.now();
  const rows = await q('DECLARE $s AS Utf8; DECLARE $t AS Uint64; SELECT uid, id FROM reviews WHERE status = $s AND ts < $t LIMIT 100;', { $s: TypedValues.utf8('pending'), $t: TypedValues.uint64(now - STALE_MS) });
  let n = 0;
  for (const r of rows) if (await refundRow(r.uid, r.id)) n++;
  return n;
}
module.exports = { STALE_MS, stale, refundPlan, refundRow, finishRow, sweepUser, sweepStale };
