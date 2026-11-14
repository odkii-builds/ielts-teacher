/* ПРЕВЬЮ платного ИИ-разбора. ТОЛЬКО для закрытого превью: в проде (ielts.odkii-builds.ru) флаг выключен жёстко.
 * ИИ и оплата здесь имитируются (никаких запросов, никаких списаний). Пока владелец не скажет «Robokassa готова, РКН, всё легально»,
 * эту ветку в main не вливаем. См. docs/RELEASE-GATE.md. */
window.Paid = (function () {
  'use strict';
  const host = location.hostname;
  const PROD = /(^|\.)ielts\.odkii-builds\.ru$/.test(host) || /(^|\.)odkii-builds\.ru$/.test(host);
  const enabled = !PROD && (/\.vercel\.app$/.test(host) || host === 'localhost' || host === '127.0.0.1');
  const KEY = 'ielts_demo_ent';
  const DEF = { free: 1, credits: 0, prem: false, ban: false };
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

  // ---------- стили ----------
  const css = document.createElement('style');
  css.textContent = '.pd-band{font-size:44px;font-weight:700;letter-spacing:-.02em;line-height:1}.pd-row{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;margin:10px 0}.pd-row .bar{grid-column:1/3;height:6px;background:var(--s2);border-radius:3px;overflow:hidden}.pd-del{background:#dc262622;text-decoration:line-through;border-radius:4px;padding:0 2px}.pd-ins{background:#16a34a22;border-radius:4px;padding:0 2px}.pd-lock{position:relative;border:1px dashed var(--line);border-radius:14px;padding:12px 14px;margin:8px 0;overflow:hidden}.pd-lock .pd-blur{filter:blur(5px);opacity:.55;user-select:none;pointer-events:none}.pd-lock .pd-tag{position:absolute;inset:0;display:grid;place-items:center;font-weight:600;font-size:14px}.pd-opt{display:grid;grid-template-columns:1fr auto;gap:2px 12px;text-align:left;width:100%;border:1px solid var(--line);background:var(--s);border-radius:14px;padding:12px 14px;margin:8px 0;color:var(--fg)}.pd-opt.on{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}.pd-opt b{font-size:16px}.pd-opt span{color:var(--mut);font-size:13px}.pd-opt em{font-style:normal;font-weight:700;grid-row:1/3;grid-column:2;align-self:center}.pd-demo{position:fixed;left:12px;bottom:calc(var(--tab,64px) + 12px);z-index:50;background:var(--fg);color:var(--bg);border:0;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:600;opacity:.9}.lock .pd-demo{display:none}.pd-note{background:var(--s2);border-radius:12px;padding:10px 12px;font-size:13px;color:var(--mut);margin:10px 0}.pd-dots i{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--acc);margin:0 2px;animation:pdd 1s infinite}.pd-dots i:nth-child(2){animation-delay:.15s}.pd-dots i:nth-child(3){animation-delay:.3s}@keyframes pdd{0%,100%{opacity:.25}50%{opacity:1}}';

  const esc = (s) => (H ? H.esc(s) : String(s));
  const balance = () => ent.ban ? 'Доступ к ИИ-разбору отключён' : ent.prem ? 'Premium: до 10 разборов в сутки' : ent.credits > 0 ? 'Оплаченных разборов: ' + ent.credits + (ent.free ? ' · бесплатный: 1' : '') : ent.free ? 'Бесплатный разбор: 1' : 'Бесплатный разбор использован';

  function privacy() { return '<div class="pd-note">Не пишите в тексте имя, контакты, адреса и другие персональные данные. Текст уходит на разбор во внешний ИИ-сервис.</div>'; }

  function start(ctx) {
    const can = !ent.ban && (ent.prem || ent.credits > 0 || ent.free > 0);
    H.openSheet('<h2>Разбор от ИИ</h2><p class="mut" style="margin-top:-6px">' + esc(balance()) + '</p>' +
      '<div class="list" style="padding:4px 16px"><div class="rowi" style="padding:10px 0"><span>•</span><span class="grow">Оценка по четырём критериям IELTS и итоговый band</span></div><div class="rowi" style="padding:10px 0"><span>•</span><span class="grow">Что сильнее всего тянет балл вниз</span></div><div class="rowi" style="padding:10px 0"><span>•</span><span class="grow">Подробный разбор самого слабого абзаца</span></div></div>' +
      privacy() +
      '<div class="pd-note">В превью ИИ не вызывается: показывается пример разбора на демо-тексте.</div>' +
      '<div class="stack">' + (ent.ban ? '' : '<button class="btn p" id="pdgo">' + (can ? 'Получить разбор' : 'Открыть полный разбор') + '</button>') + '<button class="btn" id="pdno">Закрыть</button></div>', () => {
      const go = document.getElementById('pdgo'); if (go) go.onclick = () => (can ? run() : paywall());
      document.getElementById('pdno').onclick = () => H.closeSheet();
    });
  }

  function run() {
    let tier;
    if (ent.prem) tier = 'paid'; else if (ent.credits > 0) { ent.credits--; tier = 'paid'; } else { ent.free--; tier = 'free'; }
    save();
    H.openSheet('<h2>Читаю текст</h2><p class="mut" id="pdst">Проверяю структуру и аргументы…</p><p class="pd-dots" style="text-align:center;margin:26px 0"><i></i><i></i><i></i></p>', () => {
      const steps = ['Оцениваю по критериям IELTS…', 'Ищу ошибки и слабые места…', 'Собираю разбор…'];
      steps.forEach((t, i) => setTimeout(() => { const e = document.getElementById('pdst'); if (e) e.textContent = t; }, 700 * (i + 1)));
      setTimeout(() => result(tier), 2600);
    });
  }

  const locked = (title, text) => '<div class="pd-lock"><div class="pd-blur"><b>' + esc(title) + '</b><div>' + esc(text) + '</div></div><div class="pd-tag">Только в полном разборе</div></div>';

  function result(tier) {
    const full = tier === 'paid';
    const overall = 6.0;
    let h = '<h2>' + (full ? 'Полный разбор' : 'Ваш разбор') + '</h2><p class="mut" style="margin-top:-6px">Демо-пример · оценка приблизительная, это не официальный результат IELTS</p>';
    h += '<div style="display:flex;align-items:flex-end;gap:12px"><div class="pd-band">≈ ' + overall.toFixed(1) + '</div><div class="mut" style="padding-bottom:6px">диапазон 5.5–6.0</div></div>';
    h += CRIT.map((c) => '<div class="pd-row"><span>' + esc(c[0]) + '</span><b>' + c[1].toFixed(1) + '</b><div class="bar"><i style="width:' + Math.round(c[1] / 9 * 100) + '%"></i></div></div>').join('');
    h += '<h3>Что тянет балл вниз</h3><div class="list" style="padding:4px 16px">' +
      '<div class="rowi" style="padding:10px 0"><span style="color:var(--warn)">!</span><span class="grow"><b>Грамматика.</b> Согласование подлежащего и сказуемого сломано почти в каждом абзаце (it also <span class="pd-del">have</span>, parents <span class="pd-del">has</span>, government <span class="pd-del">pay</span>). Это держит Grammatical Range & Accuracy на 5.5.</span></div>' +
      '<div class="rowi" style="padding:10px 0"><span style="color:var(--warn)">!</span><span class="grow"><b>Позиция.</b> Вы пишете «partly agree», но идея из вывода (бесплатно только для лучших студентов) нигде не раскрыта в основной части. Это снижает Task Response.</span></div></div>';
    h += '<h3>Разбор самого слабого абзаца (абзац 2)</h3>' +
      '<p style="margin:0 0 8px">' + esc(SAMPLE[1]).replace(/can not|very expensive|their parents has not enough money|If the government pay|this students|improve their life|bring more benefit to the society/g, (m) => '<span class="pd-del">' + m + '</span>') + '</p>' +
      '<p class="mut" style="margin:0 0 4px">Исправлено:</p><p style="margin:0 0 10px"><span class="pd-ins">' + esc(FIX2_TEXT) + '</span></p>' +
      '<div class="list" style="padding:4px 16px">' + FIX2.map((f) => '<div class="rowi" style="padding:10px 0;align-items:flex-start"><span class="grow"><span class="pd-del">' + esc(f[0]) + '</span> → <span class="pd-ins">' + esc(f[1]) + '</span><div class="mut" style="margin-top:2px;font-size:13px">' + esc(f[2]) + '</div></span></div>').join('') + '</div>';
    if (full) {
      h += '<h3>Остальные ошибки</h3><div class="list" style="padding:4px 16px">' + ALLFIX.map((f) => '<div class="rowi" style="padding:10px 0;align-items:flex-start"><span class="grow"><span class="pd-del">' + esc(f[0]) + '</span> → <span class="pd-ins">' + esc(f[1]) + '</span><div class="mut" style="margin-top:2px;font-size:13px">' + esc(f[3]) + ' · ' + esc(f[2]) + '</div></span></div>').join('') + '</div>';
      h += '<h3>Текст на уровне Band 7</h3>' + BAND7.map((p) => '<p style="margin:0 0 8px"><span class="pd-ins">' + esc(p) + '</span></p>').join('');
      h += '<h3>Что заменить в словаре</h3><div class="list" style="padding:4px 16px">' + VOCAB.map((v) => '<div class="rowi" style="padding:8px 0"><span class="grow">' + esc(v[0]) + ' → <b>' + esc(v[1]) + '</b></span></div>').join('') + '</div>';
      h += '<div class="pd-note">Ошибки из этого разбора можно сохранить в журнал ошибок и повторять карточками. (В превью не сохраняется.)</div>';
    } else {
      h += '<h3>В полном разборе</h3>' + locked('Все ошибки по абзацам', 'Ещё 5 ошибок с объяснением и тегом критерия') + locked('Текст на уровне Band 7', 'Ваш текст, переписанный на уровень Band 7 с сохранением ваших идей') + locked('Что заменить в словаре', 'Шесть слабых слов и сильные замены') +
        '<div class="stack" style="margin-top:14px"><button class="btn p" id="pdup">Открыть полный разбор · от 99 ₽</button></div>';
    }
    h += '<div class="stack" style="margin-top:10px"><button class="btn" id="pdx">Закрыть</button></div>';
    H.openSheet(h, () => { const u = document.getElementById('pdup'); if (u) u.onclick = paywall; document.getElementById('pdx').onclick = () => H.closeSheet(); });
  }

  const OPTS = [['one', 'Полный разбор текста', 'Все ошибки, текст на Band 7, словарь', '99 ₽', 1], ['five', 'Пакет из 5 разборов', '80 ₽ за разбор, не сгорают', '399 ₽', 5], ['prem', 'Premium на 30 дней', 'До 10 разборов в сутки, проверка исправленной версии', '490 ₽', 0]];
  function paywall() {
    let sel = 'one';
    const draw = () => OPTS.map((o) => '<button class="pd-opt' + (sel === o[0] ? ' on' : '') + '" data-k="' + o[0] + '"><b>' + esc(o[1]) + '</b><em>' + esc(o[3]) + '</em><span>' + esc(o[2]) + '</span></button>').join('');
    H.openSheet('<h2>Полный разбор</h2><div id="pdopts">' + draw() + '</div>' +
      '<div class="pd-note">Оплата через Robokassa (карта или СБП), чек придёт на e-mail. Результат сразу в приложении. Нажимая «Оплатить», вы принимаете <a href="' + PAY + '/#oferta" target="_blank" rel="noopener">оферту</a> и <a href="' + PAY + '/#policy" target="_blank" rel="noopener">политику</a>.</div>' +
      '<div class="stack"><button class="btn p" id="pdpay">Оплатить</button><button class="btn" id="pdback">Назад</button></div>', () => {
      const wrap = document.getElementById('pdopts');
      wrap.onclick = (e) => { const b = e.target.closest('.pd-opt'); if (!b) return; sel = b.dataset.k; wrap.innerHTML = draw(); };
      document.getElementById('pdback').onclick = () => H.closeSheet();
      document.getElementById('pdpay').onclick = () => demoPay(sel);
    });
  }
  function demoPay(sel) {
    H.openSheet('<h2>Демо-оплата</h2><p class="mut" style="margin-top:-6px">В превью реальная оплата отключена, деньги не списываются.</p><div class="stack"><button class="btn p" id="pdok">Имитировать успешную оплату</button><button class="btn" id="pdcancel">Отмена</button></div>', () => {
      document.getElementById('pdcancel').onclick = () => H.closeSheet();
      document.getElementById('pdok').onclick = () => {
        if (sel === 'one') ent.credits += 1; else if (sel === 'five') ent.credits += 5; else ent.prem = true;
        save(); H.toast('Оплата прошла (демо)'); start({});
      };
    });
  }

  function demoPanel() {
    H.openSheet('<h2>Демо-состояние</h2><p class="mut" style="margin-top:-6px">Только в превью. Так будет выглядеть приложение у разных пользователей.</p><div class="stack">' +
      '<button class="btn" data-s="new">Новый пользователь (1 бесплатный)</button><button class="btn" data-s="used">Бесплатный использован</button><button class="btn" data-s="paid">Есть 3 оплаченных разбора</button><button class="btn" data-s="prem">Premium активен</button><button class="btn" data-s="ban">Доступ к ИИ запрещён админом</button></div>', (el) => {
      el.onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; const s = b.dataset.s;
        ent = { free: s === 'new' ? 1 : 0, credits: s === 'paid' ? 3 : 0, prem: s === 'prem', ban: s === 'ban' }; save(); H.toast('Состояние: ' + b.textContent); H.closeSheet(); };
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
    button() { return enabled ? '<button class="btn p" id="pdai">Разбор от ИИ · ' + esc(ent.free && !ent.ban ? '1 бесплатный' : 'платный') + '</button>' : ''; },
    bind(ctx) { const b = document.getElementById('pdai'); if (b) b.onclick = () => start(ctx || {}); },
    _state: () => ent,
  };
}());
