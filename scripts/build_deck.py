#!/usr/bin/env python3
"""data/deck/*.txt  ->  app/data/deck.json. Формат строки: term|ru|example с [[формой]]|pos|domain
pos: n v adj adv prep conj phr | coll (коллокация) phv (фразовый глагол) idiom hedge (оборот/связка)
Уровень CEFR НЕ задаётся вручную: он берётся из data/official_levels.json (официальные списки Oxford 3000/5000;
собирается scripts/official_levels.py). Нет совпадения — у карточки нет уровня.
"""
import glob, hashlib, json, re, sys, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cards, seen, errs = [], set(), []
OFF = json.load(open(os.path.join(root, 'data', 'official_levels.json'), encoding='utf-8')) if os.path.exists(os.path.join(root, 'data', 'official_levels.json')) else {}
for f in sorted(glob.glob(os.path.join(root, "data", "deck", "*.txt"))):
    for n, line in enumerate(open(f, encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"):
            continue
        p = line.split("|")
        if len(p) != 5:
            errs.append(f"{os.path.basename(f)}:{n} fields={len(p)}"); continue
        t, ru, ex, pos, dom = [x.strip() for x in p]
        if not re.search(r"\[\[[^\[\]]+\]\]", ex) or ex.count("[[") != ex.count("]]"):
            errs.append(f"{os.path.basename(f)}:{n} bad [[ ]] in example: {t}"); continue
        key = (t.lower(), pos)
        rec = os.path.basename(f).startswith("t_")  # рекомендации учителя: идут в начало очереди новых
        if key in seen:
            if rec:
                for c0 in cards:
                    if (c0["t"].lower(), c0["pos"]) == key: c0["rec"] = 1
            else:
                print("skip duplicate:", t, pos)
            continue
        seen.add(key)
        card = {"id": "k" + hashlib.sha1((t.lower() + "|" + pos).encode()).hexdigest()[:8], "t": t, "ru": ru, "ex": ex, "pos": pos, "dom": dom}
        o = OFF.get(t + "|" + pos, {})
        if o.get("cef"): card.update(cef=o["cef"], src=o["src"])
        if o.get("acl"): card["acl"] = 1
        if rec: card["rec"] = 1
        cards.append(card)
# переводы примеров: data/ex_ru/*.txt, строки «term|pos|русское предложение с [[словом]]»
EXR = {}
for f in sorted(glob.glob(os.path.join(root, "data", "ex_ru", "*.txt"))):
    for n, line in enumerate(open(f, encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"): continue
        q = line.split("|", 2)
        if len(q) != 3: errs.append(f"{os.path.basename(f)}:{n} bad ex_ru line"); continue
        EXR[(q[0].strip().lower(), q[1].strip())] = q[2].strip()
for c0 in cards:
    r = EXR.get((c0["t"].lower(), c0["pos"]))
    if r: c0["exr"] = r
# дополнительные примеры: data/ex_more/*.txt, строки «term|pos|English sentence with [[phrase]]» (до 2 на карточку)
EX2 = {}
for f in sorted(glob.glob(os.path.join(root, "data", "ex_more", "*.txt"))):
    for n, line in enumerate(open(f, encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"): continue
        q = line.split("|", 2)
        if len(q) != 3 or "[[" not in q[2] or "]]" not in q[2]: errs.append(f"{os.path.basename(f)}:{n} bad ex_more line"); continue
        EX2.setdefault((q[0].strip().lower(), q[1].strip()), []).append(q[2].strip())
for c0 in cards:
    m = EX2.get((c0["t"].lower(), c0["pos"]))
    if m:
        seen_ex = {c0["ex"].lower()}; keep = []
        for s_ in m:  # без повторов: одно и то же предложение дважды не считается новым контекстом
            if s_.lower() not in seen_ex: seen_ex.add(s_.lower()); keep.append(s_)
        if keep: c0["ex2"] = keep[:2]
print("cards with 3 examples:", sum(1 for c0 in cards if c0.get("ex2")), "| collocations:", sum(1 for c0 in cards if c0["pos"] == "coll"))
print("ex translations:", sum(1 for c0 in cards if c0.get("exr")), "of", len(cards))
ids = [c['id'] for c in cards]
if len(ids) != len(set(ids)):
    errs.append('id collision')
if errs:
    print("\n".join(errs)); sys.exit(1)
json.dump(cards, open(os.path.join(root, "app", "data", "deck.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(cards), "cards ->", "app/data/deck.json")
