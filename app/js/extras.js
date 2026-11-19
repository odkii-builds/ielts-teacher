/* Экраны: набор в клуб, слова из Reading в карточки, диагностика слов. */
(function () {
  'use strict';
  const N = window.Next = { views: {}, more: [['diag', 'Диагностика слов', '🔍', 'Какие слова ты знаешь на самом деле']], after: function () {}, };

  const C = () => window.Ctx;
  const esc = (s) => C().esc(s);
  const CLUB = { spots: 3, dm: 'https://ig.me/m/odkii.builds' };
  const CLUB_CONFIRM_SECONDS = 15;
  const ST = { unk: 'Не знаю значение', pas: 'Понимаю, но не использую', str: 'Не понимаю конструкцию' };
  const DST = { use: 'Знаю и использую', some: 'Иногда использую', pas: 'Понимаю, но не употребляю', fgt: 'Забыл', new: 'Вижу впервые', unsure: 'Затрудняюсь' };
  const KIND = { t2: 'Task 2', t1: 'Task 1', gt: 'Письмо' };
  const S = () => { const p = C().P(); const n = p.nx = p.nx || {}; n.marks = n.marks || []; n.diag = n.diag || {}; n.hideW = n.hideW || 0; n.hideTg = n.hideTg || 0; return n; };
  const copy = (t, msg) => {
    const ok = () => C().toast(msg || 'Скопировано');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => C().toast('Не удалось скопировать'));
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { C().toast('Не удалось скопировать'); } ta.remove(); }
  };
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rng = (o) => (o.low === o.high ? o.low.toFixed(1) : o.low.toFixed(1) + '–' + o.high.toFixed(1));


  // ---------- баннер набора в клуб ----------
  // Ник Telegram «@ник», без пробелов (5–32 символа: латиница, цифры, «_», первая — буква). Правило то же, что в backend/yc/tg.js.
  const tgNorm = (s) => { let t = String(s == null ? '' : s).trim().replace(/^(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)\/?$/i, '$1'); if (!t) return ''; if (t[0] !== '@') t = '@' + t; return /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(t) ? t : ''; };
  // В очереди, но Telegram ещё не указан: просим добавить (баннер и окно клуба)
  const needTg = () => { const s = S(); return !!s.wl && !(s.wls && s.wls.tg); };
  function bannerHtml() {
    const inq = S().wl, nt = needTg();
    const title = inq ? (nt ? 'Добавь свой Telegram' : 'Вы в листе ожидания') : 'Клуб тебе подходит?';
    const sub = inq ? (nt ? 'Чтобы мы могли написать тебе, когда появятся свободные места.' : 'Дадим знать, когда откроем места.') : 'Прочитай, как всё устроено, и подтверди участие.';
    const label = inq ? (nt ? 'Добавить Telegram' : 'Вы в очереди ✓') : 'Подтвердить участие';
    return '<div class="nbanner" id="nbn"><button class="nb-x" id="nbx" aria-label="Скрыть">×</button><img class="nb-i" src="img/club-w.jpg" alt="IELTS Teacher Club" width="768" height="512" decoding="async">' +
      '<div class="nb-c"><span class="nb-tag">Набор закрыт</span><b class="nb-t">' + title + '</b><span class="nb-s">' + sub + '</span>' +
      '<button class="btn sm nb-b" id="nbo" style="' + (inq && !nt ? '' : 'background:linear-gradient(110deg,#0045fd,#3d9bff,#ff5fa2);color:#fff;') + '">' + label + '</button></div></div>';
  }
  function clubSheet() {
    const mask = (em) => { const m = /^(.)[^@]*(@.+)$/.exec(String(em || '')); return m ? m[1] + '***' + m[2] : ''; };
    const row = (path, title, detail) => '<div class="rowi"><svg class="i" aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" style="flex:none;color:var(--acc)"><path d="' + path + '"/></svg><div class="grow"><b>' + title + '</b><div class="mut">' + detail + '</div></div></div>';
    const head = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2 style="margin:0">IELTS Teacher Club</h2><span class="chip">Места заняты</span></div><p class="mut">Закрытая группа для регулярной подготовки</p><div class="list">' +
      row('M4 6h16v15H4z M8 3v5m8-5v5M4 10h16m-12 5 3 3 5-6', 'Дисциплина', 'Чек-ины помогают заниматься регулярно') +
      row('M14 4H5v16h14v-8M10 15l1-4 8-8 3 3-8 8z', 'Обратная связь', 'Разбор показывает, где именно теряются баллы') +
      row('M4 4h13v10H9l-5 4z M10 17h6l4 4V8', 'Живое общение', 'Небольшая группа, вопросы и общий созвон') +
      row('M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z', 'Пробуешь новое раньше других', 'Доступ к функциям IELTS Teacher до релиза') +
      '</div><p class="mut">3 дня без чек-инов или 2 пропущенных созвона подряд — место переходит следующему.</p>';
    const form = (val, btnId, btnLabel, timed) => '<div style="margin-top:14px"><label for="nwt" style="display:block;font-weight:600;margin-bottom:6px">Telegram</label>' +
      '<input id="nwt" type="text" placeholder="@nickname" value="' + esc(val || '') + '" maxlength="64" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done">' +
      '<div class="mut" id="nwe" style="min-height:18px;margin-top:6px">Введи @ник или ссылку t.me/ник.</div></div>' +
      '<div class="stack" style="margin-top:8px"><button class="btn p" id="' + btnId + '" disabled>' + (timed ? btnLabel + ' · ' + CLUB_CONFIRM_SECONDS + ' сек' : btnLabel) + '</button></div>';
    const draw = (st) => {
      const joined = !!(st && st.joined), tg = joined && st.tg ? st.tg : '', editing = !!(st && st.edit);
      let body;
      if (joined) {
        const card = '<div class="card" style="margin-top:14px"><b id="nwpos">' + (st.pos ? 'Вы в очереди · №' + st.pos + ' из ' + st.total : 'Вы в очереди') + '</b><div class="mut" style="margin-top:4px">Когда откроем места, дадим знать в приложении, на e-mail аккаунта' + (st.email ? ' (' + esc(st.email) + ')' : '') + ' и в Telegram.</div>' +
          (tg && !editing ? '<div style="margin-top:10px"><span class="mut">Telegram:</span> <b id="nwtg">' + esc(tg) + '</b> <button class="btn sm" id="nwed" style="margin-left:6px">Изменить</button></div>' : '') + '</div>';
        if (!tg) body = card + '<p class="mut" style="margin:14px 0 0">Добавьте Telegram, чтобы мы могли написать вам, если появятся свободные места.</p>' + form('', 'nws', 'Сохранить') + '<div class="stack" style="margin-top:8px"><button class="btn" id="nwc">Закрыть</button></div>';
        else if (editing) body = card + form(tg, 'nws', 'Сохранить') + '<div class="stack" style="margin-top:8px"><button class="btn" id="nwx">Отмена</button></div>';
        else body = card + '<div class="stack" style="margin-top:12px"><button class="btn" id="nwc">Закрыть</button></div>';
      } else body = '<p class="mut" style="margin:14px 0 0">Подтверждение добавит тебя в лист ожидания.</p>' + form('', 'nwj', 'Подтвердить участие', true) +
        '<p class="mut" style="margin:10px 0 0;font-size:12px">Подтверждая участие, ты принимаешь правила активности и соглашаешься, что мы напишем тебе в Telegram и на e-mail, когда откроется набор.</p>';
      C().openSheet(head + body, (el) => {
        const j = el.querySelector('#nwj'), sv = el.querySelector('#nws'), c = el.querySelector('#nwc'), x = el.querySelector('#nwx'), ed = el.querySelector('#nwed');
        const inp = el.querySelector('#nwt'), er = el.querySelector('#nwe'); const go = j || sv;
        let wait = j ? CLUB_CONFIRM_SECONDS : 0;
        const hint = er ? er.textContent : '';
        if (c) c.onclick = () => C().closeSheet();
        if (x) x.onclick = () => draw(Object.assign({}, st, { edit: false }));
        if (ed) ed.onclick = () => draw(Object.assign({}, st, { edit: true }));
        if (inp && go) {
          const fail = (m) => { er.textContent = m; er.style.color = '#dc2626'; };
          const countdown = () => {
            if (!j) return;
            j.textContent = wait > 0 ? 'Подтвердить участие · ' + wait + ' сек' : 'Подтвердить участие';
          };
          const check = () => {
            const v = inp.value.trim(), ok = !!tgNorm(v);
            go.disabled = !ok || wait > 0;
            if (!v || ok) { er.textContent = hint; er.style.color = ''; } else fail('Проверьте формат: @ник, 5–32 символа, латиница, цифры и «_», без пробелов');
            return ok;
          };
          inp.oninput = check; inp.onkeydown = (e) => { if (e.key === 'Enter' && !go.disabled) { e.preventDefault(); go.click(); } };
          if (j) {
            countdown();
            const timer = setInterval(() => {
              if (!document.body.contains(j)) { clearInterval(timer); return; }
              wait = Math.max(0, wait - 1); countdown(); check();
              if (!wait) clearInterval(timer);
            }, 1000);
          }
          check();
          if (editing || (joined && !tg)) setTimeout(() => inp.focus(), 380);
          go.onclick = async () => {
            if (wait > 0 || inp.disabled) return;
            const v = tgNorm(inp.value); if (!v) { check(); return; }
            const label = go.textContent; go.disabled = true; go.textContent = j ? 'Записываю…' : 'Сохраняю…'; inp.disabled = true;
            try {
              const r = await window.Cloud.clubWait(!!j, v);
              if (!r.joined) { S().wl = 0; S().wls = null; C().save(); draw(null); return; }
              S().wl = 1; const u = await window.Cloud.session();
              S().wls = { pos: r.pos, total: r.total, email: u ? mask(u.user.email) : '', tg: r.tg || v }; C().save();
              draw(Object.assign({ joined: true }, S().wls));
            } catch (er2) {
              inp.disabled = false; go.disabled = false; go.textContent = label;
              fail(/Нет связи/.test(er2.message) ? 'Нет связи. Проверьте интернет и попробуйте ещё раз.' : (/Telegram/.test(er2.message) ? er2.message : 'Не получилось сохранить. Попробуйте чуть позже.'));
            }
          };
        }
      });
    };
    // уже в очереди: сразу рисуем итоговый вид (из кэша), без мигания «Встать в очередь»; цифры обновляем на месте
    draw(S().wl ? Object.assign({ joined: true }, S().wls || {}) : null);
    if (S().wl) window.Cloud.clubWait(false).then(async (r) => {
      if (!r.joined) { S().wl = 0; S().wls = null; C().save(); draw(null); return; }
      const had = !!(S().wls && S().wls.tg);
      const u = await window.Cloud.session(); S().wls = { pos: r.pos, total: r.total, email: u ? mask(u.user.email) : '', tg: r.tg || '' }; C().save();
      if (!had && r.tg) { draw(Object.assign({ joined: true }, S().wls)); return; } // Telegram уже есть на сервере (добавлен с другого устройства)
      const el = document.getElementById('nwpos'); if (el) el.textContent = 'Вы в очереди · №' + r.pos + ' из ' + r.total;
    }).catch(() => {});
  }
  function bindBanner(v) {
    const b = v.querySelector('#nbn'); if (!b) return;
    v.querySelector('#nbo').onclick = clubSheet;
    // «Добавь Telegram» скрываем на 2 дня, обычный баннер на 7
    v.querySelector('#nbx').onclick = () => { if (needTg()) S().hideTg = Date.now() + 2 * 864e5; else S().hideW = Date.now() + 7 * 864e5; C().save(); b.remove(); };
  }

  // ---------- Reading: выделил слово — оно попало в карточки на повторение ----------
  const bar = document.createElement('div'); bar.className = 'selbar'; bar.hidden = true; document.body.appendChild(bar);
  function selInfo() {
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0); const a = r.commonAncestorContainer; const el = a.nodeType === 1 ? a : a.parentElement;
    const host = el && el.closest && el.closest('.rtext'); if (!host) return null;
    const text = sel.toString().replace(/\s+/g, ' ').trim(); if (!text || text.length > 90 || text.split(' ').length > 8) return null;
    const para = (el.closest('p') || host).textContent.replace(/^[A-Z]\s+/, '');
    const sents = para.split(/(?<=[.!?])\s+/); const ctx = sents.find((s) => s.includes(text)) || para.slice(0, 200);
    return { text, ctx: ctx.trim() };
  }
  const markOf = (src, text) => S().marks.find((x) => x.src === src && x.text.toLowerCase() === text.toLowerCase());
  // карточка слова: по ссылке cid, а для старых меток без cid — по самому слову среди своих карточек
  function cardOf(mk) {
    const c = C(); const have = c.P().cards.some((x) => x.id === mk.cid);
    if (have) return mk.cid;
    const id = c.findCardId(mk.text); if (id) { mk.cid = id; c.save(); return id; }
    return null;
  }
  async function addMark(info, st) {
    const m = /^#read\/(.+)$/.exec(location.hash); if (!m) return;
    const s = S(); const key = info.text.toLowerCase();
    let mk = markOf(m[1], info.text);
    if (mk) mk.st = st; else { mk = { id: C().uid(), text: info.text, ctx: info.ctx, st, src: m[1], date: C().today() }; s.marks.push(mk); }
    window.getSelection().removeAllRanges(); bar.hidden = true; decorate(document.getElementById('view'));
    const r = await C().addFromReading(info.text, info.ctx);
    if (r !== 'dup') { mk.cid = r; C().save(); showDel(mk); return; }
    if (cardOf(mk)) { C().toast('Уже есть в карточках'); showDel(mk); } else C().toast('Уже есть в карточках');
  }
  let delT = 0;
  function showDel(mk) {
    bar.dataset.mode = 'del'; bar.dataset.mid = mk.id;
    bar.innerHTML = '<div class="sb-w">«' + esc(mk.text) + '» добавлено в карточки</div><div class="sb-b"><button id="ndel">Удалить из карточек</button><button id="nkeep">Оставить</button></div>';
    bar.hidden = false; clearTimeout(delT); delT = setTimeout(hideDel, 8000);
    bar.querySelector('#nkeep').onclick = () => { window.getSelection().removeAllRanges(); hideDel(); };
    bar.querySelector('#ndel').onclick = () => {
      const s = S(); const cid = cardOf(mk); s.marks = s.marks.filter((x) => x.id !== mk.id); if (cid) C().removeCard(cid); C().save(); window.getSelection().removeAllRanges();
      document.querySelectorAll('.rtext mark.hl').forEach((el) => { if (el.textContent.toLowerCase() === mk.text.toLowerCase()) el.replaceWith(document.createTextNode(el.textContent)); });
      const h = document.querySelector('.rtext'); if (h) h.normalize(); hideDel(); C().toast('Удалено из карточек');
    };
  }
  function hideDel() { clearTimeout(delT); delete bar.dataset.mode; delete bar.dataset.mid; bar.hidden = true; }
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.rtext mark.hl'); if (!el || !/^#read\//.test(location.hash)) return;
    const m = /^#read\/(.+)$/.exec(location.hash); const mk = markOf(m[1], el.textContent);
    if (mk && cardOf(mk)) showDel(mk);
  });
  let selT = 0;
  function refreshBar() {
    if (!/^#read\//.test(location.hash)) { hideDel(); return; }
    const i = selInfo();
    if (bar.dataset.mode === 'del' && !i) return;
    if (i) { const m = /^#read\/(.+)$/.exec(location.hash); const mk = m && markOf(m[1], i.text); if (mk && cardOf(mk)) { if (bar.dataset.mid !== mk.id || bar.hidden) showDel(mk); return; } }
    delete bar.dataset.mode; delete bar.dataset.mid;
    if (!i) { bar.hidden = true; return; }
    bar.innerHTML = '<div class="sb-w">«' + esc(i.text) + '» → в карточки</div><div class="sb-b">' + Object.keys(ST).map((k) => '<button data-k="' + k + '">' + ST[k] + '</button>').join('') + '</div>';
    bar.hidden = false;
    bar.querySelectorAll('button').forEach((b) => { b.onpointerdown = (e) => e.preventDefault(); b.onclick = () => { addMark(selInfo() || i, b.dataset.k); }; });
  }
  document.addEventListener('selectionchange', () => { clearTimeout(selT); selT = setTimeout(refreshBar, 120); });
  ['touchend', 'pointerup', 'mouseup'].forEach((ev) => document.addEventListener(ev, () => { clearTimeout(selT); selT = setTimeout(refreshBar, 250); }, { passive: true }));
  function decorate(v) {
    const m = /^#read\/(.+)$/.exec(location.hash); const host = v.querySelector('.rtext'); if (!m || !host) return;
    const marks = S().marks.filter((x) => x.src === m[1]); if (!marks.length) return;
    const re = new RegExp('(' + marks.map((x) => reEsc(x.text)).sort((a, b) => b.length - a.length).join('|') + ')', 'gi');
    const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => {
      if (n.parentElement.closest('mark') || !re.test(n.nodeValue)) { re.lastIndex = 0; return; } re.lastIndex = 0;
      const f = document.createDocumentFragment(); n.nodeValue.split(re).forEach((part, i) => {
        if (i % 2) { const mk = document.createElement('mark'); mk.className = 'hl'; mk.textContent = part; f.appendChild(mk); } else f.appendChild(document.createTextNode(part));
      }); n.replaceWith(f);
    });
  }

  // ---------- Диагностика слов ----------
  const dg = { dom: '', batch: [] };
  function nextBatch() {
    const c = C(); const s = S(); const pool = c.DECK.filter((w) => !s.diag[w.id] && (!dg.dom || w.dom === dg.dom) && (!w.cef || /^(B1|B2|C1)$/.test(w.cef)));
    const out = []; for (let i = 0; i < 10 && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); dg.batch = out;
  }
  const queued = () => Object.keys(S().diag).map((k) => S().diag[k]).filter((d) => d.s !== 'use' && !d.q);
  N.views.diag = function () {
    const c = C(); const s = S(); const doms = {}; c.DECK.forEach((w) => { if (w.dom) doms[w.dom] = (doms[w.dom] || 0) + 1; });
    if (!dg.batch.length) nextBatch();
    const nd = Object.keys(s.diag).length; const qn = queued().length;
    let h = c.head('Диагностика слов', 'Отметь, как ты на самом деле обращаешься со словом, и нужные попадут в повторение') +
      '<div class="chips" style="margin-bottom:12px"><button data-dom="" class="' + (dg.dom ? '' : 'on') + '">Все темы</button>' + Object.keys(doms).sort((a, b) => doms[b] - doms[a]).slice(0, 14).map((d) => '<button data-dom="' + esc(d) + '" class="' + (dg.dom === d ? 'on' : '') + '">' + esc(d) + '</button>').join('') + '</div>' +
      '<div class="stack">' + dg.batch.map((w) => {
        const cur = s.diag[w.id];
        return '<div class="card dw' + (cur ? ' done' : '') + '" data-w="' + w.id + '"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:19px">' + esc(w.t) + '</b><span class="chip">' + esc(w.pos || '') + '</span></div><div class="mut" style="margin:4px 0 10px">' + esc(String(w.ex || '').replace(/\[\[(.*?)\]\]/g, '$1')) + '</div>' +
          (cur ? '<div class="mut tr">' + esc(w.ru) + '</div>' : '') +
          '<div class="dst">' + Object.keys(DST).map((k) => '<button data-s="' + k + '" class="' + (cur && cur.s === k ? 'on' : '') + '">' + DST[k] + '</button>').join('') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="stack" style="margin-top:14px"><button class="btn" id="nmore">Ещё 10 слов</button><button class="btn p" id="nrep"' + (qn ? '' : ' disabled') + '>' + (qn ? 'Добавить в повторение: ' + qn : 'Отметь слова, которые нужно повторить') + '</button></div>' +
      '<p class="mut" style="margin-top:12px">Отмечено слов: ' + nd + '. Повторение идёт в обычных карточках: слово, пример и ввод в предложении.</p>';
    c.paint(h);
    c.$$('[data-dom]').forEach((b) => { b.onclick = () => { dg.dom = b.dataset.dom; nextBatch(); N.views.diag(); }; });
    c.$$('.dw').forEach((card) => card.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => {
      const w = dg.batch.find((x) => x.id === card.dataset.w); const prev = s.diag[w.id]; s.diag[w.id] = { s: b.dataset.s, t: w.t, ex: w.ex, ru: w.ru, date: c.today(), q: prev && prev.s === b.dataset.s ? prev.q : 0 }; c.save();
      card.classList.add('done'); card.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
      if (!card.querySelector('.tr')) card.querySelector('.dst').insertAdjacentHTML('beforebegin', '<div class="mut tr">' + esc(w.ru) + '</div>');
      const n = queued().length; const nb = c.$('#nrep'); nb.disabled = !n; nb.textContent = n ? 'Добавить в повторение: ' + n : 'Отметь слова, которые нужно повторить';
    }; }));
    c.$('#nmore').onclick = () => { nextBatch(); N.views.diag(); window.scrollTo(0, 0); };
    c.$('#nrep').onclick = () => {
      const list = queued(); const n = c.addDiagWords(list.map((d) => ({ t: d.t, ru: d.ru, ex: String(d.ex || '').replace(/\[\[|\]\]/g, '') })));
      list.forEach((d) => { d.q = 1; }); c.save(); c.toast(n ? 'В карточки добавлено: ' + n : 'Эти слова уже есть в карточках'); N.views.diag();
    };
  };

  N.views['club-invite'] = async function () {
    const ctx = C();
    ctx.paint(ctx.head('Приглашение в клуб', 'IELTS Teacher Club') + '<p id="inviteStatus" role="status">Проверяем приглашение…</p><button id="acceptInvite" class="btn p" hidden>Подтвердить участие</button>');
    const status = document.querySelector('#inviteStatus'), button = document.querySelector('#acceptInvite');
    async function refresh(accept) {
      button.disabled = true;
      try {
        const {until,accepted} = await window.Cloud.clubInvitation(accept);
        const available = until > Date.now() && !accepted;
        status.textContent = accepted ? 'Ты подтвердил участие. Организатор увидит ответ в админке.' : available ? 'Подтверди участие до '+new Date(until).toLocaleString('ru-RU')+'.' : until ? 'Срок приглашения истёк.' : 'Приглашение ещё не выдано.';
        button.hidden = !available;
      } catch (error) {status.textContent = error.message;}
      finally {button.disabled = false;}
    }
    button.onclick = () => refresh(true);
    await refresh(false);
  };

  N.after = function (v) {
    const h = location.hash || '#today'; const p = C() && C().P(); if (!p) return; const s = S();
    if (/^#(today)?$/.test(h) && Date.now() > (needTg() ? s.hideTg : s.hideW)) { const hd = v.querySelector('.head'); if (hd) { hd.insertAdjacentHTML('afterend', bannerHtml()); bindBanner(v); } }
    if (/^#read\//.test(h)) decorate(v); else bar.hidden = true;
  };
})();
