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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--test')
    ap.add_argument('--part', type=int)
    ap.add_argument('--dry', action='store_true', help='только показать план и число символов')
    ap.add_argument('--yes', action='store_true', help='не спрашивать подтверждение')
    ap.add_argument('--force', action='store_true', help='пересобрать MP3, даже если файл уже есть (кэш реплик сохраняется)')
    a = ap.parse_args()

    data, cfg = load()
    parts = plan(data, cfg, a.test, a.part)
    if not parts:
        raise SystemExit('Нечего озвучивать: проверь --test / --part.')

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
