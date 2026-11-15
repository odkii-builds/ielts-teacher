'use strict';
// Сводка для админки: дни считаем по Москве (UTC+3), пустые дни заполняем нулями.
const MSK = 3 * 3600 * 1000, DAY = 86400000;
const dayNum = (ms) => Math.floor((ms + MSK) / DAY);
const dayStr = (n) => new Date(n * DAY).toISOString().slice(0, 10);
/** rows: [{d: номер дня (UTC+3), c: сколько}], вернёт days последних дней, по возрастанию, включая сегодня. */
function fillDays(rows, now, days) {
  const m = new Map(rows.map((r) => [Number(r.d), Number(r.c)]));
  const last = dayNum(now), out = [];
  for (let n = last - days + 1; n <= last; n++) out.push({ day: dayStr(n), n: m.get(n) || 0 });
  return out;
}
module.exports = { fillDays, dayNum, MSK, DAY };
