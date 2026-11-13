-- YDB serverless (Yandex Cloud). Выполнить в консоли YDB → «Навигация» → «Новый SQL-запрос».
CREATE TABLE users (email Utf8, id Utf8, pass Utf8, created Uint64, PRIMARY KEY (email));
CREATE TABLE data (id Utf8, d String, upd Uint64, PRIMARY KEY (id));
