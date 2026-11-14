'use strict';
/* IELTS Teacher API: одна Cloud Function (Yandex Cloud) + YDB serverless.
 * Без секретов в коде. Env: YDB_ENDPOINT, YDB_DATABASE, JWT_SECRET, ORIGIN, SB_URL, SB_KEY (последние два — только для переноса старых аккаунтов).
 * Доступ к YDB — через сервисный аккаунт функции (метаданные), ключи не нужны.
 * Таблицы: см. schema.sql. Данные пользователя хранятся gzip-сжатыми (меньше RU). */
const crypto = require('crypto');
const zlib = require('zlib');
const { Driver, MetadataAuthService, TypedValues, TypedData } = require('ydb-sdk');

const E = process.env;
const ORIGINS = (E.ORIGIN || 'https://ielts.odkii-builds.ru').split(',');
const TTL = 30 * 864e5;
let driver = null;
async function db() {
  if (driver) return driver;
  const d = new Driver({ endpoint: E.YDB_ENDPOINT, database: E.YDB_DATABASE, authService: new MetadataAuthService() });
  if (!(await d.ready(8000))) throw new Error('ydb not ready');
  return (driver = d);
}
async function q(text, params) {
  const d = await db();
  const res = await d.tableClient.withSession((s) => s.executeQuery(text, params || {}));
  return res.resultSets && res.resultSets[0] ? TypedData.createNativeObjects(res.resultSets[0]) : [];
}

