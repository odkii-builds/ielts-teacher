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
  const S = () => { const p = C().P(); const n = p.nx = p.nx || {}; n.marks = n.marks || []; n.diag = n.diag || {}; n.hide = n.hide || 0; return n; };
  const copy = (t, msg) => {
    const ok = () => C().toast(msg || 'Скопировано');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => C().toast('Не удалось скопировать'));
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { C().toast('Не удалось скопировать'); } ta.remove(); }
  };
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rng = (o) => (o.low === o.high ? o.low.toFixed(1) : o.low.toFixed(1) + '–' + o.high.toFixed(1));


  // ---------- баннер набора в клуб ----------
  function bannerHtml() {
    return '<div class="nbanner" id="nbn"><button class="nb-x" id="nbx" aria-label="Скрыть">×</button><img class="nb-i" src="img/club.jpg" alt="IELTS Teacher Club" width="768" height="512">' +
      '<div class="nb-c"><span class="nb-tag">Набор открыт · бесплатно</span><b class="nb-t">Ищем ' + CLUB.spots + ' человека в клуб</b><span class="nb-s">Комьюнити и ручная проверка работ. Отбор бесплатный.</span>' +
      '<button class="btn sm nb-b" id="nbo">Как попасть</button></div></div>';
  }
  function clubSheet() {
    const p = C().P(); const lvl = p.placement ? p.placement.cefr + (p.placement.band ? ' (≈ band ' + p.placement.band + ')' : '') : '';
    const goal = p.target && p.target.overall ? p.target.overall : '';
    const form = 'Привет! Хочу в IELTS Teacher Club.\n1. Мой уровень / результат IELTS сейчас: ' + (lvl || '…') + '\n2. Цель по IELTS: ' + (goal || '…') + '\n3. Куда хочу поступать: …\n4. В каком году: …';
    C().openSheet('<h2 style="margin:0 0 6px">Как попасть в клуб</h2><p class="mut" style="margin:0 0 12px">Отбор бесплатный. Напиши мне в Telegram и коротко расскажи:</p>' +
      '<div class="list"><div class="rowi"><span class="grow">Свой уровень английского или результат IELTS</span></div><div class="rowi"><span class="grow">Куда хочешь поступать</span></div><div class="rowi"><span class="grow">В каком году</span></div></div>' +
      '<p class="mut" style="margin:12px 0">Шаблон уже подставил данные из твоего профиля — проверь и допиши.</p>' +
      '<div class="stack"><button class="btn" id="ncp">Скопировать шаблон</button><a class="btn p" style="display:grid;place-items:center;text-decoration:none" href="https://t.me/odkii" target="_blank" rel="noopener">Написать в Telegram</a></div>',
    (el) => { el.querySelector('#ncp').onclick = () => copy(form, 'Шаблон скопирован'); });
  }
  function bindBanner(v) {
    const b = v.querySelector('#nbn'); if (!b) return;
    v.querySelector('#nbo').onclick = clubSheet;
    v.querySelector('#nbx').onclick = () => { S().hide = Date.now() + 7 * 864e5; C().save(); b.remove(); };
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
  async function addMark(info, st) {
    const m = /^#read\/(.+)$/.exec(location.hash); if (!m) return;
    const s = S(); const key = info.text.toLowerCase();
    s.marks = s.marks.filter((x) => !(x.src === m[1] && x.text.toLowerCase() === key));
    s.marks.push({ id: C().uid(), text: info.text, ctx: info.ctx, st, src: m[1], date: C().today() });
    window.getSelection().removeAllRanges(); bar.hidden = true; decorate(document.getElementById('view'));
    const r = await C().addFromReading(info.text, info.ctx);
    if (r === 'dup') { C().toast('Уже есть в карточках'); return; }
    const mk = s.marks.find((x) => x.src === m[1] && x.text.toLowerCase() === key); if (mk) { mk.cid = r; C().save(); showDel(mk); }
  }
  let delT = 0;
  function showDel(mk) {
    bar.dataset.mode = 'del';
    bar.innerHTML = '<div class="sb-w">«' + esc(mk.text) + '» добавлено в карточки</div><div class="sb-b"><button id="ndel">Удалить из карточек</button><button id="nkeep">Оставить</button></div>';
    bar.hidden = false; clearTimeout(delT); delT = setTimeout(hideDel, 8000);
    bar.querySelector('#nkeep').onclick = hideDel;
    bar.querySelector('#ndel').onclick = () => {
      const s = S(); s.marks = s.marks.filter((x) => x.id !== mk.id); if (mk.cid) C().removeCard(mk.cid); C().save();
      document.querySelectorAll('.rtext mark.hl').forEach((el) => { if (el.textContent.toLowerCase() === mk.text.toLowerCase()) el.replaceWith(document.createTextNode(el.textContent)); });
      const h = document.querySelector('.rtext'); if (h) h.normalize(); hideDel(); C().toast('Удалено из карточек');
    };
  }
  function hideDel() { clearTimeout(delT); delete bar.dataset.mode; bar.hidden = true; }
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.rtext mark.hl'); if (!el || !/^#read\//.test(location.hash)) return;
    const m = /^#read\/(.+)$/.exec(location.hash); const mk = S().marks.find((x) => x.src === m[1] && x.text.toLowerCase() === el.textContent.toLowerCase());
    if (mk && mk.cid) showDel(mk);
  });
  let selT = 0;
  function refreshBar() {
    if (!/^#read\//.test(location.hash)) { hideDel(); return; }
    if (bar.dataset.mode === 'del' && !selInfo()) return;
    delete bar.dataset.mode;
    const i = selInfo(); if (!i) { bar.hidden = true; return; }
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
    if (/^#(today)?$/.test(h) && Date.now() > s.hide) { const hd = v.querySelector('.head'); if (hd) { hd.insertAdjacentHTML('afterend', bannerHtml()); bindBanner(v); } }
    if (/^#read\//.test(h)) decorate(v); else bar.hidden = true;
  };
})();
