'use strict';
// Доступ к YDB: токен сервисного аккаунта приходит в context функции; подставляем его вместо загрузки тяжёлого @yandex-cloud/nodejs-sdk.
const CUR = { token: '' };
const Mod = require('module'), _load = Mod._load;
Mod._load = function (r, ...a) {
  if (typeof r === 'string' && r.startsWith('@yandex-cloud/nodejs-sdk/dist/token-service/metadata-token-service')) return { MetadataTokenService: class { async getToken() { return CUR.token; } } };
  return _load.call(this, r, ...a);
};
/* Права, платные проверки и админ-действия поверх index.js. Точка входа функции: main.handler */
const crypto = require('crypto');
const base = require('./index');
const { fillDays } = require('./stats');
const S = require('./security');
const N = require('./ent');
const W = require('./sweep');
const R = require('./review');
const { limit } = require('./ratelimit');
const { q, inTx, verify, getUser, userMeta, ok, bad, own, TypedValues, E, ORIGINS } = base._;
const { getEnt, putEnt, num } = N;

// ---------- Права и платные возможности (источник истины — сервер) ----------
const ADMINS = (E.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
const isAdmin = (me) => !!me && ADMINS.includes(String(me.email).toLowerCase());
const today = () => N.dayOf(Date.now());
// freeAllowed=false: бесплатная проверка не показывается и не выдаётся (почта не подтверждена)
const view = (e, me, freeAllowed) => ({ credits: e.credits, premium_until: e.prem > Date.now() ? new Date(e.prem).toISOString() : null, banned: !!e.ban, free_left: freeAllowed === false ? 0 : e.free, daily_left: e.prem > Date.now() ? Math.max(0, N.PREMIUM_DAILY - (e.day === today() ? e.dcount : 0)) : 0, admin: isAdmin(me) });
// Бесплатная проверка выдаётся только при подтверждённой почте (users.vf) либо аккаунтам, созданным до FREE_LEGACY_BEFORE (мс).
// При сбое запроса считаем почту неподтверждённой: оплаченные проверки при этом работают.
async function freeAllowedFor(me) {
  try { return N.freeOk(await userMeta(me.email), Number(E.FREE_LEGACY_BEFORE) || 0); } catch (e) { S.logErr('userMeta failed', e); return false; }
}
// Списание одной ИИ-проверки вне разбора (атомарно). Сам разбор списывает в своей транзакции вместе с записью в реестр.
async function spend(id, freeAllowed) {
  return inTx(async (run) => { const e = await getEnt(id, run); e.kind = N.charge(e, Date.now(), freeAllowed !== false); await putEnt(id, e, run); return e; });
}
// Вернуть списанную проверку того же вида, что была списана (kind из spend)
async function refund(id, kind) { return inTx(async (run) => { const e = N.giveBack(await getEnt(id, run), kind, Date.now()); await putEnt(id, e, run); return e; }); }
module.exports.spend = spend; module.exports.refund = refund; module.exports.inTx = inTx;

const actions = {};
const U = (v) => TypedValues.utf8(v), U64 = (v) => TypedValues.uint64(v);
// Расширенный разбор. Порядок: проверка текста -> лимит частоты -> возврат зависших -> одна транзакция (нет другого разбора, дневной
// предохранитель, списание, запись pending в реестр) -> Groq -> done; при любой ошибке возврат списанного и refunded.
// Эссе живёт только в памяти запроса: в таблицы и логи не пишется. Бесплатная проверка получает обрезанный результат (остальное не покидает сервер).
actions.review = async (b, me) => {
  // До релиза платных функций разбор доступен только админам (ADMIN_EMAILS); REVIEW_OPEN=1 открывает всем.
  if (!reviewOpenFor(me)) throw bad('Расширенный разбор пока недоступен', 403);
  const kind = ['t1', 'gt'].includes(b.kind) ? b.kind : 't2', text = String(b.text || ''), bad0 = R.check(kind, text);
  if (bad0) throw bad(bad0);
  const goal = Math.min(9, Math.max(4, Number(b.goal) || 7));
  await limit('review', [me.id]);
  try { await W.sweepUser(me.id); } catch (e) { S.logErr('sweepUser failed', e); }
  const freeAllowed = await freeAllowedFor(me), rid = crypto.randomUUID(), max = N.budgetMax(E.REVIEW_DAILY_MAX);
  const spent = await inTx(async (run) => {
    const now = Date.now(), day = N.dayOf(now);
    const pend = await run('DECLARE $u AS Utf8; DECLARE $s AS Utf8; SELECT id FROM reviews WHERE uid = $u AND status = $s LIMIT 1;', { $u: U(me.id), $s: U('pending') });
    if (pend.length) throw bad('Разбор уже идёт. Дождитесь результата', 429);
    const e = await getEnt(me.id, run), k = N.charge(e, now, freeAllowed);
    const br = await run('DECLARE $d AS Uint64; SELECT n FROM budget WHERE day = $d;', { $d: U64(day) }), n = br[0] ? num(br[0].n) : 0;
    if (N.overBudget(n, max)) throw bad('Сервис перегружен, попробуйте позже', 503); // транзакция откатывается: списания нет
    await run('DECLARE $d AS Uint64; DECLARE $n AS Uint64; UPSERT INTO budget (day, n) VALUES ($d, $n);', { $d: U64(day), $n: U64(n + 1) });
    await putEnt(me.id, e, run);
    await run('DECLARE $u AS Utf8; DECLARE $i AS Utf8; DECLARE $k AS Utf8; DECLARE $s AS Utf8; DECLARE $t AS Uint64; UPSERT INTO reviews (uid, id, kind, status, ts) VALUES ($u, $i, $k, $s, $t);',
      { $u: U(me.id), $i: U(rid), $k: U(k), $s: U('pending'), $t: U64(now) });
    return k;
  });
  let full;
  try { full = R.shape(await R.callGroq(R.messages(kind, b.question, text, goal)), text); }
  catch (err) {
    S.logErr('review failed', err);
    let back = false;
    try { back = await W.refundRow(me.id, rid); } catch (e2) { S.logErr('refund failed', e2); }
    throw bad(back ? 'Не удалось получить разбор. Проверка возвращена, попробуйте ещё раз через минуту' : 'Не удалось получить разбор. Проверка вернётся автоматически в течение нескольких минут', 502);
  }
  // Если отметить не удалось, запись останется pending и проверка вернётся как зависшая: ошибка в пользу пользователя.
  try { if (!(await W.finishRow(me.id, rid))) console.error('review row was not pending at finish'); } catch (e) { S.logErr('finish failed', e); }
  return ok({ result: spent === 'free' ? R.trim(full) : R.fullOut(full), ent: view(await getEnt(me.id), me, freeAllowed) });
};
// Лишний запрос о подтверждении почты делаем, только когда разбор этому пользователю доступен и бесплатная проверка ещё не потрачена.
const reviewOpenFor = (me) => isAdmin(me) || E.REVIEW_OPEN === '1';
actions.me = async (b, me) => { const e = await getEnt(me.id); return ok({ ent: view(e, me, e.free > 0 && reviewOpenFor(me) ? await freeAllowedFor(me) : true) }); };
// Доступен ли Groq с сервера (нужно проверить из РФ до включения разбора). Только админ; ключ и тело ответа не возвращаются.
actions.groq_ping = async (b, me) => { needAdmin(me); await limit('groq_ping', [me.id]); return ok({ groq: await R.ping() }); };
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
function needAdmin(me) { if (!isAdmin(me)) throw bad('forbidden', 403); }
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
  return ok({ users: users.map((u) => { const e = m.get(u.id); return { email: u.email, id: u.id, created: num(u.created), credits: e ? num(e.credits) : 0, premium_until: e && num(e.prem) > Date.now() ? new Date(num(e.prem)).toISOString() : null, banned: !!(e && num(e.ban)), free: e ? num(e.free) : N.FREE_REVIEWS, note: e ? e.note || '' : '' }; }) });
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
  } catch (e) { if (e.code) throw e; throw bad('stats: ' + S.redact(e && e.message || e, 300), 400); } // только админу: показываем причину
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

