// Fechas en la zona horaria de la clínica, sin librerías. Funciona con horario de verano (Chile).
// Convenciones: instantes en milisegundos UTC; "dateKey" = 'YYYY-MM-DD' local; minutos = minuto del día local.

const fmtCache = new Map();
function partsFmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function local(ms, tz) {
  const p = {};
  for (const x of partsFmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  const y = +p.year, m = +p.month, d = +p.day, hh = +p.hour % 24, mm = +p.minute;
  return {
    y, m, d, hh, mm, dow: WD[p.weekday],
    dateKey: `${p.year}-${p.month}-${p.day}`,
    minutes: hh * 60 + mm,
  };
}

export function tzOffset(ms, tz) {
  const l = local(ms, tz);
  const asUtc = Date.UTC(l.y, l.m - 1, l.d, l.hh, l.mm, new Date(ms).getUTCSeconds());
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Minuto local de un día local -> instante UTC.
export function toUtc(dateKey, minutes, tz) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let ms = guess - tzOffset(guess, tz);
  const off2 = tzOffset(ms, tz);
  ms = guess - off2;
  return ms;
}

export function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function dowOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function diffDays(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

export function hm(str) {
  const [h, m] = String(str).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function hmStr(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// 10:30 a. m. — formato usado en Perú y casi toda la región.
export function timeLabel(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suf = h < 12 ? 'a. m.' : 'p. m.';
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`;
}

export function dateLabel(dateKey, nowKey) {
  const [, m, d] = dateKey.split('-').map(Number);
  const dow = dowOf(dateKey);
  const base = `${DAYS[dow]} ${d} de ${MONTHS[m - 1]}`;
  if (nowKey) {
    const dd = diffDays(nowKey, dateKey);
    if (dd === 0) return `hoy ${base}`;
    if (dd === 1) return `mañana ${base}`;
  }
  return base;
}

export function shortLabel(ms, tz) {
  const l = local(ms, tz);
  return `${DAYS_SHORT[l.dow]} ${l.d} · ${timeLabel(l.minutes).replace(' a. m.', ' am').replace(' p. m.', ' pm')}`;
}

// "mañana martes 3 de noviembre a las 3:00 p. m." / "el miércoles 4 de noviembre a la 1:00 p. m."
export function atLabel(ms, tz, nowMs) {
  const l = local(ms, tz);
  const nowKey = nowMs != null ? local(nowMs, tz).dateKey : null;
  const d = dateLabel(l.dateKey, nowKey);
  const rel = /^(hoy|mañana) /.test(d);
  const h = Math.floor(l.minutes / 60) % 12;
  return `${rel ? '' : 'el '}${d} ${h === 1 ? 'a la' : 'a las'} ${timeLabel(l.minutes)}`;
}

export function whenLabel(ms, tz, nowMs) {
  const l = local(ms, tz);
  const nowKey = nowMs != null ? local(nowMs, tz).dateKey : null;
  return `${dateLabel(l.dateKey, nowKey)}, ${timeLabel(l.minutes)}`;
}
