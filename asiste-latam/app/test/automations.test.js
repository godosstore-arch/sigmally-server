import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/shared/memstore.js';
import { processInbound, runAutomations, staffUpdateAppointment } from '../src/shared/pipeline.js';
import { toUtc } from '../src/shared/time.js';
import { clinic, MON_NIGHT } from './helpers.js';

test('recordatorio del día anterior se envía una sola vez y en horario razonable', () => {
  const c = clinic();
  const store = createMemoryStore();
  const p = store.createPatient({ clinicId: 1, phone: '51911111111', name: 'Luis Zapata', createdAt: 0 });
  const start = toUtc('2026-11-04', 10 * 60, c.tz);
  store.insertAppointment({ clinicId: 1, patientId: p.id, serviceId: 'eval', staffId: 's1', start, end: start + 1800000, status: 'booked', source: 'staff', createdAt: MON_NIGHT - 86400000 });
  const night = toUtc('2026-11-03', 22 * 60, c.tz);
  assert.equal(runAutomations({ store, clinic: c, nowMs: night }).length, 0, 'no a las 10 p. m.');
  const morning = toUtc('2026-11-03', 10 * 60, c.tz);
  const out = runAutomations({ store, clinic: c, nowMs: morning });
  assert.equal(out.filter((o) => o.kind === 'day_before').length, 1);
  assert.equal(out[0].message.buttons[0].id, 'confirm:' + store.db.appointments[0].id);
  assert.ok(out[0].message.template, 'debe tener plantilla para fuera de las 24 h');
  assert.equal(runAutomations({ store, clinic: c, nowMs: morning + 60000 }).filter((o) => o.kind === 'day_before').length, 0, 'sin duplicados');
});

test('cancelación ofrece el espacio a la lista de espera', () => {
  const c = clinic();
  c.staff = [c.staff[0]];
  c.maxDaysAhead = 2;
  const store = createMemoryStore();
  // Llenar todo martes y miércoles
  const filler = store.createPatient({ clinicId: 1, phone: '51900000009', name: 'Relleno', createdAt: 0 });
  for (const d of ['2026-11-03', '2026-11-04']) {
    for (const [a, b] of [[9 * 60, 13 * 60], [15 * 60, 20 * 60]]) {
      for (let m = a; m < b; m += 30) store.insertAppointment({ clinicId: 1, patientId: filler.id, serviceId: 'eval', staffId: 's1', start: toUtc(d, m, c.tz), end: toUtc(d, m + 30, c.tz), status: 'booked', source: 'staff', createdAt: 0 });
    }
  }
  const say = (t, phone) => processInbound({ store, clinic: c, phone, msg: typeof t === 'string' ? { type: 'text', text: t } : t, nowMs: MON_NIGHT });
  let r = say('quiero una consulta', '51922222222');
  r = say({ type: 'button', id: 'svc:eval', title: 'Consulta' }, '51922222222');
  r = say('lo antes posible', '51922222222');
  assert.match(r.replies.at(-1).text, /lista de espera/);
  say({ type: 'button', id: 'wl:join', title: 'Sí, anótame' }, '51922222222');
  assert.equal(store.db.waitlist.length, 1);
  const victim = store.db.appointments.find((a) => a.start === toUtc('2026-11-04', 10 * 60, c.tz));
  const res = staffUpdateAppointment({ store, clinic: c, id: victim.id, patch: { status: 'cancelled' }, nowMs: MON_NIGHT });
  const offers = res.outbound.filter((o) => o.kind === 'waitlist');
  assert.equal(offers.length, 1);
  const takeId = offers[0].message.buttons[0].id;
  r = say({ type: 'button', id: takeId, title: 'Sí, lo tomo' }, '51922222222');
  r = say('Pedro Sernaqué', '51922222222');
  assert.match(r.replies.at(-1).text, /quedó reservada/);
  assert.ok(store.db.appointments.some((a) => a.start === victim.start && a.status === 'booked' && a.patientId !== filler.id));
});

test('adelanto vencido libera el espacio y avisa', () => {
  const c = clinic();
  c.deposit = { enabled: true, amount: 30, methods: 'Yape', holdMinutes: 60 };
  const store = createMemoryStore();
  const p = store.createPatient({ clinicId: 1, phone: '51933333333', name: 'Kiara Ramos', createdAt: 0 });
  const start = toUtc('2026-11-05', 10 * 60, c.tz);
  store.insertAppointment({ clinicId: 1, patientId: p.id, serviceId: 'eval', staffId: 's1', start, end: start + 1800000, status: 'pending_deposit', source: 'assistant', createdAt: MON_NIGHT });
  const out = runAutomations({ store, clinic: c, nowMs: MON_NIGHT + 61 * 60000 });
  assert.equal(store.db.appointments[0].status, 'cancelled');
  assert.ok(out.some((o) => o.kind === 'hold_expired'));
});
