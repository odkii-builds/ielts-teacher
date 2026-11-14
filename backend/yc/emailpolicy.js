'use strict';
/* Политика email при регистрации: только популярные почтовые сервисы, один человек = один ящик.
 * Работает только на сервере. Вход для уже существующих пользователей не ограничивается. */
const GROUPS = {
  'gmail.com': ['gmail.com', 'googlemail.com'],
  'yandex.ru': ['yandex.ru', 'yandex.com', 'ya.ru', 'yandex.kz', 'yandex.by', 'yandex.ua'],
  'icloud.com': ['icloud.com', 'me.com', 'mac.com'],
  'outlook.com': ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
  'proton.me': ['proton.me', 'protonmail.com', 'pm.me'],
  'mail.ru': ['mail.ru'], 'inbox.ru': ['inbox.ru'], 'list.ru': ['list.ru'], 'bk.ru': ['bk.ru'],
  'rambler.ru': ['rambler.ru'], 'yahoo.com': ['yahoo.com'],
};
const CANON = {};
Object.keys(GROUPS).forEach((c) => GROUPS[c].forEach((d) => { CANON[d] = c; }));
const RELAY = ['privaterelay.appleid.com'];

// Возвращает { ok:true, canon, raw } или { ok:false, msg }
function check(input) {
  const raw = String(input || '').trim().toLowerCase();
  const m = /^([^@\s]{1,64})@([^@\s]{1,255}\.[^@\s]{2,})$/.exec(raw);
  if (!m) return { ok: false, msg: 'Некорректный email' };
  let local = m[1]; const dom = m[2];
  if (RELAY.includes(dom)) return { ok: false, msg: 'Скрытые адреса Apple не подходят. Используйте свою основную почту (iCloud, Gmail, Яндекс, Mail.ru).' };
  const cd = CANON[dom];
  if (!cd) return { ok: false, msg: 'Регистрация доступна с почтой Gmail, Яндекс, Mail.ru, iCloud, Outlook, Proton, Rambler или Yahoo.' };
  local = local.split('+')[0];
  if (!local) return { ok: false, msg: 'Некорректный email' };
  if (cd === 'gmail.com') local = local.replace(/\./g, '');
  if (cd === 'yandex.ru') local = local.replace(/-/g, '.');
  return { ok: true, canon: local + '@' + cd, raw };
}
module.exports = { check };
