/* IELTS Teacher — проверка английского по правилам (без ИИ и без сети).
   Только точные правила на типичные ошибки русскоговорящих. Лучше пропустить ошибку, чем обвинить верное предложение.
   Rules.check(text) → [{offset, length, message, replacements:[{value}], rule:{id, category:{id}}}] — формат как у LanguageTool. */
(function (root) {
  'use strict';
  const S = (s) => new Set(s.split(' '));
  const BASE = S('go have do make take want need like think know see come give work study live use help play learn say get find tell try ask feel become leave keep begin seem show hear bring write speak travel eat drink buy sell love hate start stop watch visit teach build change create improve increase support provide prefer remember forget believe understand meet run');
  const third = (b) => (b === 'have' ? 'has' : b === 'do' ? 'does' : b === 'go' ? 'goes' : /[^aeiou]y$/.test(b) ? b.slice(0, -1) + 'ies' : /(ch|sh|s|x|z|o)$/.test(b) ? b + 'es' : b + 's');
  const S3 = new Map(); BASE.forEach((b) => S3.set(third(b), b));
  const NOUNISH = S('works plays uses needs wants shows means runs finds helps changes supports increases visits starts stops'); // могут быть существительными
  const PAST = { went: 'go', had: 'have', made: 'make', took: 'take', came: 'come', saw: 'see', gave: 'give', got: 'get', knew: 'know', thought: 'think', said: 'say', found: 'find', told: 'tell', felt: 'feel', left: 'leave', wrote: 'write', ran: 'run', began: 'begin', brought: 'bring', bought: 'buy', spoke: 'speak', ate: 'eat', drove: 'drive', chose: 'choose', met: 'meet', heard: 'hear', kept: 'keep', sold: 'sell', became: 'become', built: 'build', taught: 'teach' };
  const PP = { went: 'gone', saw: 'seen', came: 'come', took: 'taken', wrote: 'written', spoke: 'spoken', ate: 'eaten', gave: 'given', did: 'done', drove: 'driven', knew: 'known', grew: 'grown', chose: 'chosen', began: 'begun', ran: 'run', drank: 'drunk', sang: 'sung', flew: 'flown', broke: 'broken', forgot: 'forgotten', wore: 'worn', rode: 'ridden', fell: 'fallen', hid: 'hidden', threw: 'thrown' };
  const UNCOUNT = S('information advice news furniture homework equipment luggage baggage progress evidence money weather accommodation scenery rubbish garbage');
  const UNC_ADJ = S('useful good great important new interesting valuable helpful practical detailed accurate reliable little');
  const FUNC = S('of about on for to and but or that which who is are was were has have can will because when if in at with by from as so than');
  const UNCOUNT_QTY = new Set([...UNCOUNT, ...S('time research music pollution rain snow sugar rice water food')]);
  const PLURALS = S('people books students children friends things cars countries years days reasons ways problems ideas cities jobs hours words places families teachers parents women men');
  const BAD_PL = { informations: 'information', advices: 'advice', knowledges: 'knowledge', furnitures: 'furniture', equipments: 'equipment', luggages: 'luggage', baggages: 'baggage', homeworks: 'homework', evidences: 'evidence', feedbacks: 'feedback' };
  const MODAL = S('can could may might must should would shall cannot');
  const AUX = S('do does did can could may might must should would shall will to');
  const SUBJV = S('suggest suggested suggests recommend recommended recommends insist insisted demand demanded require required propose proposed advise advised essential important vital necessary');
  const OBJ_VERBS = S('give gives gave show shows tell tells told teach teaches let lets help helps thank thanks wish ask asks bring brings offer send sends make makes made see sees saw hear hears heard watch watches');
  const ADJ = S('important good great big small interesting useful difficult serious main major key new old young long short high low large strong clear special popular common different various huge significant essential crucial valuable effective positive negative real simple modern local social public healthy');
  const DET = S('this these those my your his her our their');
  const SKIP_PREV = S('be is are am was were been being seem seems seemed look looks looked feel feels felt become becomes became get gets got remain remains remained stay stays stayed sound sounds sounded appear appears appeared prove proves proved very so too as how quite rather really more most less least not extremely fairly pretty equally just still also even particularly especially');
  const TIMEN = S('day days week weeks month months year years time times morning evening night afternoon moment century decade summer winter spring autumn season semester term weekend');
  const ADV = S('never already just ever always also still often usually not');
  const COMP = S('better worse bigger larger faster cheaper smaller harder higher lower stronger healthier happier safer older younger newer longer shorter richer simpler cleaner wider easier closer');
  const GER_V = S('enjoy enjoys enjoyed enjoying avoid avoids avoided avoiding consider considered considers suggest suggested suggests practised admit admitted deny denied imagine imagined postpone postponed');
  const BE = S('be is are am was were been being get gets got it\'s');
  const VOWEL_CONS = /^(unit|union|uni(?:versal|versity|versities|form|que|corn|fy|fied|lateral|on)|use|user|used|using|usual|usually|usage|utensil|utility|utilis|utiliz|eu|one|once|ubiq|ukrain|uranium|urinal|urine)/;
  const SILENT_H = /^(hour|honest|honou?r|heir)/;

  const BASE_ING = new Set([...BASE, 'read', 'put', 'set', 'cut', 'be']);
  function ger(b) {
    if (b === 'be') return 'being';
    if (/ee$/.test(b)) return b + 'ing';
    if (/e$/.test(b)) return b.slice(0, -1) + 'ing';
    if (/^(run|begin|get|put|stop|plan|swim|sit|win)$/.test(b)) return b + b.slice(-1) + 'ing';
    return b + 'ing';
  }
  const startsVowelSound = (w) => (SILENT_H.test(w) ? true : VOWEL_CONS.test(w) ? false : /^[aeiou]/.test(w));

  function check(text) {
    const t = String(text || ''); const tk = []; const re = /[A-Za-z]+(?:['’][A-Za-z]+)?/g; let m;
    while ((m = re.exec(t))) tk.push({ w: m[0], lw: m[0].toLowerCase().replace(/’/g, "'"), i: m.index, e: m.index + m[0].length });
    const out = [];
    const g = (x, y) => !!x && !!y && /^[ \u00a0]$/.test(t.slice(x.e, y.i));
    const add = (from, to, message, rep, cat, id) => out.push({ offset: from.i, length: to.e - from.i, message, replacements: (Array.isArray(rep) ? rep : [rep]).map((value) => ({ value })), rule: { id, category: { id: cat } } });
    const src = (from, to) => t.slice(from.i, to.e);
    const hasNear = (k, set, n) => { for (let j = Math.max(0, k - n); j < k; j++) if (set.has(tk[j].lw)) return true; return false; };

    for (let k = 0; k < tk.length; k++) {
      if (tk[k].w.length > 1 && tk[k].w === tk[k].w.toUpperCase()) continue;
      const a = tk[k], b = tk[k + 1], c = tk[k + 2], p = tk[k - 1]; const nb = b && g(a, b) ? b : null; const nc = nb && c && g(b, c) ? c : null;

      // 1. i → I
      if (/^i(?:'(?:m|ve|ll|d))?$/.test(a.lw) && a.w[0] === 'i' && /^[\s,!?;:)"']?$/.test(t[a.e] || '') && /^[\s("']?$/.test(t[a.i - 1] || '')) add(a, a, 'Местоимение «I» всегда пишется с заглавной буквы.', 'I' + a.w.slice(1), 'CASING', 'I_CAPITAL');
      // 2. повтор слова
      if (nb && a.lw === nb.lw && !S('had that bye no so very ha').has(a.lw)) add(a, nb, 'Слово повторено дважды.', a.w, 'REDUNDANCY', 'REPEAT');
      // 3. a / an
      if (nb && (a.lw === 'a' || a.lw === 'an') && !/'/.test(nb.lw) && nb.w.length > 1 && nb.w !== nb.w.toUpperCase()) {
        const v = startsVowelSound(nb.lw);
        if (a.lw === 'a' && v) add(a, nb, 'Перед гласным звуком нужен артикль «an»: «an ' + nb.w + '».', 'an ' + nb.w, 'GRAMMAR', 'A_AN');
        else if (a.lw === 'an' && !v && !/^h/.test(nb.lw)) add(a, nb, 'Перед согласным звуком нужен артикль «a»: «a ' + nb.w + '».', 'a ' + nb.w, 'GRAMMAR', 'A_AN');
        if (UNCOUNT.has(nb.lw) && (!nc || !g(nb, nc) || FUNC.has(nc.lw))) add(a, nb, '«' + nb.w + '» — неисчисляемое слово, артикль «a/an» не нужен. Можно сказать «a piece of ' + nb.lw + '».', nb.w, 'GRAMMAR', 'UNCOUNT_ART');
      }
      if (nc && (a.lw === 'a' || a.lw === 'an') && UNC_ADJ.has(nb.lw) && UNCOUNT.has(nc.lw) && (!tk[k + 3] || !g(nc, tk[k + 3]) || FUNC.has(tk[k + 3].lw))) add(a, nc, '«' + nc.w + '» — неисчисляемое слово, артикль «a/an» не нужен: «' + nb.w + ' ' + nc.w + '».', nb.w + ' ' + nc.w, 'GRAMMAR', 'UNCOUNT_ART');
      // 4. неправильные множественные неисчисляемых
      if (BAD_PL[a.lw]) add(a, a, '«' + BAD_PL[a.lw] + '» — неисчисляемое слово, во множественном числе не используется.', BAD_PL[a.lw], 'GRAMMAR', 'UNCOUNT_PL');
      // 5. many/much, few/little
      if (nb && a.lw === 'much' && PLURALS.has(nb.lw)) add(a, a, 'С исчисляемыми во множественном числе говорят «many»: «many ' + nb.w + '».', 'many', 'GRAMMAR', 'MUCH_MANY');
      if (nb && a.lw === 'many' && UNCOUNT_QTY.has(nb.lw)) add(a, a, '«' + nb.w + '» — неисчисляемое слово, нужно «much»: «much ' + nb.w + '».', 'much', 'GRAMMAR', 'MANY_MUCH');
      if (nb && a.lw === 'few' && UNCOUNT_QTY.has(nb.lw)) add(a, a, '«' + nb.w + '» — неисчисляемое слово, нужно «little».', 'little', 'GRAMMAR', 'FEW_LITTLE');
      if (nc && a.lw === 'a' && nb.lw === 'few' && UNCOUNT_QTY.has(nc.lw)) add(a, nb, '«' + nc.w + '» — неисчисляемое слово, нужно «a little».', 'a little', 'GRAMMAR', 'FEW_LITTLE');
      // 6. подлежащее + глагол: he go / they goes / be / don't
      if (nb && /^(he|she|it)$/.test(a.lw) && BASE.has(nb.lw) && !(p && AUX.has(p.lw)) && !hasNear(k, SUBJV, 4) && !(a.lw === 'it' && p && S('make makes made let lets help helps watch see saw hear heard have had find found keep kept').has(p.lw)) && !(nb.lw === 'need' && nc && nc.lw === 'not'))
        add(a, nb, 'После he/she/it глагол в настоящем времени принимает окончание -s: «' + a.lw + ' ' + third(nb.lw) + '».', a.w + ' ' + third(nb.lw), 'GRAMMAR', 'SVA_3SG');
      if (nb && /^(i|we|they|you)$/.test(a.lw) && S3.has(nb.lw) && !(a.lw === 'you' && p && OBJ_VERBS.has(p.lw)))
        add(a, nb, 'После ' + a.w + ' глагол в настоящем времени без окончания -s: «' + a.w + ' ' + S3.get(nb.lw) + '».', a.w + ' ' + S3.get(nb.lw), 'GRAMMAR', 'SVA_PL');
      if (nb) {
        const bad = { i: ['is', 'are'], he: ['are', 'am'], she: ['are', 'am'], it: ['are', 'am'], you: ['is', 'am', 'was'], we: ['is', 'am', 'was'], they: ['is', 'am', 'was'] }[a.lw];
        if (bad && bad.includes(nb.lw)) { const r = a.lw === 'i' ? 'am' : /^(he|she|it)$/.test(a.lw) ? 'is' : (nb.lw === 'was' ? 'were' : 'are'); add(a, nb, 'Неверная форма «to be» после ' + a.w + ': «' + a.w + ' ' + r + '».', a.w + ' ' + r, 'GRAMMAR', 'BE_FORM'); }
        if (/^(he|she|it)$/.test(a.lw) && /^(don't|haven't)$/.test(nb.lw)) add(a, nb, 'После he/she/it отрицание: «' + (nb.lw === "don't" ? "doesn't" : "hasn't") + '».', a.w + ' ' + (nb.lw === "don't" ? "doesn't" : "hasn't"), 'GRAMMAR', 'NEG_3SG');
        if (/^(i|you|we|they)$/.test(a.lw) && /^(doesn't|hasn't)$/.test(nb.lw)) add(a, nb, 'После ' + a.w + ' отрицание: «' + (nb.lw === "doesn't" ? "don't" : "haven't") + '».', a.w + ' ' + (nb.lw === "doesn't" ? "don't" : "haven't"), 'GRAMMAR', 'NEG_PL');
        if (a.lw === 'people' && /^(is|was|has|does|isn't|wasn't|hasn't|doesn't)$/.test(nb.lw) && !(p && S('a one every each this that').has(p.lw))) {
          const r = { is: 'are', was: 'were', has: 'have', does: 'do', "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't", "doesn't": "don't" }[nb.lw];
          add(a, nb, '«People» — множественное число: «people ' + r + '».', a.w + ' ' + r, 'GRAMMAR', 'PEOPLE_PL');
        }
        if (/^(everyone|everybody|someone|somebody|nobody|everything|something|nothing)$/.test(a.lw) && /^(are|were)$/.test(nb.lw)) add(a, nb, '«' + a.w + '» — единственное число: «' + a.w + ' ' + (nb.lw === 'are' ? 'is' : 'was') + '».', a.w + ' ' + (nb.lw === 'are' ? 'is' : 'was'), 'GRAMMAR', 'EVERYONE_SG');
      }
      // 7. модальные и вспомогательные
      if (nb && MODAL.has(a.lw) && nb.lw === 'to' && nc && !S('the a an my your his her our their this that it him them us me').has(nc.lw)) add(a, nb, 'После «' + a.w + '» глагол идёт без «to»: «' + a.w + ' ' + nc.w + '».', a.w, 'GRAMMAR', 'MODAL_TO');
      if (nb && MODAL.has(a.lw) && S3.has(nb.lw)) add(a, nb, 'После «' + a.w + '» глагол без окончания: «' + a.w + ' ' + S3.get(nb.lw) + '».', a.w + ' ' + S3.get(nb.lw), 'GRAMMAR', 'MODAL_S');
      if (nb && /^(should|could|would|must|might)$/.test(a.lw) && nb.lw === 'of') add(a, nb, 'Правильно «' + a.w + ' have», а не «' + a.w + ' of» (звучат одинаково).', a.w + ' have', 'GRAMMAR', 'SHOULD_OF');
      if (nb && a.lw === 'to' && S3.has(nb.lw) && !NOUNISH.has(nb.lw)) add(a, nb, 'После «to» глагол в начальной форме: «to ' + S3.get(nb.lw) + '».', 'to ' + S3.get(nb.lw), 'GRAMMAR', 'TO_S');
      if (nb && /^(did|didn't|doesn't|don't|does|do)$/.test(a.lw)) {
        if (/^(did|didn't)$/.test(a.lw) && PAST[nb.lw]) add(a, nb, 'После «' + a.w + '» глагол в начальной форме: «' + a.w + ' ' + PAST[nb.lw] + '».', a.w + ' ' + PAST[nb.lw], 'GRAMMAR', 'DID_PAST');
        else if (/^(does|doesn't|don't|do)$/.test(a.lw) && S3.has(nb.lw) && !NOUNISH.has(nb.lw)) add(a, nb, 'После «' + a.w + '» глагол в начальной форме: «' + a.w + ' ' + S3.get(nb.lw) + '».', a.w + ' ' + S3.get(nb.lw), 'GRAMMAR', 'DOES_S');
      }
      // have + Past Simple вместо причастия
      if (/^(have|has|had|haven't|hasn't|hadn't|(?:i|you|we|they|he|she|who)'ve)$/.test(a.lw) && nb) {
        let v = nb, last = nb; if (ADV.has(nb.lw) && nc) { v = nc; last = nc; }
        if (PP[v.lw]) add(a, last, 'После «' + a.w + '» нужна третья форма глагола: «' + PP[v.lw] + '».', src(a, v).replace(new RegExp(v.w + '$'), PP[v.lw]), 'GRAMMAR', 'PERFECT_PP');
      }
      // 8. порядок слов: прилагательное перед this/my/…
      if (p && nb && nc && ADJ.has(a.lw) && DET.has(nb.lw) && g(p, a) && !SKIP_PREV.has(p.lw) && !/['’](s|re|m)$/.test(p.lw) && !TIMEN.has(nc.lw))
        add(a, nb, 'Порядок слов: сначала this/my/…, потом прилагательное, потом существительное — «' + nb.lw + ' ' + a.lw + ' ' + nc.w + '», а не «' + a.w + ' ' + nb.w + ' ' + nc.w + '».', nb.lw + ' ' + a.lw, 'GRAMMAR', 'ADJ_DET');
      // 9. more + comparative; comparative + then
      if (nb && a.lw === 'more' && COMP.has(nb.lw)) add(a, nb, 'Сравнительная степень уже есть в «' + nb.w + '», «more» не нужно.', nb.w, 'GRAMMAR', 'MORE_COMP');
      if (nb && nb.lw === 'then' && (COMP.has(a.lw) || /^(more|less|rather|fewer|other)$/.test(a.lw))) add(a, nb, 'При сравнении нужно «than», а не «then».', a.w + ' than', 'TYPOS', 'THAN_THEN');
      // 10. управление глаголов: предлоги
      if (nb && /^(emphasi[sz]e|emphasi[sz]es|emphasi[sz]ed|emphasi[sz]ing)$/.test(a.lw) && /^(on|upon)$/.test(nb.lw)) add(a, nb, '«' + a.w + '» не требует предлога: «' + a.w + ' ' + (nc ? nc.w : '…') + '» (можно «stress on»).', a.w, 'COLLOCATIONS', 'EMPHASIZE_ON');
      if (nb && /^(discuss|discusses|discussed|discussing|mention|mentions|mentioned|mentioning)$/.test(a.lw) && nb.lw === 'about') add(a, nb, '«' + a.w + '» не требует предлога «about»: «' + a.w + ' ' + (nc ? nc.w : '…') + '».', a.w, 'COLLOCATIONS', 'DISCUSS_ABOUT');
      if (nb && /^(depend|depends|depended|depending)$/.test(a.lw) && nb.lw === 'of') add(a, nb, 'Правильно «' + a.w + ' on».', a.w + ' on', 'COLLOCATIONS', 'DEPEND_ON');
      if (nb && /^(consist|consists|consisted)$/.test(a.lw) && nb.lw === 'from') add(a, nb, 'Правильно «' + a.w + ' of».', a.w + ' of', 'COLLOCATIONS', 'CONSIST_OF');
      if (nb && /^(married)$/.test(a.lw) && nb.lw === 'with') add(a, nb, 'Правильно «married to».', 'married to', 'COLLOCATIONS', 'MARRIED_TO');
      if (nb && a.lw === 'afraid' && nb.lw === 'from') add(a, nb, 'Правильно «afraid of».', 'afraid of', 'COLLOCATIONS', 'AFRAID_OF');
      if (nb && /^(listen|listens|listened|listening)$/.test(a.lw) && /^(music|radio|the|a|an|my|his|her|their|our|your|him|them|us|me)$/.test(nb.lw)) add(a, nb, 'После «' + a.w + '» нужен предлог «to»: «' + a.w + ' to ' + nb.w + '».', a.w + ' to ' + nb.w, 'COLLOCATIONS', 'LISTEN_TO');
      if (nb && /^(explain|explains|explained)$/.test(a.lw) && /^(me|him|us|them)$/.test(nb.lw)) add(a, nb, 'Правильно «' + a.w + ' to ' + nb.w + '».', a.w + ' to ' + nb.w, 'COLLOCATIONS', 'EXPLAIN_TO');
      if (nc && a.lw === 'said' && /^(me|us|them|him)$/.test(nb.lw) && nc.lw === 'that') add(a, nb, 'С дополнением говорят «told»: «told ' + nb.w + ' that…».', 'told ' + nb.w, 'COLLOCATIONS', 'SAID_TOLD');
      if (nb && /^(pay|pays|paid|paying)$/.test(a.lw) && nb.lw === 'attention' && nc && nc.lw === 'on') add(a, nc, 'Правильно «' + a.w + ' attention to».', a.w + ' attention to', 'COLLOCATIONS', 'ATTENTION_TO');
      if (nb && /^(go|goes|went|going|gone|come|comes|came|coming|get|gets|got|getting)$/.test(a.lw) && nb.lw === 'to' && nc && /^(home|abroad)$/.test(nc.lw)) add(a, nc, 'После «' + a.w + '» «' + nc.lw + '» идёт без «to»: «' + a.w + ' ' + nc.w + '».', a.w + ' ' + nc.w, 'COLLOCATIONS', 'GO_HOME');
      if (nb && /^(arrive|arrives|arrived|arriving)$/.test(a.lw) && nb.lw === 'to') add(a, nb, 'После «' + a.w + '» нужен предлог «in» (город, страна) или «at» (место).', [a.w + ' in', a.w + ' at'], 'COLLOCATIONS', 'ARRIVE_IN');
      if (nb && nc && a.lw === 'the' && nb.lw === 'reason' && nc.lw === 'of') add(nb, nc, 'Правильно «reason for».', 'reason for', 'COLLOCATIONS', 'REASON_FOR');
      if (nb && nc && a.lw === 'on' && nb.lw === 'the' && /^(picture|photo|photograph)$/.test(nc.lw)) add(a, nc, 'Говорят «in the ' + nc.w + '», а не «on».', 'in the ' + nc.w, 'COLLOCATIONS', 'IN_PICTURE');
      if (nb && nc && a.lw === 'in' && nb.lw === 'the' && nc.lw === 'internet') add(a, nc, 'Говорят «on the Internet».', 'on the Internet', 'COLLOCATIONS', 'ON_INTERNET');
      if (nb && nc && /^(am|i'm)$/.test(a.lw) && nb.lw === 'interesting' && nc.lw === 'in') add(nb, nc, 'Про себя: «interested in» (интересуюсь), а «interesting» — «интересный».', 'interested in', 'COLLOCATIONS', 'INTERESTED_IN');
      if (nb && /^(am|is|are|was|were|i'm|we're|they're|you're|he's|she's)$/.test(a.lw) && nb.lw === 'agree') add(a, nb, 'Глагол «agree» употребляется без «am/is/are»: «I agree».', 'agree', 'GRAMMAR', 'AM_AGREE');
      // 11. ing/to после глаголов; look forward to + ing
      if (nc && GER_V.has(a.lw) && nb.lw === 'to' && BASE_ING.has(nc.lw) && !(p && BE.has(p.lw))) add(a, nc, 'После «' + a.w + '» глагол в форме -ing: «' + a.w + ' ' + ger(nc.lw) + '».', a.w + ' ' + ger(nc.lw), 'GRAMMAR', 'GERUND');
      if (nb && nc && a.lw === 'forward' && nb.lw === 'to' && BASE_ING.has(nc.lw) && p && /^(look|looks|looked|looking)$/.test(p.lw)) add(nb, nc, 'После «look forward to» глагол в форме -ing: «to ' + ger(nc.lw) + '».', 'to ' + ger(nc.lw), 'GRAMMAR', 'LOOK_FORWARD');
      // 12. двойное отрицание
      if (/n't$/.test(a.lw) || /^(never|hardly|barely)$/.test(a.lw)) {
        const x = nb && /^(nothing|nobody|nowhere)$/.test(nb.lw) ? nb : (nc && /^(nothing|nobody|nowhere)$/.test(nc.lw) ? nc : null);
        if (x) add(x, x, 'Двойное отрицание: в английском одно отрицание на предложение — «' + { nothing: 'anything', nobody: 'anybody', nowhere: 'anywhere' }[x.lw] + '».', { nothing: 'anything', nobody: 'anybody', nowhere: 'anywhere' }[x.lw], 'GRAMMAR', 'DOUBLE_NEG');
        else if (/n't$/.test(a.lw) && nb && nc && /^(have|has|had|got|want|need|see|know|like|find)$/.test(nb.lw) && nc.lw === 'no') add(nc, nc, 'Двойное отрицание: после «' + a.w + '» нужно «any».', 'any', 'GRAMMAR', 'DOUBLE_NEG');
      }
      // 13. оборотные ошибки
      if (nb && nc && a.lw === 'the' && nb.lw === 'most' && nc.lw === 'of' && !(p && /^(make|makes|made|making)$/.test(p.lw))) add(a, nb, 'Говорят «most of», без «the».', 'most', 'GRAMMAR', 'THE_MOST_OF');
      if (nb && a.lw === 'according' && nb.lw === 'to' && nc && nc.lw === 'me') add(a, nc, 'О своём мнении говорят «in my opinion» или «I think».', ['in my opinion', 'to my mind'], 'STYLE', 'ACCORDING_TO_ME');
      if (nb && nc && a.lw === 'there' && /^(is|was)$/.test(nb.lw) && /^(many|several|two|three|four|five|six|seven|eight|nine|ten)$/.test(nc.lw)) add(a, nb, 'Дальше множественное число, поэтому «there ' + (nb.lw === 'is' ? 'are' : 'were') + '».', 'there ' + (nb.lw === 'is' ? 'are' : 'were'), 'GRAMMAR', 'THERE_ARE');
      if (a.lw === 'alot') add(a, a, 'Пишется раздельно: «a lot».', 'a lot', 'TYPOS', 'A_LOT');
      if (nb && nc && a.lw === 'in' && nb.lw === 'the' && nc.lw === 'other' && tk[k + 3] && tk[k + 3].lw === 'hand' && g(nc, tk[k + 3])) add(a, tk[k + 3], 'Устойчивое выражение: «on the other hand».', 'on the other hand', 'COLLOCATIONS', 'ON_OTHER_HAND');
    }
    return out;
  }
  const api = { check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Rules = api;
})(typeof self !== 'undefined' ? self : this);
