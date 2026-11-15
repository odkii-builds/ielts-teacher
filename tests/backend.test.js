'use strict';
/* Сквозные проверки обработчика функции на подменённой базе: защита входа, разбор, списание, возврат, лимиты. */
const test = require('node:test'), assert = require('node:assert'), crypto = require('crypto');
Object.assign(process.env, { JWT_SECRET: 'test-secret', ADMIN_EMAILS: 'admin@gmail.com', ORIGIN: 'https://ielts.odkii-builds.ru,https://preview.vercel.app', REVIEW_OPEN: '1', GROQ_KEY: 'gsk_TESTKEY123', YDB_ENDPOINT: 'x', YDB_DATABASE: 'x' });
delete process.env.REVIEW_DAILY_MAX; delete process.env.FREE_LEGACY_BEFORE; delete process.env.GROQ_BASE;
const DB = require('./helpers/fake-ydb');
const { handler } = require('../backend/yc/main');
const { limit } = require('../backend/yc/ratelimit');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (id, email) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub: id, em: email, exp: Date.now() + 1e6 }); return h + '.' + p + '.' + crypto.createHmac('sha256', 'test-secret').update(h + '.' + p).digest('base64url'); };
const call = async (body, extra) => { const r = await handler(Object.assign({ httpMethod: 'POST', headers: { origin: 'https://ielts.odkii-builds.ru' }, body: typeof body === 'string' ? body : JSON.stringify(body), requestContext: { identity: { sourceIp: '10.0.0.1' } } }, extra)); return { code: r.statusCode, headers: r.headers, json: r.body ? JSON.parse(r.body) : null }; };
const essay = 'Nowadays, many people argue that university education must be free. Many students can not study because tuition fees are very expensive, and their parents has not enough money. ' + 'word '.repeat(40);
const groqJson = JSON.stringify({ band: 6, criteria: { TR: 6, CC: 6, LR: 6, GRA: 6 }, pull_down: [{ title: 'a', text: 'b' }], errors: [{ para: 1, wrong: 'can not', right: 'cannot', type: 'SP', rule: 'r' }, { para: 2, wrong: 'parents has', right: 'parents have', type: 'GRA', rule: 'r' }], weakest_para: 1, weakest_fixed: 'f', paras: [{ title: 't', note: 'n' }], band7_text: ['p'], band8_para: 'b8', vocab: [['a', 'b']], plan: [{ title: 't', gain: 'g', time: '5' }] });
let groq = 'ok', groqCalls = 0, lastGroqBody = '';
global.fetch = async (url, opt) => {
  groqCalls++; lastGroqBody = String(opt && opt.body || '');
  await new Promise((r) => setTimeout(r, 5));
  if (groq === 'fail') return { ok: false, status: 500, json: async () => ({ error: { code: 'boom', message: 'leak user@gmail.com gsk_SECRETKEY' } }), text: async () => '' };
  if (groq === 'throw') throw new Error('connect ETIMEDOUT to api for user@gmail.com with gsk_SECRETKEY');
  if (groq === 'junk') return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'не json' } }] }) };
  if (/\/models$/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'llama-3.3-70b-versatile' }] }) };
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: groqJson } }] }) };
};
const user = (id, o) => { const email = id + '@gmail.com'; DB.put('users', Object.assign({ email, id, pass: 'x', created: Date.now(), vf: 1 }, o)); return token(id, email); };
const ent = (id, o) => DB.put('ent', Object.assign({ id, credits: 0, prem: 0, ban: 0, free: 1, day: 0, dcount: 0, note: '' }, o));
const fresh = () => { DB.reset(); groq = 'ok'; groqCalls = 0; delete process.env.REVIEW_DAILY_MAX; delete process.env.FREE_LEGACY_BEFORE; };
const review = (t, o) => call(Object.assign({ a: 'review', token: t, kind: 't2', question: 'Topic', text: essay, goal: 7 }, o));

