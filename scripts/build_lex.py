"""Словарь для попапа слова: транскрипция (CMUdict, US) + перевод из колоды. -> app/data/lex.json"""
import json, re, cmudict
cards = json.load(open('app/data/deck.json'))
A = {'AA':'ɑ','AE':'æ','AH':'ʌ','AO':'ɔ','AW':'aʊ','AY':'aɪ','EH':'ɛ','ER':'ɜr','EY':'eɪ','IH':'ɪ','IY':'i','OW':'oʊ','OY':'ɔɪ','UH':'ʊ','UW':'u',
     'B':'b','CH':'tʃ','D':'d','DH':'ð','F':'f','G':'ɡ','HH':'h','JH':'dʒ','K':'k','L':'l','M':'m','N':'n','NG':'ŋ','P':'p','R':'r','S':'s','SH':'ʃ','T':'t','TH':'θ','V':'v','W':'w','Y':'j','Z':'z','ZH':'ʒ'}
cmu = cmudict.dict()
VOW = {'AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'}
def ipa(w):
    p = cmu.get(w)
    if not p: return ''
    p = p[0]; toks = []
    multi = sum(1 for x in p if x[-1] in '012') > 1
    for s_ in p:
        m = re.match(r'([A-Z]+)(\d?)', s_); b_, st = m.group(1), m.group(2)
        v = A[b_]
        if b_ == 'AH': v = 'ʌ' if st == '1' else 'ə'
        if b_ == 'ER': v = 'ɜr' if st == '1' else 'ɚ'
        toks.append([v, b_ in VOW, st])
    out = []
    for i, (v, isv, st) in enumerate(toks):
        if isv and multi and st in '12':
            j = len(out)
            while j > 0 and not out[j-1][1] and len(out) - j < 2: j -= 1
            if j > 0 and not out[j-1][1] and out[j-1][0] == 's' : j -= 1
            out.insert(j, ['ˈ' if st == '1' else 'ˌ', False])
        out.append([v, isv])
    return '/' + ''.join(x[0] for x in out) + '/'
tw = {}
for c in cards:
    if ' ' not in c['t'] and re.fullmatch(r"[A-Za-z-]+", c['t']): tw.setdefault(c['t'].lower(), c['ru'])
FUNC = dict(x.split('=') for x in 'the=определённый артикль;a=артикль «один»;an=артикль «один»;of=из, о, у;to=к, чтобы;in=в;on=на;at=в, у;for=для, на;with=с;by=у, посредством;from=от, из;and=и;or=или;but=но;is=есть (быть);are=есть (быть);was=был;were=были;be=быть;been=был;have=иметь;has=имеет;had=имел;do=делать;does=делает;did=сделал;will=будет;would=бы;can=мочь;could=мог бы;should=следует;may=может;might=мог бы;must=должен;it=это, оно;its=его, её;he=он;she=она;they=они;we=мы;you=ты, вы;i=я;me=меня;him=его;her=её, ей;them=их;us=нас;my=мой;your=твой;his=его;our=наш;their=их;this=этот;that=тот, что;these=эти;those=те;not=не;no=нет, не;as=как;if=если;than=чем;so=так;too=тоже, слишком;very=очень;more=больше;most=наиболее;also=также;all=весь;some=некоторые;any=любой;many=много;much=много;one=один;two=два;three=три;who=кто;what=что;which=который;when=когда;where=где;why=почему;how=как;there=там, есть;here=здесь;about=о, около;into=в;over=над, свыше;after=после;before=до;between=между;during=во время;through=через;under=под;up=вверх;out=вне, из;off=от;than=чем;then=затем;just=просто;only=только;even=даже;still=всё ещё;now=сейчас;new=новый;other=другой;each=каждый;both=оба;such=такой;own=свой;same=тот же'.split(';'))
tw.update({'boil': 'кипятить, кипеть', 'villages': 'деревни', 'river': 'река', 'water': 'вода; поливать', 'drinking': 'питьё; употребление напитков'})
def lemma(w):
    if w in FUNC and w not in tw: return FUNC[w]
    if w in tw: return tw[w]
    for suf, rep in (('ies','y'),('es',''),('s',''),('ed',''),('ed','e'),('d',''),('ing',''),('ing','e'),('ly',''),('er',''),('est',''),('ied','y')):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            b = w[:-len(suf)] + rep
            if b in tw: return tw[b]
            if len(b) > 2 and b[-1] == b[-2] and b[:-1] in tw: return tw[b[:-1]]
    return ''
words = set()
for c in cards:
    for k in ('ex', 'ex2'):
        for s in ([c.get(k)] if k == 'ex' else c.get(k, [])):
            if s: words.update(w.lower() for w in re.findall(r"[A-Za-z][A-Za-z'’-]*", s.replace('[[','').replace(']]','')))
lex = {}
for w in sorted(words):
    i, r = ipa(w.replace('’', "'")), lemma(w)
    if i or r: lex[w] = [i, r] if r else [i]
json.dump(lex, open('app/data/lex.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(words), 'words;', sum(1 for v in lex.values() if v[0]), 'ipa;', sum(1 for v in lex.values() if len(v) > 1), 'ru')
