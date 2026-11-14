-- YDB serverless (Yandex Cloud). Выполнить в консоли YDB → «Навигация» → «Новый SQL-запрос».
CREATE TABLE users (email Utf8, id Utf8, pass Utf8, created Uint64, PRIMARY KEY (email));
CREATE TABLE data (id Utf8, d String, upd Uint64, PRIMARY KEY (id));
-- Права и платные возможности (баланс проверок, Premium, бан)
CREATE TABLE ent (id Utf8, credits Int64, prem Uint64, ban Uint8, free Int64, day Uint64, dcount Uint64, note Utf8, PRIMARY KEY (id));
-- Лист ожидания клуба (выполнить один раз)
CREATE TABLE waitlist (id Utf8, email Utf8, ts Uint64, PRIMARY KEY (id));
-- Коды подтверждения почты (выполнить один раз)
CREATE TABLE codes (email Utf8, h Utf8, exp Uint64, n Uint64, last Uint64, PRIMARY KEY (email));
