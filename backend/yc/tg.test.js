const assert = require('assert'); const { normTg } = require('./tg');
assert.strictEqual(normTg('@ivan_petrov'), '@ivan_petrov');
assert.strictEqual(normTg('  @IvanPetrov  '), '@IvanPetrov');
assert.strictEqual(normTg('ivan_petrov'), '@ivan_petrov'); // «@» добавляем сами
assert.strictEqual(normTg('@a1b2c'), '@a1b2c'); // минимум 5 символов
assert.strictEqual(normTg('@' + 'a'.repeat(32)), '@' + 'a'.repeat(32)); // максимум 32
['', '   ', null, undefined, '@', '@abcd', '@' + 'a'.repeat(33), '@iv an', '@ivan petrov', '@1ivan', '@_ivan', '@иван_петров', '@ivan-petrov', '@@ivan_petrov', 'https://t.me/ivan_petrov', '@ivan.petrov'].forEach((x) => assert.strictEqual(normTg(x), '', String(x)));
console.log('tg ok');
