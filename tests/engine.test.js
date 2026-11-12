const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('../app/js/engine.js');
const content = JSON.parse(fs.readFileSync(path.join(__dirname, '../app/data/content.json'), 'utf8'));
const resources = JSON.parse(fs.readFileSync(path.join(__dirname, '../app/data/resources.json'), 'utf8'));

const profile = (over) => Object.assign({
  module: 'academic', target: { overall: 7.5, min: 7 }, hours: 13, start: '2026-11-02',
  skills: { L: 5, R: 5, W: 4, S: 4.5 },
}, over || {});

test('weights sum to 1, weakest skill gets most', () => {
  const w = E.weights(profile(), {});
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(w.W > w.L && w.W > w.R);
});

test('weights: all at target → still every skill has ≥10%', () => {
  const w = E.weights(profile({ skills: { L: 7.5, R: 7.5, W: 7.5, S: 7.5 } }), {});
  Object.values(w).forEach((v) => assert.ok(v >= 0.1));
});

test('weeks and phases', () => {
  assert.equal(E.weekNo('2026-11-02', '2026-11-02'), 1);
  assert.equal(E.weekNo('2026-11-02', '2026-11-16'), 3);
  assert.equal(E.phaseFor(3).id, 'P1');
  assert.equal(E.phaseFor(19).id, 'P2');
  assert.equal(E.phaseFor(35).id, 'P3');
  assert.equal(E.phaseFor(60).id, 'BUF');
});

test('dayTasks is deterministic and fits the budget for a whole year', () => {
  const p = profile();
  for (let i = 0; i < 365; i++) {
    const d = E.addDays(p.start, i);
    const a = E.dayTasks(p, d, content, resources, []);
    const b = E.dayTasks(p, d, content, resources, []);
    assert.deepStrictEqual(a, b);
    assert.ok(a.tasks.length >= 2, d);
    a.tasks.forEach((t) => { assert.ok(t.title && t.minutes >= 5, d + ' ' + t.title); });
    const weekly = 13 * 60;
    assert.ok(a.total <= weekly * 0.3, d + ' total ' + a.total);
  }
});

test('weekly total is close to hours budget (non-light, non-P0 week)', () => {
  const p = profile();
  let total = 0;
  for (let i = 0; i < 7; i++) total += E.dayTasks(p, E.addDays('2026-11-30', i), content, resources, []).total;
  assert.ok(total > 13 * 60 * 0.8 && total < 13 * 60 * 1.2, 'total ' + total);
});

test('General module gets letters on Task-1 days', () => {
  const p = profile({ module: 'general' });
  const titles = [];
  for (let i = 0; i < 250; i++) E.dayTasks(p, E.addDays(p.start, i), content, resources, []).tasks.forEach((t) => titles.push(t.title));
  assert.ok(titles.some((t) => t.includes('письмо')));
  assert.ok(!titles.some((t) => t.includes('Task 1 (Academic)')));
});

test('no british-council resources are assigned', () => {
  const p = profile();
  const bad = new Set(resources.filter((r) => r.ru_risk === true).map((r) => r.id));
  for (let i = 0; i < 120; i++) E.dayTasks(p, E.addDays(p.start, i), content, resources, []).tasks.forEach((t) => { if (t.resource) assert.ok(!bad.has(t.resource.id)); });
});

test('error tags bias drills', () => {
  const p = profile({ start: '2026-11-02' });
  const errs = Array.from({ length: 6 }, () => ({ date: '2026-12-01', tag: 'L-SPELL' }));
  let hit = false;
  for (let i = 28; i < 56; i++) E.dayTasks(p, E.addDays(p.start, i), content, resources, errs).tasks.forEach((t) => { if (/орфограф/.test(t.title)) hit = true; });
  assert.ok(hit);
});

