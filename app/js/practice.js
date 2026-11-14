/* IELTS Teacher — «Тест по моим словам»: промпт для своего ИИ и разбор его ответа (JSON). Без сети.
   Ответ ИИ — только данные: все строки потом выводятся через textContent/esc, HTML не исполняется. */
(function (root) {
  'use strict';
  const TYPES = ['context', 'gap', 'match_def', 'match_parts', 'order', 'choose', 'write'];
  const MAXI = 40, MAXS = 300;
  const lc = (s) => String(s).toLowerCase().trim();
  const stem = (w) => { const f = lc(w).replace(/^to /, '').split(/\s+/)[0]; return f.length > 4 ? f.slice(0, f.length - 2) : f; };
  function known(text, words) { const a = lc(text); return words.some((w) => lc(w.t) === a || a.startsWith(stem(w.t))); }

  function buildPrompt(words, avoid) {
    const list = words.map((w) => '- ' + w.t + (w.ru ? ' — ' + w.ru : '')).join('\n');
    return 'Ты преподаватель IELTS. Составь тренировочный тест для закрепления слов (уровень B2, темы IELTS).\n\nСлова:\n' + list + '\n\n' +
      'Верни ТОЛЬКО один JSON без пояснений и без markdown, строго такого вида:\n' +
      '{"v":1,"items":[\n' +
      '{"type":"context","word":"tackle","sentences":["...","..."]},\n' +
      '{"type":"gap","text":"A more __1__ system could __2__ lower emissions.","answers":["reliable","contribute to"],"words":["reliable","contribute to"]},\n' +
      '{"type":"match_def","pairs":[["tackle","to deal with a problem"]]},\n' +
      '{"type":"match_parts","pairs":[["raise","awareness"]]},\n' +
      '{"type":"order","blocks":["Better education","can","contribute to","raising","awareness"]},\n' +
      '{"type":"choose","text":"The campaign raised public __1__.","options":["awareness","reliable","significant"],"answers":["awareness"]},\n' +
      '{"type":"write","words":["reliable","significant"],"min":2}\n]}\n\n' +
      'Требования: используй только слова из списка (можно менять форму); по 2–3 разных контекста на слово; по 1–2 задания каждого типа; часть заданий с 2–3 словами сразу; предложения естественные, не длиннее 25 слов; в order от 4 до 8 блоков, блоки в ПРАВИЛЬНОМ порядке; не больше 24 заданий всего; определения на английском.' +
      (avoid ? '\nНе повторяй эти предложения: ' + avoid : '');
  }

  const str = (x) => typeof x === 'string' && x.trim() && x.length <= MAXS;
  const blanks = (t) => (t.match(/__\d+__/g) || []).length;
  function check(it, words) {
    if (!it || typeof it !== 'object' || TYPES.indexOf(it.type) < 0) return null;
    const S = (a) => Array.isArray(a) && a.length > 0 && a.length <= 12 && a.every(str);
    const t = it.type;
    if (t === 'context') return str(it.word) && known(it.word, words) && S(it.sentences) && it.sentences.every((s) => lc(s).indexOf(stem(it.word)) >= 0) ? { type: t, word: it.word.trim(), sentences: it.sentences.map((s) => s.trim()) } : null;
    if (t === 'gap' || t === 'choose') {
      const pool = t === 'gap' ? it.words : it.options;
      if (!str(it.text) || !S(it.answers) || !S(pool) || blanks(it.text) !== it.answers.length) return null;
      if (!it.answers.every((a) => pool.some((x) => lc(x) === lc(a)) && known(a, words))) return null;
      return { type: t, text: it.text.trim(), answers: it.answers.map((x) => x.trim()), bank: pool.map((x) => x.trim()) };
    }
    if (t === 'match_def' || t === 'match_parts') {
      if (!Array.isArray(it.pairs) || it.pairs.length < 2 || it.pairs.length > 6) return null;
      if (!it.pairs.every((p) => Array.isArray(p) && p.length === 2 && str(p[0]) && str(p[1]))) return null;
      if (new Set(it.pairs.map((p) => lc(p[0]))).size !== it.pairs.length || new Set(it.pairs.map((p) => lc(p[1]))).size !== it.pairs.length) return null;
      if (!it.pairs.some((p) => known(p[0], words) || known(p[1], words))) return null;
      return { type: t, pairs: it.pairs.map((p) => [p[0].trim(), p[1].trim()]) };
    }
    if (t === 'order') return S(it.blocks) && it.blocks.length >= 4 && it.blocks.length <= 8 && it.blocks.some((b) => known(b, words) || lc(b).split(/\s+/).some((w) => words.some((x) => lc(x.t).split(/\s+/)[0].replace(/^to$/, '') && w.startsWith(stem(x.t))))) ? { type: t, blocks: it.blocks.map((x) => x.trim()) } : null;
    if (t === 'write') return S(it.words) && it.words.every((w) => known(w, words)) ? { type: t, words: it.words.map((x) => x.trim()), min: Math.max(1, Math.min(it.words.length, it.min | 0 || it.words.length)) } : null;
    return null;
  }

  function parseImport(text, words) {
    let s = String(text || '').trim();
    s = s.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return { ok: false, error: 'Не нашёл JSON в ответе. Попроси ИИ вернуть только JSON.' };
    let j; try { j = JSON.parse(s.slice(a, b + 1)); } catch (e) { return { ok: false, error: 'JSON сломан. Попроси ИИ исправить и вернуть только JSON.' }; }
    if (!j || j.v !== 1 || !Array.isArray(j.items)) return { ok: false, error: 'Ответ не по формату (нужны "v":1 и "items"). Попроси ИИ исправить.' };
    const items = []; let skipped = 0;
    j.items.slice(0, MAXI).forEach((it) => { const r = check(it, words); if (r) items.push(r); else skipped++; });
    skipped += Math.max(0, j.items.length - MAXI);
    if (!items.length) return { ok: false, error: 'Ни одно задание не прошло проверку (слова не из твоего списка или кривой формат).' };
    return { ok: true, items, skipped };
  }

  const matches = (text, words) => words.filter((w) => known(text, [w]));
  const api = { buildPrompt, parseImport, matches, TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Practice = api;
})(typeof window !== 'undefined' ? window : globalThis);
