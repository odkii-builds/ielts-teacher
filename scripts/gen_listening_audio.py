#!/usr/bin/env python3
"""Озвучка тестов Listening через ElevenLabs в MP3 (по одному файлу на часть).

Как пользоваться (на своём компьютере, нужен только Python 3):
  1. Открой scripts/listening_voices.json и впиши id голосов из своей библиотеки ElevenLabs
     (по одному на пару «акцент-пол», см. подсказки в файле).
  2. Положи ключ в переменную окружения (в код и в чат его не вставлять):
       export ELEVEN_API_KEY=...        # Mac/Linux
       $env:ELEVEN_API_KEY="..."        # Windows PowerShell
  3. Посмотри, что и сколько будет озвучено, ничего не тратя:
       python3 scripts/gen_listening_audio.py --dry
  4. Озвучь всё, чего ещё нет (или один тест / одну часть):
       python3 scripts/gen_listening_audio.py --yes
       python3 scripts/gen_listening_audio.py --test L1 --part 2 --yes
  5. Закоммить app/audio/ и app/data/listening_audio.json.

Без API, вручную в интерфейсе ElevenLabs (те же кредиты, просто больше кликов):
  python3 scripts/gen_listening_audio.py --kit            # страница scripts/audio-kit.html: тексты по кусочкам с кнопкой «Копировать»
  python3 scripts/gen_listening_audio.py --assemble ПАПКА # склеить скачанные MP3 в части (имена файлов покажет страница)

Каждая реплика кэшируется в scripts/.audio-cache по хэшу (голос + модель + текст): повторный запуск
не тратит кредиты, а правка одной реплики озвучивает только её. Паузы (30 секунд на чтение
вопросов и проверку) делаются вставкой тишины, ElevenLabs за них не берёт.
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'app', 'data', 'listening.json')
MANIFEST = os.path.join(ROOT, 'app', 'data', 'listening_audio.json')
OUT = os.path.join(ROOT, 'app', 'audio')
VOICES = os.path.join(ROOT, 'scripts', 'listening_voices.json')
CACHE = os.path.join(ROOT, 'scripts', '.audio-cache')
SIL_1S = os.path.join(ROOT, 'scripts', 'audio', 'silence_1s.mp3')
SIL_GAP = os.path.join(ROOT, 'scripts', 'audio', 'silence_04s.mp3')
FORMAT = 'mp3_44100_64'  # речь, моно: ≈ 0,5 МБ на минуту


def read(path, mode='rb'):
    with open(path, mode) as f:
        return f.read()


def load():
    data = json.loads(read(DATA, 'r'))
    cfg = json.loads(read(VOICES, 'r'))
    return data, cfg


def voice_for(cfg, cast, speaker):
    acc, sex = cast[speaker]
    key = '%s-%s' % (acc, sex)
    vid = cfg['voices'].get(key, '')
    if not vid:
        raise SystemExit('В scripts/listening_voices.json не указан голос «%s». Впиши id из своей библиотеки ElevenLabs.' % key)
    return key, vid


def plan(data, cfg, only_test=None, only_part=None):
    """Список частей: [(test_id, part_no, [(kind, speaker, text|seconds)])]."""
    out = []
    for t in data['tests']:
        if only_test and t['id'] != only_test:
            continue
        for p in t['parts']:
            if only_part and p['n'] != only_part:
                continue
            items = []
            for sp, val in p['script']:
                items.append(('pause', sp, val) if sp == '_' else ('say', sp, val))
            out.append((t['id'], p['n'], p['cast'], items))
    return out


def line_key(cfg, voice_id, text, speaker):
    sp = cfg['speed'].get('narrator' if speaker == 'N' else 'default', 1.0)
    h = hashlib.sha1(('%s|%s|%s|%s' % (voice_id, cfg['model'], sp, text)).encode('utf-8')).hexdigest()
    return h, sp


def tts(key, cfg, voice_id, text, speed):
    body = json.dumps({
        'text': text,
        'model_id': cfg['model'],
        'voice_settings': {'stability': cfg['stability'], 'similarity_boost': cfg['similarity_boost'], 'speed': speed},
    }).encode('utf-8')
    url = 'https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=%s' % (voice_id, FORMAT)
    for attempt in range(5):
        req = urllib.request.Request(url, data=body, method='POST', headers={
            'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 ** attempt * 2)
                continue
            detail = e.read()[:200].decode('utf-8', 'replace')
            raise SystemExit('ElevenLabs вернул %s: %s' % (e.code, detail))
        except urllib.error.URLError as e:
            if attempt < 4:
                time.sleep(2 ** attempt * 2)
                continue
            raise SystemExit('Нет связи с ElevenLabs: %s' % e.reason)


def units(items):
    """Режем часть на кусочки: каждая реплика диктора и каждая подряд идущая беседа — отдельный файл."""
    out, run = [], []
    def flush():
        if run:
            out.append({'kind': 'speech', 'lines': list(run)})
            run.clear()
    for kind, sp, val in items:
        if kind == 'pause':
            flush(); out.append({'kind': 'pause', 'sec': int(val)})
        elif sp == 'N':
            flush(); out.append({'kind': 'narr', 'lines': [(sp, val)]})
        else:
            run.append((sp, val))
    flush()
    n = 0
    for u in out:
        if u['kind'] != 'pause':
            n += 1
            u['no'] = n
    return out


def unit_files(tid, pn, u):
    base = '%s_p%d_u%02d' % (tid, pn, u['no'])
    return base + '.mp3', ['%s_l%02d.mp3' % (base, i + 1) for i in range(len(u['lines']))]


def assemble(parts, folder):
    sil1, gap = read(SIL_1S), read(SIL_GAP)
    manifest = json.loads(read(MANIFEST, 'r')) if os.path.exists(MANIFEST) else {}
    missing = []
    built = []
    for tid, n, cast, items in parts:
        buf = bytearray()
        for u in units(items):
            if u['kind'] == 'pause':
                buf += sil1 * u['sec']
                continue
            whole, lines = unit_files(tid, n, u)
            if os.path.exists(os.path.join(folder, whole)):
                buf += read(os.path.join(folder, whole)) + gap
            elif all(os.path.exists(os.path.join(folder, x)) for x in lines):
                for x in lines:
                    buf += read(os.path.join(folder, x)) + gap
            else:
                missing.append(whole)
        built.append((tid, n, buf))
    if missing:
        raise SystemExit('Не хватает файлов (положи их в %s):\n  ' % folder + '\n  '.join(missing))
    for tid, n, buf in built:
        target = os.path.join(OUT, tid, 'p%d.mp3' % n)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as f:
            f.write(bytes(buf))
        manifest['%s/%d' % (tid, n)] = 'audio/%s/p%d.mp3?v=%s' % (tid, n, hashlib.sha1(bytes(buf)).hexdigest()[:8])
        print('%s часть %d: %s (%.1f МБ)' % (tid, n, os.path.relpath(target, ROOT), len(buf) / 1e6))
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write('\n')
    print('Готово. Закоммить app/audio/ и app/data/listening_audio.json.')


def kit(parts, path):
    """Страница-шпаргалка для ручной озвучки в интерфейсе ElevenLabs."""
    import html
    h = ['<!DOCTYPE html><meta charset="utf-8"><title>Озвучка Listening</title><style>body{font:16px/1.5 system-ui;max-width:760px;margin:24px auto;padding:0 16px}.u{border:1px solid #ddd;border-radius:12px;padding:12px 14px;margin:12px 0}.h{font-weight:700}.m{color:#666;font-size:14px}pre{white-space:pre-wrap;background:#f6f6f6;border-radius:8px;padding:10px;margin:8px 0}button{font:inherit;padding:6px 14px;border-radius:8px;border:0;background:#0045fd;color:#fff}.p{color:#888;margin:6px 0}</style><h1>Озвучка Listening</h1><p>Для каждого кусочка: выбери голос, вставь текст, скачай MP3 и сохрани под указанным именем. Все файлы положи в одну папку, затем: <code>python3 scripts/gen_listening_audio.py --assemble ПАПКА</code>. Для беседы можно скачать один файл на весь кусочек (Text to Dialogue) или по реплике: имя с суффиксом _l01, _l02…</p>']
    for tid, n, cast, items in parts:
        h.append('<h2>%s · часть %d</h2>' % (tid, n))
        h.append('<p class="m">Голоса: ' + ', '.join('%s — %s %s' % (k, v[0], 'женский' if v[1] == 'f' else 'мужской') for k, v in cast.items()) + '</p>')
        for u in units(items):
            if u['kind'] == 'pause':
                h.append('<div class="p">⏸ пауза %d с (скрипт вставит сам)</div>' % u['sec'])
                continue
            whole, lines = unit_files(tid, n, u)
            who = sorted({sp for sp, _ in u['lines']})
            txt = '\n'.join(v if len(who) == 1 else '%s: %s' % (sp, v) for sp, v in u['lines'])
            only = ' (%s %s)' % tuple(cast[who[0]]) if len(who) == 1 else ''
            h.append('<div class="u"><div class="h">%s</div><div class="m">%s%s · символов: %d · файл: <b>%s</b></div><pre>%s</pre><button onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>{this.textContent=\'Скопировано\'})">Копировать</button></div>' % (
                'Реплика диктора' if u['kind'] == 'narr' else ('Беседа' if len(who) > 1 else 'Монолог'), 'голоса: ' + ', '.join(who) if len(who) > 1 else 'голос ' + who[0], only, sum(len(v) for _, v in u['lines']), whole, html.escape(txt)))
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(h))
    print('Шпаргалка: %s' % os.path.relpath(path, ROOT))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--test')
    ap.add_argument('--part', type=int)
    ap.add_argument('--dry', action='store_true', help='только показать план и число символов')
    ap.add_argument('--yes', action='store_true', help='не спрашивать подтверждение')
    ap.add_argument('--kit', action='store_true', help='собрать страницу-шпаргалку для озвучки вручную')
    ap.add_argument('--assemble', metavar='ПАПКА', help='склеить MP3, скачанные вручную из ElevenLabs')
    ap.add_argument('--force', action='store_true', help='пересобрать MP3, даже если файл уже есть (кэш реплик сохраняется)')
    a = ap.parse_args()

    data, cfg = load()
    parts = plan(data, cfg, a.test, a.part)
    if not parts:
        raise SystemExit('Нечего озвучивать: проверь --test / --part.')

    if a.kit:
        return kit(parts, os.path.join(ROOT, 'scripts', 'audio-kit.html'))
    if a.assemble:
        return assemble(parts, a.assemble)
    new_chars = total_chars = 0
    for tid, n, cast, items in parts:
        todo = 0
        for kind, sp, val in items:
            if kind != 'say':
                continue
            total_chars += len(val)
            if a.dry and not cfg['voices'].get('%s-%s' % tuple(cast[sp]), ''):
                vid = 'ID'
            else:
                _, vid = voice_for(cfg, cast, sp)
            h, _ = line_key(cfg, vid, val, sp)
            if not os.path.exists(os.path.join(CACHE, h + '.mp3')):
                todo += len(val)
        new_chars += todo
        done = os.path.exists(os.path.join(OUT, tid, 'p%d.mp3' % n))
        print('%s часть %d: %s, к озвучке %d симв.' % (tid, n, 'файл уже есть' if done else 'нет файла', todo))
    print('Всего символов в тексте: %d. Новых к озвучке (расход кредитов ElevenLabs): %d.' % (total_chars, new_chars))
    if a.dry:
        return
    key = os.environ.get('ELEVEN_API_KEY', '')
    if not key and new_chars:
        raise SystemExit('Нет ключа: задай переменную окружения ELEVEN_API_KEY (см. шапку файла).')
    if new_chars and not a.yes:
        if input('Озвучить? [y/N] ').strip().lower() != 'y':
            raise SystemExit('Отменено.')

    os.makedirs(CACHE, exist_ok=True)
    sil1, gap = read(SIL_1S), read(SIL_GAP)
    manifest = json.loads(read(MANIFEST, 'r')) if os.path.exists(MANIFEST) else {}
    for tid, n, cast, items in parts:
        target = os.path.join(OUT, tid, 'p%d.mp3' % n)
        if os.path.exists(target) and not a.force and not new_chars:
            manifest['%s/%d' % (tid, n)] = manifest.get('%s/%d' % (tid, n)) or 'audio/%s/p%d.mp3' % (tid, n)
            continue
        buf = bytearray()
        for kind, sp, val in items:
            if kind == 'pause':
                buf += sil1 * int(val)
                continue
            _, vid = voice_for(cfg, cast, sp)
            h, speed = line_key(cfg, vid, val, sp)
            cp = os.path.join(CACHE, h + '.mp3')
            if not os.path.exists(cp):
                audio = tts(key, cfg, vid, val, speed)
                with open(cp, 'wb') as f:
                    f.write(audio)
                print('  озвучено: %s «%s…»' % (sp, val[:40]))
            buf += read(cp) + gap
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as f:
            f.write(bytes(buf))
        v = hashlib.sha1(bytes(buf)).hexdigest()[:8]
        manifest['%s/%d' % (tid, n)] = 'audio/%s/p%d.mp3?v=%s' % (tid, n, v)
        print('%s часть %d: %s (%.1f МБ)' % (tid, n, os.path.relpath(target, ROOT), len(buf) / 1e6))
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write('\n')
    print('Готово. Закоммить app/audio/ и app/data/listening_audio.json.')


if __name__ == '__main__':
    sys.exit(main())
