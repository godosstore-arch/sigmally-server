// Automatizaciones programadas (funciones puras): qué recordatorios, avisos de lista de espera,
// seguimientos y controles toca enviar ahora. El servidor las ejecuta cada minuto.
import { ACTIVE, findSlots } from './slots.js';
import { whenLabel, local, addDays } from './time.js';
import { words } from './countries.js';
import { firstName } from './text.js';

const H = 3600000;

export function defaultAutomations() {
  return { dayBefore: true, sameDay: true, sameDayHours: 3, noShowFollowUp: true, recall: true, review: false, depositHoldMinutes: 120 };
}

// Recordatorio del día anterior: se envía entre 20 y 28 h antes, en horario razonable (8:00–20:30 local).
export function dueReminders(clinic, appointments, nowMs) {
  const cfg = { ...defaultAutomations(), ...(clinic.automations || {}) };
  const l = local(nowMs, clinic.tz);
  const civil = l.minutes >= 8 * 60 && l.minutes <= 20 * 60 + 30;
  const out = [];
  for (const a of appointments) {
    if (!ACTIVE.has(a.status) || a.patientOptOut) continue;
    const dt = a.start - nowMs;
    if (cfg.dayBefore && !a.remindedDayBefore && dt > 3 * H && dt <= 28 * H && civil && (dt >= 20 * H || local(a.start, clinic.tz).dateKey === addDays(l.dateKey, 1))) {
      out.push({ kind: 'day_before', appt: a });
    } else if (cfg.sameDay && !a.remindedSameDay && dt > 0.5 * H && dt <= cfg.sameDayHours * H && a.createdAt < a.start - 6 * H) {
      out.push({ kind: 'same_day', appt: a });
    }
  }
  return out;
}

export function reminderMessage(clinic, a, kind, patientName, nowMs, serviceName) {
  const W = words(clinic.country);
  const who = patientName ? `, ${firstName(patientName)}` : '';
  const when = whenLabel(a.start, clinic.tz, nowMs);
  if (kind === 'day_before') {
    return {
      template: { name: 'recordatorio_cita', params: [patientName ? firstName(patientName) : 'paciente', clinic.name, when] },
      type: 'buttons',
      text: `Hola${who}. Le recordamos su ${W.cita} en ${clinic.name}: ${when}${serviceName ? ` (${serviceName.toLowerCase()})` : ''}.\n\n¿Nos confirma su asistencia?`,
      buttons: [{ id: 'confirm:' + a.id, title: 'Confirmo' }, { id: 'resched:' + a.id, title: 'Cambiar fecha' }, { id: 'cancel:' + a.id, title: 'Cancelar' }],
    };
  }
  return {
    template: { name: 'recordatorio_hoy', params: [patientName ? firstName(patientName) : 'paciente', clinic.name, when] },
    type: 'text',
    text: `Hola${who}. Le esperamos hoy en ${clinic.name}: ${when}.${clinic.address ? `\n${clinic.address}` : ''}${clinic.mapsUrl ? `\n${clinic.mapsUrl}` : ''}`,
  };
}

// Adelantos no pagados a tiempo: se libera el espacio.
export function expiredHolds(clinic, appointments, nowMs) {
  const hold = (clinic.deposit?.holdMinutes || 120) * 60000;
  return appointments.filter((a) => a.status === 'pending_deposit' && a.depositStatus !== 'review' && nowMs - a.createdAt > hold && a.source === 'assistant');
}

// Cuando se libera un espacio, se ofrece a la lista de espera (el primero que acepte, lo toma).
export function waitlistMatches(clinic, appointments, waitlist, freed, nowMs) {
  const svcs = clinic.services || [];
  const res = [];
  for (const w of waitlist) {
    if (w.status !== 'waiting') continue;
    const svc = svcs.find((s) => s.id === w.serviceId) || svcs[0];
    if (!svc) continue;
    if (freed.start - nowMs < 2 * H) continue;
    if (freed.end - freed.start < svc.duration * 60000) continue;
    const slots = findSlots({ clinic, appointments, service: svc, pref: { days: [local(freed.start, clinic.tz).dateKey] }, nowMs, limit: 20, staffId: freed.staffId ?? null });
    const s = slots.find((x) => x.start === freed.start) || slots.find((x) => x.start >= freed.start && x.start < freed.end);
    if (s) res.push({ waitlist: w, slot: s, service: svc });
  }
  return res;
}