test('SRS intervals grow, again resets', () => {
  const c = E.newCard('a', 'b', 'x');
  E.review(c, 2, '2026-11-02'); assert.equal(c.interval, 1);
  E.review(c, 2, '2026-11-03'); assert.equal(c.interval, 4);
  E.review(c, 2, '2026-11-07'); assert.ok(c.interval >= 9);
  E.review(c, 0, '2026-11-20'); assert.equal(c.reps, 0); assert.equal(c.due, '2026-11-20');
});

test('overall rounding and raw→band', () => {
  assert.equal(E.overall(6.5, 6.5, 6, 6), 6.5); // 6.25 → 6.5
  assert.equal(E.overall(7, 7, 6.5, 7), 7);     // 6.875 → 7.0
  assert.equal(E.overall(6, 6.5, 7, 7), 6.5);   // 6.625 → 6.5
  assert.equal(E.rawToBand('listening', 32), 7.5);
  assert.equal(E.rawToBand('reading_general', 34), 7);
});

// ---------- заучивание ----------
const Eg = require('../app/js/engine.js');
const mk = (id, t, pos, dom) => ({ id, t, ru: '', ex: 'We [[' + t + ']] it.', pos, dom, seen: false });
test('lrMode растёт с уровнем, выученные — flip', () => {
  const c = mk('a', 'plunge', 'v', 'gen');
  assert.equal(Eg.lrMode(c), 'flip'); c.lv = 1; assert.equal(Eg.lrMode(c), 'mcq'); c.lv = 3; assert.equal(Eg.lrMode(c), 'write');
  c.mastered = true; assert.equal(Eg.lrMode(c), 'flip');
  assert.equal(Eg.lrMode({ id: 'x', f: 'a', b: 'b', lv: 4 }), 'flip');
});
test('lrRate: again обнуляет, easy не закрывает карточку', () => {
  const c = mk('a', 'plunge', 'v', 'gen');
  assert.equal(Eg.lrRate(c, 3), 20); assert.equal(c.lv, 2); assert.ok(!c.mastered);
  assert.equal(Eg.lrRate(c, 3), 20); assert.equal(c.lv, 4);
  assert.equal(Eg.lrRate(c, 3), 20); assert.equal(c.lv, 5); assert.ok(!c.mastered);
  assert.equal(Eg.lrRate(c, 0), 2); assert.equal(c.lv, 0);
});
test('master/review: повторение и возврат в заучивание', () => {
  const c = mk('a', 'plunge', 'v', 'gen'); Eg.master(c, '2026-11-01');
  assert.equal(c.mastered, true); assert.equal(c.due, '2026-11-04');
  assert.equal(Eg.reviewMastered(c, 2, '2026-11-04'), 'scheduled'); assert.ok(c.due > '2026-11-04');
  assert.equal(Eg.reviewMastered(c, 0, '2026-11-10'), 'relearn'); assert.equal(c.mastered, false); assert.equal(c.lv, 0);
});
test('buildSession/pickNext: карточка не исчезает, пока не выучена', () => {
  const cards = [mk('a', 'plunge', 'v', 'gen'), mk('b', 'soar', 'v', 'env'), mk('c', 'peak', 'v', 'trans')];
  const s = Eg.buildSession(cards, '2026-11-01', 2, 2);
  assert.equal(s.active.length, 2);
  cards.forEach((c) => { c.seen = true; }); s.active = ['a', 'b'];
  const seen = new Set();
  for (let i = 0; i < 12; i++) { const id = Eg.pickNext(cards, s); assert.ok(id); seen.add(id); const c = cards.find((x) => x.id === id); s.counter++; s.due[id] = s.counter + Eg.lrRate(c, 3); s.last = id; }
  assert.ok(cards.find((x) => x.id === 'a').lv >= 4 && !cards[0].mastered); // всё ещё в работе
  Eg.master(cards[0], '2026-11-01'); Eg.master(cards[1], '2026-11-01');
  assert.equal(Eg.pickNext(cards, s), null);
});
test('просроченные выученные идут первыми', () => {
  const cards = [mk('a', 'plunge', 'v', 'gen'), mk('b', 'soar', 'v', 'env')]; Eg.master(cards[1], '2026-10-01');
  const s = Eg.buildSession(cards, '2026-11-01', 5, 5); assert.deepEqual(s.mdue, ['b']); assert.equal(Eg.pickNext(cards, s), 'b');
});
test('mcq: правильный вариант на месте, дистракторы того же pos', () => {
  const cards = [mk('a', 'plunge', 'v', 'gen'), mk('b', 'soar', 'v', 'env'), mk('c', 'peak', 'v', 'trans'), mk('d', 'decline', 'v', 'soc'), mk('e', 'issue', 'n', 'soc')];
  const q = Eg.mcq(cards[0], cards, () => 0.3);
  assert.equal(q.opts.length, 4); assert.equal(q.opts[q.answer], 'plunge'); assert.ok(!q.opts.includes('issue')); assert.ok(q.text.includes('_____'));
});
test('checkSentence', () => {
  const c = { t: 'play a crucial role in', ex: 'x' };
  assert.equal(Eg.checkSentence(c, 'Teachers play a crucial role in shaping young minds.').ok, true);
  assert.equal(Eg.checkSentence(c, 'Teachers are important.').used, false);
  assert.equal(Eg.checkSentence({ t: 'soar', ex: 'x' }, 'prices soared').ok, false);
  assert.equal(Eg.checkSentence({ t: 'unstable', ex: 'x' }, 'the economy is unstable right now.').ok, true);
  assert.equal(Eg.checkSentence({ t: 'soar', ex: 'x' }, 'House prices soared in the city last year.').ok, true);
});

