import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSlots, isFree, findWithFallback } from '../src/shared/slots.js';
import { toUtc, local, addDays } from '../src/shared/time.js';
import { clinic, MON_NIGHT, TUE_MORNING } from './helpers.js';

test('solo ofrece horarios dentro del horario de atención y con anticipación mínima', () => {
  const c = clinic();
  const svc = c.services[1];
  const s = findSlots({ clinic: c, service: svc, nowMs: TUE_MORNING, limit: 50 });
  assert.ok(s.length > 0);
  for (const x of s) {
    const l = local(x.start, c.tz);
    const wins = c.hours[l.dow];
    assert.ok(wins.some(([a, b]) => { const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number); return l.minutes >= ah * 60 + am && l.minutes + svc.duration <= bh * 60 + bm; }), 'fuera de horario');
    assert.ok(x.start >= TUE_MORNING + 60 * 60000, 'sin anticipación');
    assert.notEqual(l.dow, 0, 'domingo cerrado');
  }
});
test('nunca ofrece un horario ocupado (por profesional)', () => {
  const c = clinic();
  const svc = c.services[0];
  const day = '2026-11-04';
  const appts = [];
  // Llenar a la Dra. (s1) todo el miércoles en la mañana
  for (let m = 9 * 60; m < 13 * 60; m += 30) appts.push({ id: 'x' + m, staffId: 's1', status: 'booked', start: toUtc(day, m, c.tz), end: toUtc(day, m + 30, c.tz) });
  const s = findSlots({ clinic: c, appointments: appts, service: svc, pref: { days: [day], part: 'morning' }, nowMs: MON_NIGHT, limit: 20 });
  assert.ok(s.length > 0);
  assert.ok(s.every((x) => x.staffId === 's2'), 'debería ofrecer solo al otro profesional');
  for (const x of s) assert.ok(isFree(c, appts, x.start, x.end, x.staffId, null));
});
test('respeta feriados', () => {
  const c = clinic();
  c.closedDates = ['2026-11-04'];
  const s = findSlots({ clinic: c, service: c.services[0], pref: { days: ['2026-11-04'] }, nowMs: MON_NIGHT });
  assert.equal(s.length, 0);
  const r = findWithFallback({ clinic: c, service: c.services[0], pref: { days: ['2026-11-04'] }, nowMs: MON_NIGHT });
  assert.ok(r.slots.length > 0);
  assert.ok(r.slots.every((x) => local(x.start, c.tz).dateKey !== '2026-11-04'));
});
test('zona horaria con horario de verano (Chile) convierte bien', () => {
  const c = clinic({ countryCode: 'CL' });
  for (const day of ['2026-07-15', '2026-12-15']) {
    const ms = toUtc(day, 10 * 60, c.tz);
    const l = local(ms, c.tz);
    assert.equal(l.dateKey, day);
    assert.equal(l.minutes, 600);
  }
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
