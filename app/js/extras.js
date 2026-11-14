/* Экраны: набор в клуб, слова из Reading в карточки, диагностика слов. */
(function () {
  'use strict';
  const N = window.Next = { views: {}, more: [['diag', 'Диагностика слов']], after: function () {}, };

  const C = () => window.Ctx;
  const esc = (s) => C().esc(s);
  const CLUB = { spots: 3, dm: 'https://ig.me/m/odkii.builds' };
  const ST = { unk: 'Не знаю значение', pas: 'Понимаю, но не использую', str: 'Не понимаю конструкцию' };
  const DST = { use: 'Знаю и использую', some: 'Иногда использую', pas: 'Понимаю, но не употребляю', fgt: 'Забыл', new: 'Вижу впервые', unsure: 'Затрудняюсь' };
  const KIND = { t2: 'Task 2', t1: 'Task 1', gt: 'Письмо' };
  const S = () => { const p = C().P(); const n = p.nx = p.nx || {}; n.marks = n.marks || []; n.diag = n.diag || {}; n.hideW = n.hideW || 0; return n; };
  const copy = (t, msg) => {
    const ok = () => C().toast(msg || 'Скопировано');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => C().toast('Не удалось скопировать'));
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { C().toast('Не удалось скопировать'); } ta.remove(); }
  };
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rng = (o) => (o.low === o.high ? o.low.toFixed(1) : o.low.toFixed(1) + '–' + o.high.toFixed(1));


  // ---------- баннер набора в клуб ----------
  function bannerHtml() {
    const inq = S().wl;
    return '<div class="nbanner" id="nbn"><button class="nb-x" id="nbx" aria-label="Скрыть">×</button><img class="nb-i" src="img/club.jpg" alt="IELTS Teacher Club" width="768" height="512" style="filter:saturate(.75) brightness(.85)">' +
      '<div class="nb-c"><span class="nb-tag">Набор закрыт</span><b class="nb-t">' + (inq ? 'Вы в листе ожидания' : 'Запишись в лист ожидания') + '</b><span class="nb-s">' + (inq ? 'Дадим знать, когда откроем места.' : 'Места заняты. Напишем первым, когда откроем следующий набор.') + '</span>' +
      '<button class="btn sm nb-b" id="nbo" style="' + (inq ? '' : 'background:linear-gradient(110deg,#0045fd,#3d9bff,#ff5fa2);color:#fff;') + 'width:100%">' + (inq ? 'Вы в очереди ✓' : 'Встать в очередь') + '</button></div></div>';
  }
  function clubSheet() {
    const mask = (em) => { const m = /^(.)[^@]*(@.+)$/.exec(String(em || '')); return m ? m[1] + '***' + m[2] : ''; };
    const row = (t, d) => '<div class="rowi" style="align-items:flex-start"><span class="grow"><b>' + t + '</b><div class="mut" style="margin-top:2px;font-size:13px">' + d + '</div></span></div>';
    const info = '<div class="list">' + row('Еженедельные созвоны', 'Живое общение с участниками раз в неделю') + row('Ежедневные цели и чек-ины', 'Каждый день фиксируешь план и результат, не бросаешь на полпути') + row('Ручная проверка работ', 'Эссе и письма смотрит человек, а не только программа') + row('Темы в группе', 'Отдельные ветки для эссе, материалов и чек-инов') + row('Отбор по целям', 'Берём тех, у кого есть конкретная цель по IELTS') + '</div>';
    const head = '<h2 style="margin:0 0 6px">IELTS Teacher Club</h2><p class="mut" style="margin:0 0 12px">Небольшая закрытая группа для тех, кто готовится к IELTS всерьёз. Отбор бесплатный.</p>' + info;
    const draw = (st) => {
      let body;
      if (st && st.joined) body = '<div class="card" style="margin-top:14px"><b>Вы в очереди · №' + st.pos + ' из ' + st.total + '</b><div class="mut" style="margin-top:4px">Когда откроем места, дадим знать в приложении и на e-mail аккаунта' + (st.email ? ' (' + esc(st.email) + ')' : '') + '.</div></div><div class="stack" style="margin-top:12px"><button class="btn" id="nwc">Закрыть</button></div>';
      else if (st && st.err) body = '<p class="mut" style="margin:14px 0 8px">' + esc(st.err) + '</p><div class="stack"><button class="btn p" id="nwj">Попробовать ещё раз</button></div>';
      else body = '<p class="mut" style="margin:14px 0 8px">Сейчас все места заняты. Очередь даёт приоритет: места следующего набора мы сначала предложим вам. Нажимая кнопку, вы соглашаетесь получить сообщение об открытии набора.</p><div class="stack"><button class="btn p" id="nwj" style="background:linear-gradient(110deg,#0045fd,#3d9bff,#ff5fa2);color:#fff">Встать в очередь</button></div>';
      C().openSheet(head + body, (el) => {
        const j = el.querySelector('#nwj'), c = el.querySelector('#nwc');
        if (c) c.onclick = () => C().closeSheet();
        if (j) j.onclick = async () => {
          j.disabled = true; j.textContent = 'Записываю…';
          try { const r = await window.Cloud.clubWait(true); S().wl = 1; C().save(); const u = await window.Cloud.session(); draw(Object.assign({ email: u ? mask(u.user.email) : '' }, r)); }
          catch (er) { draw({ err: /Нет связи/.test(er.message) ? 'Нет связи. Проверьте интернет и попробуйте ещё раз.' : 'Не получилось записаться. Попробуйте чуть позже.' }); }
        };
      });
    };
    draw(null);
    if (S().wl) window.Cloud.clubWait(false).then(async (r) => { if (r.joined) { const u = await window.Cloud.session(); draw(Object.assign({ email: u ? mask(u.user.email) : '' }, r)); } }).catch(() => {});
  }
  function bindBanner(v) {
    const b = v.querySelector('#nbn'); if (!b) return;
    v.querySelector('#nbo').onclick = clubSheet;
    v.querySelector('#nbx').onclick = () => { S().hideW = Date.now() + 7 * 864e5; C().save(); b.remove(); };
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

  N.after = function (v) {
    const h = location.hash || '#today'; const p = C() && C().P(); if (!p) return; const s = S();
    if (/^#(today)?$/.test(h) && Date.now() > s.hideW) { const hd = v.querySelector('.head'); if (hd) { hd.insertAdjacentHTML('afterend', bannerHtml()); bindBanner(v); } }
    if (/^#read\//.test(h)) decorate(v); else bar.hidden = true;
  };
})();
