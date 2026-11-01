// Motor de disponibilidad. El asistente SOLO ofrece horarios que salen de aquí,
// y se vuelven a verificar justo antes de reservar (evita doble reserva).
import { local, toUtc, addDays, dowOf, hm } from './time.js';
import { partRange } from './dates.js';

export const ACTIVE = new Set(['booked', 'confirmed', 'pending_deposit']);

export function staffFor(clinic, service) {
  const staff = (clinic.staff || []).filter((s) => s.active !== false);
  if (!staff.length) return [null];
  const ok = staff.filter((s) => {
    if (service?.staff?.length) return service.staff.includes(s.id);
    if (s.services?.length) return s.services.includes(service?.id);
    return true;
  });
  return ok.length ? ok : staff;
}

function dayWindows(clinic, dateKey, staff) {
  if ((clinic.closedDates || []).includes(dateKey)) return [];
  const dow = dowOf(dateKey);
  if (staff?.days && !staff.days.includes(dow)) return [];
  const src = staff?.hours || clinic.hours || {};
  return (src[dow] || src[String(dow)] || []).map(([a, b]) => [hm(a), hm(b)]);
}

export function isFree(clinic, appointments, start, end, staffId, excludeId) {
  const overlapping = appointments.filter(
    (a) => ACTIVE.has(a.status) && a.id !== excludeId && a.start < end && a.end > start,
  );
  if (staffId != null) return !overlapping.some((a) => a.staffId === staffId);
  return overlapping.length < (clinic.capacity || 1);
}

export function fitsHours(clinic, start, end, staffId) {
  const tz = clinic.tz;
  const l = local(start, tz);
  const staff = (clinic.staff || []).find((s) => s.id === staffId) || null;
  const mins = l.minutes, dur = Math.round((end - start) / 60000);
  return dayWindows(clinic, l.dateKey, staff).some(([a, b]) => mins >= a && mins + dur <= b);
}

export function findSlots({ clinic, appointments = [], service, pref = null, nowMs, limit = 3, staffId = null, excludeId = null }) {
  const tz = clinic.tz;
  const dur = service?.duration || 30;
  const step = clinic.slotStep || 15;
  const minNotice = (clinic.minNoticeMinutes ?? 60) * 60000;
  const maxDays = clinic.maxDaysAhead || 30;
  const today = local(nowMs, tz).dateKey;

  let days;
  if (pref?.days?.length) days = pref.days.filter((d) => d >= today && d <= addDays(today, maxDays));
  else days = Array.from({ length: maxDays + 1 }, (_, i) => addDays(today, i));

  let [lo, hi] = partRange(pref?.part);
  if (pref?.after != null) lo = Math.max(lo, pref.after);
  if (pref?.before != null) hi = Math.min(hi, pref.before);

  let staffList = staffFor(clinic, service);
  if (staffId != null) staffList = staffList.filter((s) => s && s.id === staffId);
  if (!staffList.length) staffList = [null];

  const cands = [];
  for (const day of days) {
    for (const st of staffList) {
      for (const [a, b] of dayWindows(clinic, day, st)) {
        for (let t = Math.ceil(a / step) * step; t + dur <= b; t += step) {
          if (t < lo || t >= hi) continue;
          const start = toUtc(day, t, tz);
          if (start < nowMs + minNotice) continue;
          const end = start + dur * 60000;
          if (!isFree(clinic, appointments, start, end, st ? st.id : null, excludeId)) continue;
          cands.push({ start, end, staffId: st ? st.id : null, dateKey: day, minutes: t });
        }
      }
    }
    if (cands.length > 200) break;
  }
  // Un horario por hora de inicio (si hay 2 doctores libres a la misma hora, se ofrece una vez).
  const seen = new Set();
  let uniq = cands
    .sort((x, y) => x.start - y.start)
    .filter((c) => (seen.has(c.start) ? false : (seen.add(c.start), true)));

  if (pref?.exact != null) {
    // Lo más cercano a la hora pedida primero; luego alternativas separadas al menos 1 hora.
    uniq = uniq.sort((x, y) => {
      if (x.dateKey !== y.dateKey) return x.dateKey < y.dateKey ? -1 : 1;
      return Math.abs(x.minutes - pref.exact) - Math.abs(y.minutes - pref.exact) || x.start - y.start;
    });
    const first = uniq[0];
    if (!first) return [];
    const rest = [];
    for (const c of uniq.slice(1)) {
      if (rest.length >= limit - 1) break;
      if ([first, ...rest].every((p) => p.dateKey !== c.dateKey || Math.abs(p.minutes - c.minutes) >= 60)) rest.push(c);
    }
    return [first, ...rest.sort((x, y) => x.start - y.start)];
  }

  // Ofrecer opciones variadas: separadas al menos 90 min el mismo día.
  const picked = [];
  for (const c of uniq) {
    if (picked.length >= limit) break;
    if (picked.every((p) => p.dateKey !== c.dateKey || Math.abs(p.minutes - c.minutes) >= 90)) picked.push(c);
  }
  for (const gap of [45, 0]) {
    for (const c of uniq) {
      if (picked.length >= limit) break;
      if (!picked.includes(c) && picked.every((p) => p.dateKey !== c.dateKey || Math.abs(p.minutes - c.minutes) >= gap)) picked.push(c);
    }
  }
  return picked.sort((x, y) => x.start - y.start);
}

// Busca primero lo pedido y, si no hay, relaja la condición paso a paso.
export function findWithFallback(args) {
  const { pref } = args;
  const exact = findSlots(args);
  const limit = args.limit || 3;
  if (exact.length && exact.length < limit && pref && !pref.days?.length) return { slots: exact, relaxed: null };
  if (exact.length && exact.length < limit && pref) {
    // Pocas opciones ese día: se completan con lo más cercano en la misma franja.
    const more = findSlots({ ...args, pref: { part: pref.part, after: pref.after, before: pref.before }, limit: limit + 6 })
      .filter((x) => !exact.some((y) => y.start === x.start) && x.start > exact[0].start - 86400000);
    return { slots: [...exact, ...more].slice(0, limit), relaxed: null };
  }
  if (exact.length || !pref) return { slots: exact, relaxed: null };
  if (pref.days && (pref.part || pref.after != null || pref.before != null || pref.exact != null)) {
    const sameDay = findSlots({ ...args, pref: { days: pref.days } });
    if (sameDay.length) return { slots: sameDay, relaxed: 'time' };
  }
  if (pref.part || pref.after != null || pref.before != null) {
    const samePart = findSlots({ ...args, pref: { part: pref.part, after: pref.after, before: pref.before } });
    if (samePart.length) return { slots: samePart, relaxed: 'day' };
  }
  const any = findSlots({ ...args, pref: null });
  return { slots: any, relaxed: any.length ? 'all' : 'none' };
}

export function openNow(clinic, nowMs) {
  const l = local(nowMs, clinic.tz);
  return dayWindows(clinic, l.dateKey, null).some(([a, b]) => l.minutes >= a && l.minutes < b);
}

export function nextOpening(clinic, nowMs) {
  const l = local(nowMs, clinic.tz);
  for (let i = 0; i < 14; i++) {
    const day = addDays(l.dateKey, i);
    for (const [a] of dayWindows(clinic, day, null)) {
      if (i > 0 || a > l.minutes) return { dateKey: day, minutes: a };
    }
  }
  return null;
}
