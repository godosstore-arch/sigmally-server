import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen } from '../src/shared/dates.js';
import { MON_NIGHT } from './helpers.js';

const TZ = 'America/Lima';
const p = (t) => parseWhen(t, MON_NIGHT, TZ);

test('mañana en la tarde', () => {
  const r = p('quiero cita mañana en la tarde');
  assert.deepEqual(r.days, ['2026-11-03']);
  assert.equal(r.part, 'afternoon');
});
test('mañana a secas es el día siguiente; "en la mañana" es la franja', () => {
  assert.deepEqual(p('mañana').days, ['2026-11-03']);
  const r = p('el jueves en la mañana');
  assert.deepEqual(r.days, ['2026-11-05']);
  assert.equal(r.part, 'morning');
});
test('pasado mañana a las 4 y media (se entiende p. m.)', () => {
  const r = p('pasado mañana a las 4 y media');
  assert.deepEqual(r.days, ['2026-11-04']);
  assert.equal(r.exact, 16 * 60 + 30);
});
test('el sábado temprano', () => {
  const r = p('el sabado temprano');
  assert.deepEqual(r.days, ['2026-11-07']);
  assert.equal(r.part, 'morning');
  assert.equal(r.before, 11 * 60);
});
test('fechas numéricas y con mes', () => {
  assert.deepEqual(p('para el 15/11').days, ['2026-11-15']);
  assert.deepEqual(p('el 20 de diciembre a las 10 am').days, ['2026-12-20']);
  assert.equal(p('el 20 de diciembre a las 10 am').exact, 600);
  assert.deepEqual(p('el 5 de enero').days, ['2027-01-05']);
});
test('rangos: después de / antes de', () => {
  assert.equal(p('mañana después de las 5').after, 17 * 60);
  assert.equal(p('el viernes antes de las 11 de la mañana').before, 11 * 60);
});
test('la próxima semana = lunes a sábado siguientes', () => {
  const r = p('la próxima semana');
  assert.equal(r.days[0], '2026-11-09');
  assert.equal(r.days.length, 6);
});
test('lo antes posible y a la 1', () => {
  assert.equal(p('lo antes posible por favor').asap, true);
  assert.equal(p('mañana a la una').exact, 13 * 60);
});
test('texto sin fecha no inventa nada', () => {
  assert.equal(p('cuánto cuesta la limpieza'), null);
  assert.equal(p('2'), null);
});
