const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Rules = require('../app/js/rules.js');

const fix = (text) => { const r = Rules.check(text); return r.map((m) => m.replacements[0].value); };

test('rules: типичные ошибки русскоговорящих находятся и исправляются', () => {
  const cases = [
    ['He go to school every day.', 'he goes'], ['She have a car.', 'she has'], ['They goes home.', 'they go'], ['We has a problem.', 'we have'],
    ['I is a student.', 'I am'], ['They was late.', 'they were'], ["He don't like it.", "he doesn't"], ['She can to swim.', 'can'], ['He can goes there.', 'can go'],
    ["I didn't went there.", "didn't go"], ['I have went to Paris.', 'have gone'], ['I have never saw it.', 'have never seen'], ['You should of called.', 'should have'],
    ['I have a apple.', 'an apple'], ['It is an book.', 'a book'], ['I waited a hour.', 'an hour'], ['She gave me an advice.', 'advice'], ['I need an useful information.', 'useful information'],
    ['There are many informations.', 'information'], ['Too much people live here.', 'many'], ['I have many money.', 'much'], ['He has few information.', 'little'],
    ['People is happy.', 'people are'], ['Everyone are here.', 'everyone is'], ['We discussed about the plan.', 'discussed'], ['She depends of her parents.', 'depends on'],
    ['I listen music every day.', 'listen to music'], ['He explained me the rule.', 'explained to me'], ['This is more better.', 'better'], ['It is bigger then mine.', 'bigger than'],
    ["I don't know nothing.", 'anything'], ['He said me that he left.', 'told me'], ['I think i like it.', 'I'], ['It is the the best.', 'the'], ['I enjoy to read books.', 'enjoy reading'],
    ['I look forward to see you.', 'to seeing'], ['I am agree with you.', 'agree'], ['According to me, it is good.', 'in my opinion'], ['In the other hand, it is cheap.', 'on the other hand'],
    ['Go to home now.', 'go home'], ['He arrived to London.', 'arrived in'], ['The reason of this is simple.', 'reason for'], ['There is many people here.', 'there are'],
    ["I'm interesting in music.", 'interested in'], ['The most of people agree.', 'most'], ['I want to emphasize on this point.', 'emphasize'], ['I want to emphasize important this point!', 'this important'],
  ];
  cases.forEach(([text, want]) => assert.ok(fix(text).some((x) => x.toLowerCase().includes(want.toLowerCase())), text + ' → ' + JSON.stringify(fix(text))));
});

test('rules: верные предложения не трогаются', () => {
  [
    'It is important this year.', 'Make it work.', 'Let it go.', 'Does he go?', 'Where did she go?', 'I suggest that he go home.', 'She is an honest woman.',
    'He has a university degree.', 'We saw an MBA graduate.', 'The teacher explained to me why.', 'It is a very important point for my future.', 'She finds it useful these days.',
    "He's interesting in many ways.", 'They have gone home.', 'I had left early.', "She doesn't go there.", 'He is considered to be a leader.', 'You should make the most of your time.',
    "I don't have any money.", 'We looked forward to seeing them.', 'It is an unusual case.', 'Skills in IT are highly desirable.', 'A traffic violation costs money.',
    'Teachers use reflective practice to improve.', 'She has a knowledge of grammar.', 'Write the correct number, i–viii.', 'He used to go there.', 'The artist explained her creative process.',
  ].forEach((x) => assert.deepEqual(Rules.check(x), [], x));
});

test('rules: на примерах и текстах самого приложения ложных срабатываний нет', () => {
  const seen = new Set(); const hits = [];
  const walk = (x) => {
    if (typeof x === 'string') {
      const s = x.replace(/\[\[|\]\]/g, '');
      if (/[А-Яа-яЁё]/.test(s) || s.split(/\s+/).length < 5 || seen.has(s)) return;
      seen.add(s); Rules.check(s).forEach((m) => hits.push(s + ' → ' + m.rule.id));
    } else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  ['deck', 'reading', 'writing', 'content'].forEach((f) => walk(JSON.parse(fs.readFileSync(path.join(__dirname, '../app/data/' + f + '.json'), 'utf8'))));
  assert.ok(seen.size > 1000);
  assert.deepEqual(hits.slice(0, 5), []);
});
