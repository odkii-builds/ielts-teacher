/* ПРЕВЬЮ платного ИИ-разбора. ТОЛЬКО для закрытого превью: в проде (ielts.odkii-builds.ru) флаг выключен жёстко.
 * ИИ и оплата здесь имитируются (никаких запросов, никаких списаний). Пока владелец не скажет «Robokassa готова, РКН, всё легально»,
 * эту ветку в main не вливаем. См. docs/RELEASE-GATE.md. */
window.Paid = (function () {
  'use strict';
  const host = location.hostname;
  const PROD = /(^|\.)ielts\.odkii-builds\.ru$/.test(host) || /(^|\.)odkii-builds\.ru$/.test(host);
  const enabled = !PROD && (/\.vercel\.app$/.test(host) || host === 'localhost' || host === '127.0.0.1');
  const KEY = 'ielts_demo_ent';
  const DEF = { free: 1, credits: 0, prem: false, ban: false, used: 0 };
  let H = null, ent = Object.assign({}, DEF);
  try { const s = localStorage.getItem(KEY); if (s) ent = Object.assign({}, DEF, JSON.parse(s)); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ent)); } catch (e) { /* ignore */ } };
  const PAY = 'https://pay.odkii-builds.ru';

  // ---------- демо-пример разбора (не от реального ИИ) ----------
  const SAMPLE_Q = 'Some people believe that university education should be free for everyone. To what extent do you agree or disagree?';
  const SAMPLE = [
    'Nowadays, many people argue that university education must be free for everyone. In my opinion, I partly agree with this statement, because free education has some advantages, but it also have disadvantages.',
    'Firstly, free universities would help poor families. Many talented students can not study because tuition fees are very expensive, and their parents has not enough money. If the government pay for education, this students will get a chance to improve their life and later bring more benefit to the society.',
    'However, there is a problem too. Government budget is limited, so free education may reduce the quality of teaching. For example, in some countries where universities are free, classes are overcrowded and there are not enough modern equipment.',
    'In conclusion, I think that education should be free only for the best students, and others should pay a part of the cost.',
  ];
  const CRIT = [['Task Response', 6.0], ['Coherence & Cohesion', 6.0], ['Lexical Resource', 5.5], ['Grammatical Range & Accuracy', 5.5]];
  const FIX2 = [
    ['can not', 'cannot', 'Пишется слитно.'],
    ['very expensive', 'too high', 'Про цену обучения говорят tuition fees are high; expensive сочетается с вещами и услугами, а very — слабое усиление.'],
    ['their parents has not enough money', 'their parents do not have enough money', 'Подлежащее parents во множественном числе: do have. Отрицание строится через do not have, а не has not.'],
    ['If the government pay', 'If the government pays', 'После the government глагол в 3-м лице единственного числа: pays.'],
    ['this students', 'these students', 'Множественное число: these.'],
    ['improve their life', 'improve their lives', 'У their (мн. число) жизни — во мн. числе: lives.'],
    ['bring more benefit to the society', 'contribute more to society', 'Устойчивое сочетание: contribute to society, без the.'],
  ];
  const FIX2_TEXT = 'Firstly, free universities would help low-income families. Many talented students cannot study because tuition fees are too high and their parents do not have enough money. If the government pays for education, these students will get a chance to improve their lives and later contribute more to society.';
  const ALLFIX = [
    ['it also have disadvantages', 'it also has disadvantages', 'GRA', 'Абзац 1'],
    ['In my opinion, I partly agree', 'I partly agree', 'LR', 'Абзац 1: «In my opinion» и «I agree» дублируют друг друга'],
    ['Government budget is limited', 'A government’s budget is finite', 'GRA', 'Абзац 3: нужен артикль и притяжательная форма'],
    ['there are not enough modern equipment', 'there is not enough modern equipment', 'GRA', 'Абзац 3: equipment — неисчисляемое'],
    ['pay a part of the cost', 'pay part of the cost', 'GRA', 'Абзац 4'],
  ];
  const BAND7 = [
    'Nowadays, many people argue that university education should be free for everyone. I partly agree with this view, since free tuition has clear advantages, but it also has serious drawbacks.',
    'Firstly, free universities would support low-income families. Many talented students cannot study because tuition fees are too high and their parents cannot afford them. If the government pays for higher education, these students will have a chance to improve their lives and later contribute more to society.',
    'However, there is a drawback. A government’s budget is finite, so free education may lower the quality of teaching. For example, in some countries where universities are free, classes are overcrowded and there is not enough modern equipment.',
    'In conclusion, I believe that education should be free only for the strongest students, while the others should pay part of the cost.',
  ];
  const VOCAB = [['help', 'support / assist'], ['very expensive', 'prohibitively high'], ['bring benefit', 'contribute'], ['problem', 'drawback / downside'], ['limited', 'finite / restricted'], ['good students', 'academically strong students']];

  const DAILY = 10;
  const goal = () => { const g = Number(H && H.target && H.target()); return g >= 4 && g <= 9 ? g : 7; };
  const gs = () => goal().toFixed(1);
  const TYPES = [['Грамматика', 8], ['Лексика', 3], ['Орфография', 1]];
  const PARAS = [
    ['Абзац 1 · вступление', 'Позиция названа сразу, это плюс. Но «In my opinion, I partly agree» дублирует мысль, а «free education has some advantages» слишком общо: назовите, какие именно.'],
    ['Абзац 2 · довод «за»', 'Хороший довод про семьи с низким доходом. Не хватает конкретики: цифра или пример сделали бы его на уровень убедительнее.'],
    ['Абзац 3 · довод «против»', 'Мысль про качество обучения понятна, но пример «in some countries» размыт. Назовите тип страны или систему.'],
    ['Абзац 4 · вывод', 'Здесь появляется идея «бесплатно только для лучших», которой не было в основной части. Эксперт заметит это как нелогичность.']
  ];
  const STEPS = [['Согласование подлежащего и сказуемого', 'ещё +0.5 к Grammatical Range & Accuracy', '15 минут'], ['Развернуть идею из вывода в основной части', 'до +0.5 к Task Response', '20 минут'], ['Заменить 6 слабых слов на сильные', '+0.5 к Lexical Resource', '10 минут']];
  const BAND8 = 'While free tuition would widen access for low-income families, it carries a hidden cost: when funding is spread across every student, per-student resources shrink, and the quality of teaching is the first casualty. Countries with fee-free systems often report overcrowded lecture halls and outdated laboratories, which suggests that access without quality is only a partial victory.';
  const LOCKS = [['Все 12 ошибок', 'по всем абзацам, с объяснением правила'], ['Ваш текст, переписанный сильнее', 'ваши идеи на уровне Band 7'], ['Разбор аргументации', 'где мысль не доведена и что добавить'], ['Образец сильного абзаца', 'под ваш вопрос, на Band 8'], ['План на неделю', '3 шага, которые дают +0.5 band'], ['Словарь для карточек', 'слабые слова и замены в один клик']];

  // ---------- стили ----------
  const css = document.createElement('style');
  css.textContent = '.pd-band{font-size:44px;font-weight:700;letter-spacing:-.02em;line-height:1}.pd-row{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;margin:10px 0}.pd-row .bar{grid-column:1/3;height:6px;background:var(--s2);border-radius:3px;overflow:hidden}.pd-row .bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#3d7bff,#ff5fa2)}.pd-del{background:#dc262622;text-decoration:line-through;border-radius:4px;padding:0 2px}.pd-ins{background:#16a34a22;border-radius:4px;padding:0 2px}' +
    '.pd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 14px}.pd-head h2{margin:0}.pd-hp{font-size:12px;font-weight:600;padding:5px 11px;border-radius:999px;background:rgba(79,134,255,.16);color:var(--acc);white-space:nowrap}' +
    '.btn.pd-shine{display:flex;align-items:center;justify-content:center;gap:10px;color:#fff;background:linear-gradient(110deg,#0045fd,#3d9bff,#ff5fa2,#3d7bff,#0045fd);background-size:300% 100%;animation:pds 6s linear infinite;box-shadow:0 8px 22px rgba(0,69,253,.28)}@keyframes pds{to{background-position:-300% 0}}.pd-pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.24);white-space:nowrap}' +
    '.pd-lk{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(120,120,135,.3);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);font-size:12px;font-weight:600;color:var(--fg);white-space:nowrap}.pd-lk svg{width:12px;height:12px}.pd-lk.s{padding:3px 8px;font-size:11px}' +
    '.pd-lock{position:relative;border-radius:16px;margin:10px 0;overflow:hidden;background:var(--s);box-shadow:0 0 0 1px var(--line)}.pd-lock .pd-blur{padding:14px;filter:blur(6px);opacity:.6;user-select:none;pointer-events:none}.pd-lock .pd-tag{position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(180deg,transparent,rgba(0,0,0,.12))}' +
    '.pd-feat{display:flex;align-items:center;gap:12px;padding:11px 0}.pd-feat+.pd-feat{border-top:1px solid var(--line)}.pd-feat b{display:block;font-size:15px}.pd-feat span.d{display:block;font-size:12.5px;color:var(--mut)}.pd-feat .g{flex:1}' +
    '.pd-meter{height:8px;border-radius:4px;background:var(--s2);overflow:hidden;margin:8px 0 4px}.pd-meter i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#3d7bff,#ff5fa2)}' +
    '.pd-card{background:var(--s);border-radius:18px;box-shadow:0 0 0 1px var(--line);padding:14px 16px;margin:10px 0}.pd-hero{margin:0 0 8px;padding:18px 16px 16px;border-radius:20px;background:radial-gradient(120% 120% at 0% 0%,rgba(61,123,255,.3),transparent 60%),radial-gradient(100% 100% at 100% 0%,rgba(255,95,162,.22),transparent 62%),var(--s2)}.pd-hero h2{margin:0 0 6px;font-size:22px;line-height:1.2}.pd-hero p{margin:0;color:var(--mut);font-size:14px}' +
    '.pd-plan{position:relative;display:grid;grid-template-columns:22px 1fr auto;gap:2px 12px;align-items:start;text-align:left;width:100%;border:1.5px solid var(--line);background:var(--s);border-radius:18px;padding:14px 16px;margin:10px 0;color:var(--fg)}.pd-plan.on{border-color:var(--acc);background:rgba(79,134,255,.09)}.pd-plan.best{border:1.5px solid transparent;background:linear-gradient(var(--s),var(--s)) padding-box,linear-gradient(110deg,#0045fd,#3d9bff,#ff5fa2) border-box}.pd-plan.best.on{background:linear-gradient(rgba(79,134,255,.12),rgba(79,134,255,.12)),linear-gradient(var(--s),var(--s)) padding-box,linear-gradient(110deg,#0045fd,#3d9bff,#ff5fa2) border-box;background-clip:padding-box,padding-box,border-box}' +
    '.pd-dot{width:20px;height:20px;border-radius:50%;border:2px solid var(--line);margin-top:2px;grid-row:1/3}.pd-plan.on .pd-dot{border-color:var(--acc);background:radial-gradient(circle,var(--acc) 0 4px,transparent 5px)}.pd-plan b{font-size:16px}.pd-plan .pr{grid-column:3;grid-row:1;font-weight:700;font-size:18px;text-align:right}.pd-plan .pr small{display:block;font-size:11px;font-weight:500;color:var(--mut)}.pd-plan ul{grid-column:2/4;margin:4px 0 0;padding:0;list-style:none;font-size:13px;color:var(--mut)}.pd-plan li{padding:1px 0}.pd-plan li:before{content:"✓ ";color:var(--ok);font-weight:700}.pd-badge{position:absolute;top:-10px;right:14px;font-size:11px;font-weight:700;color:#fff;padding:3px 10px;border-radius:999px;background:linear-gradient(110deg,#0045fd,#ff5fa2)}' +
    '.pd-demo{position:fixed;left:12px;bottom:calc(var(--tab,64px) + 12px);z-index:50;background:var(--fg);color:var(--bg);border:0;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:600;opacity:.9}.lock .pd-demo{display:none}.pd-note{background:var(--s2);border-radius:12px;padding:10px 12px;font-size:13px;color:var(--mut);margin:10px 0}.pd-dots i{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--acc);margin:0 2px;animation:pdd 1s infinite}.pd-dots i:nth-child(2){animation-delay:.15s}.pd-dots i:nth-child(3){animation-delay:.3s}@keyframes pdd{0%,100%{opacity:.25}50%{opacity:1}}.pd-cf{position:fixed;inset:0;width:100%;height:100%;z-index:200;pointer-events:none}@media(prefers-reduced-motion:reduce){.btn.pd-shine{animation:none}}';

  const esc = (s) => (H ? H.esc(s) : String(s));
  const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const lk = (t, sm) => '<span class="pd-lk' + (sm ? ' s' : '') + '">' + LOCK_SVG + esc(t) + '</span>';
  const dailyLeft = () => Math.max(0, DAILY - (ent.used || 0));
  // короткая надпись про остаток (для пилюль)
  function pill() {
    if (ent.ban) return 'Доступ закрыт';
    if (ent.prem) return 'Сегодня: ' + dailyLeft() + ' из ' + DAILY;
    if (ent.credits > 0) return 'Разборов: ' + ent.credits + (ent.free ? ' + 1 бесплатный' : '');
    if (ent.free) return '1 бесплатный';
    return 'от 99 ₽';
  }
  const canRun = () => !ent.ban && ((ent.prem && dailyLeft() > 0) || ent.credits > 0 || ent.free > 0);

  function privacy() { return '<div class="pd-note">Не пишите в тексте имя, контакты, адреса и другие персональные данные. Текст уходит на разбор во внешний ИИ-сервис.</div>'; }

  function confetti() {
    try {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const c = document.createElement('canvas'); c.className = 'pd-cf'; document.body.appendChild(c);
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = c.width = innerWidth * dpr, Hh = c.height = innerHeight * dpr, x = c.getContext('2d');
      const col = ['#0045fd', '#3d9bff', '#ff5fa2', '#ffd166', '#ffffff'];
      const P = Array.from({ length: 140 }, () => { const a = (Math.random() * 0.9 + 0.05) * Math.PI; const v = (6 + Math.random() * 9) * dpr; return { x: W / 2 + (Math.random() - .5) * W * .3, y: Hh * .62, vx: Math.cos(a) * v * (Math.random() < .5 ? -1 : 1), vy: -Math.sin(a) * v, w: (5 + Math.random() * 6) * dpr, h: (3 + Math.random() * 4) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: col[Math.floor(Math.random() * col.length)] }; });
      const t0 = performance.now();
      (function f(t) { const k = (t - t0) / 2600; x.clearRect(0, 0, W, Hh); if (k >= 1) { c.remove(); return; }
        P.forEach((q) => { q.vy += .28 * dpr; q.vx *= .992; q.x += q.vx; q.y += q.vy; q.r += q.vr; x.save(); x.globalAlpha = Math.min(1, (1 - k) * 2); x.translate(q.x, q.y); x.rotate(q.r); x.fillStyle = q.c; x.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); x.restore(); });
        requestAnimationFrame(f); }(t0));
    } catch (e) { /* ignore */ }
  }

  function start() {
    const can = canRun();
    const feats = [['Оценка по 4 критериям и итоговый band', 'как у экзаменатора, с диапазоном'], ['Что тянет балл вниз', 'и сколько band вы теряете на каждом'], ['Подробный разбор слабого абзаца', 'каждая ошибка и правило']];
    H.openSheet('<div class="pd-head"><h2>Расширенный разбор</h2><span class="pd-hp">' + esc(pill()) + '</span></div>' +
      '<div class="pd-card" style="padding:4px 16px">' + feats.map((f) => '<div class="pd-feat"><div class="g"><b>' + esc(f[0]) + '</b><span class="d">' + esc(f[1]) + '</span></div></div>').join('') + '</div>' +
      privacy() + '<div class="pd-note">В превью ИИ не вызывается: показывается пример разбора на демо-тексте.</div>' +
      '<div class="stack">' + (ent.ban ? '' : '<button class="btn pd-shine" id="pdgo">' + (can ? 'Получить разбор' : (ent.prem ? 'Лимит на сегодня исчерпан' : 'Открыть полный разбор')) + '</button>') + '<button class="btn" id="pdno">Закрыть</button></div>', () => {
      const go = document.getElementById('pdgo'); if (go) go.onclick = () => (can ? run() : paywall());
      document.getElementById('pdno').onclick = () => H.closeSheet();
    });
  }

  function loading(title, steps, ms, done) {
    H.openSheet('<h2>' + esc(title) + '</h2><p class="mut" id="pdst" style="margin-top:-6px">' + esc(steps[0]) + '</p><p class="pd-dots" style="text-align:center;margin:30px 0">&nbsp;<i></i><i></i><i></i></p>', () => {
      steps.forEach((t, i) => setTimeout(() => { const e = document.getElementById('pdst'); if (e) e.textContent = t; }, (ms / steps.length) * i));
      setTimeout(done, ms);
    });
  }

  function run() {
    let tier;
    if (ent.prem && dailyLeft() > 0) { ent.used = (ent.used || 0) + 1; tier = 'paid'; } else if (ent.credits > 0) { ent.credits--; tier = 'paid'; } else { ent.free--; tier = 'free'; }
    save();
    loading('Читаю текст', ['Проверяю структуру и аргументы…', 'Оцениваю по критериям IELTS…', 'Ищу ошибки и слабые места…', 'Собираю разбор…'], 3000, () => result(tier));
  }

  const blurBox = (inner, label) => '<div class="pd-lock"><div class="pd-blur">' + inner + '</div><div class="pd-tag">' + lk(label) + '</div></div>';

  function result(tier) {
    const full = tier === 'paid';
    let h = '<div class="pd-head"><h2>Расширенный разбор</h2><span class="pd-hp">' + (full ? 'Полный' : 'Бесплатная часть') + '</span></div><p class="mut" style="margin:-6px 0 12px">Демо-пример · оценка приблизительная, это не официальный результат IELTS</p>';
    h += '<div style="display:flex;align-items:flex-end;gap:12px"><div class="pd-band">≈ 6.0</div><div class="mut" style="padding-bottom:6px">диапазон 5.5–6.0</div></div>';
    h += CRIT.map((c) => '<div class="pd-row"><span>' + esc(c[0]) + '</span><b>' + c[1].toFixed(1) + '</b><div class="bar"><i style="width:' + Math.round(c[1] / 9 * 100) + '%"></i></div></div>').join('');
    h += (goal() > 6 ? '<div class="pd-card"><b>До вашей цели Band ' + gs() + ' не хватает ≈ ' + (goal() - 6).toFixed(1) + '</b><div class="mut" style="margin-top:4px">Это достижимо: 12 найденных ошибок и одна логическая дыра в выводе закрывают заметную часть разрыва.</div></div>' : '<div class="pd-card"><b>Ваша цель Band ' + gs() + ' уже в зоне досягаемости</b><div class="mut" style="margin-top:4px">Закрепите результат: 12 найденных ошибок — это то, что может стоить вам баллов в день экзамена.</div></div>');
    h += '<h3>Что тянет балл вниз</h3><div class="list" style="padding:4px 16px">' +
      '<div class="rowi" style="padding:10px 0"><span style="color:var(--warn)">!</span><span class="grow"><b>Грамматика.</b> Согласование подлежащего и сказуемого сломано почти в каждом абзаце (it also <span class="pd-del">have</span>, parents <span class="pd-del">has</span>, government <span class="pd-del">pay</span>). Это держит Grammatical Range & Accuracy на 5.5.</span></div>' +
      '<div class="rowi" style="padding:10px 0"><span style="color:var(--warn)">!</span><span class="grow"><b>Позиция.</b> Вы пишете «partly agree», но идея из вывода (бесплатно только для лучших студентов) нигде не раскрыта в основной части. Это снижает Task Response.</span></div></div>';
    h += '<h3>Разбор самого слабого абзаца (абзац 2)</h3>' +
      '<p style="margin:0 0 8px">' + esc(SAMPLE[1]).replace(/can not|very expensive|their parents has not enough money|If the government pay|this students|improve their life|bring more benefit to the society/g, (m) => '<span class="pd-del">' + m + '</span>') + '</p>' +
      '<p class="mut" style="margin:0 0 4px">Исправлено:</p><p style="margin:0 0 10px"><span class="pd-ins">' + esc(FIX2_TEXT) + '</span></p>' +
      '<div class="list" style="padding:4px 16px">' + FIX2.map((f) => '<div class="rowi" style="padding:10px 0;align-items:flex-start"><span class="grow"><span class="pd-del">' + esc(f[0]) + '</span> → <span class="pd-ins">' + esc(f[1]) + '</span><div class="mut" style="margin-top:2px;font-size:13px">' + esc(f[2]) + '</div></span></div>').join('') + '</div>';
    if (full) {
      h += '<h3>Какие у вас ошибки</h3><div class="pd-card">' + TYPES.map((t) => '<div class="pd-row" style="margin:6px 0"><span>' + esc(t[0]) + '</span><b>' + t[1] + '</b><div class="bar"><i style="width:' + Math.round(t[1] / 12 * 100) + '%"></i></div></div>').join('') + '</div>';
      h += '<h3>Остальные ошибки</h3><div class="list" style="padding:4px 16px">' + ALLFIX.map((f) => '<div class="rowi" style="padding:10px 0;align-items:flex-start"><span class="grow"><span class="pd-del">' + esc(f[0]) + '</span> → <span class="pd-ins">' + esc(f[1]) + '</span><div class="mut" style="margin-top:2px;font-size:13px">' + esc(f[3]) + ' · ' + esc(f[2]) + '</div></span></div>').join('') + '</div>';
      h += '<h3>Разбор аргументации по абзацам</h3><div class="list" style="padding:4px 16px">' + PARAS.map((x) => '<div class="rowi" style="padding:10px 0;align-items:flex-start"><span class="grow"><b>' + esc(x[0]) + '</b><div class="mut" style="margin-top:2px;font-size:13px">' + esc(x[1]) + '</div></span></div>').join('') + '</div>';
      h += '<h3>Ваш текст на уровне Band 7</h3>' + BAND7.map((p) => '<p style="margin:0 0 8px"><span class="pd-ins">' + esc(p) + '</span></p>').join('');
      h += '<h3>Образец сильного абзаца (Band 8)</h3><p style="margin:0 0 8px"><span class="pd-ins">' + esc(BAND8) + '</span></p><p class="mut" style="margin:0">Образец написан под ваш вопрос. Не заучивайте, а возьмите структуру: уступка, неожиданный вывод, вывод.</p>';
      h += '<h3>Словарь: что заменить</h3><div class="list" style="padding:4px 16px">' + VOCAB.map((v) => '<div class="rowi" style="padding:8px 0"><span class="grow">' + esc(v[0]) + ' → <b>' + esc(v[1]) + '</b></span></div>').join('') + '</div>';
      h += '<h3>План на неделю</h3><div class="list" style="padding:4px 16px">' + STEPS.map((x, i) => '<div class="rowi" style="padding:10px 0;align-items:flex-start"><span style="font-weight:700;color:var(--acc)">' + (i + 1) + '</span><span class="grow"><b>' + esc(x[0]) + '</b><div class="mut" style="margin-top:2px;font-size:13px">' + esc(x[1]) + ' · ' + esc(x[2]) + '</div></span></div>').join('') + '</div>';
      h += '<div class="pd-note">Ошибки и слова из разбора можно сохранить в журнал ошибок и повторять карточками. (В превью не сохраняется.)</div>';
      if (!ent.prem) h += '<div class="pd-card" style="display:flex;align-items:center;gap:12px"><div style="flex:1"><b>Проверка исправленной версии</b><div class="mut" style="font-size:13px">Перепишите текст и получите новый band. Входит в Premium.</div></div>' + lk('Premium', true) + '</div>';
    } else {
      h += '<h3>Что ещё в полном разборе</h3>' +
        '<div class="pd-card"><b>Найдено 12 ошибок, открыто 7</b><div class="pd-meter"><i style="width:58%"></i></div><div class="mut" style="font-size:12.5px">Бесплатно разобран 1 абзац из 4. Остальные 5 ошибок и логика других абзацев скрыты.</div></div>' +
        blurBox('<b>Ваш текст на уровне Band 7</b><p>' + esc(BAND7[0]) + '</p><p>' + esc(BAND7[2]) + '</p>', 'Только в полном разборе') +
        '<div class="pd-card" style="padding:4px 16px">' + LOCKS.map((f) => '<div class="pd-feat"><div class="g"><b>' + esc(f[0]) + '</b><span class="d">' + esc(f[1]) + '</span></div>' + lk('закрыто', true) + '</div>').join('') + '</div>' +
        '<div class="stack" style="margin-top:14px"><button class="btn pd-shine" id="pdup">Открыть полный разбор<span class="pd-pill">от 99 ₽</span></button></div>' +
        '<p class="mut" style="text-align:center;margin:8px 0 0">Premium: до ' + DAILY + ' разборов в день</p>';
    }
    h += '<div class="stack" style="margin-top:10px"><button class="btn" id="pdx">Закрыть</button></div>';
    H.openSheet(h, () => { const u = document.getElementById('pdup'); if (u) u.onclick = paywall; document.getElementById('pdx').onclick = () => H.closeSheet(); setTimeout(confetti, 250); });
  }

  const OPTS = [
    ['prem', 'Premium · 30 дней', '490 ₽', '≈ 16 ₽ в день', ['До ' + DAILY + ' полных разборов в день', 'Проверка исправленной версии', 'Все будущие функции'], true],
    ['five', 'Пакет из 5 разборов', '399 ₽', '80 ₽ за разбор', ['5 полных разборов', 'Не сгорают, тратьте когда удобно'], false],
    ['one', 'Один полный разбор', '99 ₽', 'разово', ['Все ошибки, текст на Band 7, план'], false]
  ];
  function paywall() {
    let sel = 'prem';
    const draw = () => OPTS.map((o) => '<button class="pd-plan' + (o[5] ? ' best' : '') + (sel === o[0] ? ' on' : '') + '" data-k="' + o[0] + '">' + (o[5] ? '<span class="pd-badge">Выгоднее всего</span>' : '') + '<span class="pd-dot"></span><b>' + esc(o[1]) + '</b><span class="pr">' + esc(o[2]) + '<small>' + esc(o[3]) + '</small></span><ul>' + o[4].map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></button>').join('');
    const label = () => { const o = OPTS.find((x) => x[0] === sel); return 'Оплатить ' + o[2]; };
    H.openSheet('<div class="pd-hero"><h2>Узнайте, что мешает вам набрать ' + gs() + '</h2><p>Покажем каждую ошибку, перепишем текст на уровень выше и дадим план на неделю. Результат сразу в приложении.</p></div>' +
      '<div id="pdopts">' + draw() + '</div>' +
      '<div class="stack"><button class="btn pd-shine" id="pdpay">' + label() + '</button><button class="btn" id="pdback">Не сейчас</button></div>' +
      '<p class="mut" style="text-align:center;margin:12px 0 0">Карта или СБП через Robokassa · чек на e-mail · без подписки и автопродления. Нажимая «Оплатить», вы принимаете <a href="' + PAY + '/#oferta" target="_blank" rel="noopener">оферту</a> и <a href="' + PAY + '/#policy" target="_blank" rel="noopener">политику</a>.</p>', () => {
      const wrap = document.getElementById('pdopts');
      wrap.onclick = (e) => { const b = e.target.closest('.pd-plan'); if (!b) return; sel = b.dataset.k; wrap.innerHTML = draw(); document.getElementById('pdpay').textContent = label(); };
      document.getElementById('pdback').onclick = () => H.closeSheet();
      document.getElementById('pdpay').onclick = () => demoPay(sel);
    });
  }
  function demoPay(sel) {
    H.openSheet('<h2>Демо-оплата</h2><p class="mut" style="margin-top:-6px">В превью реальная оплата отключена, деньги не списываются. В реальной версии здесь откроется Robokassa, а после оплаты вы вернётесь в приложение.</p><div class="stack"><button class="btn p" id="pdok">Имитировать успешную оплату</button><button class="btn" id="pdcancel">Отмена</button></div>', () => {
      document.getElementById('pdcancel').onclick = () => H.closeSheet();
      document.getElementById('pdok').onclick = () => {
        loading('Подтверждаем оплату', ['Ждём подтверждение от банка…', 'Начисляем доступ…'], 2200, () => {
          if (sel === 'one') ent.credits += 1; else if (sel === 'five') ent.credits += 5; else { ent.prem = true; ent.used = 0; }
          save(); run();
        });
      };
    });
  }

  function demoPanel() {
    H.openSheet('<h2>Демо-состояние</h2><p class="mut" style="margin-top:-6px">Только в превью. Так будет выглядеть приложение у разных пользователей.</p><div class="stack">' +
      '<button class="btn" data-s="new">Новый пользователь (1 бесплатный)</button><button class="btn" data-s="used">Бесплатный использован</button><button class="btn" data-s="paid">Есть 5 оплаченных разборов</button><button class="btn" data-s="prem">Premium активен (использовано 3 из 10)</button><button class="btn" data-s="ban">Доступ к ИИ запрещён админом</button></div>', (el) => {
      el.onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; const s = b.dataset.s;
        ent = { free: s === 'new' ? 1 : 0, credits: s === 'paid' ? 5 : 0, prem: s === 'prem', ban: s === 'ban', used: s === 'prem' ? 3 : 0 }; save(); H.toast('Состояние: ' + b.textContent); H.closeSheet(); };
    });
  }

  return {
    enabled,
    init(h) {
      H = h; if (!enabled) return;
      document.head.appendChild(css);
      const b = document.createElement('button'); b.className = 'pd-demo'; b.textContent = 'ПРЕВЬЮ · демо'; b.onclick = demoPanel; document.body.appendChild(b);
    },
    // HTML кнопки для листа «Анализ текста»
    button() { return enabled && !ent.ban ? '<button class="btn pd-shine" id="pdai" style="margin-bottom:10px">✦ Расширенный разбор<span class="pd-pill">' + esc(pill()) + '</span></button>' : ''; },
    bind(ctx) { const b = document.getElementById('pdai'); if (b) b.onclick = () => start(); },
    _state: () => ent,
  };
}());