test('analyseText: слова, абзацы, повторы, связки', () => {
  const txt = 'Technology helps students. However, technology also distracts students.\n\nFor example, technology may reduce focus. In conclusion, technology matters; technology is everywhere.';
  const a = Eg.analyseText(txt, 't2');
  assert.equal(a.paras, 2); assert.ok(a.short); assert.equal(a.minWords, 250);
  assert.ok(a.linkers.includes('however') && a.linkers.includes('for example') && a.linkers.includes('in conclusion'));
  assert.equal(a.repeats[0][0], 'technology'); assert.ok(a.hasConclusion);
  assert.equal(Eg.analyseText('', 't1').words, 0);
});
test('checkAnswer: регистр и дефис не важны, неверное — нет', () => {
  assert.ok(Eg.checkAnswer({ a: ['lower-cost', 'lower cost'] }, ' Lower cost ')); assert.ok(Eg.checkAnswer({ a: ['planters'] }, 'PLANTERS.'));
  assert.ok(!Eg.checkAnswer({ a: ['planters'] }, 'planter')); assert.ok(!Eg.checkAnswer({ a: ['x'] }, ''));
  assert.ok(Eg.checkAnswer({ a: 'T' }, 't')); assert.ok(!Eg.checkAnswer({ a: 'NG' }, 'F'));
});

test('parseFeedback: оценки, ошибки, коллокации, советы из ответа ИИ', () => {
  const txt = require('fs').readFileSync(__dirname + '/fixtures/ai_feedback.txt', 'utf8');
  const r = Eg.parseFeedback(txt);
  assert.deepEqual(r.scores, [4, 4, 4, 4]); assert.equal(r.kind, 't2'); assert.equal(r.overallRange, '4.0–4.5');
  assert.equal(r.errors.length, 9);
  assert.deepEqual(r.errors[0], { tag: 'W-ART', snippet: 'amount of information', fix: 'the amount of information' });
  assert.equal(r.errors.find((e) => e.snippet === 'usuable').fix, 'usable');
  assert.equal(r.errors.find((e) => e.tag === 'W-REP').fix, '');
  assert.deepEqual(r.collocations, ['practical life skills', 'academic curriculum', 'critical thinking']);
  assert.equal(r.fixes.length, 3); assert.ok(r.rewrite.startsWith('In my view'));
});
test('parseFeedback: без JSON берёт нижние границы; мусор даёт пусто', () => {
  const r = Eg.parseFeedback('Task Response: 5.5–6.0\nCoherence and Cohesion: 6.0\nLexical Resource: 5.5–6.0\nGrammatical Range and Accuracy: 5.0–5.5');
  assert.deepEqual(r.scores, [5.5, 6, 5.5, 5]);
  const e = Eg.parseFeedback('hello'); assert.equal(e.scores, null); assert.equal(e.errors.length, 0);
});