export function waitlistMessage(clinic, slot, service, patientName, nowMs) {
  const W = words(clinic.country);
  return {
    template: { name: 'cupo_disponible', params: [patientName ? firstName(patientName) : 'paciente', clinic.name, whenLabel(slot.start, clinic.tz, nowMs)] },
    type: 'buttons',
    text: `Hola${patientName ? `, ${firstName(patientName)}` : ''}. Se liberó un espacio en ${clinic.name} para ${service.name.toLowerCase()}: ${whenLabel(slot.start, clinic.tz, nowMs)}.\n\n¿Lo quiere? Se asigna al primero que responda.`,
    buttons: [{ id: `wl:take:${slot.start}:${service.id}:${slot.staffId ?? 'null'}`, title: `Sí, lo tomo` }, { id: 'wl:skip', title: 'No, gracias' }],
    note: W.cita,
  };
}

// Pacientes que faltaron: un mensaje amable para reagendar (no culpa, sí facilidad).
export function noShowFollowUps(clinic, appointments, nowMs) {
  const cfg = { ...defaultAutomations(), ...(clinic.automations || {}) };
  if (!cfg.noShowFollowUp) return [];
  return appointments.filter((a) => a.status === 'no_show' && !a.followedUp && nowMs - a.end < 3 * 24 * H && !a.patientOptOut);
}

export function noShowMessage(clinic, a, patientName) {
  const W = words(clinic.country);
  return {
    template: { name: 'reagendar_inasistencia', params: [patientName ? firstName(patientName) : 'paciente', clinic.name] },
    type: 'buttons',
    text: `Hola${patientName ? `, ${firstName(patientName)}` : ''}. Le extrañamos hoy en ${clinic.name}. ¿Le busco ${W.una} ${W.nueva} fecha que le acomode mejor?`,
    buttons: [{ id: 'menu:book', title: 'Sí, reagendar' }, { id: 'menu:human', title: 'Hablar con recepción' }],
  };
}

// Controles periódicos (limpieza cada 6 meses, control de ortodoncia mensual, etc.).
export function recallsDue(clinic, patients, appointments, nowMs) {
  const cfg = { ...defaultAutomations(), ...(clinic.automations || {}) };
  if (!cfg.recall) return [];
  const svcs = Object.fromEntries((clinic.services || []).map((s) => [s.id, s]));
  const res = [];
  for (const p of patients) {
    if (p.optedOut) continue;
    const mine = appointments.filter((a) => a.patientId === p.id);
    if (mine.some((a) => ACTIVE.has(a.status) && a.start > nowMs)) continue;
    const last = mine.filter((a) => a.status === 'completed').sort((a, b) => b.start - a.start)[0];
    if (!last) continue;
    const svc = svcs[last.serviceId];
    if (!svc?.recallMonths) continue;
    const due = last.start + svc.recallMonths * 30 * 24 * H;
    if (nowMs >= due && nowMs - due < 45 * 24 * H && (!p.lastRecallAt || nowMs - p.lastRecallAt > 30 * 24 * H)) {
      res.push({ patient: p, service: svc, last });
    }
  }
  return res;
}

export function recallMessage(clinic, patient, service) {
  const W = words(clinic.country);
  return {
    template: { name: 'control_pendiente', params: [patient.name ? firstName(patient.name) : 'paciente', service.name.toLowerCase(), clinic.name] },
    type: 'buttons',
    text: `Hola${patient.name ? `, ${firstName(patient.name)}` : ''}. Ya le toca su ${service.name.toLowerCase()} en ${clinic.name}. ¿Le reservo ${W.una} ${W.cita}?`,
    buttons: [{ id: 'svc:' + service.id, title: `Sí, agendar` }, { id: 'menu:human', title: 'Tengo una consulta' }],
  };
}
