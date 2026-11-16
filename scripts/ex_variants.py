#!/usr/bin/env python3
"""Доп. примеры для карточек (ex2/ex2r): prep -> (агент пишет out) -> check -> merge.
  prep  [--n 40] [--target 3] [--pilot]   нарезает карточки без достатка примеров на пачки in/bNNNN.json
  check                                    проверяет out/*.json, годные кладёт в ok/, брак пишет в bad/
  merge                                    вливает ok/*.json в app/data/deck.json (ex2/ex2r)
Рабочая папка: $GEN (по умолчанию /home/claude/gen)."""
import json, os, re, sys, glob, random
GEN = os.environ.get('GEN', '/home/claude/gen')
DECK = os.path.join(os.path.dirname(__file__), '..', 'app', 'data', 'deck.json')
STOP = {'a','an','the','to','of','in','on','at','for','with','by','and','or','one','your','my','his','her','their','its','be','is','are','it','as','up','out','off','from','into','over'}
MARK = re.compile(r'\[\[([^\[\]]+)\]\]')
def load(): return json.load(open(DECK, encoding='utf-8'))
def plain(s): return MARK.sub(r'\1', s)
def lead(s): return ' '.join(re.findall(r"[a-z']+", plain(s).lower())[:3])
def stem(w): return w[:5] if len(w) > 5 else w[:max(3, len(w) - 1)]
def need(c, target): return max(0, target - 1 - len(c.get('ex2', [])))
def prep(n, target, pilot):
    d = [c for c in load() if need(c, target)]
    if pilot:
        random.seed(7); by = {}
        for c in d: by.setdefault(c['pos'], []).append(c)
        d = [x for p in sorted(by) for x in random.sample(by[p], min(6, len(by[p])))][:n]
    os.makedirs(GEN + '/in', exist_ok=True)
    for i in range(0, len(d), n):
        b = [{'id': c['id'], 't': c['t'], 'ru': c['ru'], 'pos': c['pos'], 'have': [c['ex']] + c.get('ex2', []), 'need': need(c, target)} for c in d[i:i+n]]
        json.dump(b, open(GEN + '/in/b%04d.json' % (i // n + 1 + (900 if pilot else 0)), 'w'), ensure_ascii=False, indent=0)
    print('cards', len(d), 'batches', (len(d) + n - 1) // n)
def check_item(it, got):
    errs = []
    if len(got) != it['need']: return ['нужно %d, дано %d' % (it['need'], len(got))]
    seen = {lead(x) for x in it['have']}
    keys = [stem(w) for w in re.findall(r"[a-z]+", it['t'].lower()) if w not in STOP] or [it['t'].lower()[:4]]
    for g in got:
        en, ru = g.get('en', ''), g.get('ru', '')
        m, mr = MARK.findall(en), MARK.findall(ru)
        if len(m) != 1 or len(mr) != 1: errs.append('нужна ровно одна пара [[ ]] в en и в ru: ' + en); continue
        low = m[0].lower(); hit = sum(1 for k in keys if k in low)
        if hit < max(1, round(len(keys) * 0.6)): errs.append('в [[ ]] нет ключевого выражения: ' + en)
        if not re.search(r'[.!?]$', en): errs.append('нет конца предложения: ' + en)
        w = len(plain(en).split())
        if w < 6 or w > 20: errs.append('длина %d слов: %s' % (w, en))
        if not re.search('[а-яё]', ru.lower()) or re.search('[а-яё]', en.lower()): errs.append('языки перепутаны: ' + en)
        l = lead(en)
        if l in seen: errs.append('то же начало «%s»: %s' % (l, en))
        seen.add(l)
    return errs
def check():
    os.makedirs(GEN + '/ok', exist_ok=True); os.makedirs(GEN + '/bad', exist_ok=True)
    tot = good = 0
    for f in sorted(glob.glob(GEN + '/out/b*.json')):
        name = os.path.basename(f); inp = {x['id']: x for x in json.load(open(GEN + '/in/' + name))}
        out = json.load(open(f)); ok = {}; bad = {}
        for i, it in inp.items():
            tot += 1; e = check_item(it, out.get(i, []))
            if e: bad[i] = e
            else: ok[i] = out[i]; good += 1
        json.dump(ok, open(GEN + '/ok/' + name, 'w'), ensure_ascii=False)
        if bad: json.dump(bad, open(GEN + '/bad/' + name, 'w'), ensure_ascii=False, indent=1)
        elif os.path.exists(GEN + '/bad/' + name): os.remove(GEN + '/bad/' + name)
    print('карточек', tot, 'годных', good, 'брак', tot - good)
    rules_check()
def rules_check():
    import subprocess
    js = "const R=require('%s');const a=JSON.parse(require('fs').readFileSync(0,'utf8'));for(const [i,s] of a){R.check(s.replace(/\\[\\[|\\]\\]/g,'')).forEach(m=>console.log(i+'\\t'+m.rule.id+'\\t'+s))}" % os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'app', 'js', 'rules.js'))
    items = [(i, g['en']) for f in glob.glob(GEN + '/ok/b*.json') for i, got in json.load(open(f)).items() for g in got]
    r = subprocess.run(['node', '-e', js], input=json.dumps(items), capture_output=True, text=True)
    if r.stdout.strip(): print('ПРАВИЛА грамматики сработали (перепиши эти предложения):\n' + r.stdout)
def merge():
    d = load(); byid = {c['id']: c for c in d}; n = 0
    for f in glob.glob(GEN + '/ok/b*.json'):
        for i, got in json.load(open(f)).items():
            c = byid.get(i)
            if not c or any(g['en'] in c.get('ex2', []) for g in got) or len(c.get('ex2', [])) + len(got) > 3 or c.get('ex2r') is not None and len(c['ex2r']) != len(c.get('ex2', [])): continue
            c['ex2r'] = (c.get('ex2r') or [''] * len(c.get('ex2', []))) + [g['ru'] for g in got]; c['ex2'] = c.get('ex2', []) + [g['en'] for g in got]; n += 1
    json.dump(d, open(DECK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); print('влито карточек', n)
if __name__ == '__main__':
    a = sys.argv[1:]; g = lambda k, dv: int(a[a.index(k) + 1]) if k in a else dv
    {'prep': lambda: prep(g('--n', 40), g('--target', 3), '--pilot' in a), 'check': check, 'merge': merge}[a[0]]()