test('исправление ошибок: интервалы 1→3→7 дней, закрытие после 3 верных, сброс при ошибке', () => {
  const e = { tag: 'W-WF', snippet: 'did you ever needed', fix: 'did you ever need' };
  Eg.errInit(e, '2026-11-01'); assert.equal(e.due, '2026-11-02');
  assert.equal(Eg.errDue([e], '2026-11-01').length, 0); assert.equal(Eg.errDue([e], '2026-11-02').length, 1);
  assert.ok(Eg.errCheck(e, 'Did you ever need.')); assert.ok(!Eg.errCheck(e, 'did you ever needed'));
  assert.equal(Eg.errRate(e, true, '2026-11-02'), 'next'); assert.equal(e.due, '2026-11-03');
  assert.equal(Eg.errRate(e, true, '2026-11-03'), 'next'); assert.equal(e.due, '2026-11-06');
  assert.equal(Eg.errRate(e, false, '2026-11-06'), 'again'); assert.equal(e.n, 0); assert.equal(e.due, '2026-11-06');
  Eg.errRate(e, true, '2026-11-06'); Eg.errRate(e, true, '2026-11-07'); assert.equal(Eg.errRate(e, true, '2026-11-10'), 'closed');
  assert.equal(e.done, true); assert.equal(e.due, '2026-12-10');
  assert.equal(Eg.errRate(e, true, '2026-12-10'), 'kept'); assert.equal(Eg.errRate(e, false, '2027-02-01'), 'again'); assert.equal(e.done, false);
});
test('W-PUNCT учитывает регистр и апостроф; без fix не тренируется', () => {
  const p = { tag: 'W-PUNCT', snippet: 'thats why', fix: 'that’s why' };
  assert.ok(Eg.errCheck(p, "that's why")); assert.ok(!Eg.errCheck(p, 'thats why'));
  const c = { tag: 'W-PUNCT', snippet: 'at first', fix: 'At first' }; assert.ok(!Eg.errCheck(c, 'at first')); assert.ok(Eg.errCheck(c, 'At first,'));
  assert.equal(Eg.errDue([{ tag: 'W-REP', snippet: 'x', fix: '', due: '2026-01-01' }], '2026-11-01').length, 0);
});

test('cefOf / cefRank: карточки на ступень выше', () => {
  assert.equal(E.cefOf({ L: 4.5, R: 4.5, W: 4.5, S: 4.5 }), 'B1');
  assert.equal(E.cefOf({ L: 6, R: 6.5, W: 6, S: 6 }), 'B2');
  assert.equal(E.cefOf({ L: 7.5, R: 7.5, W: 7, S: 7 }), 'C1');
  assert.equal(E.cefRank('B1', 'B2'), 0); assert.equal(E.cefRank('B1', 'B1'), 1);
  assert.equal(E.cefRank('B1', 'C1'), 2); assert.equal(E.cefRank('C1', 'B1'), 3); assert.equal(E.cefRank('B1', 'C2'), 4); assert.equal(E.cefRank('B1', 'A2'), 3); assert.equal(E.cefRank('B1', undefined), 1);
});