test('обработчик: заголовки, CORS, неизвестные действия, размер тела', async () => {
  fresh();
  const o = await handler({ httpMethod: 'OPTIONS', headers: { origin: 'https://evil.com' } });
  assert.equal(o.statusCode, 204); assert.equal(o.headers['access-control-allow-origin'], 'https://ielts.odkii-builds.ru'); assert.equal(o.headers['cache-control'], 'no-store'); assert.equal(o.headers['x-content-type-options'], 'nosniff');
  assert.equal((await call({ a: 'me' }, { headers: { origin: 'https://preview.vercel.app' } })).headers['access-control-allow-origin'], 'https://preview.vercel.app');
  assert.equal((await call({ a: 'nope' })).code, 404);
  for (const a of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal((await call({ a })).code, 404, a);
  assert.equal((await call('{not json')).code, 400);
  assert.equal((await call('null')).code, 404);
  assert.equal((await call({ a: 'login', email: 'a@gmail.com', password: 'x'.repeat(70000) })).code, 413);
  assert.equal((await call('x'.repeat(700000))).code, 413);
  for (const ev of [null, 'str', [], {}]) assert.ok((await handler(ev)).statusCode >= 400);
});
test('токены: без токена, подделка, чужой секрет, просроченный', async () => {
  fresh();
  const good = user('u1'); ent('u1');
  assert.equal((await call({ a: 'me', token: good })).code, 200);
  assert.equal((await call({ a: 'me' })).code, 401);
  assert.equal((await call({ a: 'me', token: good.slice(0, -2) + 'xx' })).code, 401);
  const [h, , sg] = good.split('.');
  assert.equal((await call({ a: 'me', token: h + '.' + b64({ sub: 'admin', em: 'admin@gmail.com', exp: Date.now() + 1e6 }) + '.' + sg })).code, 401);
  const p = b64({ sub: 'u1', em: 'u1@gmail.com', exp: Date.now() - 1 });
  assert.equal((await call({ a: 'me', token: h + '.' + p + '.' + crypto.createHmac('sha256', 'test-secret').update(h + '.' + p).digest('base64url') })).code, 401);
  for (const a of ['admin_list', 'admin_stats', 'admin_grant', 'club_list', 'groq_ping']) assert.equal((await call({ a, token: good, email: 'u1@gmail.com', credits: 99 })).code, 403, a);
  assert.equal(DB.get('ent', 'u1').credits, 0);
});
test('разбор: бесплатный даёт урезанный результат, списывает один раз, запись в реестре закрыта', async () => {
  fresh();
  const t = user('u1');
  const r = await review(t);
  assert.equal(r.code, 200); assert.equal(r.json.result.tier, 'free'); assert.equal(r.json.ent.free_left, 0);
  assert.ok(!('band7_text' in r.json.result) && !('vocab' in r.json.result) && !('plan' in r.json.result)); // платная часть не покидает сервер
  assert.equal(r.json.result.errors.length, 1); assert.equal(r.json.result.total_errors, 2);
  assert.deepEqual(DB.rows('reviews').map((x) => [x.kind, x.status]), [['free', 'done']]);
  assert.equal(DB.rows('budget')[0].n, 1);
  assert.ok(!/u1@gmail|"u1"/.test(lastGroqBody)); // в Groq не уходят почта и id
  const r2 = await review(t);
  assert.equal(r2.code, 402); assert.equal(groqCalls, 1); assert.equal(DB.rows('reviews').length, 1);
});
test('разбор: оплаченный даёт полный результат', async () => {
  fresh();
  const t = user('u1'); ent('u1', { credits: 2 });
  const r = await review(t);
  assert.equal(r.json.result.tier, 'paid'); assert.equal(r.json.ent.credits, 1); assert.equal(r.json.ent.free_left, 1); assert.equal(r.json.result.errors.length, 2);
});
test('разбор: сбой ИИ возвращает проверку, в логах нет ключей и почт', async () => {
  const logs = [], orig = console.error; console.error = (...a) => logs.push(a.join(' '));
  try {
    for (const mode of ['fail', 'throw', 'junk']) {
      fresh(); groq = mode;
      const t = user('u1'); ent('u1', { credits: 1, free: 0 });
      const r = await review(t);
      assert.equal(r.code, 502, mode); assert.ok(/возвращена/.test(r.json.error));
      assert.equal(DB.get('ent', 'u1').credits, 1, mode);
      assert.deepEqual(DB.rows('reviews').map((x) => x.status), ['refunded']);
    }
    fresh(); groq = 'fail';
    const tp = user('p1'); ent('p1', { prem: Date.now() + 864e5 });
    await review(tp); assert.equal(DB.get('ent', 'p1').dcount, 0);
    const tf = user('f1'); await review(tf); assert.equal(DB.get('ent', 'f1').free, 1);
  } finally { console.error = orig; }
  const all = logs.join('\n');
  assert.ok(logs.length > 0); assert.ok(!/gsk_|user@gmail|u1@gmail|university education/.test(all), all.slice(0, 300));
});
test('разбор: неподтверждённая почта не получает бесплатный, оплаченные работают; старые аккаунты по дате', async () => {
  fresh();
  const t = user('u1', { vf: 0 });
  assert.equal((await call({ a: 'me', token: t })).json.ent.free_left, 0);
  assert.equal((await review(t)).code, 402); assert.equal(groqCalls, 0); assert.equal(DB.rows('reviews').length, 0);
  ent('u1', { credits: 1 });
  assert.equal((await review(t)).json.result.tier, 'paid');
  process.env.FREE_LEGACY_BEFORE = String(Date.now() + 1000);
  assert.equal((await call({ a: 'me', token: t })).json.ent.free_left, 1);
  const t2 = user('u2', { vf: 0 }); assert.equal((await review(t2)).json.result.tier, 'free');
  fresh(); DB.breakTable('users'); // колонки vf ещё нет: бесплатный не выдаём, но запрос не падает
  const t3 = token('u3', 'u3@gmail.com'); ent('u3', {});
  const orig = console.error; console.error = () => {};
  try { assert.equal((await call({ a: 'me', token: t3 })).json.ent.free_left, 0); } finally { console.error = orig; }
});
test('разбор: 10 одновременных запросов при одной проверке дают ровно один успех', async () => {
  fresh();
  const t = user('u1'); ent('u1', { credits: 1, free: 0 });
  const rs = await Promise.all(Array.from({ length: 10 }, () => review(t)));
  const codes = rs.map((r) => r.code);
  assert.equal(codes.filter((c) => c === 200).length, 1, codes.join(','));
  assert.ok(codes.every((c) => [200, 402, 429, 503].includes(c)), codes.join(',')); // ни одного 500
  assert.equal(DB.get('ent', 'u1').credits, 0); assert.equal(groqCalls, 1); assert.equal(DB.rows('reviews').length, 1);
});
test('разбор: разные пользователи одновременно не мешают друг другу', async () => {
  fresh();
  const ts = Array.from({ length: 4 }, (_, i) => user('m' + i));
  const rs = await Promise.all(ts.map((t) => review(t)));
  assert.deepEqual(rs.map((r) => r.code), [200, 200, 200, 200]); assert.equal(DB.rows('budget')[0].n, 4);
});
test('разбор: дневной предохранитель останавливает без списания; бан; лимит частоты', async () => {
  fresh(); process.env.REVIEW_DAILY_MAX = '1';
  const a = user('a1'), b = user('b1');
  assert.equal((await review(a)).code, 200);
  const r = await review(b);
  assert.equal(r.code, 503); assert.equal(DB.get('ent', 'b1'), undefined); assert.equal(DB.rows('reviews').length, 1); assert.equal(groqCalls, 1);
  fresh();
  const z = user('z1'); ent('z1', { ban: 1, credits: 5 });
  assert.equal((await review(z)).code, 403); assert.equal(DB.get('ent', 'z1').credits, 5);
  fresh(); groq = 'fail';
  const orig = console.error; console.error = () => {};
  try {
    const t = user('u1'); ent('u1', { credits: 1, free: 0 });
    const codes = []; for (let i = 0; i < 8; i++) codes.push((await review(t)).code);
    assert.deepEqual(codes, [502, 502, 502, 502, 502, 502, 429, 429]); assert.equal(DB.get('ent', 'u1').credits, 1);
  } finally { console.error = orig; }
});
test('разбор: текст проверяется до списания, большой текст и мусор отклоняются', async () => {
  fresh();
  const t = user('u1');
  for (const text of ['short', 'word '.repeat(700), '', '\u0000'.repeat(100), '🙂'.repeat(3000)]) assert.equal((await review(t, { text })).code, 400);
  assert.equal(DB.rows('reviews').length, 0); assert.equal(groqCalls, 0); assert.equal(DB.get('ent', 'u1'), undefined);
});
test('зависший разбор: возвращается при следующем разборе и по таймеру, повторно не возвращается', async () => {
  fresh();
  const t = user('u1'); ent('u1', { credits: 0, free: 0 });
  DB.put('reviews', { uid: 'u1', id: 'old', kind: 'credit', status: 'pending', ts: Date.now() - 200000 });
  const r = await review(t); // возврат зависшего даёт проверку, она же тратится на новый разбор
  assert.equal(r.code, 200); assert.equal(DB.get('reviews', 'u1', 'old').status, 'refunded'); assert.equal(DB.get('ent', 'u1').credits, 0);
  fresh();
  user('u2'); ent('u2', { credits: 0, free: 0 }); user('u3'); ent('u3', { free: 0 });
  DB.put('reviews', { uid: 'u2', id: 'a', kind: 'credit', status: 'pending', ts: Date.now() - 200000 });
  DB.put('reviews', { uid: 'u3', id: 'b', kind: 'free', status: 'pending', ts: Date.now() - 1000 }); // свежий не трогаем
  const timer = { messages: [{ event_metadata: { event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage' }, details: { trigger_id: 't1' } }] };
  for (let i = 0; i < 3; i++) assert.equal((await handler(timer)).statusCode, 200);
  assert.equal(DB.get('ent', 'u2').credits, 1); assert.equal(DB.get('ent', 'u3').free, 0); assert.equal(DB.get('reviews', 'u3', 'b').status, 'pending');
  const t3 = token('u3', 'u3@gmail.com');
  assert.equal((await review(t3)).code, 429); // идёт другой разбор
});
test('лимит частоты: счётчик в базе, мягкий режим при сбое таблицы', async () => {
  fresh();
  for (let i = 0; i < 3; i++) await limit('signup_code_email', ['a@gmail.com']);
  await assert.rejects(() => limit('signup_code_email', ['A@gmail.com']), (e) => e.code === 429);
  await limit('signup_code_email', ['b@gmail.com']);
  assert.ok(DB.rows('rl').every((r) => !/gmail/.test(r.k)));
  DB.breakTable('rl');
  const orig = console.error; console.error = () => {};
  try { await limit('login', ['1.1.1.1', 'a@gmail.com'], { soft: true }); await assert.rejects(() => limit('review', ['u1'])); } finally { console.error = orig; }
});
test('вход: перебор пароля ограничен', async () => {
  fresh();
  const codes = []; for (let i = 0; i < 12; i++) codes.push((await call({ a: 'login', email: 'nobody@gmail.com', password: 'wrong' + i })).code);
  assert.ok(codes.slice(0, 8).every((c) => c === 401), codes.join(',')); assert.equal(codes[11], 429);
});
test('groq_ping: только админ, ключ не возвращается', async () => {
  fresh();
  const t = user('admin');
  const r = await call({ a: 'groq_ping', token: t });
  assert.equal(r.code, 200); assert.deepEqual([r.json.groq.reachable, r.json.groq.status, r.json.groq.key_set, r.json.groq.model_available], [true, 200, true, true]);
  assert.ok(!/gsk_/.test(JSON.stringify(r.json)));
  groq = 'throw'; const r2 = await call({ a: 'groq_ping', token: t });
  assert.equal(r2.json.groq.reachable, false); assert.ok(!/gsk_|user@gmail/.test(JSON.stringify(r2.json)));
});
