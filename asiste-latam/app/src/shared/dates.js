// Entiende cómo escriben los pacientes en LATAM: "mañana en la tarde", "el sábado temprano",
// "pasado mañana a las 4 y media", "15/11 después de las 6", "la otra semana", "lo antes posible".
import { norm, wordNumber } from './text.js';
import { local, addDays, dowOf } from './time.js';

const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const NUMW = '(?:una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';

function toNum(w) {
  if (/^\d+$/.test(w)) return parseInt(w, 10);
  return wordNumber(w);
}

export function parseWhen(input, nowMs, tz) {
  let t = ' ' + norm(input) + ' ';
  const now = local(nowMs, tz);
  const today = now.dateKey;
  const out = { days: null, part: null, after: null, before: null, exact: null, asap: false, any: false, found: false };

  // Frases de "mañana" como parte del día, antes de leer "mañana" como día siguiente.
  if (/ (esta) manana /.test(t)) { out.days = [today]; out.part = 'morning'; t = t.replace(/ esta manana /g, ' _m_ '); }
  t = t.replace(/ (por|en|de|a) la manana /g, ' _m_ ').replace(/ (en|por) las mananas /g, ' _m_ ').replace(/ temprano(cito)? /g, ' _m_ _early_ ');
  if (/ _m_ /.test(t)) out.part = 'morning';
  if (/ _early_ /.test(t)) out.before = out.before ?? 11 * 60;
  if (/ (en|por|de) (la|las) tardes? | esta tarde | tardecita /.test(t)) out.part = 'afternoon';
  if (/ (en|por|de) (la|las) noches? | esta noche | nochecita /.test(t)) out.part = 'evening';
  if (/ (al )?medio ?dia /.test(t)) { out.part = out.part || 'noon'; }

  if (/ (lo antes posible|lo mas (pronto|antes|rapido)|cuanto antes|primer (horario|espacio|cupo)|lo mas cercano|hoy mismo|ya mismo|urgente) /.test(t)) out.asap = true;
  if (/ (cualquier (dia|hora|horario|momento)|cuando sea|me da igual|indistinto|el que (tenga|haya)) /.test(t)) out.any = true;

  // --- Días ---
  let days = out.days;
  if (/ pasado manana /.test(t)) { days = [addDays(today, 2)]; t = t.replace(/ pasado manana /g, ' '); }
  if (!days && / manana /.test(t)) days = [addDays(today, 1)];
  if (!days && / hoy /.test(t)) days = [today];
  if ((/ esta tarde | esta noche /.test(t)) && !days) days = [today];

  const nextWeek = / (proxima|siguiente|otra) semana | semana que viene /.test(t);
  const thisWeek = / esta semana /.test(t);

  const wdMatch = t.match(/ (este |el |la |los |para el |proximo |el proximo )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)( que viene| proximo)? /);
  if (!days && wdMatch) {
    const target = WEEKDAYS[wdMatch[2]];
    let delta = (target - now.dow + 7) % 7;
    const explicitNext = /proximo/.test(wdMatch[1] || '') || /que viene|proximo/.test(wdMatch[3] || '');
    const isThis = /este/.test(wdMatch[1] || '');
    if (delta === 0 && !isThis) delta = 7;
    if (nextWeek && delta < 7) {
      // "el martes de la próxima semana": semana siguiente (desde el lunes que viene)
      const daysToNextMonday = ((1 - now.dow + 7) % 7) || 7;
      delta = daysToNextMonday + ((target - 1 + 7) % 7);
    } else if (explicitNext && delta <= 1 && now.dow !== 0) {
      // "el próximo jueves" dicho un miércoles suele significar el de mañana; se respeta.
    }
    days = [addDays(today, delta)];
  }

  if (!days && / (fin de semana|finde) /.test(t)) {
    const toSat = (6 - now.dow + 7) % 7;
    days = [addDays(today, toSat), addDays(today, toSat + 1)];
  }

  // Fechas: 15/11, 15-11-2026, 15 de noviembre, el 20, el dia 20
  let m = t.match(/ (\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))? /);
  if (!days && m) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) days = [resolveDate(now, d, mo, m[3])];
  }
  m = t.match(/ (\d{1,2}|primero) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: del? (\d{4}))? /);
  if (!days && m) days = [resolveDate(now, m[1] === 'primero' ? 1 : +m[1], MONTHS[m[2]], m[3])];
  m = t.match(/ el (?:dia )?(\d{1,2}) (?!(?:de la|y media|y cuarto|am|pm|a m|p m|hrs|horas|h )\b)/);
  if (!days && m && !/ (a las|para las|desde las|despues de las|antes de las|hasta las) \d/.test(' ' + t.slice(0, m.index + 4))) {
    const d = +m[1];
    if (d >= 1 && d <= 31) {
      let mo = now.m;
      if (d < now.d) mo = mo === 12 ? 1 : mo + 1;
      days = [resolveDate(now, d, mo)];
    }
  }
  m = t.match(/ (?:en|dentro de) (\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|diez|quince) dias /);
  if (!days && m) days = [addDays(today, toNum(m[1]))];
  if (!days && / dentro de una semana | en una semana /.test(t)) days = [addDays(today, 7)];

  if (!days && nextWeek) {
    const toMon = ((1 - now.dow + 7) % 7) || 7;
    days = [0, 1, 2, 3, 4, 5].map((i) => addDays(today, toMon + i));
  }
  if (!days && thisWeek) {
    days = [];
    for (let i = 0; i <= (6 - now.dow + 7) % 7; i++) days.push(addDays(today, i));
  }

  // --- Horas ---
  const timeRe = new RegExp(
    ' (a las|a la|para las|para la|tipo|como a las|a eso de las|desde las|despues de las|pasadas las|antes de las|hasta las|de|a)? ?' +
    '(\\d{1,2}|' + NUMW + ')(?::(\\d{2})| y (media|cuarto)| menos cuarto)? ?(am|pm|a m|p m|hrs|horas|h)?(?: de la (manana|tarde|noche)| _m_)? ',
    'g',
  );
  let tm;
  while ((tm = timeRe.exec(t))) {
    const prefix = (tm[1] || '').trim();
    const hasPrefix = /^(a las|a la|para las|para la|tipo|como a las|a eso de las|desde las|despues de las|pasadas las|antes de las|hasta las)$/.test(prefix);
    const hasSuffix = !!(tm[3] || tm[4] || tm[5] || tm[6] || / _m_ $/.test(tm[0]) || / menos cuarto/.test(tm[0]));
    if (!hasPrefix && !hasSuffix) continue;
    let h = toNum(tm[2]);
    if (h == null || h > 23) continue;
    let mi = tm[3] ? +tm[3] : tm[4] === 'media' ? 30 : tm[4] === 'cuarto' ? 15 : 0;
    if (/ menos cuarto/.test(tm[0])) { h = h - 1; mi = 45; }
    const suf = (tm[5] || '').replace(' ', '');
    const partWord = tm[6] || (/ _m_ $/.test(tm[0]) ? 'manana' : null);
    if (suf === 'pm' || partWord === 'tarde' || partWord === 'noche') { if (h < 12) h += 12; }
    else if (suf === 'am' || partWord === 'manana') { if (h === 12) h = 0; }
    else if (h <= 12 && (out.part === 'afternoon' || out.part === 'evening')) { if (h < 12) h += 12; }
    else if (h >= 1 && h <= 7) h += 12;
    const minutes = h * 60 + mi;
    if (/despues de las|pasadas las|desde las/.test(prefix)) out.after = minutes;
    else if (/antes de las|hasta las/.test(prefix)) out.before = minutes;
    else out.exact = minutes;
    if (!out.part && partWord) out.part = partWord === 'manana' ? 'morning' : partWord === 'tarde' ? 'afternoon' : 'evening';
  }
  if (out.part === 'noon' && out.exact == null) { out.after = 12 * 60; out.before = 14 * 60; out.part = null; }

  out.days = days;
  out.found = !!(days || out.part || out.after != null || out.before != null || out.exact != null || out.asap || out.any);
  return out.found ? out : null;
}

function resolveDate(now, d, mo, yRaw) {
  let y = yRaw ? +yRaw : now.y;
  if (y < 100) y += 2000;
  const key = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!yRaw && key < now.dateKey) return `${y + 1}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return key;
}

export function partRange(part) {
  if (part === 'morning') return [0, 12 * 60];
  if (part === 'afternoon') return [12 * 60, 18 * 60];
  if (part === 'evening') return [18 * 60, 24 * 60];
  return [0, 24 * 60];
}

export { dowOf };
