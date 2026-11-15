-- YDB serverless (Yandex Cloud). Выполнить в консоли YDB → «Навигация» → «Новый SQL-запрос».
CREATE TABLE users (email Utf8, id Utf8, pass Utf8, created Uint64, PRIMARY KEY (email));
CREATE TABLE data (id Utf8, d String, upd Uint64, PRIMARY KEY (id));
-- Права и платные возможности (баланс проверок, Premium, бан)
CREATE TABLE ent (id Utf8, credits Int64, prem Uint64, ban Uint8, free Int64, day Uint64, dcount Uint64, note Utf8, PRIMARY KEY (id));
-- Лист ожидания клуба (выполнить один раз)
CREATE TABLE waitlist (id Utf8, email Utf8, ts Uint64, PRIMARY KEY (id));
-- Коды подтверждения почты (выполнить один раз)
CREATE TABLE codes (email Utf8, h Utf8, exp Uint64, n Uint64, last Uint64, PRIMARY KEY (email));

-- ===== Защита платного разбора (выполнить один раз, ДО загрузки новой версии функции) =====
-- Счётчики лимитов частоты (ключ = действие + хэш; почты и адреса в открытом виде не хранятся)
CREATE TABLE rl (k Utf8, w Uint64, n Uint64, PRIMARY KEY (k));
-- Реестр разборов: pending | done | refunded. Текст эссе и результат сюда не пишутся.
CREATE TABLE reviews (uid Utf8, id Utf8, kind Utf8, status Utf8, ts Uint64, PRIMARY KEY (uid, id));
-- Дневной предохранитель расходов на ИИ (число разборов за сутки по всему сервису)
CREATE TABLE budget (day Uint64, n Uint64, PRIMARY KEY (day));
-- Почта подтверждена кодом (1). От этого зависит бесплатный разбор.
ALTER TABLE users ADD COLUMN vf Uint8;
