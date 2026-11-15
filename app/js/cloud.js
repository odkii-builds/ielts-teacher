/* Облако: собственный API (Yandex Cloud Function + YDB, серверы в РФ). Токен — в localStorage.
 * Интерфейс совместим с прежним: signIn/signUp/signOut/session/onAuth/pull/push. Запросы — простые POST (text/plain), без preflight. */
window.Cloud = (function () {
  'use strict';
  const API = 'https://functions.yandexcloud.net/d4ea11hmfpfku2eldtqo';
  const TK = 'ielts_tok';
  const subs = [];
  let lastSent = '';
  const tok = () => { try { return localStorage.getItem(TK); } catch (e) { return null; } };
  function who(t) {
    try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.exp > Date.now() ? { id: p.sub, email: p.em } : null; } catch (e) { return null; }
  }
  async function call(a, body) {
    let r;
    try { r = await fetch(API, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(Object.assign({ a }, body)) }); }
    catch (e) { throw new Error('Нет связи'); }
    let j = {}; try { j = await r.json(); } catch (e) { /* ignore */ }
    if (r.status === 401 && body && body.token) { out(); }
    if (!r.ok || !j.ok) throw new Error(j.error || 'Ошибка ' + r.status);
    return j;
  }
  function out() { try { localStorage.removeItem(TK); } catch (e) { /* ignore */ } subs.forEach((f) => f('SIGNED_OUT', null)); }
  async function auth(a, email, password, code) {
    try {
      const j = await call(a, { email, password, code });
      try { localStorage.setItem(TK, j.token); } catch (e) { /* ignore */ }
      const session = { user: j.user, access_token: j.token };
      subs.forEach((f) => f('SIGNED_IN', session));
      return { data: { session }, error: null };
    } catch (e) { return { data: { session: null }, error: e }; }
  }
  return {
    available: () => true,
    async session() { const t = tok(), u = t && who(t); return u ? { user: u, access_token: t } : null; },
    signIn: (email, password) => auth('login', email, password),
    signUp: (email, password, code) => auth('signup', email, password, code),
    // Шаг 1 регистрации: сервер сам решает, нужен ли код (required) и отправляет письмо
    async signupCode(email) { return call('signup_code', { email }); },
    async signOut() { out(); },
    onAuth: (fn) => { subs.push(fn); },
    // Права и баланс ИИ-проверок — всегда с сервера (источник истины)
    async me() { return (await call('me', { token: tok() })).ent; },
    // Лист ожидания клуба: join=true встаёт в очередь (повтор безопасен), join=false только статус
    async clubWait(join) { return call('club_wait', { token: tok(), join: !!join }); },
    async pull() {
      const j = await call('pull', { token: tok() });
      return j.row || null;
    },
    async push(uid, obj) {
      const s = JSON.stringify(obj);
      if (s === lastSent) return; // ничего не изменилось — не тратим запрос
      await call('push', { token: tok(), data: obj });
      lastSent = s;
    },
  };
})();
