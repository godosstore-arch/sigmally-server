// Cerebro de la conversación. Función pura: recibe el mensaje y el estado, devuelve respuestas,
// acciones (reservar, cancelar, derivar…) y el nuevo estado. La usan igual el servidor y la demo.
import { detect, matchService, matchFaq, looksLikeName, cleanName } from './intents.js';
import { parseWhen } from './dates.js';
import { findWithFallback, isFree, fitsHours, ACTIVE, openNow, nextOpening } from './slots.js';
import { local, whenLabel, atLabel, shortLabel, timeLabel, dateLabel, DAYS, hm } from './time.js';
import { country, words, money, emergencyLine, mentalLine } from './countries.js';
import { firstName, titleCase, norm } from './text.js';

const HUMAN_TIMEOUT_H = 12;

export function initialState() {
  return { step: null, mode: null, serviceId: null, pref: null, offered: [], apptId: null, chosen: null, unknown: 0, human: null, greeted: false };
}

const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + '…');
const text = (body) => ({ type: 'text', text: body });
const buttons = (body, btns) => ({ type: 'buttons', text: body, buttons: btns.slice(0, 3).map((b) => ({ id: b.id, title: clip(b.title, 20) })) });
const list = (body, button, rows) => ({ type: 'list', text: body, button: clip(button, 20), rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: clip(r.title, 24), description: r.description ? clip(r.description, 72) : undefined })) });

