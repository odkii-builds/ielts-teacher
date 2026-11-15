'use strict';
/* Права пользователя (таблица ent): баланс проверок, Premium, бан. Чистые правила списания и возврата + чтение/запись строки. */
const FREE_REVIEWS = 1, PREMIUM_DAILY = 10, DAY = 864e5;
const bad = (m, c) => { const e = new Error(m); e.code = c || 400; return e; };
const num = (x) => (x && x.toNumber ? x.toNumber() : Number(x || 0));
const dayOf = (now) => Math.floor(now / DAY);

// Списание одной проверки (меняет e, возвращает вид списания). Порядок: бан -> Premium (лимит в сутки) -> оплаченные/выданные -> бесплатная первая.
// freeAllowed=false: бесплатная проверка не выдаётся (почта не подтверждена).
function charge(e, now, freeAllowed) {
  if (e.ban) throw bad('Доступ к ИИ отключён', 403);
  if (e.prem > now) {
    const t = dayOf(now);
    if (e.day !== t) { e.day = t; e.dcount = 0; }
    if (e.dcount >= PREMIUM_DAILY) throw bad('Дневной лимит Premium исчерпан', 429);
    e.dcount++; return 'prem';
  }
  if (e.credits > 0) { e.credits--; return 'credit'; }
  if (e.free > 0 && freeAllowed) { e.free--; return 'free'; }
  throw bad('Нет доступных проверок', 402);
}
// Возврат списанной проверки того же вида (меняет e)
function giveBack(e, kind, now) {
  if (kind === 'prem') { if (e.dcount > 0 && e.day === dayOf(now)) e.dcount--; } else if (kind === 'free') e.free++; else e.credits++;
  return e;
}
// Дневной предохранитель расходов на ИИ (REVIEW_DAILY_MAX, по умолчанию 300 разборов в сутки на весь сервис)
const overBudget = (n, max) => n >= max;
const budgetMax = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 && String(v).trim() !== '' ? n : 300; };
// Бесплатная проверка: только при подтверждённой почте (vf) либо для аккаунтов, созданных до даты legacyBefore (мс; 0 = таких нет)
const freeOk = (u, legacyBefore) => !!u && (num(u.vf) === 1 || num(u.created) < (legacyBefore || 0));

async function getEnt(id, run) {
  const { q, TypedValues } = require('./index')._;
  const r = await (run || q)('DECLARE $i AS Utf8; SELECT credits, prem, ban, free, day, dcount, note FROM ent WHERE id = $i;', { $i: TypedValues.utf8(id) });
  const e = r[0];
  return e ? { credits: num(e.credits), prem: num(e.prem), ban: num(e.ban), free: num(e.free), day: num(e.day), dcount: num(e.dcount), note: e.note || '' }
    : { credits: 0, prem: 0, ban: 0, free: FREE_REVIEWS, day: 0, dcount: 0, note: '', fresh: true };
}
async function putEnt(id, e, run) {
  const { q, TypedValues } = require('./index')._;
  await (run || q)('DECLARE $i AS Utf8; DECLARE $c AS Int64; DECLARE $p AS Uint64; DECLARE $b AS Uint8; DECLARE $f AS Int64; DECLARE $d AS Uint64; DECLARE $n AS Uint64; DECLARE $t AS Utf8; UPSERT INTO ent (id, credits, prem, ban, free, day, dcount, note) VALUES ($i, $c, $p, $b, $f, $d, $n, $t);',
    { $i: TypedValues.utf8(id), $c: TypedValues.int64(e.credits), $p: TypedValues.uint64(e.prem), $b: TypedValues.uint8(e.ban), $f: TypedValues.int64(e.free), $d: TypedValues.uint64(e.day), $n: TypedValues.uint64(e.dcount), $t: TypedValues.utf8(String(e.note || '').slice(0, 300)) });
}
module.exports = { FREE_REVIEWS, PREMIUM_DAILY, DAY, dayOf, charge, giveBack, overBudget, budgetMax, freeOk, getEnt, putEnt, num, bad };
