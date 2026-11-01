import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/shared/memstore.js';
import { processInbound } from '../src/shared/pipeline.js';
import { local } from '../src/shared/time.js';
import { clinic, MON_NIGHT, TUE_MORNING } from './helpers.js';

function chat(c, now, phone = '51987000111') {
  const store = createMemoryStore();
  let t = now;
  const say = (m) => {
    const msg = typeof m === 'string' ? { type: 'text', text: m } : m;
    const r = processInbound({ store, clinic: c, phone, msg, nowMs: t });
    t += 30000;
    return r;
  };
  return { store, say, at: (x) => { t = x; } };
}
const textOf = (r) => r.replies.map((x) => x.text).join('\n---\n');

test('agenda completa: pide servicio, horario, nombre y reserva', () => {
  const c = clinic();
  const { store, say } = chat(c, MON_NIGHT);
  let r = say('Hola buenas noches, quisiera una cita');
  assert.match(textOf(r), /asistente virtual de Clínica Dental Sonrisa Norte/);
  assert.equal(r.replies.at(-1).type, 'list');
  r = say({ type: 'button', id: 'svc:limpieza', title: 'Limpieza dental' });
  assert.match(textOf(r), /Qué día y horario/);
  r = say('mañana en la tarde');
  const offer = r.replies.at(-1);
  assert.equal(offer.type, 'buttons');
  assert.equal(offer.buttons.length, 3);
  for (const b of offer.buttons) assert.ok(b.title.length <= 20, 'título de botón > 20');
  r = say('2');
  assert.match(textOf(r), /A nombre de quién/);
  r = say('María Fernanda López');
  assert.match(textOf(r), /quedó reservada/);
  const appts = store.db.appointments;
  assert.equal(appts.length, 1);
  assert.equal(appts[0].status, 'booked');
  assert.equal(local(appts[0].start, c.tz).dateKey, '2026-11-03');
  assert.ok(local(appts[0].start, c.tz).minutes >= 12 * 60);
  assert.equal(store.db.patients[0].name, 'María Fernanda López');
});

test('precio, luego "sí" agenda con ese servicio', () => {
  const c = clinic();
  const { say } = chat(c, MON_NIGHT);
  let r = say('cuanto cuesta la limpieza?');
  assert.match(textOf(r), /Limpieza dental: S\/ 80/);
  r = say('si');
  assert.match(textOf(r), /limpieza dental/i);
  assert.match(textOf(r), /Qué día/);
});

test('"sí, para el sábado temprano" después del precio ofrece horarios del sábado', () => {
  const c = clinic();
  const { say } = chat(c, MON_NIGHT);
  say('¿Cuánto cuesta la limpieza?');
  const r = say('sí, para el sábado temprano');
  assert.equal(r.replies.at(-1).type, 'buttons');
  assert.match(textOf(r), /Sábado 7 de noviembre/);
  const r2 = chat(c, MON_NIGHT).say('para el viernes en la tarde');
  assert.match(textOf(r2), /servicio/);
});

test('reprogramar y cancelar una cita existente; confirmar desde el recordatorio', () => {
  const c = clinic();
  const { store, say } = chat(c, MON_NIGHT);
  say('quiero una cita para limpieza el miercoles a las 10 de la mañana');
  say('1'); say('Juan Pérez');
  assert.equal(store.db.appointments.length, 1);
  const id = store.db.appointments[0].id;
  let r = say({ type: 'button', id: 'confirm:' + id, title: 'Confirmo' });
  assert.equal(store.db.appointments[0].status, 'confirmed');
  assert.match(textOf(r), /confirmada/);
  r = say('necesito cambiar mi cita para el viernes en la tarde');
  assert.match(textOf(r), /actual es/);
  const before = store.db.appointments[0].start;
  say('1');
  assert.notEqual(store.db.appointments[0].start, before);
  assert.equal(local(store.db.appointments[0].start, c.tz).dow, 5);
  r = say('ya no voy a poder ir, quiero cancelar');
  assert.equal(r.replies.at(-1).type, 'buttons');
  say({ type: 'button', id: 'cxl:yes', title: 'Sí, cancelar' });
  assert.equal(store.db.appointments[0].status, 'cancelled');
});