test('сессия: новые + 10 недавних + 5 самых давних, без застоя старых', () => {
  const cards = []; for (let i = 0; i < 60; i++) cards.push(Object.assign(mk('c' + i, 'w' + i, 'v', 'gen'), i < 40 ? { seen: true, fs: '2026-10-' + String(1 + (i % 20)).padStart(2, '0'), ls: '2026-10-' + String(1 + (i % 20)).padStart(2, '0') } : {}));
  const s = Eg.buildSession(cards, '2026-11-01', 12, 10);
  const byId = (id) => cards.find((c) => c.id === id);
  const fresh = s.active.filter((id) => !byId(id).seen), old = s.active.filter((id) => byId(id).seen);
  assert.equal(fresh.length, 10); assert.equal(old.length, 15);
  const s2 = Eg.buildSession(cards, '2026-11-02', 12, 10);
  assert.notDeepEqual(s.active.filter((id) => !byId(id).seen).sort(), s2.active.filter((id) => !byId(id).seen).sort());
});
test('сессия после перезагрузки не добавляет лишних старых', () => {
  const cards = []; for (let i = 0; i < 30; i++) cards.push(Object.assign(mk('c' + i, 'w' + i, 'v', 'gen'), { seen: true, fs: '2026-10-' + String(1 + i % 20).padStart(2, '0'), ls: '2026-10-20' }));
  const a = Eg.buildSession(cards, '2026-11-01', 12, 0); a.active.slice(0, 15).forEach((id) => { cards.find((c) => c.id === id).ls = '2026-11-01'; });
  const b = Eg.buildSession(cards, '2026-11-01', 12, 0); assert.equal(b.active.length, 15);
});

test('группы карточек', () => {
  assert.equal(Eg.group({ f: 'Task 1: резко вырос', b: '' }), 't1');
  assert.equal(Eg.group({ f: 'paraphrase: increase', b: '' }), 'par');
  assert.equal(Eg.group(mk('a', 'soar', 'v', 't1')), 't1');
  assert.equal(Eg.group(mk('a', 'x y', 'coll', 'acad')), 'coll');
  assert.equal(Eg.group(mk('a', 'plunge', 'v', 'gen')), 'w');
  assert.ok(Eg.inGroup(mk('a', 'x', 'v', 'gen'), 'main')); assert.ok(!Eg.inGroup(mk('a', 'x', 'v', 't1'), 'main'));
});
test('typeCheck и choices', () => {
  const c = Object.assign(mk('a', 'plunge', 'v', 'gen'), { ex: 'Sales [[plunged]] fast.' });
  assert.equal(Eg.typeCheck(c, 'Plunged'), 'ok'); assert.equal(Eg.typeCheck(c, 'plunge'), 'ok'); assert.equal(Eg.typeCheck(c, 'plunjed'), 'near'); assert.equal(Eg.typeCheck(c, 'soar'), 'bad');
  assert.equal(Eg.hintOf(c), 'p______');
  const cards = [c, mk('b', 'soar', 'v', 'gen'), mk('c', 'peak', 'v', 'gen'), mk('d', 'dip', 'v', 'gen'), mk('e', 'fall', 'v', 'gen')]; cards.forEach((x) => { x.ru = 'ру-' + x.t; });
  const ch = Eg.choices(c, cards, 'ru'); assert.equal(ch.opts.length, 4); assert.equal(ch.opts[ch.answer], 'ру-plunge');
});

test('contexts: другие предложения со словом', () => {
  const a = Object.assign(mk('a', 'plunge', 'v', 'gen'), { ex: 'Sales [[plunged]] fast.' }), b = Object.assign(mk('b', 'sales', 'v', 'gen'), { ex: 'The [[sales]] team plunged into work.' });
  assert.deepEqual(Eg.contexts(a, [a, b], 3), ['The sales team [[plunged]] into work.']);
});

test('exOf rotates through the three example sentences', () => {
  const c = { ex: 'a [[x]]', ex2: ['b [[x]]', 'c [[x]]'] };
  assert.deepEqual([0, 1, 2, 3].map((n) => { c.rv = n; return E.exOf(c); }), ['a [[x]]', 'b [[x]]', 'c [[x]]', 'a [[x]]']);
  assert.equal(E.exIdx({ ex: 'z' }), 0);
  assert.equal(E.exOf({ ex: 'z', rv: 5 }), 'z');
});

