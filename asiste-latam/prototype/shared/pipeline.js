// Flujo completo de un mensaje entrante y de las acciones del equipo, sobre un "store" (SQLite en
// producción, memoria en la demo). Así la demo y la app real se comportan exactamente igual.
import { handle, initialState } from './conversation.js';
import { isFree, ACTIVE } from './slots.js';
import {
  dueReminders, reminderMessage, expiredHolds, waitlistMatches, waitlistMessage,
  noShowFollowUps, noShowMessage, recallsDue, recallMessage,
} from './automations.js';
import { whenLabel, local } from './time.js';
import { words } from './countries.js';

const DAY = 86400000;

function windowAppts(store, clinic, nowMs) {
  return store.listAppointments(clinic.id, nowMs - 3 * DAY, nowMs + ((clinic.maxDaysAhead || 30) + 3) * DAY);
}

function msgBody(msg) {
  if (msg.type === 'text') return msg.text || '';
  if (msg.type === 'button') return msg.title || msg.text || msg.id;
  if (msg.type === 'image') return '[Imagen]' + (msg.text ? ' ' + msg.text : '');
  if (msg.type === 'document') return '[Documento]';
  if (msg.type === 'audio') return '[Audio]';
  return '[' + (msg.type || 'mensaje') + ']';
}

