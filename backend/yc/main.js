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
const { q, verify, getUser, ok, bad, TypedValues, E } = base._;

// ---------- Права и платные возможности (источник истины — сервер) ----------
const ADMINS = (E.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
const isAdmin = (me) => !!me && ADMINS.includes(String(me.email).toLowerCase());
const FREE_REVIEWS = 1, PREMIUM_DAILY = 10;
const num = (x) => (x && x.toNumber ? x.toNumber() : Number(x || 0));
async function getEnt(id) {
  const r = await q('DECLARE $i AS Utf8; SELECT credits, prem, ban, free, day, dcount, note FROM ent WHERE id = $i;', { $i: TypedValues.utf8(id) });
  const e = r[0];
  return e ? { credits: num(e.credits), prem: num(e.prem), ban: num(e.ban), free: num(e.free), day: num(e.day), dcount: num(e.dcount), note: e.note || '' }
    : { credits: 0, prem: 0, ban: 0, free: FREE_REVIEWS, day: 0, dcount: 0, note: '', fresh: true };
}
async function putEnt(id, e) {
  await q('DECLARE $i AS Utf8; DECLARE $c AS Int64; DECLARE $p AS Uint64; DECLARE $b AS Uint8; DECLARE $f AS Int64; DECLARE $d AS Uint64; DECLARE $n AS Uint64; DECLARE $t AS Utf8; UPSERT INTO ent (id, credits, prem, ban, free, day, dcount, note) VALUES ($i, $c, $p, $b, $f, $d, $n, $t);',
    { $i: TypedValues.utf8(id), $c: TypedValues.int64(e.credits), $p: TypedValues.uint64(e.prem), $b: TypedValues.uint8(e.ban), $f: TypedValues.int64(e.free), $d: TypedValues.uint64(e.day), $n: TypedValues.uint64(e.dcount), $t: TypedValues.utf8(String(e.note || '').slice(0, 300)) });
}
const today = () => Math.floor(Date.now() / 864e5);
const view = (e, me) => ({ credits: e.credits, premium_until: e.prem > Date.now() ? new Date(e.prem).toISOString() : null, banned: !!e.ban, free_left: e.free, daily_left: e.prem > Date.now() ? Math.max(0, PREMIUM_DAILY - (e.day === today() ? e.dcount : 0)) : 0, admin: isAdmin(me) });
// Списание одной ИИ-проверки. Порядок: бан -> Premium (лимит в сутки) -> оплаченные/выданные -> бесплатная первая.
// Вызывается сервером перед обращением к ИИ; клиенту доверять нельзя.
async function spend(id) {
  const e = await getEnt(id);
  if (e.ban) throw bad('Доступ к ИИ отключён', 403);
  const t = today();
  if (e.prem > Date.now()) {
    if (e.day !== t) { e.day = t; e.dcount = 0; }
    if (e.dcount >= PREMIUM_DAILY) throw bad('Дневной лимит Premium исчерпан', 429);
    e.dcount++;
  } else if (e.credits > 0) e.credits--;
  else if (e.free > 0) e.free--;
  else throw bad('Нет доступных проверок', 402);
  await putEnt(id, e);
  return e;
}
async function refund(id) { const e = await getEnt(id); if (e.dcount > 0 && e.day === today()) e.dcount--; else e.credits++; await putEnt(id, e); }
module.exports.spend = spend; module.exports.refund = refund;

const actions = {};
actions.me = async (b, me) => ok({ ent: view(await getEnt(me.id), me) });
const needAdmin = (me) => { if (!isAdmin(me)) throw bad('forbidden', 403); };
actions.admin_list = async (b, me) => {
  needAdmin(me);
  const users = await q('SELECT email, id, created FROM users ORDER BY created DESC LIMIT 500;');
  const ents = await q('SELECT id, credits, prem, ban, free, note FROM ent;');
  const m = new Map(ents.map((e) => [e.id, e]));
  return ok({ users: users.map((u) => { const e = m.get(u.id); return { email: u.email, id: u.id, created: num(u.created), credits: e ? num(e.credits) : 0, premium_until: e && num(e.prem) > Date.now() ? new Date(num(e.prem)).toISOString() : null, banned: !!(e && num(e.ban)), free: e ? num(e.free) : FREE_REVIEWS, note: e ? e.note || '' : '' }; }) });
};
// Выдать/изменить: credits (+/-), premium_days (+), ban (true/false), note, set_free
actions.admin_grant = async (b, me) => {
  needAdmin(me);
  const u = await getUser(String(b.email || '').trim().toLowerCase());
  if (!u) throw bad('Пользователь не найден', 404);
  const e = await getEnt(u.id);
  if (Number.isFinite(b.credits)) e.credits = Math.max(0, e.credits + Math.trunc(b.credits));
  if (Number.isFinite(b.premium_days)) e.prem = Math.max(Date.now(), e.prem) + Math.trunc(b.premium_days) * 864e5;
  if (b.premium_days === 0 && b.clear_premium) e.prem = 0;
  if (typeof b.ban === 'boolean') e.ban = b.ban ? 1 : 0;
  if (Number.isFinite(b.free)) e.free = Math.max(0, Math.trunc(b.free));
  if (typeof b.note === 'string') e.note = b.note;
  await putEnt(u.id, e);
  return ok({ ent: view(e, null) });
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
