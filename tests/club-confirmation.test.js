const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('клуб: подтверждение доступно только через 15 секунд и с Telegram', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/js/extras.js'), 'utf8');
  const intervals = [];
  const profile = { nx: {} };
  const calls = [];
  let sheetHtml = '';
  let controls = {};

  const control = (id) => {
    if (!controls[id]) controls[id] = { id, disabled: false, textContent: '', style: {}, value: '', dataset: {} };
    return controls[id];
  };
  const document = {
    body: { appendChild() {}, contains: () => true },
    createElement: () => ({ dataset: {}, className: '', hidden: false }),
    addEventListener() {},
    getElementById: () => null,
  };
  const ctx = {
    P: () => profile,
    esc: (s) => String(s),
    save() {},
    closeSheet() {},
    openSheet(html, mount) {
      sheetHtml = html;
      controls = {};
      const el = { querySelector(sel) {
        const id = sel.startsWith('#') ? sel.slice(1) : '';
        if (!id || !html.includes('id="' + id + '"')) return null;
        const c = control(id);
        if (id === 'nwt') c.value = '@reader_1';
        if (id === 'nwe') c.textContent = 'Подсказка';
        if (id === 'nwj') c.disabled = true;
        return c;
      } };
      mount(el);
    },
  };
  const window = {
    Ctx: ctx,
    Cloud: {
      async clubWait(join, tg) { calls.push({ join, tg }); return { joined: true, pos: 1, total: 1, tg }; },
      async session() { return { user: { email: 'reader@example.com' } }; },
    },
    getSelection: () => null,
  };
  const sandbox = {
    window, document, location: { hash: '#today' }, navigator: {}, NodeFilter: { SHOW_TEXT: 4 },
    Date, Math, console, setTimeout, clearTimeout,
    setInterval(fn) { intervals.push(fn); return intervals.length; },
    clearInterval() {},
  };
  vm.runInNewContext(source, sandbox, { filename: 'extras.js' });

  const open = control('nbo');
  const close = control('nbx');
  const banner = control('nbn');
  const head = { insertAdjacentHTML() {} };
  const view = { querySelector(sel) {
    return { '.head': head, '#nbo': open, '#nbx': close, '#nbn': banner }[sel] || null;
  } };
  window.Next.after(view);
  open.onclick();

  const join = control('nwj');
  assert.match(sheetHtml, /Пробуешь новое раньше других/);
  assert.match(sheetHtml, /3 дня без чек-инов/);
  assert.doesNotMatch(sheetHtml, /nwtime/);
  assert.equal(join.disabled, true);
  assert.equal(join.textContent, 'Подтвердить участие · 15 сек');

  for (let i = 0; i < 14; i++) intervals[0]();
  assert.equal(join.disabled, true);
  assert.equal(join.textContent, 'Подтвердить участие · 1 сек');
  const input = control('nwt');
  input.value = '';
  input.oninput();
  intervals[0]();
  assert.equal(join.disabled, true);
  input.value = 'https://example.org/wrong';
  input.oninput();
  assert.equal(join.disabled, true);
  input.value = 'https://t.me/reader_1';
  input.oninput();
  assert.equal(join.disabled, false);
  assert.equal(join.textContent, 'Подтвердить участие');

  await join.onclick();
  assert.deepStrictEqual(calls, [{ join: true, tg: '@reader_1' }]);
});
