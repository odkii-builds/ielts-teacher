'use strict';
/* Общие меры защиты: чистка логов, CORS и заголовки ответа, размер тела, адрес клиента. Без зависимостей. */
// В логи не должны попадать токены, ключи, почты и длинные тексты (эссе, ответы ИИ).
const redact = (x, n) => String(x == null ? '' : x)
  .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]').replace(/gsk_[\w-]+/g, '[key]')
  .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [key]')
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').slice(0, n || 240);
const logErr = (tag, e) => console.error(tag, redact(e && (e.stack || e.message) || e, 800));

const DEF_ORIGIN = 'https://ielts.odkii-builds.ru';
// ORIGIN: список точных адресов через запятую. Звёздочка и всё, что не похоже на адрес сайта, отбрасывается.
function origins(s) {
  const l = String(s || '').split(',').map((x) => x.trim()).filter((x) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(x) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(x));
  return l.length ? l : [DEF_ORIGIN];
}
const headers = (origin, list) => ({
  'content-type': 'application/json', 'access-control-allow-origin': list.includes(origin) ? origin : list[0],
  'access-control-allow-headers': 'content-type', vary: 'origin', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
});

// Размер тела: обычные действия до 60 КБ, сохранение данных пользователя (push) до 600 КБ (сами данные ограничены 400 КБ).
const MAX_BODY = 60000, MAX_PUSH = 600000;
const tooLarge = () => { const e = new Error('too large'); e.code = 413; return e; };
function rawBody(event) {
  const body = (event && event.body) || '';
  if (event && event.isBase64Encoded) {
    if (body.length > MAX_PUSH * 1.4) throw tooLarge();
    const raw = Buffer.from(body, 'base64').toString();
    if (raw.length > MAX_PUSH) throw tooLarge();
    return raw || '{}';
  }
  if (body.length > MAX_PUSH) throw tooLarge();
  return body || '{}';
}
const tooBig = (raw, action) => action !== 'push' && raw.length > MAX_BODY;

// Адрес клиента берём только из контекста запроса (его заполняет платформа). Заголовки подделываются.
const clientIp = (event) => String((event && event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp) || '');

module.exports = { redact, logErr, origins, headers, rawBody, tooBig, clientIp, MAX_BODY, MAX_PUSH, DEF_ORIGIN };