function hello(nowMs, tz) {
  const h = Math.floor(local(nowMs, tz).minutes / 60);
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function hoursText(clinic) {
  const H = clinic.hours || {};
  const rows = [];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const fmt = (wins) => (wins && wins.length ? wins.map(([a, b]) => `${timeLabel(hm(a))} a ${timeLabel(hm(b))}`).join(' y ') : 'cerrado');
  let i = 0;
  while (i < order.length) {
    const d = order[i];
    const v = fmt(H[d] || H[String(d)]);
    let j = i;
    while (j + 1 < order.length && fmt(H[order[j + 1]] || H[String(order[j + 1])]) === v) j++;
    const name = i === j ? cap(DAYS[d]) : `${cap(DAYS[d])} a ${DAYS[order[j]]}`;
    rows.push(`${name}: ${v}`);
    i = j + 1;
  }
  return rows.join('\n');
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function svcById(clinic, id) {
  return (clinic.services || []).find((s) => s.id === id) || null;
}
function staffName(clinic, id) {
  const s = (clinic.staff || []).find((x) => x.id === id);
  return s ? s.name : null;
}
// "con la Dra. Paredes" / "con el Dr. Quispe": así se dice en la región.
function withDoc(n) {
  if (!n) return '';
  if (/^dra\.?\s/i.test(n)) return ` con la ${n}`;
  if (/^dr\.?\s/i.test(n)) return ` con el ${n}`;
  return ` con ${n}`;
}
function priceText(clinic, s) {
  if (s.price == null || s.price === '') return 'precio a consultar';
  return (s.priceFrom ? 'desde ' : '') + money(s.price, clinic.country);
}
function needsDeposit(clinic, service) {
  const d = clinic.deposit;
  if (!d || !d.enabled || !d.amount) return false;
  return !d.services?.length || d.services.includes(service.id);
}

function upcoming(ctx) {
  return (ctx.appointments || [])
    .filter((a) => a.patientId === ctx.patient?.id && ACTIVE.has(a.status) && a.end > ctx.nowMs)
    .sort((a, b) => a.start - b.start);
}

function apptLine(clinic, a, nowMs) {
  const s = svcById(clinic, a.serviceId);
  const doc = staffName(clinic, a.staffId);
  return `${cap(whenLabel(a.start, clinic.tz, nowMs))}${s ? ` · ${s.name}` : ''}${doc ? ` · ${doc}` : ''}`;
}

export function handle(ctx) {
  const { clinic, msg } = ctx;
  const S = { ...initialState(), ...(ctx.state || {}) };
  const out = { replies: [], actions: [], state: S, fallback: false };
  const W = words(clinic.country);
  const nowMs = ctx.nowMs;
  const name = ctx.patient?.name ? firstName(ctx.patient.name) : null;
  const tidy = (s) => s.replace(/m\.\.(?=\s|$)/g, 'm.').replace(/m\.\.\s/g, 'm. ');
  const say = (r) => { const x = typeof r === 'string' ? text(r) : r; x.text = tidy(x.text); out.replies.push(x); };
  const act = (a) => out.actions.push(a);
  const reset = () => Object.assign(S, { step: null, mode: null, serviceId: null, pref: null, offered: [], apptId: null, chosen: null });

  const body = msg.type === 'text' ? String(msg.text || '') : String(msg.text || '');
  const { hit } = detect(body);
  const id = msg.id || '';

  // 1) Seguridad primero, incluso si recepción tomó la conversación.
  const spec = clinic.urgentPattern ? new RegExp(clinic.urgentPattern) : null;
  if (msg.type === 'text' && hit.crisis) {
    say(`Gracias por escribirnos. Lo que siente es importante y no tiene que pasar por esto sin ayuda. Por favor, ${mentalLine(clinic.country)}. Si está en peligro inmediato, ${emergencyLine(clinic.country)}.\n\nYa avisé a nuestro equipo para que le contacte.`);
    act({ type: 'handoff', reason: 'Posible crisis de salud mental', urgent: true });
    S.human = nowMs; S.greeted = true; reset();
    return out;
  }
  if (msg.type === 'text' && hit.emergency) {
    say(`Si es una emergencia, por favor ${emergencyLine(clinic.country)}. No espere una cita.\n\nYa avisé a nuestro equipo para que le escriba lo antes posible.`);
    act({ type: 'handoff', reason: 'Posible emergencia', urgent: true });
    S.human = nowMs; S.greeted = true; reset();
    return out;
  }
  if (msg.type === 'text' && spec && spec.test(norm(body))) {
    say(`Entiendo, eso necesita atención pronto. Ya avisé al equipo de ${clinic.name} para que le contacte en breve. Si empeora o tiene dolor intenso, ${emergencyLine(clinic.country)}.`);
    act({ type: 'handoff', reason: 'Caso que requiere atención pronta', urgent: true });
    S.human = nowMs; S.greeted = true; reset();
    return out;
  }

  // 2) Baja / alta de mensajes.
  if (msg.type === 'text' && hit.optout) {
    act({ type: 'optout' });
    say(`Listo. No le enviaremos más recordatorios ni avisos. Si desea volver a recibirlos, escriba ALTA.`);
    return out;
  }
  if (msg.type === 'text' && hit.optin) {
    act({ type: 'optin' });
    say(`Listo, volverá a recibir sus recordatorios.`);
    return out;
  }

  // 3) Si recepción tomó la conversación, el asistente no interrumpe.
  if (S.human) {
    if (nowMs - S.human < HUMAN_TIMEOUT_H * 3600000) {
      act({ type: 'attention', reason: 'Mensaje en conversación atendida por recepción' });
      return out;
    }
    S.human = null;
  }

  const intro = !S.greeted;
  S.greeted = true;
  const introLine = `${hello(nowMs, clinic.tz)}${name ? `, ${name}` : ''}. Le escribe el asistente virtual de ${clinic.name}.`;
  const privacy = clinic.privacyUrl ? `\n\nAl escribirnos acepta nuestro aviso de privacidad: ${clinic.privacyUrl}` : '';

  // ---------- Acciones de flujo ----------
  const mainButtons = () => [
    { id: 'menu:book', title: `Agendar ${W.cita}` },
    { id: 'menu:prices', title: 'Precios' },
    { id: 'menu:human', title: 'Hablar con recepción' },
  ];

  function handoff(reason, urgent = false) {
    act({ type: 'handoff', reason, urgent });
    if (openNow(clinic, nowMs)) {
      say(`Claro${name ? `, ${name}` : ''}. Le paso con recepción; le responden por aquí en unos minutos.`);
      S.human = nowMs;
    } else {
      const n = nextOpening(clinic, nowMs);
      const when = n ? `${dateLabel(n.dateKey, local(nowMs, clinic.tz).dateKey)} desde las ${timeLabel(n.minutes)}` : 'en cuanto abramos';
      say(buttons(`Recepción está fuera de horario y le escribirá ${when}. Ya dejé su mensaje anotado.\n\nSi desea, mientras tanto puedo agendar su ${W.cita} ahora mismo.`, [{ id: 'menu:book', title: `Agendar ${W.cita}` }]));
    }
    reset();
  }

  function askService(pref) {
    S.step = 'service'; S.pref = pref || S.pref;
    const svcs = clinic.services || [];
    say(list(`¿Para qué servicio desea ${W.la} ${W.cita}?`, 'Ver servicios', svcs.map((s) => ({ id: 'svc:' + s.id, title: s.name, description: `${priceText(clinic, s)} · ${s.duration} min` }))));
  }

  function askWhen() {
    S.step = 'when';
    const s = svcById(clinic, S.serviceId);
    const lead = S.mode === 'resched' ? `¿Para qué día y hora la cambiamos?` : `Perfecto${s ? `, ${s.name.toLowerCase()}` : ''}. ¿Qué día y horario le acomoda?`;
    say(buttons(`${lead} Puede escribirme, por ejemplo, "mañana en la tarde" o "el sábado temprano".`, [
      { id: 'when:asap', title: 'Lo antes posible' },
      { id: 'when:tomorrow', title: 'Mañana' },
      { id: 'when:nextweek', title: 'Próxima semana' },
    ]));
  }

  function offer(pref) {
    const service = svcById(clinic, S.serviceId);
    S.pref = pref || null;
    const excludeId = S.mode === 'resched' ? S.apptId : null;
    const keepStaff = S.mode === 'resched' ? (ctx.appointments || []).find((a) => a.id === S.apptId)?.staffId ?? null : null;
    let { slots, relaxed } = findWithFallback({ clinic, appointments: ctx.appointments || [], service, pref, nowMs, excludeId, staffId: keepStaff });
    if (!slots.length && keepStaff) ({ slots, relaxed } = findWithFallback({ clinic, appointments: ctx.appointments || [], service, pref, nowMs, excludeId }));
    if (!slots.length) {
      S.step = 'waitlist_ask';
      say(buttons(`Por ahora no tengo espacios libres para ${service.name.toLowerCase()} en los próximos ${clinic.maxDaysAhead || 30} días. ¿Le anoto en la lista de espera? Le escribo apenas se libere uno.`, [
        { id: 'wl:join', title: 'Sí, anótame' },
        { id: 'menu:human', title: 'Hablar con recepción' },
      ]));
      return;
    }
    S.step = 'pick';
    S.offered = slots.map((x) => ({ start: x.start, end: x.end, staffId: x.staffId }));
    const exactHit = pref?.exact != null && slots.some((x) => local(x.start, clinic.tz).minutes === pref.exact) && !relaxed;
    const sameStaff = new Set(slots.map((x) => x.staffId)).size === 1;
    const doc = sameStaff ? staffName(clinic, slots[0].staffId) : null;
    const con = withDoc(doc);
    let lead;
    if (exactHit) lead = `Sí, tengo ese horario${con}. También le dejo otras opciones:`;
    else if (relaxed === 'time') lead = `Ese día no tengo ese horario, pero sí estos${con}:`;
    else if (relaxed === 'day') lead = `Ese día ya está completo. Le propongo${con}:`;
    else if (relaxed === 'all') lead = `No encontré espacio con esa preferencia. Lo más cercano que tengo${con} es:`;
    else lead = `Tengo estos horarios para ${service.name.toLowerCase()}${con}:`;
    if (exactHit && slots.length === 1) lead = `Sí, tengo ese horario${con}:`;
    const lines = slots.map((x, i) => `${i + 1}) ${cap(whenLabel(x.start, clinic.tz, nowMs))}${!sameStaff && staffName(clinic, x.staffId) ? ` · ${staffName(clinic, x.staffId)}` : ''}`);
    say(buttons(`${lead}\n\n${lines.join('\n')}\n\n¿Cuál prefiere? Si ninguno le acomoda, dígame otro día u hora.`,
      slots.map((x, i) => ({ id: 'slot:' + i, title: shortLabel(x.start, clinic.tz) }))));
  }

  function startBooking(textIn, opts = {}) {
    S.mode = 'book'; S.apptId = null;
    const service = opts.service || matchService(textIn, clinic.services) || svcById(clinic, S.serviceId) || ((clinic.services || []).length === 1 ? clinic.services[0] : null);
    const pref = opts.pref !== undefined ? opts.pref : parseWhen(textIn, nowMs, clinic.tz);
    if (!service) return askService(pref);
    S.serviceId = service.id;
    if (!pref) return askWhen();
    offer(pref);
  }

  function startResched(textIn, apptId) {
    const ups = upcoming(ctx);
    const appt = apptId ? ups.find((a) => a.id === apptId) : ups[0];
    if (!appt) {
      say(buttons(`No encuentro ${W.una} ${W.cita} próxim${W.la === 'la' ? 'a' : 'o'} registrad${W.la === 'la' ? 'a' : 'o'} con este número. ¿Desea agendar ${W.una} ${W.nueva}?`, [{ id: 'menu:book', title: `Agendar ${W.cita}` }, { id: 'menu:human', title: 'Hablar con recepción' }]));
      reset();
      return;
    }
    S.mode = 'resched'; S.apptId = appt.id; S.serviceId = appt.serviceId;
    const pref = parseWhen(textIn, nowMs, clinic.tz);
    if (pref) {
      say(`${W.La} ${W.cita} actual es: ${apptLine(clinic, appt, nowMs)}.`);
      return offer(pref);
    }
    say(`${W.La} ${W.cita} actual es: ${apptLine(clinic, appt, nowMs)}.`);
    askWhen();
  }

  function startCancel(apptId) {
    const ups = upcoming(ctx);
    const appt = apptId ? ups.find((a) => a.id === apptId) : ups[0];
    if (!appt) {
      say(`No encuentro ${W.una} ${W.cita} próxim${W.la === 'la' ? 'a' : 'o'} con este número. Si fue registrad${W.la === 'la' ? 'a' : 'o'} con otro teléfono, le paso con recepción.`);
      reset();
      return;
    }
    S.step = 'cancel_confirm'; S.apptId = appt.id;
    say(buttons(`${W.La} ${W.cita} es: ${apptLine(clinic, appt, nowMs)}.\n\n¿Desea cancelar${W.la_obj === 'la' ? 'la' : 'lo'} o prefiere cambiar${W.la_obj} de fecha?`, [
      { id: 'cxl:yes', title: 'Sí, cancelar' },
      { id: 'cxl:resched', title: 'Cambiar de fecha' },
      { id: 'cxl:no', title: 'No, mantener' },
    ]));
  }

  function book(slot, patientName) {
    const service = svcById(clinic, S.serviceId);
    if (!isFree(clinic, ctx.appointments || [], slot.start, slot.end, slot.staffId, S.mode === 'resched' ? S.apptId : null) || !fitsHours(clinic, slot.start, slot.end, slot.staffId)) {
      say(`Ese horario se acaba de ocupar. Le busco otros:`);
      return offer(S.pref);
    }
    const doc = staffName(clinic, slot.staffId);
    if (S.mode === 'resched') {
      act({ type: 'reschedule', apptId: S.apptId, start: slot.start, end: slot.end, staffId: slot.staffId });
      say(`Listo${name ? `, ${name}` : ''}. ${W.La} ${W.cita} quedó ${W.reprogramada}:\n\n${cap(whenLabel(slot.start, clinic.tz, nowMs))}\n${service.name}${withDoc(doc)}\n\nLe recordaré un día antes.`);
      reset();
      return;
    }
    const dep = needsDeposit(clinic, service);
    act({
      type: 'book',
      patientName: patientName || null,
      appt: { serviceId: service.id, staffId: slot.staffId, start: slot.start, end: slot.end, status: dep ? 'pending_deposit' : 'booked', source: 'assistant' },
    });
    const who = patientName ? firstName(patientName) : name;
    let msgOut = `Listo${who ? `, ${who}` : ''}. ${W.La} ${W.cita} quedó ${dep ? W.separada : W.reservada}:\n\n` +
      `${cap(whenLabel(slot.start, clinic.tz, nowMs))}\n${service.name}${withDoc(doc)}\n${clinic.address || ''}${clinic.mapsUrl ? `\n${clinic.mapsUrl}` : ''}`;
    if (dep) {
      const hold = clinic.deposit.holdMinutes || 120;
      msgOut += `\n\nPara confirmar${W.la_obj === 'la' ? 'la' : 'lo'}, el adelanto es de ${money(clinic.deposit.amount, clinic.country)} (se descuenta del total). Puede pagar por ${clinic.deposit.methods}. Envíe la captura por aquí; le guardo el espacio por ${hold >= 60 ? `${Math.round(hold / 60)} hora${hold >= 120 ? 's' : ''}` : `${hold} minutos`}.`;
    } else {
      msgOut += `\n\nLe enviaré un recordatorio un día antes. Si necesita cambiar${W.la_obj}, solo escríbame.`;
    }
    say(msgOut.replace(/\n{3,}/g, '\n\n'));
    reset();
  }

  function pickFromText(t) {
    const offered = S.offered || [];
    if (!offered.length) return null;
    const n = norm(t);
    let m = n.match(/^(?:la |el |opcion |numero |la opcion |el numero )?(\d)$/);
    if (m) { const i = +m[1] - 1; return offered[i] ? i : null; }
    const ord = { primera: 0, primero: 0, '1ra': 0, segunda: 1, segundo: 1, '2da': 1, tercera: 2, tercero: 2, '3ra': 2, ultima: offered.length - 1, ultimo: offered.length - 1 };
    for (const [k, v] of Object.entries(ord)) if (new RegExp(`(^| )${k}( |$)`).test(n) && offered[v]) return v;
    const p = parseWhen(t, nowMs, clinic.tz);
    if (p) {
      const cand = offered.map((o, i) => ({ i, l: local(o.start, clinic.tz) })).filter(({ l }) => {
        if (p.days && !p.days.includes(l.dateKey)) return false;
        if (p.exact != null && Math.abs(l.minutes - p.exact) > 20) return false;
        return true;
      });
      if (cand.length === 1 && (p.days || p.exact != null)) return cand[0].i;
      return null;
    }
    if (offered.length === 1 && /^(si|esa|ese|dale|ok|perfecto|listo|esa esta bien|ese esta bien|me sirve)( por favor| gracias)?$/.test(n)) return 0;
    return null;
  }

  function chooseSlot(i) {
    const slot = S.offered[i];
    if (!slot) return offer(S.pref);
    if (S.mode === 'resched' || ctx.patient?.name) return book(slot, null);
    S.step = 'name'; S.chosen = slot;
    say(`Perfecto: ${atLabel(slot.start, clinic.tz, nowMs)}. ¿A nombre de quién registro ${W.la} ${W.cita}? (nombre y apellido)`);
  }

  function prices(service) {
    if (service) {
      S.step = 'offer_book'; S.serviceId = service.id; S.mode = 'book';
      say(buttons(`${service.name}: ${priceText(clinic, service)}.${service.priceFrom ? ' El monto final depende de la evaluación.' : ''}\n\n¿Le agendo ${W.una} ${W.cita}?`, [
        { id: 'menu:book', title: `Sí, agendar` },
        { id: 'menu:human', title: 'Hablar con recepción' },
      ]));
      return;
    }
    const rows = (clinic.services || []).map((s) => `• ${s.name}: ${priceText(clinic, s)}`);
    S.step = 'offer_book'; S.serviceId = null; S.mode = 'book';
    say(buttons(`Estos son nuestros precios de referencia:\n\n${rows.join('\n')}\n\n¿Le agendo ${W.una} ${W.cita}?`, [
      { id: 'menu:book', title: `Agendar ${W.cita}` },
      { id: 'menu:human', title: 'Hablar con recepción' },
    ]));
  }

  function info(kind) {
    const c = country(clinic.country);
    if (kind === 'hours') say(`Nuestro horario de atención:\n\n${hoursText(clinic)}`);
    if (kind === 'location') say(`Estamos en ${clinic.address || 'nuestra sede'}${clinic.reference ? ` (${clinic.reference})` : ''}.${clinic.mapsUrl ? `\n\nUbicación: ${clinic.mapsUrl}` : ''}`);
    if (kind === 'payment') say(`Aceptamos ${clinic.payments || c.payments}.`);
    if (kind === 'insurance') say(clinic.insurance || `Atendemos de forma particular. Para consultas sobre seguros o convenios, recepción le puede orientar.`);
    if (kind === 'parking') say(clinic.parking || `No contamos con estacionamiento propio; hay espacios en la zona.`);
  }

  // ---------- Botones (ids) ----------
  if (id) {
    const [k, a, b] = id.split(':');
    if (k === 'menu' && a === 'book') { if (intro) say(introLine); return startBooking('', { pref: null }), out; }
    if (k === 'menu' && a === 'prices') { prices(null); return out; }
    if (k === 'menu' && a === 'human') { handoff('El paciente pidió hablar con recepción'); return out; }
    if (k === 'menu' && a === 'info') { info('hours'); info('location'); return out; }
    if (k === 'svc') {
      const s = svcById(clinic, a);
      if (s) { S.serviceId = s.id; S.mode = S.mode || 'book'; if (S.pref) offer(S.pref); else askWhen(); return out; }
    }
    if (k === 'when' && S.serviceId) {
      const today = local(nowMs, clinic.tz).dateKey;
      if (a === 'asap') offer({ asap: true });
      else if (a === 'tomorrow') offer(parseWhen('mañana', nowMs, clinic.tz));
      else if (a === 'nextweek') offer(parseWhen('la próxima semana', nowMs, clinic.tz));
      else offer({ days: [today] });
      return out;
    }
    if (k === 'slot' && S.step === 'pick') { chooseSlot(+a); return out; }
    if (k === 'confirm' || k === 'resched' || k === 'cancel') {
      const appt = (ctx.appointments || []).find((x) => x.id === a && x.patientId === ctx.patient?.id);
      if (!appt || !ACTIVE.has(appt.status)) { say(`Esa ${W.cita} ya no está activa. Si desea agendar ${W.una} ${W.nueva}, escríbame.`); return out; }
      if (k === 'confirm') {
        act({ type: 'confirm', apptId: appt.id });
        say(`Gracias${name ? `, ${name}` : ''}. ${W.La} ${W.cita} queda ${W.confirmada}. Le esperamos ${atLabel(appt.start, clinic.tz, nowMs)}.`);
        reset(); return out;
      }
      if (k === 'resched') { startResched('', appt.id); return out; }
      startCancel(appt.id); return out;
    }
    if (k === 'cxl') {
      if (a === 'yes' && S.apptId) {
        const appt = (ctx.appointments || []).find((x) => x.id === S.apptId);
        act({ type: 'cancel', apptId: S.apptId });
        say(`Listo, cancelé ${W.la} ${W.cita}${appt ? ` del ${whenLabel(appt.start, clinic.tz, nowMs)}` : ''}. Cuando quiera volver a agendar, solo escríbame.`);
        reset(); return out;
      }
      if (a === 'resched' && S.apptId) { startResched('', S.apptId); return out; }
      say(`Perfecto, ${W.la} ${W.cita} se mantiene. Le esperamos.`); reset(); return out;
    }
    if (k === 'wl' && a === 'join') {
      act({ type: 'waitlist', serviceId: S.serviceId, pref: S.pref || null });
      say(`Listo, le anoté en la lista de espera. Apenas se libere un espacio le escribo por aquí para que lo tome.`);
      reset(); return out;
    }
    if (k === 'wl' && a === 'take') {
      // id: wl:take:<start>:<serviceId>:<staffId>
      const [, , startS, svcId, stf] = id.split(':');
      const svc = svcById(clinic, svcId);
      if (svc) {
        const start = +startS, end = start + svc.duration * 60000;
        S.mode = 'book'; S.serviceId = svc.id;
        const slot = { start, end, staffId: stf && stf !== 'null' ? stf : null };
        if (!isFree(clinic, ctx.appointments || [], start, end, slot.staffId, null)) {
          say(`Lo siento, ese espacio ya fue tomado. Le muestro otros:`);
          offer({ asap: true }); return out;
        }
        S.offered = [slot];
        chooseSlot(0); return out;
      }
    }
    if (k === 'wl' && a === 'skip') { say(`Entendido. Sigue en la lista de espera; le aviso si se libera otro espacio.`); return out; }
  }

  // ---------- Mensajes que no son texto ----------
  if (msg.type === 'image' || msg.type === 'document') {
    const pend = upcoming(ctx).find((x) => x.status === 'pending_deposit');
    if (pend) {
      act({ type: 'deposit_proof', apptId: pend.id });
      say(`Gracias${name ? `, ${name}` : ''}. Recibí su constancia. Recepción la valida y le confirmo ${W.la} ${W.cita} por aquí.`);
    } else {
      act({ type: 'attention', reason: 'El paciente envió un archivo' });
      say(`Recibí su archivo. Lo reviso con recepción y le respondemos por aquí.`);
    }
    return out;
  }
  if (msg.type === 'audio') {
    act({ type: 'attention', reason: 'El paciente envió un audio' });
    say(buttons(`Por ahora no puedo escuchar audios. ¿Me lo puede escribir en un mensaje? Si prefiere, le paso con recepción.`, [{ id: 'menu:human', title: 'Hablar con recepción' }]));
    return out;
  }
  if (msg.type !== 'text' && !id) {
    say(`Recibí su mensaje. ¿En qué le puedo ayudar? Puedo agendar, confirmar o cambiar su ${W.cita}.`);
    return out;
  }

  // ---------- Pasos en curso ----------
  const t = body;
  if (S.step === 'pick') {
    const i = pickFromText(t);
    if (i != null) { chooseSlot(i); return out; }
    if (hit.deny) { S.step = 'when'; say(`Sin problema. ¿Qué otro día u horario le acomoda?`); return out; }
    const p = parseWhen(t, nowMs, clinic.tz);
    if (p && !hit.cancel && !hit.price) { offer(p); return out; }
  }
  if (S.step === 'waitlist_ask' && /^(si|claro|ok|dale)\b/.test(norm(t))) hit.confirm = true;
  if (S.step === 'when') {
    const svc = matchService(t, clinic.services);
    if (svc) S.serviceId = svc.id;
    const p = parseWhen(t, nowMs, clinic.tz);
    if (p) { offer(p); return out; }
    if (/^(cualquier|cuando sea|me da igual|el que tenga|lo que tenga)/.test(norm(t))) { offer({ asap: true }); return out; }
  }
  if (S.step === 'service') {
    const n = norm(t).match(/^(\d{1,2})$/);
    const svc = n ? (clinic.services || [])[+n[1] - 1] : matchService(t, clinic.services);
    if (svc) {
      S.serviceId = svc.id;
      const p = parseWhen(t, nowMs, clinic.tz) || S.pref;
      if (p) offer(p); else askWhen();
      return out;
    }
    const p = parseWhen(t, nowMs, clinic.tz);
    if (p && !hit.cancel && !hit.human) {
      S.pref = p;
      const svcs = clinic.services || [];
      say(list(`Anotado. ¿Y para qué servicio sería?`, 'Ver servicios', svcs.map((s) => ({ id: 'svc:' + s.id, title: s.name, description: `${priceText(clinic, s)} · ${s.duration} min` }))));
      return out;
    }
  }
  if (S.step === 'name') {
    if (looksLikeName(t)) {
      const nm = titleCase(cleanName(t));
      book(S.chosen, nm);
      return out;
    }
    if (!Object.keys(hit).length) { say(`Para registrar ${W.la} ${W.cita} necesito el nombre y apellido del paciente.`); return out; }
  }
  if (S.step === 'cancel_confirm') {
    if (hit.confirm || /^(si|si cancelar|cancelar|cancela|si por favor)$/.test(norm(t))) {
      const appt = (ctx.appointments || []).find((x) => x.id === S.apptId);
      act({ type: 'cancel', apptId: S.apptId });
      say(`Listo, cancelé ${W.la} ${W.cita}${appt ? ` del ${whenLabel(appt.start, clinic.tz, nowMs)}` : ''}. Cuando quiera volver a agendar, solo escríbame.`);
      reset(); return out;
    }
    if (hit.reschedule || parseWhen(t, nowMs, clinic.tz)) { startResched(t, S.apptId); return out; }
    if (hit.deny) { say(`Perfecto, ${W.la} ${W.cita} se mantiene. Le esperamos.`); reset(); return out; }
  }
  if (S.step === 'offer_book') {
    if (hit.confirm || hit.book || /^(si|claro|ya|ok|dale)\b/.test(norm(t)) || parseWhen(t, nowMs, clinic.tz)) { const sv = S.serviceId ? svcById(clinic, S.serviceId) : null; startBooking(t, { service: matchService(t, clinic.services) || sv }); return out; }
    if (hit.deny) { say(`Entendido. Si necesita algo más, aquí estoy.`); reset(); return out; }
  }
  if (S.step === 'waitlist_ask') {
    if (hit.confirm) { act({ type: 'waitlist', serviceId: S.serviceId, pref: S.pref || null }); say(`Listo, le anoté en la lista de espera. Le escribo apenas se libere un espacio.`); reset(); return out; }
    if (hit.deny) { say(`Entendido. Si cambia de idea, escríbame.`); reset(); return out; }
  }

  // ---------- Intenciones generales ----------
  const svcMention = matchService(t, clinic.services);
  const when = parseWhen(t, nowMs, clinic.tz);
  const faq = matchFaq(t, clinic.faqs);
  if (hit.question) delete hit.book;
  const onlySocial = Object.keys(hit).length > 0 && Object.keys(hit).every((k) => ['greeting', 'thanks', 'menu', 'confirm', 'deny', 'question'].includes(k));
  const explicitBook = / (quiero|quisiera|necesito|agendar|reservar|separar|sacar|pedir|programar|hay (cita|turno|hora|espacio|cupo)|tienen (cita|turno|hora|espacio|cupo)) /.test(' ' + norm(t) + ' ');
  if (intro && !onlySocial) say(introLine + privacy);

  const svcBeyondQuestion = hit.question ? matchService(norm(t).replace(/(una|tengo una|hacer una|le hago una|tengo una pequena) (consulta|pregunta|duda)( por favor)?\s*$/, ''), clinic.services) : svcMention;
  if (hit.question && !svcBeyondQuestion && !when && !hit.price && !hit.hours && !hit.location) {
    say(buttons(`Claro${name ? `, ${name}` : ''}, dígame su consulta. También puedo agendar, confirmar o cambiar su ${W.cita}.`, mainButtons()));
    return out;
  }
  if (hit.human || hit.complaint) { handoff(hit.complaint ? 'Reclamo o queja' : 'El paciente pidió hablar con una persona'); return out; }
  if (hit.paid) { say(`Perfecto. Envíeme por aquí la captura de la operación para que recepción la valide.`); return out; }
  if (hit.cancel) { startCancel(null); return out; }
  if (hit.reschedule) { startResched(t, null); return out; }
  if (hit.myAppt && !/ (quiero|quisiera|necesito|agendar|reservar|separar|sacar|otra|nueva) /.test(' ' + norm(t) + ' ')) {
    const ups = upcoming(ctx);
    if (ups.length) say(`${ups.length === 1 ? `${W.Cita} programad${W.la === 'la' ? 'a' : 'o'}` : `${cap(W.citas)} programad${W.la === 'la' ? 'as' : 'os'}`}:\n\n${ups.slice(0, 3).map((a) => apptLine(clinic, a, nowMs) + (a.status === 'pending_deposit' ? ' (pendiente de adelanto)' : a.status === 'confirmed' ? ' (confirmada)' : '')).join('\n')}`);
    else say(buttons(`No tiene ${W.citas} próxim${W.la === 'la' ? 'as' : 'os'} con este número. ¿Desea agendar?`, [{ id: 'menu:book', title: `Agendar ${W.cita}` }]));
    return out;
  }
  if (hit.confirm && !hit.book && !svcMention) {
    const next = upcoming(ctx).find((a) => a.status === 'booked' && a.start - nowMs < 3 * 86400000);
    if (next) {
      act({ type: 'confirm', apptId: next.id });
      say(`Gracias${name ? `, ${name}` : ''}. ${W.La} ${W.cita} queda ${W.confirmada}. Le esperamos ${atLabel(next.start, clinic.tz, nowMs)}.`);
      return out;
    }
  }
  if (hit.price && !hit.book) { prices(svcMention); return out; }
  const infoAsk = hit.hours || hit.location || hit.payment || hit.insurance || hit.parking;
  if ((hit.book && (!infoAsk || explicitBook)) || (!infoAsk && svcMention && (when || !hit.price)) || (when && !infoAsk && !onlySocial)) {
    if (hit.price && svcMention) say(`${svcMention.name}: ${priceText(clinic, svcMention)}.`);
    startBooking(t);
    return out;
  }
  if (faq) { say(faq.a); return out; }
  if (hit.hours || hit.location || hit.payment || hit.insurance || hit.parking) {
    if (hit.hours) info('hours');
    if (hit.location) info('location');
    if (hit.payment) info('payment');
    if (hit.insurance) info('insurance');
    if (hit.parking) info('parking');
    return out;
  }
  if (hit.greeting || hit.menu || (intro && onlySocial)) {
    say(buttons(`${introLine} Puedo agendar, confirmar o cambiar su ${W.cita} a cualquier hora.${privacy}\n\n¿En qué le ayudo?`, mainButtons()));
    S.unknown = 0;
    return out;
  }
  if (hit.thanks || hit.bye) {
    const next = upcoming(ctx)[0];
    say(`Con gusto${name ? `, ${name}` : ''}.${next ? ` Le esperamos ${atLabel(next.start, clinic.tz, nowMs)}.` : ''} Que tenga un buen día.`);
    return out;
  }
  if (hit.confirm || hit.deny) {
    say(buttons(`¿En qué más le puedo ayudar?`, mainButtons()));
    return out;
  }

  // ---------- No entendido ----------
  S.unknown = (S.unknown || 0) + 1;
  out.fallback = true;
  if (S.unknown >= 2) { S.unknown = 0; handoff('El asistente no entendió la consulta'); return out; }
  say(buttons(`Disculpe, no logré entenderle. Puedo ayudarle a agendar, ver precios y horarios, o pasarle con recepción.`, mainButtons()));
  return out;
}
