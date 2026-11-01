// Llena una clínica con datos creíbles: pacientes, agenda de 6 semanas y conversaciones reales
// generadas por el mismo motor (no son textos inventados a mano).
import { local, toUtc, addDays, dowOf, hm, whenLabel } from './time.js';
import { words } from './countries.js';
import { processInbound } from './pipeline.js';
import { isFree } from './slots.js';

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

const FIRST_F = ['María', 'Rosa', 'Carmen', 'Lucía', 'Ana', 'Sofía', 'Valeria', 'Camila', 'Daniela', 'Milagros', 'Fiorella', 'Gabriela', 'Jimena', 'Luz', 'Kiara', 'Andrea', 'Patricia', 'Mónica', 'Elena', 'Karla'];
const FIRST_M = ['José', 'Luis', 'Carlos', 'Jorge', 'Miguel', 'Juan', 'Diego', 'Renato', 'Piero', 'Alonso', 'Sebastián', 'Mateo', 'César', 'Martín', 'Ricardo', 'Fernando', 'Óscar', 'Raúl', 'Hugo', 'Iván'];
const LAST_PE = ['Quispe', 'Flores', 'García', 'Chunga', 'Ramírez', 'Mendoza', 'Torres', 'Castillo', 'Rojas', 'Vásquez', 'Seminario', 'Huamán', 'Ramos', 'Silva', 'Zapata', 'Ipanaqué', 'Távara', 'Sernaqué', 'Querevalú', 'Sánchez', 'Morales', 'Calle', 'Jiménez', 'Valdiviezo'];
const LAST_LA = ['García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Castro', 'Ortiz', 'Herrera', 'Medina', 'Vargas'];

function personName(r, country) {
  const f = r() < 0.6 ? FIRST_F : FIRST_M;
  const L = country === 'PE' ? LAST_PE : LAST_LA;
  return `${f[Math.floor(r() * f.length)]} ${L[Math.floor(r() * L.length)]}`;
}

function phoneFor(r, country) {
  const dial = { PE: '51', MX: '52', CO: '57', CL: '56', AR: '54', EC: '593', BO: '591', UY: '598', PY: '595', CR: '506', PA: '507', DO: '1', GT: '502' }[country] || '51';
  const body = country === 'PE' ? '9' + String(Math.floor(r() * 1e8)).padStart(8, '0') : String(Math.floor(1e9 + r() * 8.9e9)).slice(0, 10);
  return dial + body;
}

