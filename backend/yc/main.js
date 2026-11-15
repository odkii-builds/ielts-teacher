'use strict';
// Доступ к YDB: токен сервисного аккаунта приходит в context функции; подставляем его вместо загрузки тяжёлого @yandex-cloud/nodejs-sdk.
const CUR = { token: '' };
const Mod = require('module'), _load = Mod._load;
Mod._load = function (r, ...a) {
  if (typeof r === 'string' && r.startsWith('@yandex-cloud/nodejs-sdk/dist/token-service/metadata-token-service')) return { MetadataTokenService: class { async getToken() { return CUR.token; } } };
  return _load.call(this, r, ...a);
};
/* Права, платные проверки и админ-действия поверх index.js. Точка входа функции: main.handler */
const base = require('./index');
const { fillDays } = require('./stats');
const { q, db, verify, getUser, ok, bad, TypedValues, TypedData, E } = base._;

// ---------- Права и платные возможности (источник истины — сервер) ----------
const ADMINS = (E.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
const isAdmin = (me) => !!me && ADMINS.includes(String(me.email).toLowerCase());
const FREE_REVIEWS = 1, PREMIUM_DAILY = 10;
const num = (x) => (x && x.toNumber ? x.toNumber() : Number(x || 0));
// Транзакция с полной изоляцией: чтение и запись видят один снимок; при конфликте с параллельным запросом повторяем.
const isConflict = (e) => /abort|lock|conflict|overload|TLI|serializ/i.test(String((e && (e.constructor && e.constructor.name)) || '') + ' ' + String((e && e.message) || ''));
async function inTx(fn) {
  for (let i = 0; ; i++) {
    try {
      const d = await db();
      return await d.tableClient.withSession(async (s) => {
        const t = await s.beginTransaction({ serializableReadWrite: {} }), txId = t.id;
        const run = async (text, params) => { const res = await s.executeQuery(text, params || {}, { txId }); return res.resultSets && res.resultSets[0] ? TypedData.createNativeObjects(res.resultSets[0]) : []; };
        try { const out = await fn(run); await s.commitTransaction({ txId }); return out; } catch (e) { try { await s.rollbackTransaction({ txId }); } catch (e2) { /* ignore */ } throw e; }
      });
    } catch (e) { if (i < 4 && !Number.isInteger(e.code) && isConflict(e)) continue; throw e; }
  }
}
async function getEnt(id, run = q) {
  const r = await run('DECLARE $i AS Utf8; SELECT credits, prem, ban, free, day, dcount, note FROM ent WHERE id = $i;', { $i: TypedValues.utf8(id) });
  const e = r[0];
  return e ? { credits: num(e.credits), prem: num(e.prem), ban: num(e.ban), free: num(e.free), day: num(e.day), dcount: num(e.dcount), note: e.note || '' }
    : { credits: 0, prem: 0, ban: 0, free: FREE_REVIEWS, day: 0, dcount: 0, note: '', fresh: true };
}
async function putEnt(id, e, run = q) {
  await run('DECLARE $i AS Utf8; DECLARE $c AS Int64; DECLARE $p AS Uint64; DECLARE $b AS Uint8; DECLARE $f AS Int64; DECLARE $d AS Uint64; DECLARE $n AS Uint64; DECLARE $t AS Utf8; UPSERT INTO ent (id, credits, prem, ban, free, day, dcount, note) VALUES ($i, $c, $p, $b, $f, $d, $n, $t);',
    { $i: TypedValues.utf8(id), $c: TypedValues.int64(e.credits), $p: TypedValues.uint64(e.prem), $b: TypedValues.uint8(e.ban), $f: TypedValues.int64(e.free), $d: TypedValues.uint64(e.day), $n: TypedValues.uint64(e.dcount), $t: TypedValues.utf8(String(e.note || '').slice(0, 300)) });
}
const today = () => Math.floor(Date.now() / 864e5);
const view = (e, me) => ({ credits: e.credits, premium_until: e.prem > Date.now() ? new Date(e.prem).toISOString() : null, banned: !!e.ban, free_left: e.free, daily_left: e.prem > Date.now() ? Math.max(0, PREMIUM_DAILY - (e.day === today() ? e.dcount : 0)) : 0, admin: isAdmin(me) });
// Списание одной ИИ-проверки. Порядок: бан -> Premium (лимит в сутки) -> оплаченные/выданные -> бесплатная первая.
// Вызывается сервером перед обращением к ИИ; клиенту доверять нельзя.
async function spend(id) {
  return inTx(async (run) => {
  const e = await getEnt(id, run);
  if (e.ban) throw bad('Доступ к ИИ отключён', 403);
  const t = today();
  if (e.prem > Date.now()) {
    if (e.day !== t) { e.day = t; e.dcount = 0; }
    if (e.dcount >= PREMIUM_DAILY) throw bad('Дневной лимит Premium исчерпан', 429);
    e.dcount++; e.kind = 'prem';
  } else if (e.credits > 0) { e.credits--; e.kind = 'credit'; }
  else if (e.free > 0) { e.free--; e.kind = 'free'; }
  else throw bad('Нет доступных проверок', 402);
  await putEnt(id, e, run);
  return e;
  });
}
// Вернуть списанную проверку того же вида, что была списана (kind из spend)
async function refund(id, kind) { return inTx(async (run) => { const e = await getEnt(id, run); if (kind === 'prem') { if (e.dcount > 0 && e.day === today()) e.dcount--; } else if (kind === 'free') e.free++; else e.credits++; await putEnt(id, e, run); return e; }); }
module.exports.spend = spend; module.exports.refund = refund; module.exports.inTx = inTx;

const R = require('./review');
// Расширенный разбор: проверка текста -> атомарное списание -> Groq -> при любой ошибке возврат списанного.
// Бесплатная проверка получает только обрезанный результат (остальное не покидает сервер).
actions.review = async (b, me) => {
  const kind = ['t1', 'gt'].includes(b.kind) ? b.kind : 't2', text = String(b.text || ''), bad0 = R.check(kind, text);
  if (bad0) throw bad(bad0);
  const goal = Math.min(9, Math.max(4, Number(b.goal) || 7));
  const e = await spend(me.id);
  let full;
  try { full = R.shape(await R.callGroq(R.messages(kind, b.question, text, goal)), text); }
  catch (err) {
    console.error('review failed', err && (err.upstream || ''), err && err.message);
    try { await refund(me.id, e.kind); } catch (e2) { console.error('refund failed', e2 && e2.message); }
    throw bad('Не удалось получить разбор. Проверка возвращена, попробуйте ещё раз через минуту', 502);
  }
  const fin = await getEnt(me.id);
  return ok({ result: e.kind === 'free' ? R.trim(full) : R.fullOut(full), ent: view(fin, me) });
};
actions.me = async (b, me) => ok({ ent: view(await getEnt(me.id), me) });
// Лист ожидания клуба. join=true: встать в очередь (повтор не меняет место); join=false: только статус.
actions.club_wait = async (b, me) => {
  const I = { $i: TypedValues.utf8(me.id) };
  const mine = await q('DECLARE $i AS Utf8; SELECT ts FROM waitlist WHERE id = $i;', I);
  let ts = mine[0] ? num(mine[0].ts) : 0;
  if (!ts && b.join === true) {
    ts = Date.now();
    await q('DECLARE $i AS Utf8; DECLARE $e AS Utf8; DECLARE $t AS Uint64; UPSERT INTO waitlist (id, email, ts) VALUES ($i, $e, $t);', { ...I, $e: TypedValues.utf8(String(me.email || '')), $t: TypedValues.uint64(ts) });
  }
  const total = num((await q('SELECT COUNT(*) AS c FROM waitlist;'))[0].c);
  if (!ts) return ok({ joined: false, total });
  const pos = num((await q('DECLARE $t AS Uint64; SELECT COUNT(*) AS c FROM waitlist WHERE ts <= $t;', { $t: TypedValues.uint64(ts) }))[0].c);
  return ok({ joined: true, pos, total });
};
const needAdmin = (me) => { if (!isAdmin(me)) throw bad('forbidden', 403); };
actions.club_list = async (b, me) => {
  needAdmin(me);
  const r = await q('SELECT email, ts FROM waitlist ORDER BY ts LIMIT 1000;');
  return ok({ list: r.map((x) => ({ email: x.email, ts: num(x.ts) })) });
};
actions.admin_list = async (b, me) => {
  needAdmin(me);
  const users = await q('SELECT email, id, created FROM users ORDER BY created DESC LIMIT 500;');
  const ents = await q('SELECT id, credits, prem, ban, free, note FROM ent;');
  const m = new Map(ents.map((e) => [e.id, e]));
  return ok({ users: users.map((u) => { const e = m.get(u.id); return { email: u.email, id: u.id, created: num(u.created), credits: e ? num(e.credits) : 0, premium_until: e && num(e.prem) > Date.now() ? new Date(num(e.prem)).toISOString() : null, banned: !!(e && num(e.ban)), free: e ? num(e.free) : FREE_REVIEWS, note: e ? e.note || '' : '' }; }) });
};
// Сводка: всего пользователей, регистрации за 30 дней, активные, Premium, лист ожидания
actions.admin_stats = async (b, me) => {
  needAdmin(me);
  try {
    const now = Date.now(), since = now - 30 * 864e5, P = (t) => ({ $t: TypedValues.uint64(t) });
    const cnt = async (sql, t) => num((await q(sql, t == null ? undefined : P(t)))[0].c);
    const total = await cnt('SELECT COUNT(*) AS c FROM users;');
    // дни по Москве (UTC+3): подзапрос с датой-числом, потом группировка
    const reg = await q('DECLARE $t AS Uint64; SELECT d, COUNT(*) AS c FROM (SELECT (created + 10800000ul) / 86400000ul AS d FROM users WHERE created >= $t) GROUP BY d;', P(since));
    const act = (ms) => cnt('DECLARE $t AS Uint64; SELECT COUNT(*) AS c FROM data WHERE upd >= $t;', now - ms);
    const a1 = await act(864e5), a7 = await act(7 * 864e5), a30 = await act(30 * 864e5);
    const prem = await cnt('DECLARE $t AS Uint64; SELECT COUNT(*) AS c FROM ent WHERE prem > $t;', now);
    const wl = await cnt('SELECT COUNT(*) AS c FROM waitlist;');
    return ok({ total, days: fillDays(reg.map((r) => ({ d: num(r.d), c: num(r.c) })), now, 30), active: { d1: a1, d7: a7, d30: a30 }, premium: prem, waitlist: wl, at: now });
  } catch (e) { if (e.code) throw e; throw bad('stats: ' + String(e && e.message || e).slice(0, 300), 400); } // только админу: показываем причину
};
// Выдать/изменить: credits (+/-), premium_days (+), ban (true/false), note, set_free
actions.admin_grant = async (b, me) => {
  needAdmin(me);
  const u = await getUser(String(b.email || '').trim().toLowerCase());
  if (!u) throw bad('Пользователь не найден', 404);
  return inTx(async (run) => {
  const e = await getEnt(u.id, run);
  if (Number.isFinite(b.credits)) e.credits = Math.max(0, e.credits + Math.trunc(b.credits));
  if (Number.isFinite(b.premium_days)) e.prem = Math.max(Date.now(), e.prem) + Math.trunc(b.premium_days) * 864e5;
  if (b.premium_days === 0 && b.clear_premium) e.prem = 0;
  if (typeof b.ban === 'boolean') e.ban = b.ban ? 1 : 0;
  if (Number.isFinite(b.free)) e.free = Math.max(0, Math.trunc(b.free));
  if (typeof b.note === 'string') e.note = b.note;
  await putEnt(u.id, e, run);
  return ok({ ent: view(e, null) });
  });
};

module.exports.handler = async (event) => {
  let b = null;
  try { b = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}'); } catch (e) { /* пусть решит базовый обработчик */ }
  const origin = (event.headers && (event.headers.Origin || event.headers.origin)) || '';
  const O = (E.ORIGIN || 'https://ielts.odkii-builds.ru').split(',');
  const h = { 'content-type': 'application/json', 'access-control-allow-origin': O.includes(origin) ? origin : O[0], 'access-control-allow-headers': 'content-type', vary: 'origin' };
  if (b && b.a === 'diag' && E.DEBUG) { try { await q('SELECT 1;'); return { statusCode: 200, headers: h, body: '{"ok":true}' }; } catch (e) { return { statusCode: 200, headers: h, body: JSON.stringify({ ok: false, err: String(e && e.message || e).slice(0, 300) }) }; } }
  if (!b || !actions[b.a]) return base.handler(event);
  try {
    const me = verify(b.token); if (!me) throw bad('unauthorized', 401);
    return { statusCode: 200, headers: h, body: JSON.stringify(await actions[b.a](b, me)) };
  } catch (e) {
    const c = Number.isInteger(e.code) ? e.code : 500;
    if (c === 500) console.error(e && e.stack || e);
    return { statusCode: c, headers: h, body: JSON.stringify({ ok: false, error: c === 500 ? 'server error' : e.message }) };
  }
};

const _h = module.exports.handler;
module.exports.handler = async (event, context) => { CUR.token = (context && context.token && context.token.access_token) || ''; return _h(event); };