export function processInbound({ store, clinic, phone, profileName = null, msg, nowMs }) {
  return store.transaction(() => {
    let patient = store.patientByPhone(clinic.id, phone);
    if (!patient) patient = store.createPatient({ clinicId: clinic.id, phone, name: null, waName: profileName, createdAt: nowMs });
    let convo = store.conversationFor(clinic.id, patient.id);
    if (!convo) convo = store.createConversation({ clinicId: clinic.id, patientId: patient.id, state: initialState(), createdAt: nowMs });

    store.addMessage({
      clinicId: clinic.id, conversationId: convo.id, direction: 'in', author: 'patient',
      kind: msg.type, body: msgBody(msg), meta: msg.mediaId ? { mediaId: msg.mediaId } : null, at: nowMs, waId: msg.waId || null,
    });

    const appointments = windowAppts(store, clinic, nowMs);
    const r = handle({ clinic, state: convo.state, patient, appointments, msg: { ...msg, id: msg.type === 'button' ? msg.id : msg.id || '' }, nowMs });
    const events = [];
    const convoPatch = { state: r.state, lastAt: nowMs, lastInboundAt: nowMs, unread: (convo.unread || 0) + 1, human: r.state.human || null };
    let replies = r.replies;

    for (const a of r.actions) {
      if (a.type === 'book') {
        if (a.patientName) { store.updatePatient(patient.id, { name: a.patientName }); patient = { ...patient, name: a.patientName }; }
        const fresh = windowAppts(store, clinic, nowMs);
        if (!isFree(clinic, fresh, a.appt.start, a.appt.end, a.appt.staffId, null)) {
          replies = [{ type: 'text', text: 'Ese horario se acaba de ocupar. ¿Qué otro día u hora le acomoda?' }];
          convoPatch.state = { ...r.state, step: 'when', mode: 'book' };
          continue;
        }
        const appt = store.insertAppointment({ clinicId: clinic.id, patientId: patient.id, ...a.appt, createdAt: nowMs, updatedAt: nowMs });
        events.push({ type: 'booked', appt });
        // Si estaba en lista de espera para ese servicio, sale de la lista.
        for (const w of store.listWaitlist(clinic.id)) {
          if (w.patientId === patient.id && w.status === 'waiting') store.updateWaitlist(w.id, { status: 'booked' });
        }
      } else if (a.type === 'cancel') {
        const old = store.appointment(a.apptId);
        if (old && ACTIVE.has(old.status)) {
          store.updateAppointment(a.apptId, { status: 'cancelled', updatedAt: nowMs, cancelledBy: 'patient' });
          events.push({ type: 'freed', slot: { start: old.start, end: old.end, staffId: old.staffId }, appt: old });
        }
      } else if (a.type === 'reschedule') {
        const old = store.appointment(a.apptId);
        if (old) {
          store.updateAppointment(a.apptId, { start: a.start, end: a.end, staffId: a.staffId, status: old.status === 'pending_deposit' ? 'pending_deposit' : 'booked', remindedDayBefore: 0, remindedSameDay: 0, updatedAt: nowMs, rescheduled: (old.rescheduled || 0) + 1 });
          events.push({ type: 'freed', slot: { start: old.start, end: old.end, staffId: old.staffId }, appt: old });
        }
      } else if (a.type === 'confirm') {
        store.updateAppointment(a.apptId, { status: 'confirmed', confirmedAt: nowMs, updatedAt: nowMs });
      } else if (a.type === 'handoff') {
        Object.assign(convoPatch, { attention: 1, urgent: a.urgent ? 1 : convo.urgent || 0, reason: a.reason });
        events.push({ type: 'handoff', urgent: !!a.urgent, reason: a.reason });
      } else if (a.type === 'attention') {
        Object.assign(convoPatch, { attention: 1, reason: a.reason });
      } else if (a.type === 'optout') {
        store.updatePatient(patient.id, { optedOut: 1 });
      } else if (a.type === 'optin') {
        store.updatePatient(patient.id, { optedOut: 0 });
      } else if (a.type === 'waitlist') {
        store.addWaitlist({ clinicId: clinic.id, patientId: patient.id, serviceId: a.serviceId, pref: a.pref, status: 'waiting', createdAt: nowMs });
      } else if (a.type === 'deposit_proof') {
        store.updateAppointment(a.apptId, { depositStatus: 'review', updatedAt: nowMs });
        Object.assign(convoPatch, { attention: 1, reason: 'Validar adelanto' });
      }
    }

    store.updateConversation(convo.id, convoPatch);
    const outbound = replies.map((rep) => store.addMessage({
      clinicId: clinic.id, conversationId: convo.id, direction: 'out', author: 'bot', kind: rep.type,
      body: rep.text, meta: rep.buttons ? { buttons: rep.buttons } : rep.rows ? { rows: rep.rows, button: rep.button } : null, at: nowMs,
    }) && rep);

    const extra = [];
    for (const ev of events) if (ev.type === 'freed') extra.push(...offerFreedSlot({ store, clinic, slot: ev.slot, nowMs, exceptPatientId: patient.id }));
    return { patient, conversationId: convo.id, replies: outbound, events, extra, fallback: r.fallback };
  });
}

// Mensajes que el sistema envía por su cuenta (recordatorios, lista de espera…): se guardan en la conversación.
export function systemMessage({ store, clinic, patientId, message, nowMs, author = 'bot' }) {
  let convo = store.conversationFor(clinic.id, patientId);
  if (!convo) convo = store.createConversation({ clinicId: clinic.id, patientId, state: initialState(), createdAt: nowMs });
  store.addMessage({
    clinicId: clinic.id, conversationId: convo.id, direction: 'out', author, kind: message.type, body: message.text,
    meta: message.buttons ? { buttons: message.buttons } : null, at: nowMs,
  });
  store.updateConversation(convo.id, { lastAt: nowMs, state: { ...convo.state, greeted: true } });
  return convo.id;
}

export function offerFreedSlot({ store, clinic, slot, nowMs, exceptPatientId = null }) {
  const wl = store.listWaitlist(clinic.id).filter((w) => w.status === 'waiting' && w.patientId !== exceptPatientId);
  if (!wl.length) return [];
  const appts = windowAppts(store, clinic, nowMs);
  const matches = waitlistMatches(clinic, appts, wl, slot, nowMs).slice(0, 3);
  const sent = [];
  for (const m of matches) {
    const p = store.patient(m.waitlist.patientId);
    if (!p || p.optedOut) continue;
    const message = waitlistMessage(clinic, m.slot, m.service, p.name, nowMs);
    store.updateWaitlist(m.waitlist.id, { status: 'offered', offeredAt: nowMs, offeredStart: m.slot.start });
    systemMessage({ store, clinic, patientId: p.id, message, nowMs });
    sent.push({ patient: p, message, kind: 'waitlist' });
  }
  return sent;
}

