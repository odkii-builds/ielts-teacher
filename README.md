<div align="center">

# 🎯 IELTS Teacher

**Бесплатная open-source система подготовки к IELTS: от A2 до 7.5+**
План на каждый день · SRS-карточки · журнал ошибок · проверка Writing/Speaking через любой ИИ

[![Tests](https://img.shields.io/badge/tests-10%20passing-brightgreen)](tests) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) ![No build](https://img.shields.io/badge/stack-vanilla%20JS-yellow) ![Cost](https://img.shields.io/badge/cost-%240-success)

[🌐 Открыть сайт](#-демо) · [🤖 Agent-skill](skill/SKILL.md) · [📚 База ресурсов](data/resources.yaml) · [🗺️ Методика](docs/02-study-method.md)

*English summary below ↓*

</div>

---

## ✨ Зачем это

Платные курсы стоят дорого, а бесплатных материалов в сети — океан без карты. **IELTS Teacher** собирает их в понятную систему: тебе не надо решать, *что делать сегодня* — ты открываешь сайт и видишь задания на день под твой уровень, цель и слабые места.

- 🧭 **Персональный план на ~12–18 месяцев** — фазы, недели, часы по навыкам (Listening / Reading / Writing / Speaking).
- 📅 **Задания на каждый день**: основной навык, лексика, аудирование/шэдоинг, ссылки на бесплатные ресурсы.
- 🧠 **~6 800 карточек** с переводом и примером в предложении (все слова Oxford B1–C1 и все академические коллокации из PTE Academic Collocation List): заучивание как в Quizlet (карточка не исчезает, пока сам не нажмёшь «Выучил»), тест с пропуском, написание своих предложений, затем интервальные повторения. Уровни CEFR из официальных списков Oxford 3000/5000: карточки показываются на ступень выше твоего; коллокации, фразовые глаголы, идиомы и оговорки; практика «текст со словами».
- 📖 **Reading и ✍️ Writing прямо на сайте**: 5 учебных текстов (66 вопросов, проверка и пересчёт в band), 50 заданий Writing с графиками, таймером и анализом текста.
- 🐞 **Журнал ошибок с тегами** — самые частые ошибки автоматически влияют на следующие задания.
- ✍️ **Проверка Writing/Speaking**: сайт собирает готовый промпт «экзаменатора» — вставляешь в любой ИИ, сохраняешь оценки.
- 📈 **Прогресс**: моки, приблизительный raw→band, выполнение по неделям.
- 📱 **Мобильный интерфейс**: нижняя навигация, минимум кнопок, тёмная тема.
- ☁️ **Аккаунт и синхронизация**: вход по email, данные хранятся в Supabase (доступ только к своей строке, RLS) и кэшируются на устройстве.

## 🌐 Демо

Ссылка на задеплоенный сайт — в поле *Website* у репозитория (About справа вверху).
Или запусти локально за 10 секунд:

```bash
git clone https://github.com/odkii-builds/ielts-teacher.git
cd ielts-teacher
npm start          # http://localhost:8080  (нужен только python3)
```

## 🚀 Как пользоваться

1. Создай профиль: модуль (Academic/General), цель, текущий уровень по навыкам, часы в неделю, дата теста.
2. Каждый день открывай **«Сегодня»** → выполняй задания → отмечай чекбоксы.
3. Новые слова и ошибки добавляй в **«Карточки»** и **«Ошибки»**.
4. Эссе и ответы Speaking проверяй через вкладку **«Проверка»** (промпт → ИИ → оценки).
5. Раз в 4 недели — полный мок, результаты в **«Прогресс»**.

### 🤖 Без сайта: agent-skill

Файл [`skill/SKILL.md`](skill/SKILL.md) — инструкция для любого чат-ИИ (Claude, ChatGPT, DeepSeek…). Загрузи его вместе с [`data/resources.yaml`](data/resources.yaml), напиши «Начни интейк» — и получишь диагностику, план и задания на день в чате.

## 🧩 Как устроено

| Часть | Где | Что внутри |
|---|---|---|
| Сайт | [`app/`](app) | HTML + JS без сборки и зависимостей |
| Движок плана | [`app/js/engine.js`](app/js/engine.js) | веса навыков, фазы, дневные бюджеты, SRS, raw→band; покрыт [тестами](tests) |
| База ресурсов | [`data/`](data) | бесплатные ресурсы со статусом проверки, фразы (phrasebank) |
| Методика | [`docs/`](docs) | факты и реальность, план разработки, методика, MVP |
| Agent-skill | [`skill/`](skill) | промпт-инструкция для любых LLM |

Алгоритм: вес навыка `w = 0.10 + 0.60·gap/Σgap` (gap = цель − текущий уровень), бонусы за частые ошибки и за Writing/Speaking, затем нормализация. Фазы P0 → P4 + буфер; каждая 4-я неделя — разгрузочная ×0.7.

## ☁️ Деплой (бесплатно)

- **Vercel:** Import repo → Framework *Other* → **Root Directory `app`** → Build пусто.
- **GitHub Pages:** Settings → Pages → Source *GitHub Actions* (workflow уже в `.github/workflows`).

## 🧪 Разработка

```bash
npm test         # тесты движка (Node ≥ 20)
npm run data     # пересобрать app/data/resources.json из data/*.yaml (pyyaml)
python3 scripts/check_links.py   # проверка ссылок в базе ресурсов
```

## 🤝 Как помочь

Самый ценный вклад — **проверенные бесплатные ресурсы** и **контент** (темы Writing/Speaking, карточки). Гайд — в [CONTRIBUTING.md](CONTRIBUTING.md). Нашёл битую ссылку или неточность — открой issue.

## ⚠️ Честно о пределах

- Это не волшебная таблетка: путь 4.5 → 7.5 за год возможен, но амбициозен ([разбор](docs/00-reality-check.md)).
- Raw→band таблицы приблизительные; ИИ-оценка Writing/Speaking — ориентир, а не официальный балл.
- Часть ресурсов помечена `to_verify` — проверяй перед использованием.
- Проект не аффилирован с British Council, IDP или Cambridge. В репозитории нет защищённых авторским правом материалов; не добавляй их.

## 🇬🇧 English summary

**IELTS Teacher** is a free, open-source, privacy-friendly IELTS study system built only on free public resources: personalised long-term plan, daily tasks, spaced-repetition vocabulary, error log, and ready-made examiner prompts to get Writing/Speaking feedback from any LLM. It is a zero-dependency static site (data stays in your browser) plus an LLM agent skill ([`skill/SKILL.md`](skill/SKILL.md)). The UI and docs are currently in Russian; translations are welcome via PR.

## 📄 Лицензия

[MIT](LICENSE) — используй, форкай, улучшай.

## Word popup, three examples, error check

- Tap any English word in an example to see its translation, IPA transcription (US, from CMUdict) and hear it. Translations come from the deck itself (`scripts/build_lex.py` → `app/data/lex.json`); words not in the deck get a machine translation from MyMemory, cached in the browser.
- Every collocation has three example sentences (`data/ex_more/*.txt`, merged by `scripts/build_deck.py`); they rotate between reviews and drills.
- Sentences and texts you write are checked for grammar and word-combination errors with the public LanguageTool API. The text you check is sent to api.languagetool.org; nothing is sent for other screens.