test('parseFeedback reads full sentence context and ctxParts splits it', () => {
  const r = E.parseFeedback('W-TR: Did you ever needed a break? || Did you ever needed → Have you ever needed.\nW-WF: old style item → fixed item');
  assert.equal(r.errors[0].ctx, 'Did you ever needed a break?');
  assert.equal(r.errors[0].snippet, 'Did you ever needed');
  assert.equal(r.errors[1].ctx, undefined);
  const e = { ctx: 'Did you ever needed a break?', snippet: 'did you ever needed', fix: 'Have you ever needed' };
  assert.deepEqual(E.ctxParts(e), { a: '', bad: 'Did you ever needed', b: ' a break?' });
  assert.equal(E.ctxParts(e, true).bad, 'Have you ever needed');
  assert.equal(E.findCtx(['One. Schools will teach well. Two.'], 'schools will teach'), 'Schools will teach well.');
});

test('placementScore: уровень по доле верных', () => {
  const mk = (lv, ok, n) => Array.from({ length: n }, (_, i) => ({ lv, topic: 't', ok: i < ok }));
  const r = E.placementScore([].concat(mk('A2', 4, 4), mk('B1', 4, 5), mk('B2', 3, 5), mk('C1', 1, 5)));
  assert.equal(r.cefr, 'B2'); assert.equal(r.band, 6.0);
  assert.equal(E.placementScore(mk('A2', 1, 4)).cefr, 'A1');
  assert.equal(E.cefOf(E.placementSkills(6.0)), 'B2');
});
test('placementItems: от лёгких к сложным, верный индекс в границах', () => {
  const deck = [];
  ['A2', 'B1', 'B2', 'C1'].forEach((lv) => { for (let i = 0; i < 30; i++) deck.push({ id: lv + i, t: 'w' + lv + i, ru: 'п' + lv + i, pos: 'n', cef: lv }); });
  const it = E.placementItems(deck, () => 0.37);
  assert.ok(it.length >= 18);
  const o = ['A2', 'B1', 'B2', 'C1']; for (let i = 1; i < it.length; i++) assert.ok(o.indexOf(it[i].lv) >= o.indexOf(it[i - 1].lv));
  it.forEach((x) => { assert.ok(x.a >= 0 && x.a < x.opts.length); assert.equal(new Set(x.opts).size, x.opts.length); });
});
test('studyTick: считает только при активности и видимости', () => {
  assert.equal(E.studyTick(5, 1000, 11000, true), 6);
  assert.equal(E.studyTick(5, 1000, 32000, true), 5);
  assert.equal(E.studyTick(5, 1000, 2000, false), 5);
  assert.equal(E.studyTick(5, 1000, 1201000, true, 1800), 6);
  assert.equal(E.studyTick(5, 1000, 1901000, true, 1800), 5);
});

test('sentenceTypes: находит шесть типов и связки', () => {
  const r = E.sentenceTypes('Remote work is popular. Offices are costly, so firms save money. Although some people disagree, the shift is clear. Homes are being redesigned for work. But will cities cope? If firms adapt, staff will gain.');
  assert.equal(r.n, 6);
  ['simple', 'compound', 'complex', 'passive', 'question', 'conditional'].forEach((k) => assert.ok(r.types[k] >= 1, k));
  assert.ok(r.markers.includes('although') && r.markers.includes('if'));
});

test('contexts: только точные формы слова', () => {
  const mk = (id, t, ex, pos) => ({ id, t, ex, pos: pos || 'adj' });
  const c = mk('1', 'plain', 'x'); const o = [mk('2', 'plan', 'The city plans a charge.', 'v'), mk('3', 'simple', 'She wore a plain dress.'), mk('4', 'durable', 'The duration is long.'), mk('5', 'x', 'A plainer look.')];
  assert.deepEqual(E.contexts(c, o, 5), ['She wore a [[plain]] dress.', 'A [[plainer]] look.']);
});
