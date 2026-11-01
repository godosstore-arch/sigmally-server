// Números que el dueño de la clínica entiende: citas, plata agendada, inasistencias, mensajes fuera de horario.
import { local, addDays } from './time.js';
import { ACTIVE, openNow } from './slots.js';

const DAY = 86400000;

export function computeMetrics({ clinic, appointments, messages, waitlist = [], nowMs }) {
  const price = Object.fromEntries((clinic.services || []).map((s) => [s.id, Number(s.price) || 0]));
  const from = nowMs - 30 * DAY;
  const created = appointments.filter((a) => a.createdAt >= from);
  const byBot = created.filter((a) => a.source === 'assistant' && a.status !== 'cancelled');
  const value = byBot.reduce((s, a) => s + (price[a.serviceId] || 0), 0);

  const past = appointments.filter((a) => a.start >= from && a.start < nowMs && ['completed', 'no_show'].includes(a.status));
  const noShows = past.filter((a) => a.status === 'no_show').length;
  const noShowRate = past.length ? noShows / past.length : 0;

  const soon = appointments.filter((a) => ACTIVE.has(a.status) && a.start > nowMs && a.start < nowMs + 2 * DAY);
  const confirmed = soon.filter((a) => a.status === 'confirmed').length;

  const inbound = messages.filter((m) => m.direction === 'in' && m.at >= from);
  const afterHours = inbound.filter((m) => !openNow(clinic, m.at)).length;
  const botReplies = messages.filter((m) => m.direction === 'out' && m.author === 'bot' && m.at >= from).length;
  const recovered = appointments.filter((a) => a.createdAt >= from && a.fromWaitlist).length +
    waitlist.filter((w) => w.status === 'booked' && (w.createdAt || 0) >= from).length;
  const reschedules = appointments.filter((a) => (a.updatedAt || 0) >= from && a.rescheduled).length;

  // Serie diaria de los últimos 14 días: citas agendadas por el asistente vs. por recepción.
  const tz = clinic.tz;
  const today = local(nowMs, tz).dateKey;
  const series = [];
  for (let i = 13; i >= 0; i--) {
    const k = addDays(today, -i);
    const dayAppts = appointments.filter((a) => local(a.createdAt, tz).dateKey === k && a.status !== 'cancelled');
    series.push({ day: k, bot: dayAppts.filter((a) => a.source === 'assistant').length, staff: dayAppts.filter((a) => a.source !== 'assistant').length });
  }

  return {
    bookedByBot: byBot.length,
    bookedValue: value,
    noShowRate,
    noShows,
    pastVisits: past.length,
    upcoming48: soon.length,
    confirmed48: confirmed,
    afterHours,
    inbound: inbound.length,
    botReplies,
    recovered,
    reschedules,
    series,
  };
}