// Acciones del equipo desde el panel.
export function staffUpdateAppointment({ store, clinic, id, patch, nowMs, notify = true }) {
  return store.transaction(() => {
    const old = store.appointment(id);
    if (!old || old.clinicId !== clinic.id) throw new Error('Cita no encontrada');
    const out = [];
    const next = { ...patch, updatedAt: nowMs };
    if (patch.start != null) {
      const svc = (clinic.services || []).find((s) => s.id === (patch.serviceId || old.serviceId));
      next.end = patch.end || patch.start + (svc?.duration || 30) * 60000;
      const appts = windowAppts(store, clinic, nowMs);
      if (!isFree(clinic, appts, patch.start, next.end, patch.staffId !== undefined ? patch.staffId : old.staffId, id)) throw new Error('Ese horario ya está ocupado');
      next.remindedDayBefore = 0; next.remindedSameDay = 0;
    }
    if (patch.depositStatus === 'received' && old.status === 'pending_deposit') next.status = 'confirmed';
    store.updateAppointment(id, next);
    const p = store.patient(old.patientId);
    const W = words(clinic.country);
    if (notify && p && !p.optedOut) {
      if (patch.depositStatus === 'received') {
        const message = { type: 'text', text: `Hola${p.name ? `, ${p.name.split(' ')[0]}` : ''}. Recibimos su adelanto. ${W.La} ${W.cita} queda ${W.confirmada}: ${whenLabel(old.start, clinic.tz, nowMs)}. Le esperamos.` };
        systemMessage({ store, clinic, patientId: p.id, message, nowMs, author: 'staff' });
        out.push({ patient: p, message, kind: 'deposit' });
      }
      if (patch.start != null && patch.start !== old.start) {
        const message = { type: 'text', text: `Hola${p.name ? `, ${p.name.split(' ')[0]}` : ''}. Le informamos que ${W.la} ${W.cita} en ${clinic.name} se cambió a: ${whenLabel(patch.start, clinic.tz, nowMs)}. Si no le acomoda, responda este mensaje.` };
        systemMessage({ store, clinic, patientId: p.id, message, nowMs, author: 'staff' });
        out.push({ patient: p, message, kind: 'moved' });
      }
    }
    const freedStatus = patch.status === 'cancelled' && ACTIVE.has(old.status);
    if (freedStatus || (patch.start != null && patch.start !== old.start)) {
      out.push(...offerFreedSlot({ store, clinic, slot: { start: old.start, end: old.end, staffId: old.staffId }, nowMs }));
    }
    return { appt: store.appointment(id), outbound: out };
  });
}