const b64u = (b) => Buffer.from(b).toString('base64url');
const hmac = (s) => crypto.createHmac('sha256', E.JWT_SECRET).update(s).digest('base64url');
function sign(user) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify({ sub: user.id, em: user.email, exp: Date.now() + TTL }));
  return h + '.' + p + '.' + hmac(h + '.' + p);
}
function verify(t) {
  const a = String(t || '').split('.');
  if (a.length !== 3) return null;
  const x = Buffer.from(hmac(a[0] + '.' + a[1])), y = Buffer.from(a[2]);
  if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) return null;
  try { const p = JSON.parse(Buffer.from(a[1], 'base64url')); return p.exp > Date.now() ? { id: p.sub, email: p.em } : null; } catch (e) { return null; }
}
const hash = (pw) => { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
function check(pw, stored) {
  const [s, h] = String(stored).split(':'); if (!s || !h) return false;
  const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 32), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const fails = new Map(); // простая защита от перебора (в пределах инстанса)
function throttled(k) { const f = fails.get(k); return f && f.n >= 8 && Date.now() - f.t < 600000; }
function fail(k) { const f = fails.get(k) || { n: 0, t: 0 }; f.n++; f.t = Date.now(); fails.set(k, f); if (fails.size > 5000) fails.clear(); }

async function getUser(email) {
  const r = await q('DECLARE $e AS Utf8; SELECT id, email, pass FROM users WHERE email = $e;', { $e: TypedValues.utf8(email) });
  return r[0] || null;
}
async function putUser(u) {
  await q('DECLARE $e AS Utf8; DECLARE $i AS Utf8; DECLARE $p AS Utf8; DECLARE $c AS Uint64; UPSERT INTO users (email, id, pass, created) VALUES ($e, $i, $p, $c);',
    { $e: TypedValues.utf8(u.email), $i: TypedValues.utf8(u.id), $p: TypedValues.utf8(u.pass), $c: TypedValues.uint64(Date.now()) });
}
async function putData(id, obj) {
  const z = zlib.gzipSync(Buffer.from(JSON.stringify(obj)));
  const upd = Date.now();
  await q('DECLARE $i AS Utf8; DECLARE $d AS String; DECLARE $u AS Uint64; UPSERT INTO data (id, d, upd) VALUES ($i, $d, $u);',
    { $i: TypedValues.utf8(id), $d: TypedValues.bytes(z), $u: TypedValues.uint64(upd) });
  return upd;
}
async function getData(id) {
  const r = await q('DECLARE $i AS Utf8; SELECT d, upd FROM data WHERE id = $i;', { $i: TypedValues.utf8(id) });
  if (!r[0]) return null;
  return { data: JSON.parse(zlib.gunzipSync(Buffer.from(r[0].d)).toString()), updated_at: new Date(r[0].upd && r[0].upd.toNumber ? r[0].upd.toNumber() : Number(r[0].upd)).toISOString() };
}

// Разовый перенос старого аккаунта из Supabase при первом входе (пароль проверяет сам Supabase).
async function legacyLogin(email, password) {
  if (!E.SB_URL || !E.SB_KEY) return null;
  try {
    const r = await fetch(E.SB_URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: E.SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!r.ok) return null;
    const j = await r.json(); if (!j.access_token || !j.user) return null;
    const user = { id: j.user.id, email, pass: hash(password) };
    await putUser(user);
    const dr = await fetch(E.SB_URL + '/rest/v1/ielts_user_data?select=data&user_id=eq.' + encodeURIComponent(user.id), { headers: { apikey: E.SB_KEY, authorization: 'Bearer ' + j.access_token } });
    if (dr.ok) { const rows = await dr.json(); if (rows[0] && rows[0].data) await putData(user.id, rows[0].data); }
    return user;
  } catch (e) { return null; }
}

const ok = (o) => ({ ok: true, ...o });
const bad = (m, c) => { const e = new Error(m); e.code = c || 400; return e; };

const actions = {
  async signup(b) {
    const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
    if (!/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(email)) throw bad('Некорректный email');
    if (pw.length < 6 || pw.length > 200) throw bad('Пароль: от 6 символов');
    if (await getUser(email)) throw bad('Этот email уже зарегистрирован. Нажмите «Войти»', 409);
    const mail = require('./mail');
    if (mail.required()) await mail.checkCode(email, b.code);
    const legacy = await legacyLogin(email, pw);
    const u = legacy || { id: crypto.randomUUID(), email, pass: hash(pw) };
    if (!legacy) await putUser(u);
    return ok({ token: sign(u), user: { id: u.id, email } });
  },
  // Шаг 1 регистрации: отправить код на почту (работает при REQUIRE_CODE=1)
  async signup_code(b) {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(email)) throw bad('Некорректный email');
    if (await getUser(email)) throw bad('Этот email уже зарегистрирован. Нажмите «Войти»', 409);
    await require('./mail').sendCode(email);
    return ok({ sent: true });
  },
  async login(b) {
    const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
    if (throttled(email)) throw bad('Слишком много попыток. Подождите 10 минут', 429);
    let u = await getUser(email);
    if (u) { if (!check(pw, u.pass)) u = null; } else u = await legacyLogin(email, pw);
    if (!u) { fail(email); throw bad('Invalid login credentials', 401); }
    return ok({ token: sign(u), user: { id: u.id, email } });
  },
  async pull(b, me) { return ok({ row: await getData(me.id) }); },
  async push(b, me) {
    if (!b.data || typeof b.data !== 'object') throw bad('no data');
    if (JSON.stringify(b.data).length > 400000) throw bad('too large', 413);
    return ok({ updated_at: new Date(await putData(me.id, b.data)).toISOString() });
  },
};

module.exports.handler = async (event) => {
  const origin = (event.headers && (event.headers.Origin || event.headers.origin)) || '';
  const h = { 'content-type': 'application/json', 'access-control-allow-origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'access-control-allow-headers': 'content-type', vary: 'origin' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: h, body: '' };
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}';
    const b = JSON.parse(raw), fn = actions[b.a];
    if (!fn) throw bad('unknown action', 404);
    let me = null;
    if (b.a === 'pull' || b.a === 'push') { me = verify(b.token); if (!me) throw bad('unauthorized', 401); }
    return { statusCode: 200, headers: h, body: JSON.stringify(await fn(b, me)) };
  } catch (e) {
    const c = e.code && Number.isInteger(e.code) ? e.code : 500;
    if (c === 500) console.error(e && e.stack || e);
    return { statusCode: c, headers: h, body: JSON.stringify({ ok: false, error: c === 500 ? 'server error' : e.message }) };
  }
};

module.exports._ = { q, verify, getUser, ok, bad, TypedValues, E };
