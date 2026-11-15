'use strict';
const test = require('node:test'), assert = require('node:assert');
const S = require('../backend/yc/security');
test('redact: токены, ключи, почты', () => {
  const s = S.redact('err eyJabc.def.ghi key gsk_ABC123 mail a.b@gmail.com ' + 'x'.repeat(500));
  assert.ok(!/eyJabc|gsk_ABC123|a\.b@gmail/.test(s)); assert.ok(s.length < 300);
});
test('redact: заголовок Authorization и пустые значения', () => {
  assert.ok(!/s3cr3t/.test(S.redact('authorization: Bearer s3cr3t.value-1')));
  assert.equal(S.redact(null), ''); assert.equal(S.redact(undefined), '');
  assert.ok(S.redact('x'.repeat(5000), 800).length <= 800);
});
test('origins: только точные адреса, без звёздочки', () => {
  assert.deepEqual(S.origins('https://a.ru, https://b.vercel.app ,*,http://evil.com,javascript:1'), ['https://a.ru', 'https://b.vercel.app']);
  assert.deepEqual(S.origins(''), ['https://ielts.odkii-builds.ru']);
  assert.deepEqual(S.origins('*'), ['https://ielts.odkii-builds.ru']);
  assert.deepEqual(S.origins('http://localhost:8080'), ['http://localhost:8080']);
});
test('headers: чужой origin не отражается, ответы не кэшируются', () => {
  const L = ['https://a.ru', 'https://b.ru'];
  assert.equal(S.headers('https://b.ru', L)['access-control-allow-origin'], 'https://b.ru');
  const h = S.headers('https://evil.com', L);
  assert.equal(h['access-control-allow-origin'], 'https://a.ru');
  assert.equal(h['cache-control'], 'no-store'); assert.equal(h['x-content-type-options'], 'nosniff');
});
test('rawBody: размер тела ограничен', () => {
  assert.equal(S.rawBody({ body: '{"a":"me"}' }), '{"a":"me"}');
  assert.equal(S.rawBody({}), '{}');
  assert.equal(S.rawBody({ isBase64Encoded: true, body: Buffer.from('{"a":1}').toString('base64') }), '{"a":1}');
  assert.throws(() => S.rawBody({ body: 'x'.repeat(S.MAX_PUSH + 1) }), (e) => e.code === 413);
  assert.throws(() => S.rawBody({ isBase64Encoded: true, body: 'A'.repeat(S.MAX_PUSH * 2) }), (e) => e.code === 413);
});
test('tooBig: большое тело разрешено только для сохранения данных', () => {
  const big = 'x'.repeat(S.MAX_BODY + 1);
  assert.equal(S.tooBig(big, 'push'), false); assert.equal(S.tooBig(big, 'review'), true); assert.equal(S.tooBig('{}', 'login'), false);
});
test('clientIp: только из контекста запроса, заголовкам не верим', () => {
  assert.equal(S.clientIp({ requestContext: { identity: { sourceIp: '1.2.3.4' } }, headers: { 'X-Forwarded-For': '9.9.9.9' } }), '1.2.3.4');
  assert.equal(S.clientIp({ headers: { 'X-Forwarded-For': '9.9.9.9' } }), '');
  assert.equal(S.clientIp(null), '');
});