// Таймер (триггер раз в 5 минут) возвращает зависшие разборы. Такое событие можно подделать снаружи (?integration=raw),
// поэтому оно делает только идемпотентную уборку и ничего не возвращает.
const isTimer = (ev) => !ev.httpMethod && Array.isArray(ev.messages) && ev.messages.some((m) => m && m.details && m.details.trigger_id);
module.exports.handler = async (event) => {
  if (!event || typeof event !== 'object') event = {};
  if (isTimer(event)) { try { await W.sweepStale(); } catch (e) { S.logErr('sweep failed', e); } return { statusCode: 200, body: 'ok' }; }
  const origin = (event.headers && (event.headers.Origin || event.headers.origin)) || '';
  const h = S.headers(origin, ORIGINS);
  let b = null, raw = '';
  try { raw = S.rawBody(event); } catch (e) { return { statusCode: 413, headers: h, body: '{"ok":false,"error":"too large"}' }; }
  try { b = JSON.parse(raw); } catch (e) { /* пусть решит базовый обработчик */ }
  if (b && b.a === 'diag' && E.DEBUG) { try { await q('SELECT 1;'); return { statusCode: 200, headers: h, body: '{"ok":true}' }; } catch (e) { return { statusCode: 200, headers: h, body: JSON.stringify({ ok: false, err: S.redact(e && e.message || e, 300) }) }; } }
  if (!b || !own(actions, b.a)) return base.handler(event);
  try {
    if (S.tooBig(raw, b.a)) throw bad('too large', 413);
    const me = verify(b.token); if (!me) throw bad('unauthorized', 401);
    return { statusCode: 200, headers: h, body: JSON.stringify(await actions[b.a](b, me, { ip: S.clientIp(event) })) };
  } catch (e) {
    const c = e && Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 500;
    if (c === 500) S.logErr('error', e);
    return { statusCode: c, headers: h, body: JSON.stringify({ ok: false, error: c === 500 ? 'server error' : e.message }) };
  }
};

const _h = module.exports.handler;
module.exports.handler = async (event, context) => { CUR.token = (context && context.token && context.token.access_token) || ''; return _h(event); };
