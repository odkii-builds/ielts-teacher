'use strict';
/* Лимиты частоты запросов. Счётчики в таблице rl (см. schema.sql): ключ = действие + хэш (адрес, почта или id), окно фиксированной длины.
 * Почты и адреса в таблицу в открытом виде не пишутся. */
const crypto = require('crypto');
const MIN = 60000, HOUR = 3600000;
// действие: [максимум запросов, длина окна в мс]
const LIMITS = {
  login: [10, 10 * MIN], signup_code_email: [3, 10 * MIN], signup_code_ip: [10, HOUR],
  review: [6, HOUR], promo_check: [20, HOUR], checkout: [10, HOUR], groq_ping: [6, HOUR],
};
function hit(st, now, max, win) {
  const w = Math.floor(now / win);
  const s = st && st.w === w ? { w, n: st.n + 1 } : { w, n: 1 };
  return { ok: s.n <= max, state: s };
}
const key = (name, parts) => name + ':' + crypto.createHash('sha256').update(JSON.stringify(parts.map((x) => String(x).toLowerCase()))).digest('hex').slice(0, 32);
const num = (x) => (x && x.toNumber ? x.toNumber() : Number(x || 0));

// Проверить и увеличить счётчик. soft: если база недоступна, запрос пропускаем (для входа и регистрации, чтобы сбой счётчика не закрыл вход).
async function limit(name, parts, opt) {
  const L = LIMITS[name]; if (!L) throw new Error('unknown limit ' + name);
  const { inTx, TypedValues, bad } = require('./index')._, { logErr } = require('./security');
  const k = { $k: TypedValues.utf8(key(name, parts)) }, now = Date.now();
  let pass;
  try {
    pass = await inTx(async (run) => {
      const r = await run('DECLARE $k AS Utf8; SELECT w, n FROM rl WHERE k = $k;', k);
      const h = hit(r[0] ? { w: num(r[0].w), n: num(r[0].n) } : null, now, L[0], L[1]);
      if (h.ok) await run('DECLARE $k AS Utf8; DECLARE $w AS Uint64; DECLARE $n AS Uint64; UPSERT INTO rl (k, w, n) VALUES ($k, $w, $n);', { ...k, $w: TypedValues.uint64(h.state.w), $n: TypedValues.uint64(h.state.n) });
      return h.ok;
    });
  } catch (e) { if (opt && opt.soft) { logErr('ratelimit skipped', e); return; } throw e; }
  if (!pass) throw bad('Слишком много запросов, подождите', 429);
}
module.exports = { hit, key, limit, LIMITS };
