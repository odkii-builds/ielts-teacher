/* IELTS Teacher — интерфейс. Без сборки. Данные: Supabase (аккаунт) + локальный кэш. */
(function () {
  'use strict';
  const E = window.Engine;
  const LEGACY = 'ielts_lab_v1';
  const TAGS = ['L-SPELL', 'L-PLURAL', 'L-NUM', 'L-DISTR', 'L-MAP', 'L-LIMIT', 'R-TFNG', 'R-MH', 'R-MI', 'R-COMP', 'R-MCQ', 'R-TIME', 'W-TR', 'W-CC', 'W-LR', 'W-GRA', 'W-ART', 'W-WF', 'W-SVA', 'W-PUNCT', 'W-COLL', 'W-REP', 'S-FC', 'S-LR', 'S-GRA', 'S-P'];
  const SKN = { L: 'Аудирование', R: 'Чтение', W: 'Письменная часть', S: 'Говорение', V: 'Лексика', G: 'Грамматика', M: 'Мок', ALL: 'Разное' };
  let CONTENT, RES, DB = { profiles: {}, active: null }, user = null, session = null;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const p2 = (n) => String(n).padStart(2, '0');
  const localDate = (d) => { d = d || new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const today = () => localDate();
  const uid = () => 'p' + Math.random().toString(36).slice(2, 9);
  const num = (v, d) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? d : n; };
  const fmtD = (s, o) => E.pd(s).toLocaleDateString('ru-RU', Object.assign({ timeZone: 'UTC' }, o || { day: 'numeric', month: 'short' }));
  const P = () => DB.profiles[DB.active];

  // ---------- иконки ----------
  const IC = {
    today: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    plan: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    cards: '<rect x="3.5" y="7" width="14" height="13" rx="3"/><path d="M7 4h12a1.5 1.5 0 0 1 1.5 1.5V16"/>',
    errors: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  };
  const ico = (n, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>';

  // ---------- хранение и синхронизация ----------
  let ver = 0, pushTimer = null, lastErr = 0, syncState = 'ok';
  const lkey = () => 'ielts_v2_' + (user ? user.id : 'anon');
  function writeLocal(dirty) { try { localStorage.setItem(lkey(), JSON.stringify({ db: pack(), dirty: !!dirty })); } catch (e) { /* ignore */ } }
  function readLocal() { try { return JSON.parse(localStorage.getItem(lkey())); } catch (e) { return null; } }
  function save() {
    if (!user) return;
    ver++; syncState = 'pending'; writeLocal(true);
    clearTimeout(pushTimer); pushTimer = setTimeout(push, 30000); // реже пишем в облако: локально сохраняется сразу
  }
  async function push() {
    clearTimeout(pushTimer);
    if (!user || !window.Cloud) return;
    const v = ver;
    try {
      await Cloud.push(user.id, pack());
      if (v === ver) { writeLocal(false); syncState = 'ok'; } else pushTimer = setTimeout(push, 300);
    } catch (e) {
      syncState = 'error';
      if (Date.now() - lastErr > 15000) { lastErr = Date.now(); toast('Нет связи — сохранено на устройстве'); }
      pushTimer = setTimeout(push, 20000);
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && syncState !== 'ok') push(); });
  window.addEventListener('pagehide', () => { if (syncState !== 'ok') push(); });

  // ---------- UI-примитивы ----------
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 2300);
  }
  function closeSheet(instant) {
    const r = $('#sheets'); r.classList.remove('open'); document.body.classList.remove('lock');
    const sh = r.querySelector('.sheet'); if (sh) sh.style.transform = '';
    if (instant) r.innerHTML = ''; else setTimeout(() => { if (!r.classList.contains('open')) r.innerHTML = ''; }, 360);
  }
  function openSheet(html, mount) {
    closeSheet(true);
    const r = $('#sheets');
    r.innerHTML = '<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sbody">' + html + '</div></div>';
    document.body.classList.add('lock');
    requestAnimationFrame(() => requestAnimationFrame(() => r.classList.add('open')));
    r.querySelector('.scrim').onclick = () => closeSheet();
    const sh = r.querySelector('.sheet'), g = r.querySelector('.grab'); let y0 = null, dy = 0;
    g.onpointerdown = (e) => { y0 = e.clientY; dy = 0; g.setPointerCapture(e.pointerId); sh.style.transition = 'none'; };
    g.onpointermove = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = 'translateY(' + dy + 'px)'; };
    const end = () => { if (y0 == null) return; y0 = null; sh.style.transition = ''; if (dy > 110) closeSheet(); else sh.style.transform = ''; };
    g.onpointerup = end; g.onpointercancel = end;
    if (mount) mount(r.querySelector('.sbody'));
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  if (window.Paid) Paid.init({ openSheet, closeSheet, toast, esc }); // превью платных функций; в проде выключено жёстко
  function confirmSheet(text, okLabel, fn) {
    openSheet('<h2>' + esc(text) + '</h2><div class="stack"><button class="btn danger" id="cfok">' + esc(okLabel) + '</button><button class="btn" id="cfno">Отмена</button></div>', () => {
      $('#cfok').onclick = () => { closeSheet(); fn(); }; $('#cfno').onclick = () => closeSheet();
    });
  }
  const seg = (id, opts, val) => '<div class="seg" id="' + id + '" data-v="' + esc(val) + '">' + opts.map(([v, n]) => '<button type="button" data-v="' + esc(v) + '" class="' + (v === val ? 'on' : '') + '">' + esc(n) + '</button>').join('') + '</div>';
  function bindSeg(id, fn) {
    const s = $('#' + id); if (!s) return;
    s.querySelectorAll('button').forEach((b) => { b.onclick = () => { s.dataset.v = b.dataset.v; s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); if (fn) fn(b.dataset.v); }; });
  }
  const segVal = (id) => $('#' + id).dataset.v;
  const head = (title, sub, acts) => '<div class="head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><div class="acts">' + (acts || '') + '</div></div>';
  const plusBtn = (id, label) => '<button class="ib" id="' + id + '" aria-label="' + esc(label) + '">' + ico('plus') + '</button>';
  function paint(html, animate) {
    document.body.classList.remove('drilling');
    const v = $('#view'); v.innerHTML = html; v.classList.remove('enter', 'first');
    const bootEl = document.getElementById('boot'); if (bootEl && !bootEl.classList.contains('out')) { bootEl.classList.add('out'); setTimeout(() => bootEl.remove(), 600); animate = true; v.classList.add('first'); }
    if (animate !== false) { void v.offsetWidth; v.classList.add('enter'); }
    const ai = v.querySelector('[data-ai]'); if (ai) ai.onclick = () => importSheet(P(), 't2', '');
    if (window.Next) Next.after(v);
  }

  // ---------- профиль ----------
  function mondayOf(dateStr) { const d = E.pd(dateStr); const dow = d.getUTCDay(); return E.addDays(dateStr, -(dow === 0 ? 6 : dow - 1)); }
  function nextMonday(dateStr) { return E.pd(dateStr).getUTCDay() === 1 ? dateStr : E.addDays(mondayOf(dateStr), 7); }
  function newProfile(f) {
    const p = {
      id: uid(), name: f.name || 'Я', module: f.module, target: { overall: f.overall, min: f.min }, test_date: f.test_date || '', hours: f.hours, start: f.start,
      skills: { L: f.L, R: f.R, W: f.W, S: f.S }, cards: CONTENT.cards.map((c, i) => E.newCard(c.f, c.b, 's' + i)),
      errors: [], days: {}, done: {}, mocks: [], subs: [], study: {}, placement: f.placement || null, newPerDay: f.newPerDay || 10, newToday: { date: '', n: 0 },
    };
    DB.profiles[p.id] = p; DB.active = p.id; syncDeck(p); ensureP(p); save();
  }
  function profileForm(p, label) {
    const v = p || { name: '', module: 'academic', target: { overall: 7.5, min: 7 }, hours: 13, start: nextMonday(today()), skills: { L: 4.5, R: 4.5, W: 4.5, S: 4.5 }, newPerDay: 15, test_date: '' };
    const band = (id, val) => '<input id="' + id + '" type="number" inputmode="decimal" step="0.5" min="1" max="9" value="' + val + '">';
    return '<form id="pf"><label>Имя</label><input id="f_name" value="' + esc(v.name) + '" autocomplete="off">' +
      '<label>Экзамен</label>' + seg('f_module', [['academic', 'Academic'], ['general', 'General']], v.module) +
      '<div class="grid2"><div><label>Цель overall</label>' + band('f_overall', v.target.overall) + '</div><div><label>Минимум по навыку</label>' + band('f_min', v.target.min) + '</div></div>' +
      '<label>Твой текущий уровень по каждой части экзамена</label><p class="mut" style="margin:0 0 8px;font-size:14px">Оценка IELTS от 1 до 9. Не знаешь — оставь 4.5, уточнится после тестов и заданий.</p><div class="grid2">' + [['L', 'Аудирование'], ['R', 'Чтение'], ['W', 'Письменная часть'], ['S', 'Говорение']].map((x) => '<div><div class="mut" style="margin-bottom:4px">' + x[1] + '</div>' + band('f_' + x[0], v.skills[x[0]]) + '</div>').join('') + '</div>' +
      '<div class="grid2"><div><label>Часов в неделю</label><input id="f_hours" type="number" inputmode="numeric" min="3" max="40" value="' + v.hours + '"></div>' +
      '<div><label>Новых карточек/день</label><input id="f_new" type="number" inputmode="numeric" min="0" max="40" value="' + v.newPerDay + '"></div></div>' +
      '<div class="grid2"><div><label>Старт плана</label><input id="f_start" type="date" value="' + v.start + '"></div>' +
      '<div><label>Дата теста</label><input id="f_test" type="date" value="' + (v.test_date || '') + '"></div></div>' +
      '<div style="margin-top:20px"><button class="btn p" type="submit">' + label + '</button></div></form>';
  }
  function readProfileForm() {
    return {
      name: $('#f_name').value.trim(), module: segVal('f_module'), overall: num($('#f_overall').value, 7.5), min: num($('#f_min').value, 7),
      L: num($('#f_L').value, 4.5), R: num($('#f_R').value, 4.5), W: num($('#f_W').value, 4.5), S: num($('#f_S').value, 4.5),
      hours: num($('#f_hours').value, 13), newPerDay: num($('#f_new').value, 10), start: $('#f_start').value || nextMonday(today()), test_date: $('#f_test').value,
    };
  }

  // ---------- таймер учёбы ----------
  let lastTouch = Date.now(), studyDirty = 0;
  ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'].forEach((ev) => window.addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true, capture: true }));
  const studySec = () => { const p = P(); return (p && p.study && p.study[today()]) || 0; };
  function showStudy() {
    const el = document.getElementById('stm'), es = document.getElementById('sts'); if (!el) return;
    const t = studySec(); const m = Math.floor(t / 60), s2 = t % 60;
    if (el.update) { el.update(m); es.update(s2); } else { el.textContent = p2(m); es.textContent = p2(s2); }
  }
  setInterval(() => {
    if (!user || !DB.active || !P()) return;
    const p = P(); p.study = p.study || {}; const d = today(); const cur = p.study[d] || 0;
    const nx = E.studyTick(cur, lastTouch, Date.now(), !document.hidden, /^#(read|write|t2|vw)\b/.test(location.hash) ? 1800 : 0);
    if (nx === cur) return;
    p.study[d] = nx; studyDirty++; showStudy();
    if (studyDirty >= 20) { studyDirty = 0; save(); }
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && studyDirty) { studyDirty = 0; save(); push(); } });
  function studyRow() {
    const nf = (id, v) => '<number-flow id="' + id + '" class="nf" data-v="' + v + '"></number-flow>';
    const t = studySec();
    return '<div class="studyrow"><span>Ты сегодня учишься уже</span><b class="stime">' + nf('stm', Math.floor(t / 60)) + '<i>:</i>' + nf('sts', t % 60) + '</b></div>';
  }
  function initStudy() {
    ['stm', 'sts'].forEach((id) => {
      const el = document.getElementById(id); if (!el) return;
      if (el.update) { el.format = { minimumIntegerDigits: 2, useGrouping: false }; el.trend = 1; el.update(Number(el.dataset.v)); } else el.textContent = p2(el.dataset.v);
    });
  }

  // ---------- входной тест ----------
  let placeDone = null; // результат теста до создания профиля
  function viewPlacement(onDone, onSkip) {
    $('#tabs').hidden = true;
    const items = E.placementItems(DECK); const ans = []; let i = 0;
    const intro = () => {
      paint(head('Входной тест', 'Определим твой уровень') + '<div class="card stack"><p>' + items.length + ' коротких вопросов: грамматика и слова (уровни A2 → C1, по официальным спискам Oxford). Идут от лёгких к сложным. Занимает около 5 минут.</p>' +
        '<p class="mut">По результату подберу уровень карточек, задания и слабые темы. Если не уверен — выбирай «не знаю», это честнее, чем угадывать.</p></div>' +
        '<div style="margin-top:16px"><button class="btn p" id="pgo">Начать</button></div>' + (onSkip ? '<div style="text-align:center"><button class="link" id="pskip">Пропустить и указать уровень вручную</button></div>' : ''));
      $('#pgo').onclick = step; if (onSkip) $('#pskip').onclick = onSkip;
    };
    const step = () => {
      if (i >= items.length) return fin();
      const it = items[i];
      const q = it.k === 'v' ? 'Что значит слово <b>' + esc(it.q) + '</b>?' : esc(it.q).replace('___', '<mark class="gap">&nbsp;&nbsp;&nbsp;&nbsp;</mark>');
      paint(head('Вопрос ' + (i + 1) + ' из ' + items.length, it.k === 'v' ? 'Слова' : 'Грамматика') + '<div class="bar" style="margin-bottom:16px"><i style="width:' + Math.round(100 * i / items.length) + '%"></i></div>' +
        '<div class="card" style="font-size:18px;margin-bottom:12px">' + q + '</div><div class="list">' + it.opts.map((o, k) => '<button class="rowi" data-k="' + k + '"><span class="grow">' + esc(o) + '</span></button>').join('') +
        '<button class="rowi" data-k="-1"><span class="grow mut">Не знаю</span></button></div><div style="text-align:center;margin-top:8px"><button class="link" id="pback">← ' + (i ? 'Назад к предыдущему вопросу' : 'Назад') + '</button></div>', false);
      $('#pback').onclick = () => { if (i) { ans.pop(); i--; step(); } else intro(); };
      $$('.rowi[data-k]').forEach((b) => { b.onclick = () => { ans.push({ lv: it.lv, topic: it.topic, ok: Number(b.dataset.k) === it.a }); i++; step(); }; });
    };
    const fin = () => {
      const r = E.placementScore(ans); r.date = today(); r.n = ans.length; r.ok = ans.filter((a) => a.ok).length;
      const tn = { tenses: 'времена', prepositions: 'предлоги', articles: 'артикли', conditionals: 'условные', agreement: 'согласование', modals: 'модальные', passive: 'пассив', collocations: 'коллокации', relative: 'относительные', inversion: 'инверсия', subjunctive: 'сослагательное', linking: 'связки', vocab: 'словарь' };
      paint(head('Твой уровень', 'Входной тест пройден') + '<div class="card stack" style="text-align:center"><div style="font-size:44px;font-weight:700">' + r.cefr + '</div><div class="mut">примерно IELTS ' + r.band + ' · верно ' + r.ok + ' из ' + r.n + '</div></div>' +
        '<div class="card stack" style="margin-top:12px">' + ['A2', 'B1', 'B2', 'C1'].map((l) => '<div class="sum"><span>' + l + '</span><span>' + r.byLv[l].ok + ' / ' + r.byLv[l].n + '</span></div>').join('') + '</div>' +
        (r.weak.length ? '<p class="mut" style="margin-top:12px">Слабые темы: ' + r.weak.map((t) => esc(tn[t] || t)).join(', ') + '. Они попадут в приоритет заданий.</p>' : '') +
        '<p class="mut">Тест проверяет грамматику и слова. Аудирование и говорение уточнятся по ходу занятий и пробных тестов.</p><div style="margin-top:16px"><button class="btn p" id="pok">Дальше</button></div>');
      $('#pok').onclick = () => onDone(r);
    };
    intro();
  }

  function glossarySheet() {
    const G = [
      ['Аудирование, Чтение, Письменная часть, Говорение', 'Четыре части экзамена: понимание речи на слух, чтение, письмо и говорение. За каждую дают оценку от 1 до 9.'],
      ['Band (бэнд)', 'Оценка IELTS по шкале 1–9 с шагом 0.5. Общий балл — среднее четырёх частей. Цель в приложении — твой целевой балл, например 7.5.'],
      ['Задание 1 и Задание 2', 'Два задания письменной части. Задание 1: описать график, таблицу (или написать письмо в General), 150+ слов, 20 минут. Задание 2: эссе-рассуждение, 250+ слов, 40 минут. Задание 2 весит больше.'],
      ['Пробный экзамен', 'Тренировочный тест целиком в условиях экзамена, чтобы честно увидеть свой уровень.'],
      ['Карточки', 'Слова и фразы, которые приложение показывает тебе по расписанию: как раз перед тем, как ты их забудешь. Так они запоминаются надолго.'],
      ['Сочетание слов (коллокация)', 'Слова, которые носители ставят рядом: make a decision (а не do a decision). Правильные сочетания сильно поднимают оценку за лексику.'],
      ['Перефраз', 'Та же мысль другими словами. Нужен в письменной части (пересказать тему) и в чтении (в тексте всё перефразировано).'],
      ['Общий вывод (Overview)', 'Общий вывод в задании 1: главные тренды или различия без мелких цифр.'],
      ['Уровень A1–C2', 'Шкала знания языка (CEFR). Для IELTS 6.5–7.5 нужен примерно B2–C1.'],
      ['Журнал ошибок', 'Вкладка «Ошибки»: твои собственные ошибки, которые приложение заставит исправить несколько раз, пока ты не перестанешь их делать.'],
    ];
    openSheet('<h2>Что значат слова</h2><div class="stack">' + G.map((g) => '<div><b>' + esc(g[0]) + '</b><div class="mut" style="margin-top:2px">' + esc(g[1]) + '</div></div>').join('') + '</div>');
  }
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-gl]')) glossarySheet(); });

  // ---------- Task 2 на 8+ ----------
  const T2TYPES = [
    ['simple', 'Простое', 'Подлежащее + сказуемое + дополнение.', 'Remote work saves time.', 'Короткий «удар»: итог мысли или конец абзаца.'],
    ['compound', 'Сложносочинённое', 'Мысль А, + and / but / so / yet / or + мысль Б.', 'Commutes are long, so many employees arrive exhausted.', 'Связать две равноценные мысли.'],
    ['complex', 'Сложноподчинённое', 'Although / While / Whereas / Because / Since / Unless + часть 1, часть 2.', 'Although offices build teamwork, many tasks are done better alone.', 'Главный «поднимающий» тип: уступка, причина, контраст.'],
    ['passive', 'Пассив', 'Предмет + to be + третья форма глагола.', 'Remote teams are often judged by results rather than by hours.', 'Академичный тон, когда важен предмет, а не кто действует.'],
    ['question', 'Вопрос', 'Один риторический вопрос на эссе.', 'Yet can a company keep its culture when everyone works online?', 'Оживить абзац, подвести к аргументу. Не злоупотребляй: одного достаточно.'],
    ['conditional', 'Условное', 'If + условие, + результат.', 'If firms offer flexible hours, they will keep talented staff.', 'Логика «если… то…»: последствия и прогнозы.'],
  ];
  function typesHtml(text) {
    const r = E.sentenceTypes(text); if (r.n < 3) return '';
    const row = (ok, t) => '<div class="rowi" style="padding:10px 0"><span style="color:var(--' + (ok ? 'ok' : 'warn') + ')">' + (ok ? '✓' : '!') + '</span><span class="grow">' + t + '</span></div>';
    return '<h3>Разнообразие предложений</h3><div class="list" style="padding:0 16px">' + T2TYPES.map((t) => row(r.types[t[0]] > 0, esc(t[1]) + ' — ' + r.types[t[0]])).join('') +
      row(r.markers.length >= 5, 'Разных связок и союзов: ' + r.markers.length + ' (нужно 5+)' + (r.markers.length ? ': ' + esc(r.markers.slice(0, 8).join(', ')) : '')) + '</div><p class="mut">Подсчёт приблизительный: программа ищет типичные признаки. Качество и естественность оценит ИИ.</p>';
  }
  function viewT2() {
    let h = head('Эссе на 8+', 'Как писать эссе с разнообразной грамматикой', back('#writing'));
    h += '<div class="card stack"><p style="margin:0"><b>Главная идея.</b> За грамматику (четверть оценки за задание 2) проверяют две вещи сразу: насколько разные конструкции ты используешь и насколько часто предложения без ошибок. Если писать только короткими простыми предложениями, потолок около 6–6.5. Для 7 и выше нужны сложные конструкции, а для 8 — чтобы большинство предложений были безошибочными.</p><p class="mut" style="margin:0">Поэтому тренируем и то и другое: смелые, но контролируемые предложения. Идея шести типов предложений взята из гайда E2 Test Prep (E2Language.com); примеры и объяснения здесь написаны заново.</p></div>';
    h += '<h3>Шесть типов предложений</h3><div class="list">' + T2TYPES.map((t, i) => '<div class="rowi" style="align-items:flex-start"><div class="grow"><b>' + (i + 1) + '. ' + esc(t[1]) + '</b><div class="mut" style="margin-top:2px">' + esc(t[2]) + '</div><div style="margin-top:6px"><i>' + esc(t[3]) + '</i></div><div class="mut" style="margin-top:4px">' + esc(t[4]) + '</div></div></div>').join('') + '</div>';
    h += '<h3>План за 5 минут</h3><div class="card"><ol style="margin:0;padding-left:20px;display:grid;gap:8px"><li><b>Введение.</b> 1-е предложение — перефраз темы своими словами. 2-е — твоя позиция в сложноподчинённом (Although… / While…).</li><li><b>Абзац 1 (довод А).</b> Тема абзаца → пример или факт в пассиве → контраст с «Although».</li><li><b>Абзац 2 (довод Б).</b> Тема абзаца → один риторический вопрос → условное «If… then…» с последствием.</li><li><b>Вывод.</b> Повтори позицию другими словами → заверши коротким простым предложением.</li></ol></div>';
    h += '<h3>Проверка перед сдачей</h3><div class="card"><ul style="margin:0;padding-left:20px;display:grid;gap:6px"><li>Использовал минимум 5 разных связок (although, while, whereas, because, since, unless…)?</li><li>Есть все шесть типов предложений?</li><li>Четыре абзаца: введение, два основных, вывод?</li><li>Проверил окончание -s у множественного числа (governments, а не government)?</li><li>Проверил артикли a / an / the?</li><li>Ответил на каждую часть вопроса?</li></ul></div>';
    h += '<p class="mut" style="margin-top:12px">Если сомневаешься в сложной конструкции — лучше упрости одну фразу, чем делать ошибки в каждом предложении. Но совсем без сложных не пиши.</p>';
    h += '<div style="margin-top:12px"><a class="btn p" href="#writing" style="display:block;text-align:center;text-decoration:none">Выбрать задание 2</a></div><div style="margin-top:8px"><a class="btn" href="#vw" style="display:block;text-align:center;text-decoration:none">Задание со своими словами</a></div>';
    paint(h);
  }

  // ---------- Сегодня ----------
  let viewDate = null;
  function dayFor(date) { const p = P(); if (!p.days[date]) p.days[date] = E.dayTasks(p, date, CONTENT, RES, p.errors); return p.days[date]; }
  function resLine(r) {
    if (!r) return '';
    const warn = r.status === 'user_provided' || r.status === 'to_verify' ? ' <span class="mut">· не проверено</span>' : '';
    if (r.url) return '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.name) + ' ↗</a>' + warn;
    return '<span class="mut">' + esc(r.name) + (r.search ? ' — поиск: «' + esc(r.search) + '»' : '') + '</span>';
  }
  // таймер (глобальный, переживает смену экранов)
  const timer = { end: 0, owner: '', idle: '25 мин' };
  setInterval(() => {
    if (!timer.end) return;
    const el = $('#tmt'); const s = Math.max(0, Math.round((timer.end - Date.now()) / 1000));
    if (el && el.dataset.owner === timer.owner) el.textContent = p2(Math.floor(s / 60)) + ':' + p2(s % 60);
    if (s <= 0) { timer.end = 0; toast('Время вышло'); try { navigator.vibrate && navigator.vibrate(300); } catch (e) { /* ignore */ } if (el && el.dataset.owner === timer.owner) el.textContent = timer.idle || '25 мин'; }
  }, 500);

  function viewToday() {
    const p = P(); const date = viewDate || today(); const isToday = date === today();
    const d = dayFor(date); const done = (p.done[date] = p.done[date] || {});
    const sum = () => { const tot = d.total || 1; const dn = d.tasks.filter((t) => done[t.id]).reduce((a, t) => a + t.minutes, 0); return { dn, tot, pct: Math.round(100 * dn / tot) }; };
    const s0 = sum();
    const sub = esc(fmtD(date, { weekday: 'long', day: 'numeric', month: 'long' })) + ' · неделя ' + d.week + ' · ' + esc(d.phaseName);
    const nav = '<button class="ib" id="dprev" aria-label="Вчера">' + ico('left') + '</button><button class="ib" id="dnext" aria-label="Завтра">' + ico('right') + '</button>';
    let h = head(isToday ? 'Сегодня' : fmtD(date), sub, nav).replace('<div><h1>', '<div class="hl"><img class="logo" src="img/logo.png?v=2" alt="" width="40" height="40"><div><h1>').replace('</div><div class="acts">', '</div></div><div class="acts">');
    h += '<div class="sum"><span id="sdn">' + s0.dn + ' из ' + d.total + ' мин</span><span id="spc">' + s0.pct + '%</span></div><div class="bar" style="margin-bottom:16px"><i id="sbar" style="width:' + s0.pct + '%"></i></div>';
    const fdue = isToday ? E.errDue(p.errors, today()).length : 0;
    if (fdue) h += fixBanner(fdue);
    if (isToday) h += studyRow();
    if (isToday) h += aiRow();
    h += '<div class="list">' + d.tasks.map((t) => {
      const more = (t.desc ? '<p>' + esc(t.desc) + '</p>' : '') + (t.resource ? '<div>' + resLine(t.resource) + '</div>' : '');
      return '<div class="task' + (done[t.id] ? ' done' : '') + '" data-id="' + esc(t.id) + '"><button class="cb" aria-label="Готово" aria-pressed="' + !!done[t.id] + '"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>' +
        '<div><button class="tbody"><div class="ttl">' + esc(t.title) + '</div><div class="tmeta">' + t.minutes + ' мин · ' + esc(SKN[t.skill] || t.skill) + '</div></button>' + (more ? '<div class="more"><div>' + more + '</div></div>' : '') + '</div></div>';
    }).join('') + '</div>';
    h += '<div style="text-align:center;margin-top:8px"><button class="link" data-gl="1">Что значат слова и буквы?</button></div>';
    paint(h); if (isToday) initStudy();
    $('#dprev').onclick = () => { viewDate = E.addDays(date, -1); route(); };
    $('#dnext').onclick = () => { const n = E.addDays(date, 1); viewDate = n === today() ? null : n; route(); };
    $$('.task').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('.cb').onclick = () => {
        if (done[id]) delete done[id]; else done[id] = true;
        row.classList.toggle('done', !!done[id]); row.querySelector('.cb').setAttribute('aria-pressed', !!done[id]);
        const s = sum(); $('#sdn').textContent = s.dn + ' из ' + d.total + ' мин'; $('#spc').textContent = s.pct + '%'; $('#sbar').style.width = s.pct + '%';
        if (done[id] && s.dn >= d.total) toast('День закрыт');
        save();
      };
      row.querySelector('.tbody').onclick = () => { if (row.querySelector('.more')) row.classList.toggle('open'); };
    });
  }

  // ---------- План ----------
  function viewPlan() {
    const p = P(); const t0 = today(); const week = E.weekNo(p.start, t0);
    const sev = E.errorSeverity(p.errors, t0); const w = E.weights(p, sev); const ph = E.phaseFor(week);
    let h = head('План', 'Неделя ' + week + ' из 52 · ' + esc(ph.name) + (p.test_date ? ' · до теста ' + Math.max(0, E.daysBetween(t0, p.test_date)) + ' дн.' : ''));
    h += '<h3>Время по навыкам · ' + p.hours + ' ч/нед</h3><div class="card stack">' + E.SK.map((s) =>
      '<div><div class="sum" style="margin-bottom:6px"><span><b style="color:var(--fg)">' + esc(SKN[s]) + '</b> · ' + p.skills[s] + ' → ' + p.target.overall + '</span><span>' + (w[s] * p.hours).toFixed(1) + ' ч · ' + Math.round(w[s] * 100) + '%</span></div><div class="bar"><i style="width:' + Math.round(w[s] * 100) + '%"></i></div></div>').join('') + '</div>';
    h += '<h3>Ближайшие дни</h3><div class="list">';
    for (let i = 0; i < 7; i++) {
      const dd = E.addDays(t0, i); const d = dayFor(dd);
      h += '<a class="rowi" href="#today" data-go="' + dd + '"><div class="grow"><b>' + esc(i === 0 ? 'Сегодня' : fmtD(dd, { weekday: 'short', day: 'numeric', month: 'short' })) + '</b><div class="mut" style="margin-top:2px">' + d.tasks.map((t) => esc(t.title.split(':')[0])).join(' · ') + '</div></div><span class="mut">' + d.total + ' мин</span>' + ico('chev', 'chev') + '</a>';
    }
    h += '</div><h3>Этапы</h3><div class="list">' + E.PHASES.map((f) =>
      '<div class="rowi"><div class="grow"><b' + (f.name === ph.name ? ' style="color:var(--acc)"' : '') + '>' + esc(f.name) + '</b><div class="mut" style="margin-top:2px">' + esc(f.goal) + '</div></div><span class="mut" style="text-align:right">' + fmtD(E.addDays(p.start, (f.from - 1) * 7)) + ' – ' + fmtD(E.addDays(p.start, f.to * 7 - 1)) + '</span></div>').join('') + '</div>';
    paint(h);
    $$('[data-go]').forEach((a) => { a.onclick = () => { viewDate = a.dataset.go === today() ? null : a.dataset.go; }; });
  }

  // ---------- Карточки ----------
  let DECK = [], READ = [], WRITING = null;
  const trLine = (c) => '<div class="exr">' + (c.exr && E.exIdx(c) === 0 ? hl(c.exr) : '<mark>' + esc(c.t) + '</mark> — ' + esc(c.ru)) + '</div>';
  const tapW = (t) => t.replace(/([A-Za-z][A-Za-z'’-]*)|([^A-Za-z]+)/g, (m, w, o) => w ? '<span class="w" data-w="' + esc(w.toLowerCase()) + '">' + esc(w) + '</span>' : esc(o));
  const hl = (ex) => String(ex == null ? '' : ex).split(/(\[\[[^\[\]]+\]\])/).map((x) => /^\[\[/.test(x) ? '<mark>' + tapW(x.slice(2, -2)) + '</mark>' : tapW(x)).join('');
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (ev) => ev.preventDefault())); // iOS: без щипкового зума
  // ---------- Попап слова: перевод + транскрипция ----------
  let LEX = null, lexP = null;
  const lexLoad = () => lexP || (lexP = fetch('data/lex.json').then((r) => r.json()).then((j) => (LEX = j)).catch(() => (LEX = {})));
  const onlineTr = async (w) => {
    const k = 'tr_' + w; try { const c = localStorage.getItem(k); if (c) return c; } catch (e) { /* */ }
    try { const j = await (await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(w) + '&langpair=en|ru')).json(); const t = j && j.responseData && j.responseData.translatedText; if (t && !/MYMEMORY|INVALID|QUERY/i.test(t)) { try { localStorage.setItem(k, t); } catch (e) { /* */ } return t.toLowerCase(); } } catch (e) { /* */ }
    return '';
  };
  const speak = (w) => { try { const u = new SpeechSynthesisUtterance(w); u.lang = 'en-US'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* */ } };
  async function wordPop(el) {
    const w = el.dataset.w; let pop = $('#wpop'); if (pop) pop.remove();
    pop = document.createElement('div'); pop.id = 'wpop'; pop.className = 'wpop'; document.body.appendChild(pop);
    const r = el.getBoundingClientRect(), W = Math.min(260, innerWidth - 20);
    pop.style.width = W + 'px'; pop.style.left = Math.max(10, Math.min(innerWidth - W - 10, r.left + r.width / 2 - W / 2)) + 'px';
    const place = () => { const h = pop.offsetHeight; pop.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px'; };
    pop.innerHTML = '<div class="wp1"><b>' + esc(w) + '</b><button class="link" id="wsp" aria-label="Произношение">🔊</button></div><div class="mut" id="wpr">…</div>'; place();
    $('#wsp').onclick = (e) => { e.stopPropagation(); speak(w); };
    const lx = await lexLoad(); const e = lx[w] || lx[w.replace(/['’]s$/, '')] || [];
    let tr = e[1] || '', online = false; if (!tr) { tr = await onlineTr(w); online = !!tr; }
    if (!$('#wpop') || $('#wpop') !== pop) return;
    pop.innerHTML = '<div class="wp1"><b>' + esc(w) + '</b>' + (e[0] ? ' <span class="mut">' + esc(e[0]) + '</span>' : '') + '<button class="link" id="wsp" aria-label="Произношение">🔊</button></div><div class="wtr">' + (tr ? esc(tr) : '<span class="mut">перевод не найден</span>') + '</div>' + (online ? '<div class="mut" style="font-size:12px;margin-top:2px">машинный перевод, без учёта контекста</div>' : '');
    $('#wsp').onclick = (ev) => { ev.stopPropagation(); speak(w); }; place();
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest && ev.target.closest('.w'); const pop = $('#wpop');
    if (el) { ev.preventDefault(); wordPop(el); } else if (pop && !pop.contains(ev.target)) pop.remove();
  });
  // ---------- Проверка ошибок в своих предложениях (LanguageTool) ----------
  const LT_CAT = { TYPOS: 'Опечатка', GRAMMAR: 'Грамматика', COLLOCATIONS: 'Сочетание слов', CONFUSED_WORDS: 'Путаница слов', PUNCTUATION: 'Пунктуация', CASING: 'Регистр', STYLE: 'Стиль', REDUNDANCY: 'Лишнее', SEMANTICS: 'Смысл', TYPOGRAPHY: 'Оформление', MISC: 'Ошибка' };
  async function ltCheck(text) {
    try { const r = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'language=en-GB&text=' + encodeURIComponent(text) }); if (!r.ok) return null; return (await r.json()).matches || []; } catch (e) { return null; }
  }
  function ltHtml(text, ms) {
    if (ms === undefined) return '<div class="mut" style="margin-top:8px">Проверяю ошибки…</div>';
    if (ms === null) return '<div class="mut" style="margin-top:8px">Проверка ошибок недоступна (нет сети)</div>';
    if (!ms.length) return '<div style="margin-top:8px;color:var(--ok);font-weight:600">Ошибок по правилам не найдено ✓</div>';
    let out = '', pos = 0; ms.slice().sort((a, b) => a.offset - b.offset).forEach((m) => { if (m.offset < pos) return; out += esc(text.slice(pos, m.offset)) + '<u class="err">' + esc(text.slice(m.offset, m.offset + m.length)) + '</u>'; pos = m.offset + m.length; }); out += esc(text.slice(pos));
    return '<div style="margin-top:8px;font-weight:600;color:var(--warn)">Найдено: ' + ms.length + '</div><div style="font-size:16px;margin:4px 0;line-height:1.6">' + out + '</div><ul style="margin:6px 0 0;padding-left:18px">' + ms.map((m) => {
      const rp = (m.replacements || []).slice(0, 3).map((x) => x.value).join(' / '); const cat = LT_CAT[m.rule && m.rule.category && m.rule.category.id] || 'Ошибка';
      return '<li style="margin-bottom:6px"><b>' + cat + ':</b> «' + esc(text.substr(m.offset, m.length)) + '»' + (rp ? ' → <b>' + esc(rp) + '</b>' : '') + '<div class="mut" style="font-size:14px">' + esc(m.message) + '</div></li>';
    }).join('') + '</ul>';
  }
  const POS = { n: 'сущ.', v: 'глагол', adj: 'прил.', adv: 'нареч.', phr: 'выражение', coll: 'сочетание слов', phv: 'фразовый глагол', idiom: 'идиома', hedge: 'оборот', prep: 'предлог', conj: 'союз' };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return h >>> 0; };
  const CAP = 12;
  let sess = null; const cst = { tab: 'learn', cur: null, step: 'q', mq: null, pick: null };

  const userCef = (p) => (p.cefMode && p.cefMode !== 'auto') ? p.cefMode : E.cefOf(p.skills);
  // Колода лежит в app/data/deck.json, а не в базе пользователя: в облако уходит только прогресс по начатым карточкам.
  const STATIC = ['t', 'ru', 'ex', 'pos', 'dom', 'cef', 'src', 'acl', 'rec', 'exr', 'ex2', 'f', 'b'];
  let DECKIDS = new Set();
  function pack() {
    const out = { active: DB.active, profiles: {} };
    Object.keys(DB.profiles).forEach((k) => {
      const p = DB.profiles[k]; const q = Object.assign({}, p);
      q.cards = p.cards.filter((c) => !DECKIDS.has(c.id) || c.seen).map((c) => {
        if (!DECKIDS.has(c.id)) return c;
        const o = {}; Object.keys(c).forEach((key) => { if (!STATIC.includes(key)) o[key] = c[key]; }); return o;
      });
      out.profiles[k] = q;
    });
    return out;
  }
  /** Возвращает true, если пришлось менять сохранённые данные (миграция id) — тогда их нужно выгрузить. */
  function syncDeck(p) {
    const byId = {}, byKey = {}; DECK.forEach((d) => { byId[d.id] = d; byKey[d.t.toLowerCase() + '|' + d.pos] = d; });
    let changed = false;
    // старые id вида d001 → стабильные id по содержимому
    p.cards.forEach((c) => { if (/^d\d+$/.test(c.id) && c.t) { const d = byKey[c.t.toLowerCase() + '|' + c.pos]; if (d) { c.id = d.id; changed = true; } } });
    const before = p.cards.length;
    const uniq = new Map(); p.cards.forEach((c) => { const o = uniq.get(c.id); if (!o || (c.seen && !o.seen)) uniq.set(c.id, c); });
    p.cards = Array.from(uniq.values()).filter((c) => c.f || c.t || byId[c.id]);
    if (p.cards.length !== before) changed = true;
    p.cards.forEach((c) => { const d = byId[c.id]; if (d) { c.t = d.t; c.ru = d.ru; c.ex = d.ex; c.pos = d.pos; c.dom = d.dom; c.cef = d.cef; c.src = d.src; c.acl = d.acl; c.rec = d.rec; c.exr = d.exr; c.ex2 = d.ex2; } });
    const ids = new Set(p.cards.map((c) => c.id));
    DECK.forEach((d) => { if (!ids.has(d.id)) p.cards.push(Object.assign(E.newCard('', '', d.id), { t: d.t, ru: d.ru, ex: d.ex, pos: d.pos, dom: d.dom, cef: d.cef, src: d.src, acl: d.acl, rec: d.rec, exr: d.exr, ex2: d.ex2, lv: 0 })); });
    const seen = p.cards.filter((c) => c.seen); const lvl = userCef(p); const rk = (c) => E.cefRank(lvl, c.cef);
    const rest = p.cards.filter((c) => !c.seen).sort((a, b) => ((b.rec ? 1 : 0) - (a.rec ? 1 : 0)) || (rk(a) - rk(b)) || (hash(a.id) - hash(b.id))); p.cards = seen.concat(rest);
    return changed;
  }
  function ensureP(p) { p.errors.forEach((e) => E.errInit(e, today())); p.drafts = p.drafts || {}; p.study = p.study || {}; p.writes = p.writes || []; p.reads = p.reads || []; if (!p.newToday) p.newToday = { date: '', n: 0, extra: 0 }; }
  const grpOf = (p) => p.cgrp || 'main';
  const newLeft = (p) => Math.max(0, p.newPerDay + (p.newToday.extra || 0) - p.newToday.n);
  function ensureSess(p) {
    const t0 = today();
    if (p.newToday.date !== t0) p.newToday = { date: t0, n: 0, extra: 0 };
    if (!sess || sess.date !== t0 || sess.pid !== p.id || sess.grp !== grpOf(p)) { sess = E.buildSession(p.cards.filter((c) => E.inGroup(c, grpOf(p))), t0, CAP, newLeft(p)); sess.date = t0; sess.pid = p.id; sess.grp = grpOf(p); cst.cur = null; }
  }
  function refill(p) {
    const left = newLeft(p) - sess.active.map((id) => p.cards.find((x) => x.id === id)).filter((c) => c && !c.seen).length;
    if (left <= 0) return;
    E.pickFresh(p.cards.filter((c) => !c.seen && !sess.active.includes(c.id) && E.inGroup(c, grpOf(p))), left, t0r()).forEach((c) => sess.active.push(c.id));
  }
  const t0r = () => today();
  function addWordCard(p, term, ru, ex) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); let c;
    if (ex && re.test(ex)) { c = E.newCard('', '', uid()); Object.assign(c, { t: term, ru, ex: ex.replace(re, (m) => '[[' + m + ']]'), pos: 'phr', dom: 'my', lv: 0 }); }
    else c = E.newCard(term, ru + (ex ? ' — ' + ex : ''));
    p.cards.push(c); return c;
  }
  function viewCards() {
    const p = P(); ensureSess(p); refill(p);
    const mastered = p.cards.filter((c) => c.mastered).length, work = p.cards.filter((c) => c.seen && !c.mastered).length;
    paint(head('Карточки', '<span id="csub"></span>', plusBtn('cplus', 'Добавить')) + seg('ctab', [['learn', 'Учить'], ['drill', 'Закрепить'], ['deck', 'Колода']], cst.tab) + (p.cards.filter((c) => c.seen).length >= 4 ? '<div class="list cta" id="vwlink" style="margin-top:12px"><a class="rowi" href="#vw"><div class="grow"><b>Задание IELTS со своими словами</b><div class="mut" style="margin-top:2px">Эссе, график или письмо — с выученными словами</div></div></a></div>' : '') + '<div id="cbody" style="margin-top:16px"></div>');
    bindSeg('ctab', (v) => { cst.tab = v; if (v === 'drill') cst.dr = null; drawCards(); });
    $('#cplus').onclick = () => openSheet('<h2>Новая карточка</h2><div class="stack"><input id="cf" placeholder="Слово или фраза (English)" autocomplete="off"><input id="cb" placeholder="Перевод" autocomplete="off"><input id="cx" placeholder="Предложение с этим словом" autocomplete="off"><button class="btn p" id="cadd">Добавить</button></div>' +
      '<h3>Импорт</h3><textarea id="csv" placeholder="слово;перевод;пример — по одной на строку (или front;back)"></textarea><div style="margin-top:10px"><button class="btn" id="cimp">Импортировать</button></div>', () => {
      $('#cadd').onclick = () => { const f = $('#cf').value.trim(), b = $('#cb').value.trim(); if (!f || !b) { toast('Заполни слово и перевод'); return; } addWordCard(p, f, b, $('#cx').value.trim()); sess = null; save(); closeSheet(); toast('Добавлено'); route(); };
      $('#cimp').onclick = () => {
        let n = 0; $('#csv').value.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => { const a = l.split(';').map((x) => x.trim()); if (a.length >= 3 && a[0] && a[1]) { addWordCard(p, a[0], a[1], a.slice(2).join('; ')); n++; } else if (a.length === 2 && a[0] && a[1]) { p.cards.push(E.newCard(a[0], a[1])); n++; } });
        sess = null; save(); closeSheet(); toast('Добавлено: ' + n); route();
      };
    });
    drawCards();
  }
  function updSub() {
    const p = P(); const el = $('#csub'); if (!el) return;
    el.textContent = p.cards.filter((c) => c.mastered).length + ' выучено из ' + p.cards.length + ' · в работе ' + p.cards.filter((c) => c.seen && !c.mastered).length;
  }
  function drawCards() { updSub(); if (cst.tab === 'deck') drawDeck(); else if (cst.tab === 'drill') drawDrill(); else drawLearn(); }
  const RATES = [['0', 'Снова'], ['1', 'Трудно'], ['2', 'Хорошо'], ['3', 'Легко']];
  const rateRow = () => '<div class="grid4" style="margin-top:14px">' + RATES.map(([q, n]) => '<button class="btn' + (q === '2' ? ' p' : '') + '" style="padding:0" data-q="' + q + '">' + n + '</button>').join('') + '</div>';

  function applyRate(p, c, q) {
    c.rv = (c.rv || 0) + 1;
    const t0 = today();
    if (!c.seen) p.newToday.n += 1;
    if (!c.fs) c.fs = t0; c.ls = t0;
    if (c.mastered) {
      const r = E.reviewMastered(c, q, t0); sess.doneM[c.id] = true;
      if (r === 'relearn') { if (!sess.active.includes(c.id)) sess.active.push(c.id); sess.due[c.id] = sess.counter + E.GAPS[0]; }
    } else sess.due[c.id] = sess.counter + E.lrRate(c, q);
    sess.counter += 1; sess.last = c.id; save(); cst.cur = null; refill(p); drawCards();
  }
  function drawLearn() {
    const p = P(); const body = $('#cbody'); const id = E.pickNext(p.cards, sess);
    if (!id) {
      body.innerHTML = grpBar(p) + '<div class="card enter" style="text-align:center;padding:30px 16px"><div class="big">✓</div><div class="mut" style="margin:6px 0 16px">На сейчас всё. Новых сегодня: ' + p.newToday.n + '</div><button class="btn p" id="cdrill">Закрепить мини-заданиями</button><div style="height:10px"></div><button class="btn" id="cmore">Ещё 10 новых слов</button></div>';
      $$('#gf button').forEach((b) => { b.onclick = () => { p.cgrp = b.dataset.g; sess = null; cst.cur = null; save(); ensureSess(p); refill(p); drawCards(); }; });
      $('#cdrill').onclick = () => { cst.tab = 'drill'; cst.dr = null; viewCards(); };
      $('#cmore').onclick = () => { p.newToday.extra = (p.newToday.extra || 0) + 10; save(); sess = null; ensureSess(p); refill(p); drawCards(); };
      return;
    }
    const c = p.cards.find((x) => x.id === id);
    if (cst.cur !== id) { cst.cur = id; cst.step = 'q'; cst.pick = null; cst.hint = false; cst.mq = E.isWord(c) && !c.mastered && E.lrMode(c) === 'mcq' ? E.mcq(c, p.cards) : null; }
    const word = E.isWord(c); const review = !!c.mastered; const mode = review ? 'flip' : E.lrMode(c);
    const gl = E.GROUP_LABEL[E.group(c)];
    const lvl = grpBar(p) + '<div class="mut" style="text-align:center;margin-bottom:8px"><span class="chip on">' + esc(gl) + '</span> ' + (review ? 'Повторение выученного' : 'Уровень ' + (c.lv || 0) + ' из 5') + '</div>';
    const how = (t) => '<p class="mut" style="text-align:center;margin:0 0 10px;font-size:14px">' + t + '</p>';
    const mst = review ? '' : '<div style="text-align:center;margin-top:6px"><button class="link" id="mst">Выучил — больше не заучивать</button></div>';
    let h = '<div class="enter">' + lvl;
    if (mode === 'flip') {
      h += how(word ? 'Прочитай слово и пример, вспомни перевод. Потом нажми «Показать перевод» и честно оцени.' : 'Это шаблонная фраза (' + esc(gl) + '). Вспомни, как сказать по-английски, затем открой ответ.');
      if (word) h += '<div class="flash"><small>' + (POS[c.pos] || '') + (c.cef ? ' · ' + c.cef : '') + '</small><div class="term">' + esc(c.t) + '</div><div class="exm">' + hl(E.exOf(c)) + '</div></div>' + (cst.step === 'a' ? '<div class="flash back"><div><b>' + esc(c.ru) + '</b>' + trLine(c) + '</div></div>' : '');
      else h += '<div class="flash">' + esc(c.f) + '</div>' + (cst.step === 'a' ? '<div class="flash back">' + esc(c.b) + '</div>' : '');
      h += cst.step === 'a' ? '<p class="mut" style="text-align:center;margin:10px 0 0;font-size:13px">Снова — вернётся через 2 карточки · Трудно — через 5 · Хорошо — через 10 · Легко — через 20</p>' + rateRow() + mst : '<div style="margin-top:14px"><button class="btn p" id="show">Показать перевод</button></div>';
    } else if (mode === 'mcq') {
      const q = cst.mq; h += how('Выбери слово, которое подходит в пропуск.');
      h += '<div class="flash"><small>' + (cst.hint ? 'перевод: ' + esc(c.ru) : 'Выбери слово') + '</small><div class="exm" style="font-size:19px">' + esc(q.text) + '</div></div><div class="opts">' +
        q.opts.map((o, i) => '<button class="opt' + (cst.pick != null ? (i === q.answer ? ' ok' : i === cst.pick ? ' bad' : '') : '') + '" data-o="' + i + '"' + (cst.pick != null ? ' disabled' : '') + '>' + esc(o) + '</button>').join('') + '</div>';
      if (cst.pick == null && !cst.hint) h += '<div style="text-align:center;margin-top:8px"><button class="link" id="hint">Взять подсказку</button></div>';
      if (cst.pick != null) h += '<div class="flash back" style="font-size:17px"><div>' + hl(E.exOf(c)) + trLine(c) + '</div></div><div style="margin-top:14px"><button class="btn p" id="next">Дальше</button></div>' + (cst.pick === q.answer ? mst : '');
    } else {
      h += how('Составь своё предложение с этим словом — так оно запомнится надёжнее всего.');
      h += '<div class="flash"><small>Напиши своё предложение</small><div class="term">' + esc(c.t) + '</div><div class="mut">' + esc(c.ru) + '</div></div>';
      if (cst.step === 'q') h += '<textarea id="mys" style="margin-top:12px;min-height:90px" placeholder="Предложение со словом «' + esc(c.t) + '»" spellcheck="false" autocapitalize="sentences"></textarea><div style="margin-top:12px"><button class="btn p" id="chk">Проверить</button></div>';
      else {
        const r = cst.res; h += '<div class="card" style="margin-top:12px"><div class="mut">Твоё предложение:</div><div style="font-size:16px;margin:2px 0 10px">' + esc(cst.mine || '') + '</div><div style="font-weight:600;color:var(--' + (r.ok ? 'ok' : 'warn') + ')">' + (r.ok ? 'Хорошее предложение' : 'Можно лучше') + '</div>' + (r.tips.length ? '<ul class="mut" style="margin:6px 0 0;padding-left:18px">' + r.tips.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
          ltHtml(cst.mine || '', cst.lt) + '<div class="mut" style="margin-top:10px">Примеры в контексте:</div>' + E.exAll(c).concat(E.contexts(c, p.cards, 3)).map((x) => '<div class="exm" style="font-size:15px;margin-top:4px">' + hl(x) + '</div>').join('') + trLine(c) + '</div>' + rateRow() + mst;
      }
    }
    body.innerHTML = h + '</div>';
    $$('#gf button').forEach((b) => { b.onclick = () => { p.cgrp = b.dataset.g; sess = null; cst.cur = null; save(); ensureSess(p); refill(p); drawCards(); }; });
    const ht = $('#hint'); if (ht) ht.onclick = () => { cst.hint = true; drawLearn(); };
    const sh = $('#show'); if (sh) sh.onclick = () => { cst.step = 'a'; drawLearn(); };
    $$('button[data-q]').forEach((b) => { b.onclick = () => applyRate(p, c, +b.dataset.q); });
    $$('.opt').forEach((b) => { b.onclick = () => { cst.pick = +b.dataset.o; drawLearn(); }; });
    const nx = $('#next'); if (nx) nx.onclick = () => applyRate(p, c, cst.pick === cst.mq.answer ? 2 : 0);
    const ck = $('#chk'); if (ck) ck.onclick = () => {
      const s = $('#mys').value.trim(); if (!s) { toast('Напиши предложение'); return; }
      cst.res = E.checkSentence(c, s); cst.mine = s; cst.lt = cst.res.issues.length ? cst.res.issues.slice() : undefined; c.my = (c.my || []).concat([s]).slice(-3); save(); cst.step = 'a'; drawLearn();
      ltCheck(s).then((ms) => { if (cst.mine === s && cst.step === 'a') { const own = (cst.res.issues || []).filter((x) => !(ms || []).some((m) => m.offset < x.offset + x.length && x.offset < m.offset + m.length)); cst.lt = ms === null && !own.length ? null : (ms || []).concat(own); drawLearn(); } });
    };
    const m = $('#mst'); if (m) m.onclick = () => { if (!c.seen) p.newToday.n += 1; E.master(c, today()); sess.last = c.id; save(); cst.cur = null; toast('Выучено — повторю через 3 дня'); refill(p); drawCards(); };
  }
  const grpBar = (p) => '<div class="chips" id="gf" style="margin:0 -18px 12px">' + [['main', 'Основное'], ...E.GROUPS, ['all', 'Все']].map(([k, n]) => '<button data-g="' + k + '" class="' + (k === grpOf(p) ? 'on' : '') + '">' + esc(n) + '</button>').join('') + '</div>';
  // ---------- Закрепление: мини-задания ----------
  function startDrill(p) {
    const q = E.drillQueue(p.cards, today(), 12);
    cst.dr = { q, i: 0, bad: {}, ids: Array.from(new Set(q.map((x) => x.id))), done: false };
  }
  function drawDrill() {
    const p = P(); const body = $('#cbody'); if (!cst.dr) startDrill(p); const d = cst.dr;
    document.body.classList.remove('drilling');
    if (!d.q.length) { body.innerHTML = '<div class="card" style="text-align:center;padding:26px 16px"><div class="big">📚</div><div class="mut" style="margin:8px 0 16px">Пока нечего закреплять: сначала пройди несколько карточек на вкладке «Учить».</div><button class="btn p" id="gol">К карточкам</button></div>'; $('#gol').onclick = () => { cst.tab = 'learn'; viewCards(); }; return; }
    const it = d.q[d.i];
    if (!it) {
      if (!d.done) { d.done = true; const t0 = today(); d.ids.forEach((id) => { const c = p.cards.find((x) => x.id === id); if (!c) return; c.fs = c.fs || t0; c.ls = t0; c.lv = d.bad[id] ? Math.max(0, (c.lv || 0) - 1) : Math.min(5, (c.lv || 0) + 1); }); save(); }
      const weak = d.ids.filter((id) => d.bad[id]).map((id) => p.cards.find((x) => x.id === id)).filter(Boolean);
      body.innerHTML = '<div class="card enter" style="text-align:center;padding:22px 16px"><div class="big">' + (weak.length ? '👍' : '🎉') + '</div><div style="font-weight:600;margin:6px 0">Верно с первого раза: ' + (d.ids.length - weak.length) + ' из ' + d.ids.length + '</div>' +
        (weak.length ? '<div class="mut" style="margin:6px 0 4px">Эти слова ещё стоит повторить:</div><div class="stack" style="text-align:left">' + weak.map((c) => '<div class="card" style="padding:10px 12px"><b>' + esc(c.t) + '</b> — ' + esc(c.ru) + '</div>').join('') + '</div>' : '<div class="mut">Уровень слов повышен.</div>') +
        '<div style="margin-top:16px"><button class="btn p" id="again">Ещё раунд</button></div><div style="margin-top:8px"><button class="btn" id="gol">К карточкам</button></div></div>';
      $('#again').onclick = () => { cst.dr = null; drawDrill(); }; $('#gol').onclick = () => { cst.tab = 'learn'; sess = null; viewCards(); };
      return;
    }
    document.body.classList.add('drilling');
    const c = p.cards.find((x) => x.id === it.id);
    if (!it.m) { if (it.type === 'gap') it.m = E.mcq(c, p.cards); else if (it.type === 'ru2en') it.m = E.choices(c, p.cards, 't'); else if (it.type === 'en2ru') it.m = E.choices(c, p.cards, 'ru'); }
    it.h = it.h || 0;
    const optsH = (m) => '<div class="opts">' + m.opts.map((o, i) => '<button class="opt' + (it.pick != null ? (i === m.answer ? ' ok' : i === it.pick ? ' bad' : '') : '') + '" data-o="' + i + '"' + (it.pick != null ? ' disabled' : '') + '>' + esc(o) + '</button>').join('') + '</div>';
    const maxH = it.type === 'type' ? 2 : it.type === 'gap' ? 1 : 0;
    const answered = it.type === 'type' ? it.res != null : it.pick != null;
    const tr = (it.h >= 1 || answered) && (it.type === 'gap' || it.type === 'type') ? '<small>перевод: ' + esc(c.ru) + '</small>' : '';
    const lab = esc(E.GROUP_LABEL[E.group(c)]);
    let card = '';
    if (it.type === 'gap') card = '<div class="flash">' + (tr || '<small>Вставь слово в пропуск</small>') + '<div class="exm">' + (answered ? hl(E.exOf(c)) + trLine(c) : esc(it.m.text)) + '</div></div>' + optsH(it.m);
    else if (it.type === 'ru2en') card = '<div class="flash"><small>Как это по-английски? · ' + lab + '</small><div class="term" style="font-size:24px">' + esc(c.ru) + '</div>' + (answered ? '<div class="exm" style="font-size:16px">' + hl(E.exOf(c)) + trLine(c) + '</div>' : '') + '</div>' + optsH(it.m);
    else if (it.type === 'en2ru') card = '<div class="flash"><small>Выбери перевод · ' + lab + '</small><div class="term">' + esc(c.t) + '</div><div class="exm" style="font-size:16px">' + hl(E.exOf(c)) + (answered ? trLine(c) : '') + '</div></div>' + optsH(it.m);
    else card = '<div class="flash">' + (tr || '<small>Впиши пропущенное слово</small>') + '<div class="exm">' + (answered ? hl(E.exOf(c)) + trLine(c) : esc(String(E.exOf(c)).replace(/\[\[[^\[\]]+\]\]/, '_____'))) + '</div>' + (!answered && it.h >= 2 ? '<div class="mut" style="letter-spacing:2px;margin-top:6px">' + esc(E.hintOf(c)) + '</div>' : '') + (answered && it.res !== 'ok' ? '<div class="mut" style="margin-top:4px">' + (it.res === 'near' ? 'Почти — опечатка' : 'Не совсем') + '</div>' : '') + '</div>' +
      (it.res == null ? '<input id="dr_in" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="слово" style="margin-top:10px">' : '');
    let act = '';
    if (answered) act = '<button class="btn p" id="dr_next">Дальше</button>';
    else {
      if (it.type === 'type') act += '<button class="btn p" id="dr_ok">Проверить</button>';
      if (it.h < maxH) act += '<div style="text-align:center;margin-top:8px"><button class="link" id="dr_hint">' + (it.type === 'type' && it.h === 1 ? 'Ещё подсказка: первая буква' : 'Взять подсказку') + '</button></div>';
    }
    body.innerHTML = '<div class="drill enter"><div class="dtop"><span class="mut">' + (d.i + 1) + ' из ' + d.q.length + '</span><button class="link" id="dr_x">Выйти</button></div>' + card + '<div style="margin-top:10px">' + act + '</div></div>';
    const fin = (ok) => { if (!ok) { d.bad[c.id] = true; if (!it.retry) d.q.push({ id: c.id, type: it.type, retry: true }); } };
    $$('.opt').forEach((b) => { b.onclick = () => { it.pick = +b.dataset.o; fin(it.pick === it.m.answer); drawDrill(); }; });
    const ok = $('#dr_ok'); if (ok) { const go = () => { const v = $('#dr_in').value.trim(); if (!v) { toast('Впиши слово'); return; } it.res = E.typeCheck(c, v); fin(it.res !== 'bad'); drawDrill(); }; ok.onclick = go; $('#dr_in').onkeydown = (e) => { if (e.key === 'Enter') go(); }; }
    const ht = $('#dr_hint'); if (ht) ht.onclick = () => { const v = $('#dr_in') ? $('#dr_in').value : ''; it.h += 1; drawDrill(); if (v && $('#dr_in')) $('#dr_in').value = v; };
    const nx = $('#dr_next'); if (nx) nx.onclick = () => { c.rv = (c.rv || 0) + 1; d.i += 1; drawDrill(); };
    $('#dr_x').onclick = () => { cst.tab = 'learn'; cst.dr = null; viewCards(); };
  }
  let deckF = 'all', deckQ = '', deckG = 'all';
  function drawDeck() {
    const p = P();
    $('#cbody').innerHTML = '<input id="dq" type="search" placeholder="Поиск по слову или переводу" value="' + esc(deckQ) + '" autocomplete="off"><div class="chips" id="df" style="margin:12px -18px 14px">' +
      [['all', 'Все'], ['work', 'В работе'], ['done', 'Выучено'], ['new', 'Новые']].map(([k, n]) => '<button data-f="' + k + '" class="' + (k === deckF ? 'on' : '') + '">' + n + '</button>').join('') + '</div><div class="chips" id="dgp" style="margin:-6px -18px 14px">' + [['all', 'Все группы'], ...E.GROUPS].map(([k, n]) => '<button data-g="' + k + '" class="' + (k === deckG ? 'on' : '') + '">' + esc(n) + '</button>').join('') + '</div><div id="dl"></div>';
    const draw = () => {
      const q = deckQ.toLowerCase();
      const list = p.cards.filter((c) => (deckF === 'all' || (deckF === 'done' && c.mastered) || (deckF === 'work' && c.seen && !c.mastered) || (deckF === 'new' && !c.seen)) &&
        (deckG === 'all' || E.group(c) === deckG) && (!q || ((c.t || c.f || '') + ' ' + (c.ru || c.b || '')).toLowerCase().includes(q)));
      $('#dl').innerHTML = (list.length ? '<div class="list">' + list.slice(0, 80).map((c) => '<button class="rowi" data-c="' + esc(c.id) + '"><div class="grow"><b>' + esc(c.t || c.f) + '</b><div class="mut" style="margin-top:2px">' + esc(E.GROUP_LABEL[E.group(c)]) + ' · ' + esc(c.ru || String(c.b).slice(0, 60)) + '</div></div><span class="chip' + (c.mastered ? ' on' : '') + '">' + (c.mastered ? 'выучено' : c.seen ? 'ур. ' + (c.lv || 0) : 'новое') + '</span></button>').join('') + '</div>' : '<div class="mut" style="text-align:center">Ничего не найдено</div>') +
        (list.length > 80 ? '<p class="mut" style="text-align:center">Показаны первые 80 из ' + list.length + ' — уточни поиск</p>' : '');
      $$('[data-c]').forEach((b) => b.onclick = () => {
        const c = p.cards.find((x) => x.id === b.dataset.c);
        openSheet('<h2>' + esc(c.t || c.f) + '</h2>' + (E.isWord(c) ? '<p class="mut">' + (POS[c.pos] || '') + (c.cef ? ' · ' + c.cef : '') + ' · ' + esc(c.ru) + '</p><div class="card exm" style="font-size:16px">' + E.exAll(c).map(hl).join('<br>') + '</div>' : '<div class="card">' + esc(c.b) + '</div>') +
          (c.my && c.my.length ? '<h3>Мои предложения</h3><div class="stack">' + c.my.map((s) => '<div class="card" style="font-size:15px">' + esc(s) + '</div>').join('') + '</div>' : '') +
          '<div style="margin-top:16px"><button class="btn' + (c.mastered ? '' : ' p') + '" id="dm">' + (c.mastered ? 'Вернуть в заучивание' : 'Отметить выученной') + '</button></div>', () => {
          $('#dm').onclick = () => { if (c.mastered) E.unmaster(c); else E.master(c, today()); sess = null; save(); closeSheet(); toast(c.mastered ? 'Выучено' : 'Снова в работе'); viewCards(); };
        });
      });
    };
    $('#dq').oninput = (e) => { deckQ = e.target.value; draw(); };
    $$('#dgp button').forEach((b) => b.onclick = () => { deckG = b.dataset.g; $$('#dgp button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
    $$('#df button').forEach((b) => b.onclick = () => { deckF = b.dataset.f; $$('#df button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
    draw();
  }

  // ---------- Практика: текст с выученными словами ----------
  let vw = null;
  function vwPick(p) {
    const t0 = today(); const seen = p.cards.filter((c) => c.seen && c.t && c.ex).sort((a, b) => ((a.wu || 0) - (b.wu || 0)) || (hash(a.id + t0) - hash(b.id + t0)));
    const out = []; const k = {};
    seen.forEach((c) => { if (out.length < 6 && (k[c.pos] || 0) < 2) { k[c.pos] = (k[c.pos] || 0) + 1; out.push(c.id); } });
    seen.forEach((c) => { if (out.length < 6 && !out.includes(c.id)) out.push(c.id); });
    return out;
  }
  function viewVw() {
    const p = P(); const t0 = today(); const W = WRITING;
    let h = head('Задание IELTS со словами', 'Выполни задание, используя выученные слова', back('#cards'));
    if (p.cards.filter((c) => c.seen && c.t && c.ex).length < 4) { paint(h + '<div class="card">Сначала выучи хотя бы 4 карточки — потом сюда попадут именно они.</div>'); return; }
    if (!vw || vw.pid !== p.id || vw.date !== t0) { const ids = vwPick(p); vw = { pid: p.id, date: t0, ids, res: null, kind: ['t2', 't2', 't1', 'gt'][hash(t0) % 4], n: 0 }; }
    const kind = vw.kind; const pool = kind === 't2' ? W.task2 : kind === 't1' ? W.task1 : W.gt;
    const task = pool[(hash(t0 + kind) + vw.n) % pool.length]; const key = 'vw' + kind + task.id;
    const need = kind === 't1' ? 3 : 4;
    const cs = vw.ids.map((id) => p.cards.find((c) => c.id === id)).filter(Boolean);
    const draft = (p.drafts && p.drafts[key]) || '';
    const qtext = (task.q || task.title) + (kind === 't1' ? '\nDATA (' + task.kind + '): ' + dataText(task) : '');
    h += seg('vk', [['t2', 'Задание 2 (эссе)'], ['t1', 'Задание 1 (график)'], ['gt', 'Письмо']], kind);
    h += '<div class="card" style="margin-top:12px"><div class="mut">' + (kind === 't2' ? 'Задание 2 · ' + esc(task.topic) : kind === 't1' ? 'Задание 1' : 'Письмо · ' + esc(task.tone)) + ' · минимум ' + (kind === 't2' ? 250 : 150) + ' слов</div><p style="margin:6px 0 0">' + esc(task.q || task.title) + '</p>' + (kind === 't1' ? '<div style="margin-top:12px">' + chartHtml(task) + '</div>' : '') + '</div>';
    h += '<h3>Вплети минимум ' + need + ' из 6 слов</h3><div class="list">' + cs.map((c, i) => '<div class="rowi"><div class="grow"><b>' + esc(c.t) + '</b> <span class="mut">— ' + esc(c.ru) + '</span><div class="mut" style="margin-top:2px">' + (vw.res ? (vw.res.used[i] ? '✓ использовано' : '✗ не найдено') + ' · ' : '') + hl(E.exOf(c)) + '</div></div></div>').join('') + '</div>';
    h += '<textarea id="vt" style="min-height:240px;margin-top:12px" spellcheck="false" placeholder="Пиши ответ на задание. Слова должны звучать естественно, а не вставляться в каждое предложение. Черновик сохраняется сам.">' + esc(draft) + '</textarea><div class="mut" id="vwc" style="margin:4px 2px 0"></div>';
    if (vw.res) h += '<div class="card" style="margin-top:12px"><b>' + vw.res.n + ' из ' + cs.length + '</b> слов использовано' + (vw.res.n >= need ? ' — зачтено.' : ' — нужно минимум ' + need + '.') + (vw.res.short ? '<div class="mut" style="margin-top:6px">Текст короче нормы IELTS (' + vw.res.wc + ' слов).</div>' : '') + '<div class="mut" style="margin-top:6px">Оценку и проверку естественности слов даст ИИ: «Промпт для ИИ», затем «Загрузить отчёт ИИ».</div>' + (kind === 't2' ? typesHtml(vw.text || '') : '') + ltHtml(vw.text || '', vw.lt) + '</div>';
    h += '<div style="margin-top:12px"><button class="btn p" id="vchk">Проверить слова</button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button class="btn" id="vcopy">Промпт для ИИ</button><button class="btn" id="vimp">Загрузить отчёт ИИ</button></div><div style="text-align:center"><button class="link" id="vnew">Другое задание и слова</button></div>';
    paint(h);
    bindSeg('vk', (v) => { vw.kind = v; vw.res = null; vw.n = 0; viewVw(); });
    const upd = () => { const a = E.analyseText($('#vt').value, kind); $('#vwc').textContent = a.words + ' слов · цель ' + a.minWords + '+'; $('#vwc').style.color = a.words && a.short ? 'var(--warn)' : ''; };
    $('#vt').oninput = () => { upd(); p.drafts[key] = $('#vt').value; save(); }; upd();
    $('#vchk').onclick = () => {
      const text = $('#vt').value.trim(); const a = E.analyseText(text, kind);
      if (a.words < 20) { toast('Напиши хотя бы 20 слов'); return; }
      const used = cs.map((c) => E.checkSentence(c, text).used); const n = used.filter(Boolean).length;
      used.forEach((u, i) => { if (u) cs[i].wu = (cs[i].wu || 0) + 1; });
      p.vwrites = p.vwrites || []; p.vwrites.push({ date: t0, ids: vw.ids.slice(), n, wc: a.words, kind, task: task.id, text });
      vw.res = { used, n, wc: a.words, short: a.short }; vw.lt = undefined; vw.text = text; save(); viewVw(); ltCheck(text).then((ms) => { if (vw && vw.text === text) { vw.lt = ms; viewVw(); } }); toast(n >= need ? 'Зачтено: ' + n + ' из ' + cs.length : 'Использовано: ' + n);
    };
    const full = () => qtext + '\n\nThe candidate was asked to use these target expressions naturally: ' + cs.map((c) => c.t).join('; ') + '. Also comment, for each one, whether it is used correctly and naturally (collocation, form, register), and suggest a better alternative if not.';
    $('#vcopy').onclick = () => { const text = $('#vt').value.trim(); if (!text) { toast('Сначала напиши текст'); return; } copyText(buildPrompt(kind, full(), text)); };
    $('#vimp').onclick = () => importSheet(p, kind, 'vw:' + task.id);
    $('#vnew').onclick = () => { cs.forEach((c) => { c.wu = (c.wu || 0) + 1; }); vw = Object.assign(vw, { ids: vwPick(p), res: null, n: vw.n + 1 }); vw.ids = vwPick(p); save(); viewVw(); };
  }

  // ---------- Ошибки ----------
  const aiRow = () => '<div class="list cta" style="margin-bottom:14px"><button class="rowi" data-ai="1"><div class="grow"><b>Загрузить отчёт ИИ</b><div class="mut" style="margin-top:2px">Вставь ответ проверяющего — баллы и ошибки сохранятся</div></div></button></div>';
  const fixBanner = (n) => '<div class="list cta" style="margin-bottom:14px"><a class="rowi" href="#fix"><div class="grow"><b>Исправь свои ошибки</b><div class="mut" style="margin-top:2px">' + n + ' фраз на сегодня</div></div>' + ico('chev', 'chev') + '</a></div>';
  const errDots = (e) => (E.errDrillable && !E.errDrillable(e)) ? '' : ' <span class="mut" style="letter-spacing:2px;color:var(--acc)">' + (e.done ? '✓' : '●'.repeat(e.n || 0) + '○'.repeat(3 - (e.n || 0))) + '</span>';
  // ---------- Исправь свои ошибки ----------
  let fixQ = null;
  function viewFix() {
    const p = P(); const t0 = today();
    if (!fixQ || fixQ.date !== t0 || fixQ.fresh) fixQ = { date: t0, ids: E.errDue(p.errors, t0).map((e) => e.id), ok: 0, bad: 0, step: 'q', res: null, total: 0 };
    if (!fixQ.total) fixQ.total = fixQ.ids.length;
    const e = fixQ.ids.length ? p.errors.find((x) => x.id === fixQ.ids[0]) : null;
    if (e && !e.ctx) { const c = E.findCtx(userTexts(p), e.snippet); if (c) { e.ctx = c; save(); } }
    let h = head('Исправь', fixQ.total ? 'Сделано ' + (fixQ.ok + fixQ.bad) + ' из ' + fixQ.total : '', back('#errors'));
    if (!e) {
      const next = p.errors.filter((x) => E.errDrillable(x) && x.due).map((x) => x.due).sort()[0];
      h += '<div class="card" style="text-align:center;padding:32px 16px"><div class="big">✓</div><div style="margin-top:6px">' + (fixQ.total ? 'Верно: ' + fixQ.ok + ' · ошибок: ' + fixQ.bad : 'На сегодня исправлять нечего') + '</div><div class="mut" style="margin-top:6px">' + (next ? 'Следующее повторение: ' + esc(fmtD(next)) : 'Загрузи оценку ИИ в письменной части — ошибки появятся здесь') + '</div></div>';
      paint(h); return;
    }
    const dots = e.done ? '✓ закрыта' : '●'.repeat(e.n || 0) + '○'.repeat(3 - (e.n || 0));
    h += '<div class="flash" style="min-height:0"><small><span class="chip">' + esc(e.tag) + '</span> <span style="letter-spacing:2px;color:var(--acc)">' + dots + '</span></small>' + (E.ctxParts(e) ? '<div class="mut">Исправь выделенную часть предложения</div><div class="term" style="font-size:19px;line-height:1.45;margin-top:8px;font-weight:600">' + esc(E.ctxParts(e).a) + '<mark class="gap">' + esc(E.ctxParts(e).bad) + '</mark>' + esc(E.ctxParts(e).b) + '</div>' : '<div class="mut">Перепиши без ошибки</div><div class="term" style="font-size:22px;margin-top:8px">«' + esc(e.snippet) + '»</div>') + '</div>';
    if (fixQ.step === 'q') h += '<input id="fx" style="margin-top:12px" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Правильный вариант"><div style="margin-top:12px"><button class="btn p" id="fchk">Проверить</button></div><div style="text-align:center"><button class="link" id="fskip">Не помню — показать ответ</button></div>';
    else h += '<div class="card" style="margin-top:12px"><div style="font-weight:600;color:var(--' + (fixQ.res.ok ? 'ok' : 'warn') + ')">' + (fixQ.res.ok ? (fixQ.res.r === 'closed' ? 'Верно — ошибка закрыта' : 'Верно') : 'Не совсем') + '</div><div style="margin-top:6px">Правильно: <b>' + esc(e.fix) + '</b></div>' + (E.ctxParts(e, true) ? '<div class="exm" style="font-size:16px">' + esc(E.ctxParts(e, true).a) + '<b>' + esc(E.ctxParts(e, true).bad) + '</b>' + esc(E.ctxParts(e, true).b) + '</div>' : '') + '<div style="margin-top:8px"><button class="link" id="fedit">Эталон неверный? Исправить запись</button></div>' + (fixQ.res.ok ? '<div class="mut" style="margin-top:6px">Следующий показ: ' + esc(fmtD(e.due)) + '</div>' : '<div class="mut" style="margin-top:6px">Вернётся в этой же серии</div>') + '</div><div style="margin-top:12px"><button class="btn p" id="fnext">Дальше</button></div>';
    paint(h, fixQ.step === 'q' && fixQ.ok + fixQ.bad === 0);
    const fin = (ok) => { const r = E.errRate(e, ok, t0); fixQ.res = { ok, r }; if (ok) fixQ.ok++; else fixQ.bad++; fixQ.step = 'a'; save(); viewFix(); };
    const c = $('#fchk'); if (c) c.onclick = () => { const v = $('#fx').value.trim(); if (!v) { toast('Напиши исправленный вариант'); return; } fin(E.errCheck(e, v)); };
    const fe = $('#fedit'); if (fe) fe.onclick = () => editErr(p, e, () => viewFix());
    const sk = $('#fskip'); if (sk) sk.onclick = () => fin(false);
    const fx = $('#fx'); if (fx) fx.onkeydown = (ev) => { if (ev.key === 'Enter') c.click(); };
    const nx = $('#fnext'); if (nx) nx.onclick = () => { const id = fixQ.ids.shift(); if (!fixQ.res.ok) fixQ.ids.push(id); fixQ.step = 'q'; fixQ.res = null; viewFix(); };
  }


  const userTexts = (p) => [].concat((p.writes || []).map((w) => w.text), (p.vwrites || []).map((w) => w.text), Object.keys(p.drafts || {}).map((k) => p.drafts[k]), p.cards.reduce((a, c) => a.concat(c.my || []), []));
  function editErr(p, e, done) {
    openSheet('<h2>Запись об ошибке</h2><div class="stack"><label>Предложение целиком</label><textarea id="eec" style="min-height:70px">' + esc(e.ctx || '') + '</textarea><label>Фрагмент с ошибкой</label><input id="ees" value="' + esc(e.snippet) + '"><label>Правильно (только этот фрагмент)</label><input id="eef" value="' + esc(e.fix || '') + '"><button class="btn p" id="eesv">Сохранить</button><button class="btn" id="eedl">Удалить запись</button></div>', () => {
      $('#eesv').onclick = () => { const sn = $('#ees').value.trim(); if (!sn) { toast('Укажи фрагмент'); return; } e.snippet = sn; e.fix = $('#eef').value.trim(); e.ctx = $('#eec').value.trim(); if (e.ctx && e.ctx.toLowerCase().indexOf(sn.toLowerCase()) < 0) { toast('Фрагмент должен входить в предложение'); return; } e.n = 0; e.done = false; save(); closeSheet(); toast('Сохранено'); (done || route)(); };
      $('#eedl').onclick = () => { p.errors = p.errors.filter((x) => x.id !== e.id); if (fixQ && fixQ.ids) fixQ.ids = fixQ.ids.filter((x) => x !== e.id); save(); closeSheet(); toast('Удалено'); route(); };
    });
  }
  function viewErrors() {
    const p = P(); const t0 = today(); const sev = E.errorSeverity(p.errors, t0);
    const top = Object.keys(sev).sort((a, b) => sev[b] - sev[a]).slice(0, 5);
    let h = head('Ошибки', p.errors.length ? 'Записей: ' + p.errors.length : 'Пока пусто', plusBtn('eplus', 'Добавить'));
    const dueN = E.errDue(p.errors, t0).length;
    h += aiRow();
    if (dueN) h += fixBanner(dueN);
    if (top.length) h += '<div class="chips" style="margin-bottom:14px">' + top.map((t) => '<span class="chip on" style="flex:none">' + esc(t) + ' · ' + p.errors.filter((e) => e.tag === t && e.date >= E.addDays(t0, -30)).length + '</span>').join('') + '</div>';
    if (p.errors.length) h += '<div class="list">' + p.errors.slice().reverse().slice(0, 100).map((e) => '<button class="rowi" data-e="' + esc(e.id) + '"><div class="grow"><div><span class="chip">' + esc(e.tag) + '</span> <span class="mut">' + esc(fmtD(e.date)) + '</span>' + errDots(e) + '</div><div style="margin-top:6px">' + esc(e.snippet) + (e.fix ? ' <span class="mut">→</span> <b>' + esc(e.fix) + '</b>' : '') + '</div>' + (e.ctx ? '<div class="mut" style="margin-top:4px;font-size:14px">' + esc(e.ctx) + '</div>' : '') + '</div></button>').join('') + '</div>';
    else h += '<div class="card mut" style="text-align:center;padding:28px">Записывай ошибки из тестов и проверок: самые частые попадут в задания.</div>';
    paint(h);
    $('#eplus').onclick = () => openSheet('<h2>Новая ошибка</h2><div class="stack"><select id="etag">' + TAGS.map((t) => '<option>' + t + '</option>').join('') + '</select><input id="esn" placeholder="Фрагмент с ошибкой" autocomplete="off"><input id="efx" placeholder="Правильно" autocomplete="off"><textarea id="ecx" placeholder="Всё предложение целиком (лучше с ним)" style="min-height:70px"></textarea><button class="btn p" id="eadd">Добавить</button></div>', () => {
      $('#eadd').onclick = () => { const s = $('#esn').value.trim(); if (!s) { toast('Укажи фрагмент'); return; } const ne = { id: uid(), date: t0, tag: $('#etag').value, snippet: s, fix: $('#efx').value.trim() }; const cx = $('#ecx').value.trim(); if (cx && cx.toLowerCase().indexOf(s.toLowerCase()) >= 0) ne.ctx = cx; E.errInit(ne, t0); p.errors.push(ne); delete p.days[t0]; save(); closeSheet(); toast('Записано'); route(); };
    });
    $$('[data-e]').forEach((b) => b.onclick = () => {
      const e = p.errors.find((x) => x.id === b.dataset.e);
      if (!e.ctx) { const c = E.findCtx(userTexts(p), e.snippet); if (c) e.ctx = c; }
      editErr(p, e);
    });
  }

  // ---------- Проверка ----------
  const RUBRIC = {
    t2: 'Task 2 (Writing). Criteria: Task Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy. Penalise: unanswered parts of the question, over-generalisation, unclear position, weak paragraphing, over-used linkers, memorised phrases/clichés, imprecise collocations, word-form errors, spelling, errors in simple and complex sentences, punctuation.',
    t1: 'Task 1 Academic (Writing). Criteria: Task Achievement, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy. Check: clear overview, accurate key features, no opinions, correct data language, 150+ words.',
    gt: 'Task 1 General Training letter (Writing). Criteria: Task Achievement, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy. Check: all bullet points covered, purpose clear, tone consistent and appropriate, 150+ words.',
    sp: 'Speaking (judging from a transcript only — say that Pronunciation cannot be judged from text). Criteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation.',
  };
  function buildPrompt(kind, q, text) {
    return 'You are a strict, experienced IELTS examiner. Use the public IELTS band descriptors for this task type. Be conservative: if unsure, choose the LOWER band. Do not inflate scores.\n\n' + RUBRIC[kind] +
      '\n\nQUESTION:\n' + q + '\n\nCANDIDATE ' + (kind === 'sp' ? 'TRANSCRIPT' : 'RESPONSE') + ' (' + text.trim().split(/\s+/).filter(Boolean).length + ' words):\n' + text +
      (kind === 't2' ? '\n\nFor Grammatical Range and Accuracy, also state which sentence types the candidate used (simple, compound, complex, passive, question, conditional), how many are error-free, and which structure to attempt next.' : '') + '\n\nReturn:\n1) A band RANGE for each of the 4 criteria (e.g. 6.0–6.5), one short comment each.\n2) An overall range.\n3) The 3 highest-impact fixes.\n4) A list of errors, ONE per line, in EXACTLY this format: CODE: <the complete original sentence containing the error, copied verbatim> || <wrong fragment, copied verbatim from that sentence> → <corrected fragment>. Codes: W-ART, W-WF, W-SVA, W-PUNCT, W-COLL, W-REP, W-TR, W-CC; for speaking S-FC, S-LR, S-GRA. Example: W-TR: Did you ever needed a break? || Did you ever needed → Have you ever needed.\n\nACCURACY RULES for every correction: (a) put the corrected fragment back into the full sentence and re-read it: the sentence must be fully correct, natural English with the SAME meaning; (b) check tense and aspect carefully: present perfect with ever/never/already/yet/just/since/for/so far, past simple only with finished-time markers, no future will after if/when/as soon as in time or conditional clauses, correct sequence of tenses; (c) check subject-verb agreement, articles, countable/uncountable nouns, prepositions, word forms and collocations; (d) include enough words in the fragment (e.g. the auxiliary verb) so the whole fix is visible; (e) if you are not 100% sure, SEARCH THE WEB (Cambridge Dictionary and Cambridge Grammar, Oxford Collocations Dictionary, British Council LearnEnglish) and follow them; never invent a rule; (f) if a sentence is acceptable, do not list it as an error.\nFinish with one JSON line: {"c1":x,"c2":x,"c3":x,"c4":x} using the LOWER end of each range.';
  }
  const KINDS = [['t2', 'Задание 2 (эссе)'], ['t1', 'Задание 1 (график)'], ['gt', 'Письмо'], ['sp', 'Говорение']];
  const back = (href) => '<a class="ib" href="' + href + '" aria-label="Назад">' + ico('left') + '</a>';
  const avgOf = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

  // ----- таймер для страниц практики -----
  function timerRow(minutes, owner) {
    return '<div class="list" style="margin:14px 0"><button class="rowi" id="tmw" data-owner="' + owner + '"><span class="grow">Таймер</span><b id="tmt" data-owner="' + owner + '">' + (timer.end && timer.owner === owner ? '…' : minutes + ' мин') + '</b></button></div>';
  }
  function bindTimer(minutes, owner) {
    const b = $('#tmw'); if (!b) return;
    b.onclick = () => {
      if (timer.end && timer.owner === owner) { timer.end = 0; $('#tmt').textContent = minutes + ' мин'; return; }
      timer.end = Date.now() + minutes * 60000; timer.owner = owner; timer.idle = minutes + ' мин'; $('#tmt').textContent = p2(minutes) + ':00';
    };
  }

  // ----- графики Task 1 (SVG из данных) -----
  const COL = ['#0045fd', '#16a34a', '#d97706', '#db2777', '#0891b2'];
  function niceMax(v) { const s = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]; return s.find((x) => x >= v) || Math.ceil(v / 100) * 100; }
  const legend = (names) => '<div class="legend">' + names.map((n, i) => '<span><i style="background:' + COL[i % COL.length] + '"></i>' + esc(n) + '</span>').join('') + '</div>';
  function chartHtml(d) {
    const W = 340, H = 210, L = 40, R = 24, T = 12, B = 30; const iw = W - L - R, ih = H - T - B;
    if (d.kind === 'table') return '<div class="tbl"><table><tr>' + d.head.map((x) => '<th>' + esc(x) + '</th>').join('') + '</tr>' + d.rows.map((r) => '<tr>' + r.map((x) => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('') + '</table></div>';
    if (d.kind === 'pie') {
      const pie = (ch) => {
        let a0 = -Math.PI / 2; const tot = ch.parts.reduce((s, x) => s + x.v, 0); const cx = 80, cy = 80, r = 70;
        return '<div style="text-align:center"><svg viewBox="0 0 160 160" width="150" role="img" aria-label="' + esc(ch.label) + '">' + ch.parts.map((x, i) => {
          const a1 = a0 + 2 * Math.PI * x.v / tot; const large = a1 - a0 > Math.PI ? 1 : 0;
          const pth = '<path d="M' + cx + ' ' + cy + ' L' + (cx + r * Math.cos(a0)).toFixed(1) + ' ' + (cy + r * Math.sin(a0)).toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + (cx + r * Math.cos(a1)).toFixed(1) + ' ' + (cy + r * Math.sin(a1)).toFixed(1) + ' Z" fill="' + COL[i % COL.length] + '" stroke="var(--s)" stroke-width="2"/>';
          const am = (a0 + a1) / 2; a0 = a1;
          return pth + '<text x="' + (cx + r * 0.62 * Math.cos(am)).toFixed(1) + '" y="' + (cy + r * 0.62 * Math.sin(am) + 4).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + x.v + '</text>';
        }).join('') + '</svg><div class="mut"><b>' + esc(ch.label) + '</b></div></div>';
      };
      return '<div style="display:flex;gap:6px;justify-content:center">' + d.charts.map(pie).join('') + '</div>' + legend(d.charts[0].parts.map((x) => x.n));
    }
    const all = d.series.reduce((a, s) => a.concat(s.v), []); const mx = niceMax(Math.max.apply(null, all));
    const y = (v) => T + ih - ih * v / mx;
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = mx * i / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="currentColor" opacity=".12"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="currentColor" opacity=".6">' + Math.round(v) + '</text>'; }
    let body = '';
    if (d.kind === 'line') {
      const xs = d.x.map((_, i) => L + iw * (d.x.length === 1 ? 0.5 : i / (d.x.length - 1)));
      body = d.series.map((s, k) => '<polyline fill="none" stroke="' + COL[k % COL.length] + '" stroke-width="2.4" stroke-linejoin="round" points="' + s.v.map((v, i) => xs[i].toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + '"/>' + s.v.map((v, i) => '<circle cx="' + xs[i].toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="' + COL[k % COL.length] + '"/>').join('')).join('') +
        d.x.map((lb, i) => '<text x="' + xs[i].toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">' + esc(lb) + '</text>').join('');
    } else {
      const gw = iw / d.cats.length, bw = Math.min(26, (gw - 10) / d.series.length);
      body = d.cats.map((c, i) => d.series.map((s, k) => { const x = L + gw * i + (gw - bw * d.series.length) / 2 + bw * k; return '<rect x="' + x.toFixed(1) + '" y="' + y(s.v[i]).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + (T + ih - y(s.v[i])).toFixed(1) + '" rx="2" fill="' + COL[k % COL.length] + '"/>'; }).join('') +
        '<text x="' + (L + gw * i + gw / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">' + esc(c) + '</text>').join('');
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(d.title) + '" style="color:var(--fg)">' + g + body + '</svg>' + legend(d.series.map((s) => s.name));
  }

  const dataText = (d) => d.kind === 'table' ? d.head.join(' | ') + '; ' + d.rows.map((r) => r.join(' | ')).join('; ') : d.kind === 'pie' ? d.charts.map((c) => c.label + ': ' + c.parts.map((x) => x.n + ' ' + x.v).join(', ')).join('; ') : (d.x || d.cats).join(', ') + ' → ' + d.series.map((x) => x.name + ': ' + x.v.join(', ')).join('; ');
  // ----- Writing -----
  let wGroup = 't2', fKind = 't2';
  const WNAME = { t2: 'Задание 2', t1: 'Задание 1', gt: 'Письмо', free: 'Своя тема' };
  function viewWriting() {
    const p = P(); const W = WRITING;
    const doneIds = new Set(p.writes.map((w) => w.id));
    let h = head('Письменная часть', 'Задания в формате IELTS', '<button class="btn sm" id="wimp">Оценка ИИ</button>') + '<div class="list cta" style="margin-bottom:14px"><a class="rowi" href="#t2"><div class="grow"><b>Как писать эссе на 8+</b><div class="mut" style="margin-top:2px">Шесть типов предложений, план за 5 минут, чек-лист</div></div>' + ico('chev', 'chev') + '</a></div>' + seg('wg', [['t2', 'Задание 2 (эссе)'], ['t1', 'Задание 1 (график)'], ['gt', 'Письма'], ['free', 'Своё']], wGroup) + '<div id="wl" style="margin-top:16px"></div>';
    if (p.subs.length) h += '<h3>Оценки</h3><div class="list">' + p.subs.slice().reverse().slice(0, 15).map((s) => '<div class="rowi"><div class="grow"><b>' + esc((KINDS.find((k) => k[0] === s.kind) || [0, s.kind])[1]) + '</b> <span class="mut">· ' + esc(fmtD(s.date)) + (s.note ? ' · ' + esc(s.note) : '') + '</span></div><b>' + esc(s.avg) + '</b></div>').join('') + '</div>';
    paint(h);
    $('#wimp').onclick = () => importSheet(p, wGroup === 't1' ? 't1' : wGroup === 'gt' ? 'gt' : 't2', '');
    const row = (t, title, sub) => '<a class="rowi" href="#write/' + t.id + '"><div class="grow"><b>' + esc(title) + '</b><div class="mut" style="margin-top:2px">' + esc(sub) + '</div></div>' + (doneIds.has(t.id) ? '<span class="chip on">✓</span>' : ico('chev', 'chev')) + '</a>';
    const draw = () => {
      let html;
      if (wGroup === 't2') html = '<div class="list">' + W.task2.map((t) => row(t, t.topic + ' · ' + W.types[t.type], t.q.slice(0, 90) + '…')).join('') + '</div>';
      else if (wGroup === 't1') html = '<div class="list">' + W.task1.map((t) => row(t, t.title, t.kind === 'table' ? 'таблица' : t.kind === 'pie' ? 'круговые диаграммы' : t.kind === 'bar' ? 'столбчатая диаграмма' : 'линейный график')).join('') + '</div>';
      else if (wGroup === 'gt') html = '<div class="list">' + W.gt.map((t) => row(t, t.tone + ' letter', t.q.slice(0, 90) + '…')).join('') + '</div>';
      else html = '<div class="card"><p style="margin:0 0 12px" class="mut">Свой вопрос или тема (из учебника, пробного теста, запись речи в тексте): получишь анализ текста и промпт для ИИ-проверки.</p><a class="btn p" href="#write/free" style="display:grid;place-items:center;text-decoration:none">Открыть редактор</a></div>';
      $('#wl').innerHTML = html;
    };
    bindSeg('wg', (v) => { wGroup = v; draw(); });
    draw();
  }
  function scoreSheet(p, kind, ref) {
    openSheet('<h2>Оценка</h2>' + seg('sk', KINDS, kind) + '<label>Четыре критерия</label><div class="grid4">' + [1, 2, 3, 4].map((i) => '<input id="sc' + i + '" type="number" inputmode="decimal" step="0.5" min="1" max="9">').join('') + '</div><label>Заметка</label><input id="snote" autocomplete="off"><div style="margin-top:16px"><button class="btn p" id="ssave">Сохранить</button></div>', () => {
      bindSeg('sk');
      $('#ssave').onclick = () => {
        const sc = [1, 2, 3, 4].map((i) => num($('#sc' + i).value, NaN)); if (sc.some(isNaN)) { toast('Заполни 4 оценки'); return; }
        p.subs.push({ id: uid(), date: today(), kind: segVal('sk'), sc, avg: E.overall(sc[0], sc[1], sc[2], sc[3]), note: $('#snote').value.trim(), ref: ref || '' }); save(); closeSheet(); toast('Сохранено'); route();
      };
    });
  }
  const guessKind = (t) => (/task\s*1|graph|chart|overview/i.test(t) && !/task\s*2/i.test(t) ? 't1' : /task\s*2|essay/i.test(t) ? 't2' : /letter|salutation|dear /i.test(t) ? 'gt' : '');
  function importSheet(p, kind0, ref) {
    openSheet('<h2>Оценка от ИИ</h2><p class="mut" style="margin-top:-6px">Вставь весь ответ ИИ целиком — оценки, ошибки и сочетания слов разберутся сами.</p><textarea id="ai" style="min-height:150px" placeholder="Вставь ответ ИИ"></textarea><div style="margin-top:12px"><button class="btn p" id="aip">Разобрать</button></div><div id="aiout"></div><div style="text-align:center;margin-top:6px"><button class="link" id="aiman">Ввести оценки вручную</button></div>', () => {
      $('#aiman').onclick = () => scoreSheet(p, kind0, ref);
      $('#aip').onclick = () => {
        const text0 = $('#ai').value; const r = E.parseFeedback(text0);
        if (!r.scores && !r.errors.length) { toast('Не нашёл оценок и ошибок — вставь ответ целиком'); return; }
        const sc = r.scores || ['', '', '', ''];
        const tags = {}; r.errors.forEach((e) => { tags[e.tag] = (tags[e.tag] || 0) + 1; });
        const known = new Set(p.errors.map((e) => e.tag + '|' + e.snippet.toLowerCase()));
        const fresh = r.errors.filter((e) => !known.has(e.tag + '|' + e.snippet.toLowerCase()));
        $('#aiout').innerHTML = '<div class="enter"><h3>Нашёл</h3>' + seg('aik', KINDS, r.kind || guessKind(text0) || kind0) + '<label>Четыре критерия' + (r.overallRange ? ' · ИИ: ' + esc(r.overallRange) : '') + '</label><div class="grid4">' + sc.map((v, i) => '<input id="as' + (i + 1) + '" type="number" inputmode="decimal" step="0.5" min="1" max="9" value="' + v + '">').join('') + '</div>' +
          '<div class="chips" style="margin:14px -18px 0">' + Object.keys(tags).map((t) => '<span class="chip on" style="flex:none">' + esc(t) + ' ×' + tags[t] + '</span>').join('') + '</div>' +
          '<label style="display:flex;gap:10px;align-items:center;margin:14px 0 0"><input type="checkbox" id="aie" checked style="width:20px;height:20px"> Записать ошибки в журнал: ' + fresh.length + (r.errors.length - fresh.length ? ' (ещё ' + (r.errors.length - fresh.length) + ' уже есть)' : '') + '</label>' +
          (r.collocations.length ? '<label style="display:flex;gap:10px;align-items:center;margin:10px 0 0"><input type="checkbox" id="aic" checked style="width:20px;height:20px"> Сохранить сочетания слов: ' + r.collocations.length + '</label>' : '') +
          '<div style="margin-top:16px"><button class="btn p" id="ais">Сохранить</button></div></div>';
        bindSeg('aik');
        $('#ais').onclick = () => {
          const v = [1, 2, 3, 4].map((i) => num($('#as' + i).value, NaN));
          if (v.some(isNaN)) { toast('Укажи 4 оценки'); return; }
          const avg = E.overall(v[0], v[1], v[2], v[3]);
          p.subs.push({ id: uid(), date: today(), kind: segVal('aik'), sc: v, avg, note: r.overallRange ? 'ИИ ' + r.overallRange : '', ref: ref || '', src: 'ai', fixes: r.fixes, rewrite: r.rewrite, colls: r.collocations });
          let n = 0;
          if ($('#aie') && $('#aie').checked) { fresh.forEach((e) => { const ne = { id: uid(), date: today(), tag: e.tag, snippet: e.snippet, fix: e.fix, ctx: e.ctx || E.findCtx(userTexts(p), e.snippet) || undefined, src: 'ai', ref: ref || '' }; E.errInit(ne, today()); p.errors.push(ne); n++; }); delete p.days[today()]; }
          if ($('#aic') && $('#aic').checked) { p.colls = p.colls || []; r.collocations.forEach((c) => { if (!p.colls.some((x) => x.t.toLowerCase() === c.toLowerCase())) p.colls.push({ t: c, date: today() }); }); }
          save(); closeSheet(); toast('Оценка ' + avg + ' · ошибок записано: ' + n); route();
        };
      };
    });
  }
  function copyText(t) {
    const ok = () => toast('Промпт скопирован');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => toast('Не удалось скопировать'));
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { toast('Не удалось скопировать'); } ta.remove(); }
  }
  function viewWrite(id) {
    const p = P(); const W = WRITING; let task = null, kind = 't2', title = '';
    if (id === 'free') { kind = fKind; title = 'Своя тема'; task = { id: 'free', q: '' }; }
    else if ((task = W.task2.find((t) => t.id === id))) { kind = 't2'; title = 'Задание 2 · ' + task.topic; }
    else if ((task = W.task1.find((t) => t.id === id))) { kind = 't1'; title = 'Задание 1'; }
    else if ((task = W.gt.find((t) => t.id === id))) { kind = 'gt'; title = 'Письмо · ' + task.tone; }
    else { location.hash = '#writing'; return; }
    const mins = kind === 't2' || kind === 'sp' ? 40 : 20;
    let h = head(title, id === 'free' ? '' : (kind === 't2' ? esc(W.types[task.type]) : kind === 't1' ? 'минимум 150 слов · 20 минут' : 'минимум 150 слов · 20 минут'), back('#writing'));
    if (id === 'free') h += seg('fk', KINDS, kind) + '<label>Задание</label><textarea id="wq" style="min-height:70px" placeholder="Вставь вопрос или тему"></textarea>';
    else {
      h += '<div class="card"><p style="margin:0">' + esc(task.q || task.title) + '</p>' + (kind === 't1' ? '<div style="margin-top:12px">' + chartHtml(task) + '<p class="mut" style="margin:8px 0 0">Данные вымышленные, составлены для тренировки.</p></div>' : '') + '</div>';
      const plan = kind === 't2' ? W.skeleton[task.type].map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul><div class="mut" style="margin-top:8px">Идеи: ' + task.ideas.map(esc).join(' · ') + '</div>' :
        kind === 't1' ? '<li>Intro: перефразируй заголовок графика</li><li>Общий вывод (overview): 2 главных тренда/различия, без цифр</li><li>Details 1 и 2: сгруппируй данные и сравни</li><li>Не пиши мнение и причины, которых нет в данных</li></ul>' :
          '<li>Обращение и цель письма в первом абзаце</li><li>Раскрой все три пункта задания</li><li>Тон: ' + esc(task.tone) + ' — выдерживай до конца</li><li>Завершение и подпись по стилю</li></ul>';
      h += '<div class="list" style="margin-top:12px"><div class="task" id="wplan" style="grid-template-columns:1fr"><div><button class="tbody"><div class="ttl">План и подсказки</div></button><div class="more"><div><ul class="mut" style="margin:8px 0 0;padding-left:18px">' + plan + '</div></div></div></div></div>';
    }
    h += timerRow(mins, 'w' + id) + '<textarea id="wt" style="min-height:260px" spellcheck="false" autocapitalize="sentences" placeholder="Пиши здесь. Черновик сохраняется сам.">' + esc(p.drafts[id] || '') + '</textarea>' +
      '<div class="sum" style="margin:8px 0 14px"><span id="wc"></span><span id="wp"></span></div><button class="btn p" id="wchk">Проверить текст</button>';
    paint(h);
    bindSeg('fk', (v) => { fKind = v; });
    bindTimer(mins, 'w' + id);
    const pl = $('#wplan'); if (pl) pl.querySelector('.tbody').onclick = () => pl.classList.toggle('open');
    const cnt = () => { const a = E.analyseText($('#wt').value, id === 'free' ? segVal('fk') : kind); $('#wc').textContent = a.words + ' слов · цель ' + a.minWords + '+'; $('#wc').style.color = a.words && a.short ? 'var(--warn)' : ''; $('#wp').textContent = a.paras + ' абз.'; };
    let dt = null; $('#wt').oninput = () => { cnt(); clearTimeout(dt); const dv = $('#wt').value; dt = setTimeout(() => { p.drafts[id] = dv; save(); }, 800); };
    cnt();
    $('#wchk').onclick = () => {
      const text = $('#wt').value; if (!text.trim()) { toast('Сначала напиши текст'); return; }
      p.drafts[id] = text; save();
      const k = id === 'free' ? segVal('fk') : kind; const q = id === 'free' ? $('#wq').value : ((task.q || task.title) + (kind === 't1' ? '\nDATA (' + task.kind + '): ' + dataText(task) : '')); const a = E.analyseText(text, k);
      const row = (ok, t) => '<div class="rowi" style="padding:10px 0"><span style="color:var(--' + (ok ? 'ok' : 'warn') + ')">' + (ok ? '✓' : '!') + '</span><span class="grow">' + t + '</span></div>';
      openSheet('<h2>Анализ текста</h2><div class="list" style="padding:0 16px">' +
        row(!a.short, a.words + ' слов (минимум ' + a.minWords + ')') + row(a.paras >= (k === 't2' ? 4 : 3), a.paras + ' абзац(а)' + (k === 't2' ? ' — нужно 4–5' : '')) +
        row(a.avgLen >= 14 && a.avgLen <= 28, 'Средняя длина предложения: ' + a.avgLen + ' слов') + row(a.linkers.length >= 4, 'Связки: ' + (a.linkers.length ? a.linkers.slice(0, 8).join(', ') : 'нет') + ' (' + a.linkers.length + ')') +
        row(!a.repeats.length, a.repeats.length ? 'Повторы: ' + a.repeats.map((r) => r[0] + ' ×' + r[1]).join(', ') : 'Сильных повторов нет') +
        (k === 't2' ? row(a.hasConclusion, a.hasConclusion ? 'Есть вывод' : 'Нет явного вывода (in conclusion…)') : k === 't1' ? row(a.hasOverview, a.hasOverview ? 'Есть общий вывод (overview)' : 'Нет общего вывода (начни с Overall, …)') : '') + '</div>' + (k === 't2' ? typesHtml(text) : '') +
        '<h3>Ошибки и сочетания слов</h3><div id="ltb">' + ltHtml(text, undefined) + '</div><p class="mut">Это проверка формы, не оценка. Содержание и смысл оценит ИИ — скопируй промпт.</p>'+(window.Paid ? Paid.button() : '')+'<div class="stack"><button class="btn p" id="wcp">Скопировать промпт для ИИ</button><button class="btn" id="wsv">Сохранить попытку</button><button class="btn" id="wsc">Вставить ответ ИИ</button></div>', () => {
        ltCheck(text).then((ms) => { const b = $('#ltb'); if (b) b.innerHTML = ltHtml(text, ms); });
        $('#wcp').onclick = () => { copyText(buildPrompt(k, q, text)); };
        if (window.Paid) Paid.bind({ kind: k, question: q, text });
        $('#wsv').onclick = () => { p.writes.push({ id, date: today(), words: a.words, text: text.slice(0, 6000) }); save(); closeSheet(); toast('Попытка сохранена'); };
        $('#wsc').onclick = () => importSheet(p, k, id);
      });
    };
  }

  // ----- Reading -----
  const RS = { id: null, ans: {}, done: false };
  const RTAG = { mh: 'R-MH', mi: 'R-MI', tfng: 'R-TFNG', mcq: 'R-MCQ', sc: 'R-COMP' };
  function viewReading() {
    const p = P();
    let h = head('Чтение', READ.tests.length + ' учебных текстов по формату Academic') + '<div class="list">' + READ.tests.map((t) => {
      const n = t.groups.reduce((a, g) => a + g.items.length, 0); const rs = p.reads.filter((r) => r.id === t.id); const best = rs.length ? rs.reduce((a, r) => (r.raw > a.raw ? r : a)) : null;
      return '<a class="rowi" href="#read/' + t.id + '"><div class="grow"><b>' + esc(t.title) + '</b><div class="mut" style="margin-top:2px">' + esc(t.topic) + ' · ' + n + ' вопросов · ' + t.minutes + ' мин</div></div>' + (best ? '<span class="chip on">' + best.raw + '/' + best.total + '</span>' : ico('chev', 'chev')) + '</a>';
    }).join('') + '</div><p class="mut" style="margin-top:14px">' + esc(READ.note) + ' Реальные тесты — в Cambridge IELTS и на ielts.org.</p>';
    paint(h);
  }
  function viewRead(id) {
    const p = P(); const t = READ.tests.find((x) => x.id === id); if (!t) { location.hash = '#reading'; return; }
    if (RS.id !== id) { RS.id = id; RS.ans = {}; RS.done = false; }
    const ans = RS.ans; const done = RS.done;
    const items = []; t.groups.forEach((g) => g.items.forEach((it) => items.push(Object.assign({ type: g.type }, it))));
    const ok = (it) => E.checkAnswer(it, ans[it.n]);
    let h = head(t.title, esc(t.topic), back('#reading')) + timerRow(t.minutes, 'r' + id);
    h += '<div class="card stack rtext">' + t.paras.map((x) => '<p style="margin:0"><b style="color:var(--acc)">' + x.k + '</b>&nbsp; ' + esc(x.t) + '</p>').join('') + '</div>';
    t.groups.forEach((g) => {
      h += '<h3>' + esc(g.title) + '</h3><p class="mut" style="margin:-4px 0 10px">' + esc(g.instr) + '</p>';
      if (g.type === 'mh') h += '<div class="card mut" style="margin-bottom:10px">' + g.options.map((o) => '<div><b>' + esc(o[0]) + '</b>&nbsp; ' + esc(o[1]) + '</div>').join('') + '</div>';
      h += '<div class="list">' + g.items.map((it) => {
        let inp = '';
        if (g.type === 'tfng') inp = '<div class="seg" style="margin-top:8px">' + ['T', 'F', 'NG'].map((v) => '<button type="button" data-q="' + it.n + '" data-v="' + v + '" class="' + (ans[it.n] === v ? 'on' : '') + '"' + (done ? ' disabled' : '') + '>' + ({ T: 'True', F: 'False', NG: 'Not given' }[v]) + '</button>').join('') + '</div>';
        else if (g.type === 'mh' || g.type === 'mi') inp = '<select data-q="' + it.n + '" style="margin-top:8px"' + (done ? ' disabled' : '') + '><option value="">—</option>' + g.options.map((o) => '<option value="' + esc(o[0]) + '"' + (ans[it.n] === o[0] ? ' selected' : '') + '>' + esc(o[0]) + '</option>').join('') + '</select>';
        else if (g.type === 'mcq') inp = '<div class="opts" style="margin-top:8px">' + it.opts.map((o) => '<button type="button" class="opt' + (ans[it.n] === o[0] ? ' sel' : '') + '" data-q="' + it.n + '" data-v="' + o[0] + '"' + (done ? ' disabled' : '') + '>' + esc(o) + '</button>').join('') + '</div>';
        else inp = '<input data-q="' + it.n + '" style="margin-top:8px" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" value="' + esc(ans[it.n] || '') + '"' + (done ? ' disabled' : '') + '>';
        const fb = done ? '<div class="mut" style="margin-top:8px;color:var(--' + (ok(it) ? 'ok' : 'warn') + ')">' + (ok(it) ? '✓ Верно' : '✗ Верный ответ: <b>' + esc(Array.isArray(it.a) ? it.a[0] : it.a) + '</b>') + ' — ' + esc(it.why) + '</div>' : '';
        return '<div class="rowi" style="display:block"><div><b>' + it.n + '.</b> ' + esc(it.q) + '</div>' + inp + fb + '</div>';
      }).join('') + '</div>';
    });
    if (done) {
      const raw = items.filter(ok).length; const scaled = Math.round(raw / items.length * 40);
      const band = E.rawToBand(p.module === 'general' ? 'reading_general' : 'reading_academic', scaled);
      h += '<div class="card" style="margin-top:18px;text-align:center"><div class="big">' + raw + ' / ' + items.length + '</div><div class="mut">≈ band ' + band + ' (пересчёт на 40 вопросов, приблизительно)</div></div><div class="stack" style="margin-top:12px"><button class="btn p" id="rerr">Добавить ошибки в журнал</button><button class="btn" id="rretry">Пройти заново</button></div>';
    } else h += '<div style="margin-top:18px"><button class="btn p" id="rsub">Сдать</button></div>';
    paint(h, !RS.painted); RS.painted = true;
    bindTimer(t.minutes, 'r' + id);
    $$('button[data-q]').forEach((b) => { b.onclick = () => { ans[b.dataset.q] = b.dataset.v; $$('button[data-q="' + b.dataset.q + '"]').forEach((x) => x.classList.toggle('on', x === b)); $$('button.opt[data-q="' + b.dataset.q + '"]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
    $$('select[data-q]').forEach((s) => { s.onchange = () => { ans[s.dataset.q] = s.value; }; });
    $$('input[data-q]').forEach((s) => { s.oninput = () => { ans[s.dataset.q] = s.value; }; });
    const sub = $('#rsub'); if (sub) sub.onclick = () => {
      const un = items.filter((it) => !String(ans[it.n] || '').trim()).length;
      const fin = () => { RS.done = true; const raw = items.filter(ok).length; const scaled = Math.round(raw / items.length * 40); p.reads.push({ id, date: today(), raw, total: items.length, band: E.rawToBand(p.module === 'general' ? 'reading_general' : 'reading_academic', scaled) }); save(); RS.painted = false; viewRead(id); window.scrollTo(0, 0); };
      if (un) confirmSheet('Без ответа: ' + un + '. Сдать всё равно?', 'Сдать', fin); else fin();
    };
    const re = $('#rerr'); if (re) re.onclick = () => {
      let n = 0; items.filter((it) => !ok(it)).forEach((it) => { p.errors.push({ id: uid(), date: today(), tag: RTAG[it.type], snippet: t.title + ' · Q' + it.n + ': ' + it.q.slice(0, 60), fix: 'ответ: ' + (Array.isArray(it.a) ? it.a[0] : it.a), nodrill: true }); n++; });
      delete p.days[today()]; save(); re.disabled = true; toast('Записано ошибок: ' + n);
    };
    const rt = $('#rretry'); if (rt) rt.onclick = () => { RS.ans = {}; RS.done = false; RS.painted = false; viewRead(id); window.scrollTo(0, 0); };
  }

  // ---------- Прогресс ----------
  function viewProgress() {
    const p = P(); const t0 = today();
    let h = head('Прогресс', p.mocks.length ? 'Последний мок: ' + p.mocks[p.mocks.length - 1].overall : 'Моков пока нет', plusBtn('mplus', 'Новый мок'));
    h += aiRow() + '<div class="grid4">' + E.SK.map((s) => '<div class="card tile"><div class="mut">' + esc(SKN[s]) + '</div><b>' + p.skills[s] + '</b><div class="mut">→ ' + p.target.overall + '</div></div>').join('') + '</div>';
    if (p.mocks.length) h += '<h3>Моки</h3><div class="list">' + p.mocks.slice().reverse().map((m) => '<div class="rowi"><div class="grow"><b>' + esc(fmtD(m.date, { day: 'numeric', month: 'long' })) + '</b><div class="mut" style="margin-top:2px">L ' + m.L + ' · R ' + m.R + ' · W ' + m.W + ' · S ' + m.S + '</div></div><span class="big" style="font-size:22px">' + m.overall + '</span></div>').join('') + '</div>';
    const wk = {}; Object.keys(p.days).forEach((d) => { const dd = p.days[d]; const dn = p.done[d] || {}; const k = dd.week; wk[k] = wk[k] || { plan: 0, done: 0 }; dd.tasks.forEach((t) => { wk[k].plan += t.minutes; if (dn[t.id]) wk[k].done += t.minutes; }); });
    const ks = Object.keys(wk).map(Number).sort((a, b) => b - a).slice(0, 8);
    if (ks.length) h += '<h3>Выполнение по неделям</h3><div class="card stack">' + ks.map((k) => { const pc = Math.round(100 * wk[k].done / Math.max(1, wk[k].plan)); return '<div><div class="sum" style="margin-bottom:6px"><span>Неделя ' + k + '</span><span>' + wk[k].done + ' / ' + wk[k].plan + ' мин</span></div><div class="bar"><i style="width:' + pc + '%"></i></div></div>'; }).join('') + '</div>';
    if (p.reads.length) h += '<h3>Чтение</h3><div class="list">' + p.reads.slice().reverse().slice(0, 6).map((r) => { const t = READ.tests.find((x) => x.id === r.id); return '<div class="rowi"><div class="grow"><b>' + esc(t ? t.title : r.id) + '</b><div class="mut" style="margin-top:2px">' + esc(fmtD(r.date)) + '</div></div><span>' + r.raw + '/' + r.total + ' · ≈' + r.band + '</span></div>'; }).join('') + '</div>';
    paint(h);
    $('#mplus').onclick = () => openSheet('<h2>Новый пробный экзамен</h2><div class="grid4">' + E.SK.map((s) => '<div><input id="m_' + s + '" type="number" inputmode="decimal" step="0.5" min="1" max="9"><div class="mut" style="text-align:center;margin-top:4px">' + esc(SKN[s]) + '</div></div>').join('') + '</div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin:16px 0"><input type="checkbox" id="m_up" checked style="width:20px;height:20px"> Обновить уровни в профиле</label><button class="btn p" id="msave">Сохранить</button>' +
      '<h3>Верные ответы → band</h3><div class="grid2"><select id="rk"><option value="listening">Аудирование</option><option value="reading_' + p.module + '">Чтение</option></select><input id="rr" type="number" inputmode="numeric" min="0" max="40" placeholder="Верных /40"></div><p class="mut" id="rout"></p>', () => {
      const calc = () => { const v = num($('#rr').value, NaN); $('#rout').textContent = isNaN(v) ? '' : '≈ band ' + E.rawToBand($('#rk').value, v) + ' (по таблице конкретного теста может отличаться)'; };
      $('#rr').oninput = calc; $('#rk').onchange = calc;
      $('#msave').onclick = () => {
        const v = {}; for (const s of E.SK) { v[s] = num($('#m_' + s).value, NaN); if (isNaN(v[s])) { toast('Заполни все 4 навыка'); return; } }
        p.mocks.push({ id: uid(), date: t0, L: v.L, R: v.R, W: v.W, S: v.S, overall: E.overall(v.L, v.R, v.W, v.S) });
        if ($('#m_up').checked) { E.SK.forEach((s) => { p.skills[s] = v[s]; }); Object.keys(p.days).forEach((d) => { if (d >= t0) delete p.days[d]; }); }
        save(); closeSheet(); toast('Мок сохранён'); route();
      };
    });
  }

  // ---------- Ресурсы ----------
  let resSkill = 'ALL', resQ = '', resRisk = false;
  function viewRes() {
    let h = head('Ресурсы', 'Бесплатные материалы') + '<input id="rq" type="search" placeholder="Поиск" value="' + esc(resQ) + '" autocomplete="off"><div class="chips" id="rs" style="margin:12px -18px 14px">' +
      ['ALL', 'L', 'R', 'W', 'S', 'V', 'G'].map((s) => '<button data-s="' + s + '" class="' + (s === resSkill ? 'on' : '') + '">' + (s === 'ALL' ? 'Все' : esc(SKN[s])) + '</button>').join('') + '</div><div id="rl"></div><div style="text-align:center"><button class="link" id="rrisk"></button></div>';
    paint(h);
    const draw = () => {
      const q = resQ.toLowerCase();
      const list = RES.filter((r) => (resSkill === 'ALL' || (r.skills || []).includes(resSkill) || (r.skills || []).includes('ALL')) && (resRisk || r.ru_risk !== true) && (!q || (r.name + ' ' + (r.tags || []).join(' ')).toLowerCase().includes(q)));
      $('#rl').innerHTML = '<div class="list">' + list.map((r) => {
        const inner = '<div class="grow"><b>' + esc(r.name) + '</b><div class="mut" style="margin-top:2px">' + esc((r.skills || []).join(' ')) + ' · ' + esc(r.level) + ' · ' + esc(r.cost) + (r.status === 'user_provided' || r.status === 'to_verify' ? ' · не проверено' : '') + (r.ru_risk ? ' · ограничен в РФ' : '') + '</div>' + (r.notes ? '<div class="mut" style="margin-top:4px">' + esc(String(r.notes).slice(0, 140)) + '</div>' : '') + '</div>';
        return r.url ? '<a class="rowi" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : '<div class="rowi">' + inner + '</div>';
      }).join('') + '</div>';
      $('#rrisk').textContent = resRisk ? 'Скрыть недоступные в РФ' : 'Показать недоступные в РФ';
    };
    $('#rq').oninput = (e) => { resQ = e.target.value; draw(); };
    $$('#rs button').forEach((b) => b.onclick = () => { resSkill = b.dataset.s; $$('#rs button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
    $('#rrisk').onclick = () => { resRisk = !resRisk; draw(); };
    draw();
  }

  // ---------- Настройки ----------
  function viewSet() {
    const p = P();
    let h = head('Настройки', esc(user ? user.email : '')) + '<div class="list"><div class="rowi"><span class="grow">Синхронизация</span><span class="mut" id="sst">' + ({ ok: 'всё сохранено', pending: 'сохраняю…', error: 'нет связи' }[syncState]) + '</span></div><button class="rowi" id="regen"><span class="grow">Пересоздать план на сегодня</span></button><button class="rowi" id="exp"><span class="grow">Скачать копию данных</span></button><button class="rowi" id="out"><span class="grow" style="color:#dc2626">Выйти</span></button></div>';
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!standalone) h += '<div class="list" style="margin-top:12px"><button class="rowi" id="inst"><span class="grow">Установить как приложение<div class="mut" style="margin-top:2px">' + (ios ? 'Safari → Поделиться → На экран «Домой»' : 'Иконка на главном экране, работает офлайн') + '</div></span></button></div>';
    h += '<div class="list" style="margin-top:12px"><div class="rowi"><span class="grow">Уровень карточек<div class="mut" style="margin-top:2px">Сейчас: ' + userCef(p) + ' — слова на ступень выше</div></span><select id="cefm">' + ['auto', 'B1', 'B2', 'C1', 'C2'].map((v) => '<option value="' + v + '"' + ((p.cefMode || 'auto') === v ? ' selected' : '') + '>' + (v === 'auto' ? 'Авто' : v) + '</option>').join('') + '</select></div></div>';
    h += '<div class="list" style="margin-top:12px"><button class="rowi" id="retest"><span class="grow">Пройти входной тест заново<div class="mut" style="margin-top:2px">' + (p.placement ? 'Сейчас: ' + esc(p.placement.cefr) + ' · ' + esc(p.placement.date) : 'Определит уровень и подберёт задания') + '</div></span>' + ico('chev', 'chev') + '</button></div>';
    h += '<div class="list" style="margin-top:12px"><button class="rowi" data-gl="1"><span class="grow">Что значат слова и буквы<div class="mut" style="margin-top:2px">Band, задания 1 и 2, пробный экзамен, сочетания слов…</div></span>' + ico('chev', 'chev') + '</button></div>';
    h += '<h3>Профиль</h3>' + profileForm(p, 'Сохранить');
    paint(h);
    $('#retest').onclick = () => viewPlacement((r) => { p.placement = r; p.skills = E.placementSkills(r.band); p.days = {}; syncDeck(p); sess = null; save(); toast('Уровень: ' + r.cefr); location.hash = '#set'; route(); });
    $('#cefm').onchange = () => { p.cefMode = $('#cefm').value; syncDeck(p); sess = null; save(); toast('Уровень карточек: ' + userCef(p)); viewSet(); };
    const ib = $('#inst'); if (ib) ib.onclick = async () => { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } else toast(ios ? 'Safari → Поделиться → На экран «Домой»' : 'Меню браузера → Установить приложение'); };
    bindSeg('f_module');
    $('#pf').onsubmit = (e) => {
      e.preventDefault(); const f = readProfileForm();
      Object.assign(p, { name: f.name || p.name, module: f.module, target: { overall: f.overall, min: f.min }, hours: f.hours, newPerDay: f.newPerDay, start: f.start, test_date: f.test_date, skills: { L: f.L, R: f.R, W: f.W, S: f.S } });
      p.days = {}; sess = null; save(); toast('Профиль сохранён');
    };
    $('#regen').onclick = () => { delete p.days[today()]; save(); toast('План обновлён'); };
    $('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(pack())], { type: 'application/json' })); a.download = 'ielts-teacher-' + today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    $('#out').onclick = () => confirmSheet('Выйти из аккаунта?', 'Выйти', async () => { await push(); await Cloud.signOut(); });
  }

  function viewOnboarding() {
    if (placeDone === null) return viewPlacement((r) => { placeDone = r; viewOnboarding(); }, () => { placeDone = false; viewOnboarding(); });
    const pre = placeDone ? E.placementSkills(placeDone.band) : null;
    const f0 = pre ? { name: '', module: 'academic', target: { overall: 7.5, min: 7 }, hours: 13, start: nextMonday(today()), skills: pre, newPerDay: 15, test_date: '' } : null;
    paint(head('Привет', 'Заполни анкету — план соберётся сам') + (pre ? '<p class="mut">Уровень из теста: ' + placeDone.cefr + ' (≈ IELTS ' + placeDone.band + '). Навыки ниже уже заполнены — поправь, если знаешь точнее.</p>' : '') + profileForm(f0, 'Создать план'));
    bindSeg('f_module');
    $('#pf').onsubmit = (e) => { e.preventDefault(); const f = readProfileForm(); if (placeDone) f.placement = placeDone; newProfile(f); placeDone = null; sess = null; location.hash = '#today'; route(); };
  }

  // ---------- вход ----------
  function viewAuth() {
    $('#tabs').hidden = true;
    let signup = false;
    paint('<div class="auth"><img class="logo" src="img/logo.png?v=2" alt="IELTS" width="88" height="88"><h1>IELTS Teacher</h1><p class="sub">Войди — данные будут на всех твоих устройствах</p><form id="af"><input id="ae" type="email" inputmode="email" autocomplete="email" autocapitalize="none" autocorrect="off" placeholder="Email" required><div class="pw"><input id="ap" type="password" autocomplete="current-password" placeholder="Пароль" minlength="6" required><button type="button" id="aeye" class="eye" aria-label="Показать пароль" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="sl" d="M4 4l16 16"/></svg></button></div><div class="err" id="aerr"></div><label class="mut" id="anote" hidden style="font-size:14px;margin:0 0 10px;display:none;gap:8px;align-items:flex-start"><input id="acons" type="checkbox" style="margin-top:3px;flex:none"><span>Я согласен(на) на <a href="https://pay.odkii-builds.ru/#consent" target="_blank" rel="noopener">обработку персональных данных</a> и принимаю <a href="https://pay.odkii-builds.ru/#policy" target="_blank" rel="noopener">политику конфиденциальности</a>. Данные хранятся в России.</span></label><button class="btn p" id="asub" type="submit">Войти</button></form><div style="text-align:center;margin-top:8px"><button class="link" id="atog" type="button">Нет аккаунта? Создать</button></div><p class="mut" style="font-size:12px;margin-top:18px;text-align:center">Бесплатный проект с открытым кодом (<a href="https://github.com/odkii-builds/ielts-teacher" target="_blank" rel="noopener">GitHub</a>). Не связан с IDP, British Council, Cambridge и, Oxford. Материалы написаны самостоятельно, списки слов — по открытым данным Oxford.</p></div>');
    $('#atog').onclick = () => { signup = !signup; $('#asub').textContent = signup ? 'Создать аккаунт' : 'Войти'; $('#atog').textContent = signup ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'; $('#ap').autocomplete = signup ? 'new-password' : 'current-password'; $('#aerr').textContent = ''; $('#anote').hidden = !signup; $('#anote').style.display = signup ? 'flex' : 'none'; };
    $('#aeye').onclick = () => { const i = $('#ap'), on = i.type === 'password'; i.type = on ? 'text' : 'password'; $('#aeye').classList.toggle('on', on); $('#aeye').setAttribute('aria-pressed', on); $('#aeye').setAttribute('aria-label', on ? 'Скрыть пароль' : 'Показать пароль'); };
    if (window.Paid && Paid.enabled) { const d = document.createElement('button'); d.className = 'btn'; d.type = 'button'; d.style.marginTop = '10px'; d.textContent = 'Демо без входа (только превью)'; d.onclick = () => start({ id: 'demo-preview', email: 'demo@preview.local' }); $('#af').appendChild(d); }
    $('#af').onsubmit = async (e) => {
      e.preventDefault(); const b = $('#asub'); b.disabled = true; $('#aerr').textContent = '';
      try {
        const em = $('#ae').value.trim(), pw = $('#ap').value;
        if (signup && !$('#acons').checked) throw new Error('Для регистрации нужно согласие на обработку данных');
        const r = signup ? await Cloud.signUp(em, pw) : await Cloud.signIn(em, pw);
        if (r.error) throw r.error;
        if (!r.data.session) { $('#af').innerHTML = '<p style="font-size:17px">Письмо отправлено на <b>' + esc(em) + '</b>.</p><p class="mut">Откройте его и перейдите по ссылке, чтобы подтвердить аккаунт. После перехода вы сразу окажетесь в приложении — входить заново не нужно. Не пришло? Проверьте «Спам».</p>'; return; }
        await start(r.data.session.user);
      } catch (err) {
        const m = String(err.message || err);
        $('#aerr').style.color = ''; $('#aerr').textContent = /Invalid login/i.test(m) ? 'Неверный email или пароль' : /rate limit/i.test(m) ? 'Слишком много запросов на отправку писем. Подожди час и попробуй снова. Мы уже чиним это.' : /already registered/i.test(m) ? 'Этот email уже зарегистрирован — нажми «Войти».' : /not confirmed/i.test(m) ? 'Сначала подтверди email по ссылке из письма' : /already registered/i.test(m) ? 'Такой аккаунт уже есть — войди' : /fetch|network/i.test(m) ? 'Нет связи с сервером' : m;
        b.disabled = false;
      }
    };
  }

  // ---------- маршрутизация ----------
  const TABS = [['today', 'Сегодня'], ['plan', 'План'], ['cards', 'Карточки'], ['errors', 'Ошибки']];
  const MORE = [['progress', 'Прогресс'], ['writing', 'Письменная часть'], ['reading', 'Чтение'], ['res', 'Ресурсы'], ['set', 'Настройки']];
  const MORE_ALIAS = { write: 'writing', read: 'reading' };
  function renderTabs(tab0) {
    let tab = tab0;
    const t = $('#tabs'); t.hidden = false;
    tab = MORE_ALIAS[tab] || (tab === 'fix' ? 'errors' : tab === 'vw' ? 'cards' : tab === 't2' ? 'writing' : tab); const inMore = MORE.some((m) => m[0] === tab);
    t.innerHTML = TABS.map(([k, n]) => '<a href="#' + k + '" class="' + (k === tab ? 'on' : '') + '">' + ico(k) + n + '</a>').join('') + '<button id="tmore" class="' + (inMore ? 'on' : '') + '">' + ico('more') + (inMore ? MORE.find((m) => m[0] === tab)[1] : 'Ещё') + '</button>';
    $('#tmore').onclick = () => openSheet('<div class="list">' + MORE.map(([k, n]) => '<a class="rowi" href="#' + k + '"><span class="grow">' + n + '</span>' + ico('chev', 'chev') + '</a>').join('') + '</div>', (el) => { el.querySelectorAll('a').forEach((a) => { a.onclick = () => closeSheet(); }); });
  }
  function route(animate) {
    if (!user) return viewAuth();
    closeSheet(true);
    const parts = (location.hash || '#today').slice(1).split('/'); const tab = parts[0];
    if (!DB.active || !P()) { $('#tabs').hidden = true; return viewOnboarding(); }
    renderTabs(tab);
    (Object.assign({ today: viewToday, plan: viewPlan, cards: viewCards, errors: viewErrors, fix: viewFix, vw: viewVw, t2: viewT2, writing: viewWriting, write: viewWrite, reading: viewReading, read: viewRead, progress: viewProgress, res: viewRes, set: viewSet }, window.Next && Next.views)[tab] || viewToday)(parts[1]);
    if (animate === false) $('#view').classList.remove('enter');
    window.scrollTo(0, 0);
  }

  async function start(u) {
    user = u; sess = null;
    const local = readLocal(); let remote = null, offline = false;
    try { remote = await Cloud.pull(u.id); } catch (e) { offline = true; }
    let legacy = null; try { legacy = JSON.parse(localStorage.getItem(LEGACY)); } catch (e) { /* ignore */ }
    const has = (d) => d && d.profiles && Object.keys(d.profiles).length;
    let upload = false;
    if (local && local.dirty && has(local.db)) { DB = local.db; upload = true; }
    else if (!offline && remote && has(remote.data)) DB = remote.data;
    else if (local && has(local.db)) { DB = local.db; upload = !offline && !(remote && has(remote.data)); }
    else if (has(legacy)) { DB = legacy; upload = true; }
    else DB = { profiles: {}, active: null };
    if (!DB.active || !DB.profiles[DB.active]) DB.active = Object.keys(DB.profiles)[0] || null;
    Object.keys(DB.profiles).forEach((k) => { ensureP(DB.profiles[k]); if (syncDeck(DB.profiles[k])) upload = true; });
    writeLocal(upload || offline); syncState = upload ? 'pending' : 'ok';
    if (upload) push();
    if (offline) toast('Нет связи — работаю с кэшем');
    route();
  }

  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  async function init() {
    try {
      const J = (u) => fetch(u).then((x) => x.json());
      const [c, r, d, rd, wr] = await Promise.all([J('data/content.json'), J('data/resources.json'), J('data/deck.json'), J('data/reading.json'), J('data/writing.json')]);
      CONTENT = c; RES = r; DECK = d; DECKIDS = new Set(d.map((x) => x.id)); READ = rd; WRITING = wr;
    } catch (e) { $('#view').textContent = 'Не удалось загрузить данные: ' + e.message; return; }
    window.addEventListener('hashchange', () => route());
    if (!Cloud.available()) { $('#view').textContent = 'Не загрузилась библиотека входа. Обнови страницу.'; return; }
    Cloud.onAuth((ev) => { if (ev === 'SIGNED_OUT') { user = null; DB = { profiles: {}, active: null }; route(); } });
    try { session = await Cloud.session(); } catch (e) { session = null; }
    if (session) await start(session.user); else route();
  }
  function writeInfo(id) {
    if (id === 'free') return { kind: segVal('fk'), q: ($('#wq') || {}).value || '' };
    let t; if ((t = WRITING.task2.find((x) => x.id === id))) return { kind: 't2', q: t.q || t.title };
    if ((t = WRITING.task1.find((x) => x.id === id))) return { kind: 't1', q: (t.q || t.title) + '\nDATA (' + t.kind + '): ' + dataText(t) };
    t = WRITING.gt.find((x) => x.id === id); return { kind: 'gt', q: t ? (t.q || t.title) : '' };
  }
  const wordKnown = (term) => { const k = term.toLowerCase(); return P().cards.some((c) => c.t && c.t.toLowerCase() === k && (c.seen || !DECKIDS.has(c.id))); };
  async function addFromReading(term, ctx) {
    const p = P(); if (wordKnown(term)) return 'dup';
    const lx = await lexLoad(); const e = lx[term.toLowerCase()] || []; let tr = e[1] || '';
    if (!tr) { try { tr = (await onlineTr(term)) || ''; } catch (er) { tr = ''; } }
    const nc = addWordCard(p, term, tr || 'перевод не найден', ctx); sess = null; save(); return nc.id;
  }
  function addDiagWords(list) {
    const p = P(); let n = 0;
    list.forEach((w) => { if (wordKnown(w.t)) return; addWordCard(p, w.t, w.ru, w.ex); n++; });
    if (n) { sess = null; save(); } return n;
  }
  window.Ctx = { writeInfo, addFromReading, findCardId: (term) => { const k = term.toLowerCase(); const c = P().cards.find((x) => x.t && x.t.toLowerCase() === k && !DECKIDS.has(x.id)); return c ? c.id : null; }, removeCard: (id) => { const p = P(); p.cards = p.cards.filter((c) => c.id !== id); sess = null; save(); }, addDiagWords, userId: () => user && user.id, P, save, paint, head, back, esc, ico, toast, openSheet, closeSheet, today, uid, $, $$, E, route, get DECK() { return DECK; }, get READ() { return READ; } };
  if (window.Next && Next.more.length) MORE.splice(MORE.length - 1, 0, ...Next.more);
  init();
})();