export function seedDemo(store, clinic, nowMs, opts = {}) {
  const r = rng(clinic.name + (opts.seed || ''));
  const tz = clinic.tz;
  const today = local(nowMs, tz).dateKey;
  const services = clinic.services;
  const weighted = services.flatMap((s, i) => Array(Math.max(1, 6 - i)).fill(s));
  const staff = clinic.staff?.length ? clinic.staff : [{ id: null }];

  const patients = [];
  const usedPhones = new Set();
  for (let i = 0; i < (opts.patients || 90); i++) {
    let phone; do { phone = phoneFor(r, clinic.country); } while (usedPhones.has(phone));
    usedPhones.add(phone);
    patients.push(store.createPatient({ clinicId: clinic.id, phone, name: personName(r, clinic.country), createdAt: nowMs - Math.floor(r() * 400) * 86400000 }));
  }

  const fill = (dayKey, ratio, statusFn) => {
    const dow = dowOf(dayKey);
    const wins = (clinic.hours[dow] || clinic.hours[String(dow)] || []).map(([a, b]) => [hm(a), hm(b)]);
    for (const st of staff) {
      for (const [a, b] of wins) {
        let t = a;
        while (t < b) {
          const svc = weighted[Math.floor(r() * weighted.length)];
          if (t + svc.duration > b) break;
          if (r() < ratio) {
            const start = toUtc(dayKey, t, tz), end = start + svc.duration * 60000;
            const p = patients[Math.floor(r() * patients.length)];
            const status = statusFn(start, end);
            if (status) {
              const source = r() < 0.48 ? 'assistant' : 'staff';
              const lead = Math.floor(1 + r() * 9) * 86400000;
              let createdAt = start - lead;
              if (createdAt > nowMs - 2 * 3600000) createdAt = nowMs - (2 + Math.floor(r() * 200)) * 3600000;
              // Muchos agendamientos del asistente ocurren de noche.
              if (source === 'assistant' && r() < 0.45) createdAt = toUtc(local(createdAt, tz).dateKey, 20 * 60 + Math.floor(r() * 180), tz);
              if (createdAt > nowMs - 2 * 3600000) createdAt = nowMs - 26 * 3600000;
              const appts = store.listAppointments(clinic.id, start - 1, end + 1);
              if (isFree(clinic, appts, start, end, st.id, null)) {
                store.insertAppointment({ clinicId: clinic.id, patientId: p.id, serviceId: svc.id, staffId: st.id, start, end, status, source, createdAt, updatedAt: createdAt });
              }
            }
            t = Math.ceil((t + svc.duration) / 15) * 15;
          } else t += 30;
        }
      }
    }
  };

  // Historial (45 días): la mayoría asistió; pocas inasistencias gracias a los recordatorios.
  for (let i = 45; i >= 1; i--) {
    fill(addDays(today, -i), 0.55, () => { const x = r(); return x < 0.06 ? 'no_show' : x < 0.13 ? 'cancelled' : 'completed'; });
  }
  // Hoy: lo que ya pasó está atendido; lo que viene, confirmado.
  fill(today, 0.7, (start, end) => (end < nowMs ? (r() < 0.06 ? 'no_show' : 'completed') : r() < 0.82 ? 'confirmed' : 'booked'));
  // Próximos 12 días.
  for (let i = 1; i <= 12; i++) {
    const ratio = Math.max(0.12, 0.5 - i * 0.05);
    fill(addDays(today, i), ratio, (start) => (start - nowMs < 30 * 3600000 ? (r() < 0.7 ? 'confirmed' : 'booked') : 'booked'));
  }

  // Historial de mensajes de las citas que agendó el asistente (resumen de cada conversación).
  const W = words(clinic.country);
  const asks = ['Hola, quisiera {a} {c} para {s}', 'Buenas, tienen espacio para {s}?', 'Hola buenas noches, quiero sacar {a} {c}', 'Disculpe, atienden {s}? quisiera {a} {c}'];
  const all = store.listAppointments(clinic.id, nowMs - 60 * 86400000, nowMs + 30 * 86400000).sort((x, y) => x.createdAt - y.createdAt);
  let k = 0;
  for (const a of all) {
    if (a.source !== 'assistant') continue;
    const svc = services.find((s) => s.id === a.serviceId);
    const p = store.patient(a.patientId);
    let c = store.conversationFor(clinic.id, a.patientId);
    if (!c) c = store.createConversation({ clinicId: clinic.id, patientId: a.patientId, state: { greeted: true }, createdAt: a.createdAt, lastAt: a.createdAt });
    const ask = asks[k++ % asks.length].replace('{a}', W.una).replace('{c}', W.cita).replace('{s}', svc.name.toLowerCase());
    store.addMessage({ clinicId: clinic.id, conversationId: c.id, direction: 'in', author: 'patient', kind: 'text', body: ask, at: a.createdAt - 150000 });
    store.addMessage({ clinicId: clinic.id, conversationId: c.id, direction: 'out', author: 'bot', kind: 'text', body: `Listo, ${p.name.split(' ')[0]}. ${W.La} ${W.cita} quedó ${W.reservada}:\n\n${whenLabel(a.start, tz)}\n${svc.name}`, at: a.createdAt });
    if ((c.lastAt || 0) < a.createdAt) store.updateConversation(c.id, { lastAt: a.createdAt });
    if (a.start < nowMs && a.status === 'completed' && r() < 0.06) store.updateAppointment(a.id, { fromWaitlist: 1 });
  }

  // Conversaciones recientes, generadas por el motor real.
  const svcA = services[1] || services[0];
  const svcB = services[0];
  const scripts = [
    { mins: -11 * 60 - 20, text: [`Hola buenas noches, quisiera una cita para ${svcA.name.toLowerCase()}`, 'mañana en la tarde', '1', null], name: true },
    { mins: -9 * 60 - 5, text: [`cuánto cuesta ${svcB.name.toLowerCase()}?`, 'sí', 'el sábado temprano', '2', null], name: true },
    { mins: -6 * 60 - 40, text: ['Buenas, trabajan con seguro?'] },
    { mins: -3 * 60 - 12, text: ['hola, a qué hora atienden los sábados? y dónde quedan'] },
    { mins: -95, text: ['Necesito reprogramar mi cita', 'la próxima semana en la mañana', '1'], existing: true },
    { mins: -50, text: ['Buenas tardes, hay cita para hoy o mañana temprano?', '1', '1', null], name: true },
    { mins: -18, text: ['Quiero hablar con la doctora por favor'] },
  ];
  const used = new Set();
  for (const sc of scripts) {
    let p;
    if (sc.existing) {
      const fut = store.listAppointments(clinic.id, nowMs, nowMs + 10 * 86400000).find((a) => a.status === 'booked' && !used.has(a.patientId));
      p = fut ? store.patient(fut.patientId) : null;
    }
    if (!p) {
      let phone; do { phone = phoneFor(r, clinic.country); } while (usedPhones.has(phone));
      usedPhones.add(phone);
      p = { phone, name: personName(r, clinic.country) };
    }
    used.add(p.id);
    let t = nowMs + sc.mins * 60000;
    for (const line of sc.text) {
      const msg = line == null ? { type: 'text', text: p.name } : { type: 'text', text: line };
      processInbound({ store, clinic, phone: p.phone, profileName: p.name.split(' ')[0], msg, nowMs: t });
      t += 40000 + Math.floor(r() * 50000);
    }
  }
  // Las conversaciones ya atendidas por el bot quedan leídas, excepto las que piden a recepción.
  for (const c of store.listConversations(clinic.id)) if (!c.attention) store.updateConversation(c.id, { unread: 0 });
  return { patients: patients.length };
}