// Corre todas las automatizaciones de una clínica. Devuelve lo que hay que enviar.
export function runAutomations({ store, clinic, nowMs }) {
  return store.transaction(() => {
    const out = [];
    const appts = windowAppts(store, clinic, nowMs);
    const patients = new Map(store.listPatients(clinic.id).map((p) => [p.id, p]));
    const svcName = (id) => (clinic.services || []).find((s) => s.id === id)?.name;

    for (const a of expiredHolds(clinic, appts, nowMs)) {
      store.updateAppointment(a.id, { status: 'cancelled', cancelledBy: 'deposit_timeout', updatedAt: nowMs });
      const p = patients.get(a.patientId);
      if (p && !p.optedOut) {
        const W = words(clinic.country);
        const message = { type: 'buttons', text: `Hola${p.name ? `, ${p.name.split(' ')[0]}` : ''}. Como no recibimos el adelanto, liberamos el espacio de ${W.la} ${W.cita} del ${whenLabel(a.start, clinic.tz, nowMs)}. Si aún desea venir, con gusto le busco otro horario.`, buttons: [{ id: 'menu:book', title: 'Buscar otro horario' }] };
        systemMessage({ store, clinic, patientId: p.id, message, nowMs });
        out.push({ patient: p, message, kind: 'hold_expired', freeForm: true });
      }
      out.push(...offerFreedSlot({ store, clinic, slot: { start: a.start, end: a.end, staffId: a.staffId }, nowMs }));
    }

    const fresh = windowAppts(store, clinic, nowMs).map((a) => ({ ...a, patientOptOut: patients.get(a.patientId)?.optedOut }));
    for (const due of dueReminders(clinic, fresh, nowMs)) {
      const p = patients.get(due.appt.patientId);
      if (!p) continue;
      const message = reminderMessage(clinic, due.appt, due.kind, p.name, nowMs, svcName(due.appt.serviceId));
      store.updateAppointment(due.appt.id, due.kind === 'day_before' ? { remindedDayBefore: nowMs } : { remindedSameDay: nowMs });
      systemMessage({ store, clinic, patientId: p.id, message, nowMs });
      out.push({ patient: p, message, kind: due.kind, apptId: due.appt.id });
    }

    const lm = local(nowMs, clinic.tz).minutes;
    const civil = lm >= 9 * 60 && lm <= 19 * 60;
    if (!civil) return out;
    const past = store.listAppointments(clinic.id, nowMs - 4 * DAY, nowMs).map((a) => ({ ...a, patientOptOut: patients.get(a.patientId)?.optedOut }));
    for (const a of noShowFollowUps(clinic, past, nowMs)) {
      const p = patients.get(a.patientId);
      store.updateAppointment(a.id, { followedUp: nowMs });
      if (!p) continue;
      const message = noShowMessage(clinic, a, p.name);
      systemMessage({ store, clinic, patientId: p.id, message, nowMs });
      out.push({ patient: p, message, kind: 'no_show' });
    }

    if (new Date(nowMs).getUTCMinutes() < 5 || clinic.recallEveryRun) {
      const history = store.listAppointments(clinic.id, nowMs - 400 * DAY, nowMs + 60 * DAY);
      for (const r of recallsDue(clinic, [...patients.values()], history, nowMs).slice(0, 25)) {
        store.updatePatient(r.patient.id, { lastRecallAt: nowMs });
        const message = recallMessage(clinic, r.patient, r.service);
        systemMessage({ store, clinic, patientId: r.patient.id, message, nowMs });
        out.push({ patient: r.patient, message, kind: 'recall' });
      }
    }
    return out;
  });
}

// Reserva manual desde el panel (recepción).
export function staffCreateAppointment({ store, clinic, input, nowMs }) {
  return store.transaction(() => {
    const svc = (clinic.services || []).find((s) => s.id === input.serviceId);
    if (!svc) throw new Error('Servicio no válido');
    const start = +input.start;
    const end = start + svc.duration * 60000;
    const appts = windowAppts(store, clinic, nowMs);
    if (!isFree(clinic, appts, start, end, input.staffId || null, null)) throw new Error('Ese horario ya está ocupado');
    let p = input.patientId ? store.patient(input.patientId) : store.patientByPhone(clinic.id, input.phone);
    if (!p) p = store.createPatient({ clinicId: clinic.id, phone: input.phone, name: input.patientName || null, createdAt: nowMs });
    else if (input.patientName && !p.name) store.updatePatient(p.id, { name: input.patientName });
    return store.insertAppointment({
      clinicId: clinic.id, patientId: p.id, serviceId: svc.id, staffId: input.staffId || null, start, end,
      status: 'booked', source: 'staff', createdAt: nowMs, updatedAt: nowMs, notes: input.notes || '',
    });
  });
}