test('emergencias y crisis: responde con el número del país y alerta urgente', () => {
  const c = clinic();
  const { store, say } = chat(c, MON_NIGHT);
  let r = say('me sangra mucho y no para');
  assert.match(textOf(r), /106/);
  assert.ok(r.events.some((e) => e.type === 'handoff' && e.urgent));
  assert.equal(store.db.conversations[0].urgent, 1);
  const mx = clinic({ countryCode: 'MX' });
  r = chat(mx, MON_NIGHT).say('ya no quiero vivir');
  assert.match(textOf(r), /800 911 2000/);
});

test('fuera de horario, pedir una persona no deja al paciente sin respuesta', () => {
  const c = clinic();
  const { store, say } = chat(c, MON_NIGHT);
  const r = say('quiero hablar con una persona');
  assert.match(textOf(r), /fuera de horario/);
  assert.match(textOf(r), /mañana martes 3 de noviembre desde las 9:00 a\. m\./);
  assert.equal(store.db.conversations[0].attention, 1);
});

test('si recepción toma la conversación, el asistente no interrumpe', () => {
  const c = clinic();
  const { store, say } = chat(c, TUE_MORNING);
  say('quiero hablar con alguien');
  const r = say('hola? sigo esperando');
  assert.equal(r.replies.length, 0);
  assert.equal(store.db.conversations[0].attention, 1);
});

test('Argentina dice "turno" con concordancia', () => {
  const c = clinic({ countryCode: 'AR' });
  const { say } = chat(c, MON_NIGHT);
  say('necesito un turno para limpieza mañana a la mañana');
  say('1');
  const r = say('Sofía Gómez');
  assert.match(textOf(r), /El turno quedó reservado/);
});

test('adelanto por Yape: queda separada y la captura pasa a revisión', () => {
  const c = clinic();
  c.deposit = { enabled: true, amount: 30, methods: 'Yape o Plin al 987 654 321', holdMinutes: 120 };
  const { store, say } = chat(c, MON_NIGHT);
  say('quiero una cita de limpieza el jueves temprano'); say('1');
  let r = say('Rosa Chunga');
  assert.match(textOf(r), /adelanto es de S\/ 30/);
  assert.equal(store.db.appointments[0].status, 'pending_deposit');
  r = say({ type: 'image', mediaId: 'abc' });
  assert.equal(store.db.appointments[0].depositStatus, 'review');
  assert.match(textOf(r), /Recibí su constancia/);
});

test('BAJA detiene los mensajes', () => {
  const c = clinic();
  const { store, say } = chat(c, MON_NIGHT);
  say('BAJA');
  assert.equal(store.db.patients[0].optedOut, 1);
});

test('dos mensajes no entendidos pasan a recepción', () => {
  const c = clinic();
  const { store, say } = chat(c, TUE_MORNING);
  say('hola');
  say('xqzw plf');
  const r = say('trrr mmm');
  assert.ok(r.events.some((e) => e.type === 'handoff'));
  assert.equal(store.db.conversations[0].attention, 1);
});

test('dos pacientes no pueden quedar en el mismo horario', () => {
  const c = clinic();
  c.staff = [c.staff[0]];
  const store = createMemoryStore();
  const a = (m, phone, t) => processInbound({ store, clinic: c, phone, msg: { type: 'text', text: m }, nowMs: t });
  a('limpieza mañana a las 3 de la tarde', '51900000001', MON_NIGHT);
  a('limpieza mañana a las 3 de la tarde', '51900000002', MON_NIGHT + 1000);
  a('1', '51900000001', MON_NIGHT + 2000);
  a('Ana Uno', '51900000001', MON_NIGHT + 3000);
  a('1', '51900000002', MON_NIGHT + 4000);
  const r = a('Bea Dos', '51900000002', MON_NIGHT + 5000);
  const active = store.db.appointments.filter((x) => x.status !== 'cancelled');
  assert.equal(active.length, 1, 'el segundo no debe reservar encima');
  assert.match(r.replies.map((x) => x.text).join(' '), /se acaba de ocupar/);
});
