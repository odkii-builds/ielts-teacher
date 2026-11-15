'use strict';
/* Подмена ydb-sdk для тестов: таблицы в памяти, простые запросы (SELECT/UPSERT/UPDATE/DELETE с условиями равенства и <),
 * транзакции со снимком и отказом при параллельном изменении (как serializable: проигравший получает Aborted и повторяет). */
const Mod = require('module'), _load = Mod._load;
const PK = { users: ['email'], data: ['id'], ent: ['id'], rl: ['k'], budget: ['day'], reviews: ['uid', 'id'], waitlist: ['id'], codes: ['email'] };
const state = { t: {}, ver: 0, broken: new Set() };
const reset = () => { state.t = {}; state.ver = 0; state.broken.clear(); for (const k of Object.keys(PK)) state.t[k] = new Map(); };
reset();
const clone = (t) => { const o = {}; for (const k of Object.keys(t)) o[k] = new Map([...t[k]].map(([a, b]) => [a, { ...b }])); return o; };
const keyOf = (tb, row) => PK[tb].map((c) => String(row[c])).join('\u0001');
const val = (tok, params, row) => {
  tok = tok.trim(); let m;
  if (tok[0] === '$') { if (!(tok in params)) throw new Error('fake-ydb: no param ' + tok); return params[tok]; }
  if ((m = /^(\w+) \+ (\d+)$/.exec(tok))) return Number(row[m[1]] || 0) + Number(m[2]);
  if (/^\d+$/.test(tok)) return Number(tok);
  throw new Error('fake-ydb: value ' + tok);
};
const where = (w, params) => {
  const conds = w ? w.split(/\s+AND\s+/i).map((c) => { const m = /^(\w+) (=|<|>=|>|<=) (\$\w+)$/.exec(c.trim()); if (!m) throw new Error('fake-ydb: cond ' + c); return m; }) : [];
  return (r) => conds.every(([, c, op, p]) => { const a = r[c], b = params[p]; return op === '=' ? a === b : op === '<' ? a < b : op === '>' ? a > b : op === '>=' ? a >= b : a <= b; });
};
function exec(T, text, params) {
  const sql = text.replace(/DECLARE \$\w+ AS \w+;/g, '').trim().replace(/;$/, '').trim(); let m;
  const tb = (n) => { if (!T[n]) throw new Error('fake-ydb: table ' + n); if (state.broken.has(n)) throw new Error('Table not found: ' + n); return T[n]; };
  if ((m = /^SELECT (.+?) FROM (\w+)(?: WHERE (.+?))?(?: LIMIT (\d+))?$/i.exec(sql))) {
    if (/COUNT\(|GROUP BY|ORDER BY/i.test(sql)) throw new Error('fake-ydb: unsupported ' + sql);
    const rows = [...tb(m[2]).values()].filter(where(m[3], params)).map((r) => ({ ...r }));
    return m[4] ? rows.slice(0, Number(m[4])) : rows;
  }
  if ((m = /^UPSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/i.exec(sql))) {
    const cols = m[2].split(',').map((x) => x.trim()), vals = m[3].split(',').map((x) => val(x, params, {})), row = {};
    cols.forEach((c, i) => { row[c] = vals[i]; });
    const t = tb(m[1]), k = keyOf(m[1], row); t.set(k, Object.assign({}, t.get(k), row)); return [];
  }
  if ((m = /^UPDATE (\w+) SET (\w+) = (.+?) WHERE (.+)$/i.exec(sql))) { for (const r of tb(m[1]).values()) if (where(m[4], params)(r)) r[m[2]] = val(m[3], params, r); return []; }
  if ((m = /^DELETE FROM (\w+) WHERE (.+)$/i.exec(sql))) { const t = tb(m[1]), f = where(m[2], params); for (const [k, r] of [...t]) if (f(r)) t.delete(k); return []; }
  throw new Error('fake-ydb: unsupported ' + sql);
}
const tick = () => new Promise((r) => setImmediate(r));
class Session {
  constructor() { this.tx = null; }
  async beginTransaction() { await tick(); this.tx = { ver: state.ver, T: clone(state.t), wrote: false }; return { id: 'tx' }; }
  async executeQuery(text, params, opt) {
    await tick();
    if (opt && opt.txId) { if (!/^\s*(DECLARE[^;]*;\s*)*SELECT/i.test(text)) this.tx.wrote = true; return { resultSets: [exec(this.tx.T, text, params || {})] }; }
    const out = exec(state.t, text, params || {}); if (!/^\s*(DECLARE[^;]*;\s*)*SELECT/i.test(text)) state.ver++; return { resultSets: [out] };
  }
  async commitTransaction() {
    await tick();
    if (this.tx.ver !== state.ver) { const e = new Error('Transaction locks invalidated'); e.name = 'Aborted'; throw e; }
    if (this.tx.wrote) { state.t = this.tx.T; state.ver++; }
  }
  async rollbackTransaction() { this.tx = null; }
}
const id = (v) => v;
const fake = {
  Driver: class { async ready() { return true; } get tableClient() { return { withSession: (fn) => fn(new Session()) }; } },
  MetadataAuthService: class {},
  TypedValues: { utf8: id, uint64: id, int64: id, uint8: id, bytes: id },
  TypedData: { createNativeObjects: id },
};
Mod._load = function (r, ...a) { return r === 'ydb-sdk' ? fake : _load.call(this, r, ...a); };
module.exports = { state, reset, put: (tb, row) => state.t[tb].set(keyOf(tb, row), { ...row }), get: (tb, ...k) => state.t[tb].get(k.join('\u0001')), rows: (tb) => [...state.t[tb].values()], breakTable: (n) => state.broken.add(n) };
