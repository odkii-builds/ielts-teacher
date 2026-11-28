/* Новый вид разделов: плитки чтения, строки аудирования с кнопкой play, листы письма.
 * Только внешний вид: данные и экраны тестов остаются прежними. */
window.Shelf = (function () {
  'use strict';
  let C = null, SEC = 'R', added = false;
  const esc = (s) => (C ? C.esc(s) : String(s)), LOCK = '';
  const tagOf = (x) => x.tag || '';
  const ICON = {
    L: '<path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
    R: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5z"/><path d="M8 7h8M8 11h6"/>',
    W: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'
  };
  // Иконки по теме теста (ключевые слова в topic/title), иначе — по номеру. Простые линии в стиле нижней панели.
  const ART = {
    city: '<path d="M3 21h18M5 21V9l5-3v15M10 21V4l6 3v14M16 21v-9l3 2v7"/><path d="M7 12h1M7 15h1M12 9h1M12 12h1M12 15h1"/>',
    leaf: '<path d="M5 19c0-8 6-14 15-14-1 9-7 15-15 14z"/><path d="M5 19l8-8"/>',
    wave: '<path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1"/><path d="M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1"/><path d="M2 7c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 15h9"/>',
    brain: '<path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 1V5a3 3 0 00-3-1z"/><path d="M15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 1"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    heart: '<path d="M12 20s-7-4.5-9-9a4.5 4.5 0 018-3.5A4.5 4.5 0 0121 11c-2 4.5-9 9-9 9z"/><path d="M7 12h2l1.5-2 2 4 1.5-2h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="14" r=".5"/><circle cx="15" cy="14" r=".5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5z"/><path d="M8 7h8M8 11h6"/>',
    brush: '<path d="M19 3l-9 9M14 4l6 6"/><path d="M10 12c-3 0-5 2-5 5 0 1.5-1 3-2 3 4 1 9-1 9-5"/>',
    pot: '<path d="M7 4h10M8 4c0 3-3 5-3 9a7 7 0 0014 0c0-4-3-6-3-9"/><path d="M6 13h12"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>'
  };
  const KEYS = [[/city|urban|plann|architect|space|civic|build/i, 'city'], [/environment|climate|tree|forest|beaver|plant|farm|field|crop|bird|animal|bee/i, 'leaf'], [/ocean|sea|river|water|current/i, 'wave'],
    [/science|lab|trial|experiment|chemist/i, 'flask'], [/memory|brain|psycholog|judgement|mind|feedback/i, 'brain'], [/star|space|astronom|occultation|sky/i, 'star'], [/econom|cost|market|queue|money|tourism|measure/i, 'chart'],
    [/dialect|language|dictionar|geograph|travel/i, 'globe'], [/music|acoustic|choir|sound/i, 'music'], [/health|hospital|medic|body/i, 'heart'], [/light|daylight|heat|energy|warmth|solar/i, 'sun'],
    [/rail|train|transport|track|car|traffic/i, 'train'], [/print|art|paint|dress|fashion|design/i, 'brush'], [/archaeolog|pot|history|ancient/i, 'pot'], [/sleep|night|teen/i, 'moon'], [/educat|school|teach|writ|read/i, 'book']];
  // У каждого раздела своя гамма и своя форма карточки, чтобы разделы не путались издалека:
  // аудирование — фиолетово-розовые строки с кнопкой «play», чтение — синие плитки-страницы, письмо — бирюзовые листы в линейку.
  // Все гаммы соседние с фирменной сине-розовой: меню, кнопки и вкладки остаются синими.
  const PALS = {
    L: ['linear-gradient(135deg,#6d28d9,#a855f7 55%,#f472b6)', 'linear-gradient(135deg,#7c3aed,#c026d3 60%,#fb7185)', 'linear-gradient(135deg,#5b21b6,#9333ea 55%,#f0abfc)', 'linear-gradient(135deg,#4c1d95,#8b5cf6 60%,#ec4899)'],
    W: ['linear-gradient(135deg,#0f766e,#14b8a6 60%,#67e8f9)', 'linear-gradient(135deg,#0e7490,#0d9488 55%,#5eead4)', 'linear-gradient(135deg,#115e59,#0891b2 60%,#7dd3fc)', 'linear-gradient(135deg,#0f766e,#06b6d4 60%,#a5f3fc)']
  };
  const PAL = ['linear-gradient(135deg,#0045fd,#3d9bff 60%,#7fb8ff)', 'linear-gradient(135deg,#1d4ed8,#3b82f6 60%,#93c5fd)', 'linear-gradient(135deg,#0369a1,#0ea5e9 60%,#7dd3fc)', 'linear-gradient(135deg,#1e40af,#2563eb 55%,#60a5fa)']; // чтение: только синие
  const artOf = (x) => { const k = String(((x.meta && x.meta.topic) || '') + ' ' + x.title); const m = KEYS.find(([re]) => re.test(k)); const names = Object.keys(ART); return ART[m ? m[1] : names[x.n % names.length]]; };
  const palOf = (x) => { const P = PALS[SEC] || PAL; return P[x.n % P.length]; };
  const WAVE = '<span class="lb-wave">' + [5, 9, 14, 8, 12, 6, 10, 4].map((h) => '<i style="height:' + h * 2 + 'px"></i>').join('') + '</span>';
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>';
  const css = document.createElement('style');
  css.textContent = '.lb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:12px}@media(max-width:340px){.lb-grid{gap:10px}.lb-body{padding:9px 10px 11px}.lb-body b{font-size:13.5px}.lb-tag{font-size:10px;padding:2px 7px}}.lb-card{position:relative;display:flex;flex-direction:column;text-align:left;border:0;border-radius:18px;padding:0;overflow:hidden;background:var(--s);box-shadow:0 0 0 1px var(--line);color:var(--fg);transition:transform .15s}.lb-card:active{transform:scale(.97)}' +
    '.lb-art{position:relative;height:86px;display:grid;place-items:center;color:#fff;background:radial-gradient(90% 120% at 10% 0%,rgba(255,255,255,.35),transparent 55%),linear-gradient(135deg,#0045fd,#3d9bff 60%,#7fb8ff)}.lb-art svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;opacity:.95}.lb-art i{position:absolute;left:10px;bottom:8px;font-style:normal;font-size:12px;font-weight:700;opacity:.9;font-variant-numeric:tabular-nums}' +
    '.lb-card.prem .lb-art{background:radial-gradient(90% 120% at 10% 0%,rgba(255,255,255,.35),transparent 55%),linear-gradient(135deg,#0045fd,#3d7bff 55%,#ff5fa2)}.lb-card.locked .lb-art{background:linear-gradient(135deg,#5c6370,#8a919e)}.lb-card.locked .lb-art svg{opacity:.45}' +
    '.lb-warm{border-radius:20px;padding:18px 18px 14px;margin:0 0 14px;color:#fff;background:linear-gradient(120deg,#0045fd,#3d7bff 60%,#ff5fa2 140%)}.lb-warm-L{background:linear-gradient(120deg,#5b21b6,#9333ea 55%,#ff5fa2 130%)}.lb-warm-W{background:linear-gradient(120deg,#0f766e,#0891b2 55%,#3d7bff 130%)}.lb-warm h2{margin:0 0 6px;font-size:22px;color:#fff}.lb-warm p{margin:0 0 10px;opacity:.92;font-size:14.5px;line-height:1.4}.lb-warm ul{margin:0;padding:0;list-style:none}.lb-warm li{padding:3px 0 3px 22px;position:relative;font-size:14px}.lb-warm li:before{content:"✓";position:absolute;left:0;font-weight:800}' +
    '.lb-more{display:flex!important;flex-direction:column;justify-content:center;align-items:flex-start;gap:6px;padding:16px;min-height:180px;color:#fff!important;background:linear-gradient(135deg,#0f766e,#0891b2 60%,#3d7bff)!important}.lb-more .m{font-size:22px}.lb-more b{font-size:15px}.lb-more span:last-child{font-size:12.5px;opacity:.9}' +
    '.lb-w .lb-body span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    'a.lb-card,a.lb-card:hover{text-decoration:none;color:var(--fg)}.lb-body b{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.lb-body{padding:10px 12px 12px}.lb-body b{display:block;font-size:14px;line-height:1.25}.lb-body span{display:block;font-size:12px;color:var(--mut);margin-top:3px}.lb-tag{position:absolute;top:8px;right:8px;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.26);color:#fff;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:inline-flex;gap:4px;align-items:center}.lb-tag svg{width:10px;height:10px}' +
    '.lb-prog{margin:0 0 14px}.lb-prog .r{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;color:var(--mut)}.lb-prog b{color:var(--fg)}.lb-chip{font-size:12px;font-weight:700;color:#fff;padding:3px 10px;border-radius:999px;background:linear-gradient(110deg,#0045fd,#ff5fa2)}' +
    '.lb-list{grid-template-columns:1fr;gap:10px}.lb-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;border-radius:18px;padding:10px 12px 10px 10px;background:var(--s);box-shadow:0 0 0 1px var(--line);color:var(--fg)}.lb-row:active{transform:scale(.98)}' +
    '.lb-sq{position:relative;flex:none;width:64px;height:64px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#5c6370,#8a919e);overflow:hidden}.lb-sq i{position:absolute;left:7px;top:5px;font-style:normal;font-size:11px;font-weight:700;color:#fff;opacity:.9}.lb-wave{display:flex;align-items:center;gap:2px;margin-top:10px}.lb-wave i{display:block;position:static;width:3px;border-radius:2px;background:#fff;opacity:.85}' +
    '.lb-rb{flex:1;min-width:0}.lb-rb b{display:block;font-size:15px;line-height:1.25}.lb-rb span{display:block;font-size:12.5px;color:var(--mut);margin-top:2px}.lb-rb em{display:inline-block;margin-top:5px;font-style:normal;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(168,85,247,.16);color:#c084fc}' +
    '.lb-play{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#7c3aed,#ec4899);box-shadow:0 6px 16px rgba(168,85,247,.35)}.lb-play svg{width:18px;height:18px;margin-left:2px}.lb-row.locked .lb-play{background:var(--s2);color:var(--mut);box-shadow:none}.lb-row.locked .lb-play svg{width:15px;height:15px;margin:0;fill:none}.lb-row.locked .lb-wave{opacity:.45}' +
    '.lb-paper{height:96px}.lb-w .lb-art i{left:auto;right:10px;bottom:8px;font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.24)}.lb-w .lb-art svg{transform:rotate(-8deg)}' +
    '.lb-ban-L{background:linear-gradient(120deg,#5b21b6 0%,#9333ea 55%,#ff5fa2 130%)!important;box-shadow:0 8px 24px rgba(147,51,234,.3)!important}.lb-ban-W{background:linear-gradient(120deg,#0f766e 0%,#0891b2 55%,#3d7bff 130%)!important;box-shadow:0 8px 24px rgba(13,148,136,.3)!important}' +
    '.lb-sec-L h1,.lb-sec-L h2{background:linear-gradient(90deg,#c084fc,#f472b6);-webkit-background-clip:text;background-clip:text;color:transparent}.lb-sec-W h1,.lb-sec-W h2{background:linear-gradient(90deg,#2dd4bf,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent}.lb-sec-R h1,.lb-sec-R h2{background:linear-gradient(90deg,#60a5fa,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '@media(prefers-color-scheme:light){.lb-sec-L h1,.lb-sec-L h2{background-image:linear-gradient(90deg,#7c3aed,#db2777)}.lb-sec-R h1,.lb-sec-R h2{background-image:linear-gradient(90deg,#1d4ed8,#0284c7)}.lb-sec-W h1,.lb-sec-W h2{background-image:linear-gradient(90deg,#0f766e,#0891b2)}.lb-rb em{color:#7c3aed}}' +
    '.lb-next{display:flex;align-items:center;gap:10px;border-radius:16px;padding:12px 14px;margin:0 0 14px;background:rgba(61,123,255,.1);font-size:13px}.lb-next b{font-variant-numeric:tabular-nums}' +
    '.lb-pop{animation:lbp .7s cubic-bezier(.2,.9,.3,1.4)}@keyframes lbp{0%{transform:scale(.9)}60%{transform:scale(1.04)}100%{transform:scale(1)}}@media(prefers-reduced-motion:reduce){.lb-pop{animation:none}.lb-card{transition:none}}';

  function cardL(x, cls, sub) {
    return '<button class="lb-row ' + cls + '" data-id="' + esc(x.id) + '"><span class="lb-sq"' + (x.access === 'locked' ? '' : ' style="background:' + palOf(x) + '"') + '>' + WAVE + '<i>' + String(x.n).padStart(2, '0') + '</i></span>' +
      '<span class="lb-rb"><b>' + esc(x.title) + '</b><span>' + esc(sub) + '</span>' + (x.access === 'locked' ? '' : '<em>' + esc(tagOf(x)) + '</em>') + '</span><span class="lb-play">' + (x.access === 'locked' ? LOCK : PLAY) + '</span></button>';
  }
  function cardW(x, cls, sub) {
    const kind = (x.meta && x.meta.task) || (x.n % 3 === 0 ? 'Task 1' : 'Task 2');
    return '<button class="lb-card lb-w ' + cls + '" data-id="' + esc(x.id) + '"><div class="lb-art lb-paper"' + (x.access === 'locked' ? '' : ' style="background:repeating-linear-gradient(180deg,transparent 0 13px,rgba(255,255,255,.18) 13px 14px),' + palOf(x) + '"') + '><svg viewBox="0 0 24 24">' + (x.meta && x.meta.icon === 'mail' ? '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5 12 13l8.5-6.5"/>' : '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>') + '</svg><i>' + esc(kind) + '</i>' +
      (x.access === 'locked' ? '<span class="lb-tag">' + LOCK + 'Закрыт</span>' : '<span class="lb-tag">' + tagOf(x) + '</span>') + '</div><div class="lb-body"><b>' + esc(x.title) + '</b><span>' + esc(sub) + '</span></div></button>';
  }
  function card(x) {
    const cls = x.access === 'locked' ? 'locked' : x.access === 'prem' || x.access === 'owned' ? 'prem' : '';
    const sub = x.sub || '';
    if (SEC === 'L') return cardL(x, cls, sub);
    if (SEC === 'W') return cardW(x, cls, sub);
    return '<button class="lb-card ' + cls + '" data-id="' + esc(x.id) + '"><div class="lb-art"' + (cls ? '' : ' style="background:radial-gradient(90% 120% at 10% 0%,rgba(255,255,255,.35),transparent 55%),' + PAL[x.n % PAL.length] + '"') + '><svg viewBox="0 0 24 24">' + artOf(x) + '</svg><i>№ ' + String(x.n).padStart(2, '0') + '</i>' +
      (x.access === 'locked' ? '<span class="lb-tag">' + LOCK + 'Закрыт</span>' : '<span class="lb-tag">' + tagOf(x) + '</span>') + '</div><div class="lb-body"><b>' + esc(x.title) + '</b><span>' + esc(sub) + '</span></div></button>';
  }

  const init = () => { if (!C) C = window.Ctx; if (!added) { document.head.appendChild(css); added = true; } };
  return {
    css: init,
    // items: { id, n, title, sub, href, tag?, meta:{topic,task,icon} }
    grid: (sec, items) => { init(); SEC = sec; return '<div class="lb-grid' + (sec === 'L' ? ' lb-list' : '') + '">' + items.map((x) => card(Object.assign({ access: 'free' }, x)).replace(/<button class="(lb-[a-z]+)/, '<a href="' + esc(x.href) + '" class="$1').replace(/<\/button>$/, '</a>')).join('') + '</div>'; },
    wCard: (o) => { init(); const prev = SEC; SEC = 'W'; const h = cardW({ id: o.id, n: o.n, title: o.title, tag: o.done ? 'Сделано' : '', meta: { task: o.task, icon: o.icon }, access: 'free' }, o.done ? 'prem' : '', o.sub); SEC = prev; return h.replace('<button class="lb-card', '<a href="#write/' + esc(o.id) + '" class="lb-card').replace(/<\/button>$/, '</a>'); }
  };
}());
