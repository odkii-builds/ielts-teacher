'use strict';
/* Отправка писем через Yandex Cloud Postbox (SESv2-совместимый API, подпись AWS SigV4) + коды подтверждения почты.
 * Env: PB_KEY_ID, PB_SECRET (статический ключ сервисного аккаунта), MAIL_FROM (по умолчанию noreply@mail.odkii-builds.ru),
 *      REQUIRE_CODE=1 — включить обязательное подтверждение при регистрации (пока не задано — всё работает как раньше).
 * Таблица codes: см. schema.sql. */
const crypto = require('crypto');
const E = process.env;
const HOST = 'postbox.cloud.yandex.net', REGION = 'ru-central1', SERVICE = 'ses';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hm = (k, s) => crypto.createHmac('sha256', k).update(s).digest();

async function send(to, subject, text, html) {
  const from = E.MAIL_FROM || 'IELTS Teacher <noreply@mail.odkii-builds.ru>';
  const body = JSON.stringify({ FromEmailAddress: from, Destination: { ToAddresses: [to] },
    Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' }, ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}) } } } });
  const path = '/v2/email/outbound-emails', amz = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''), day = amz.slice(0, 8);
  const hdrs = { 'content-type': 'application/json', host: HOST, 'x-amz-date': amz };
  const names = Object.keys(hdrs).sort(), signed = names.join(';');
  const canon = ['POST', path, '', names.map((n) => n + ':' + hdrs[n] + '\n').join(''), signed, sha(body)].join('\n');
  const scope = day + '/' + REGION + '/' + SERVICE + '/aws4_request';
  const sts = ['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n');
  const key = hm(hm(hm(hm('AWS4' + E.PB_SECRET, day), REGION), SERVICE), 'aws4_request');
  const auth = 'AWS4-HMAC-SHA256 Credential=' + E.PB_KEY_ID + '/' + scope + ', SignedHeaders=' + signed + ', Signature=' + hm(key, sts).toString('hex');
  const r = await fetch('https://' + HOST + path, { method: 'POST', headers: { 'content-type': hdrs['content-type'], 'x-amz-date': amz, authorization: auth }, body });
  if (!r.ok) throw new Error('postbox ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

const hcode = (email, code) => crypto.createHmac('sha256', E.JWT_SECRET).update(email + ':' + code).digest('hex');
const num = (x) => (x && x.toNumber ? x.toNumber() : Number(x || 0));
const bad = (m, c) => { const e = new Error(m); e.code = c || 400; return e; };

// Отправить 6-значный код. Не чаще раза в минуту на адрес.
async function sendCode(email, to) {
  const { q, TypedValues } = require('./index')._;
  if (!E.PB_KEY_ID || !E.PB_SECRET) throw bad('Почта временно недоступна', 503);
  const r = await q('DECLARE $e AS Utf8; SELECT last FROM codes WHERE email = $e;', { $e: TypedValues.utf8(email) });
  if (r[0] && Date.now() - num(r[0].last) < 60000) throw bad('Код уже отправлен. Повторить можно через минуту', 429);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await q('DECLARE $e AS Utf8; DECLARE $h AS Utf8; DECLARE $x AS Uint64; DECLARE $l AS Uint64; UPSERT INTO codes (email, h, exp, n, last) VALUES ($e, $h, $x, 0, $l);',
    { $e: TypedValues.utf8(email), $h: TypedValues.utf8(hcode(email, code)), $x: TypedValues.uint64(Date.now() + 600000), $l: TypedValues.uint64(Date.now()) });
  await send(to || email, 'Код подтверждения IELTS Teacher: ' + code,
    'Ваш код: ' + code + '\nОн действует 10 минут. Если вы не регистрировались в IELTS Teacher, просто проигнорируйте письмо.',
    '<div style="font-family:Arial,sans-serif;font-size:16px;color:#111"><p>Ваш код подтверждения:</p><p style="font-size:32px;letter-spacing:6px;font-weight:700">' + code + '</p><p style="color:#666">Код действует 10 минут. Если вы не регистрировались в IELTS Teacher, просто проигнорируйте письмо.</p></div>');
}

// Проверка кода (до 5 попыток, одноразовый).
async function checkCode(email, code) {
  const { q, TypedValues } = require('./index')._;
  const k = { $e: TypedValues.utf8(email) };
  const r = await q('DECLARE $e AS Utf8; SELECT h, exp, n FROM codes WHERE email = $e;', k);
  const c = r[0];
  if (!c || num(c.exp) < Date.now()) throw bad('Код устарел. Запросите новый', 400);
  if (num(c.n) >= 5) throw bad('Слишком много попыток. Запросите новый код', 429);
  const a = Buffer.from(hcode(email, String(code || '').trim())), b = Buffer.from(c.h);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await q('DECLARE $e AS Utf8; UPDATE codes SET n = n + 1 WHERE email = $e;', k);
    throw bad('Неверный код', 400);
  }
  await q('DECLARE $e AS Utf8; DELETE FROM codes WHERE email = $e;', k);
}

module.exports = { send, sendCode, checkCode, required: () => E.REQUIRE_CODE === '1' };
