// API de demostración: corre el MISMO motor que el servidor, en el navegador, con datos de ejemplo.
// Se personaliza por URL: ?clinica=Nombre&ciudad=Piura&tipo=dental&pais=PE
import { makeClinic } from '../shared/clinic.js';
import { createMemoryStore } from '../shared/memstore.js';
import { seedDemo } from '../shared/demo-data.js';
import { processInbound, staffUpdateAppointment, staffCreateAppointment, runAutomations } from '../shared/pipeline.js';
import { computeMetrics } from '../shared/metrics.js';
import { findSlots, ACTIVE } from '../shared/slots.js';
import { local, toUtc, addDays } from '../shared/time.js';
import { SPECIALTIES } from '../shared/specialties.js';
import { COUNTRIES, normalizePhone } from '../shared/countries.js';

const DAY = 86400000;

export function createDemoApi(params) {
  const tipo = SPECIALTIES[params.get('tipo')] ? params.get('tipo') : 'dental';
  const pais = COUNTRIES[(params.get('pais') || 'PE').toUpperCase()] ? (params.get('pais') || 'PE').toUpperCase() : 'PE';
  const name = (params.get('clinica') || '').trim().slice(0, 60) || SPECIALTIES[tipo].sample;
  const city = (params.get('ciudad') || '').trim().slice(0, 40);
  const cfg = makeClinic({ name, countryCode: pais, specialtyKey: tipo, city });
  if (pais === 'PE') cfg.deposit = { enabled: true, amount: tipo === 'estetica' ? 50 : 30, methods: `Yape o Plin al 987 654 321 (${name})`, holdMinutes: 24 * 60, services: [] };
  cfg.mapsUrl = 'https://maps.app.goo.gl/ejemplo';
  cfg.privacyUrl = '';
  const clinic = { id: 1, ...cfg, waConnected: false };
  const store = createMemoryStore();
  const t0 = Date.now();
  seedDemo(store, clinic, t0);
  // Unas cuantas automatizaciones ya ejecutadas, para que el panel se vea como un día real.
  runAutomations({ store, clinic: { ...clinic, recallEveryRun: false }, nowMs: t0 - 100 * 60000 });
  if (clinic.deposit) clinic.deposit.holdMinutes = 120;
  const now = () => Date.now();

  const patientView = (p) => (p ? { id: p.id, name: p.name || p.waName || null, phone: p.phone, optedOut: !!p.optedOut, notes: p.notes || '' } : null);
  function apptView(a) {
    const s = clinic.services.find((x) => x.id === a.serviceId);
    const st = clinic.staff.find((x) => x.id === a.staffId);
    return { ...a, serviceName: s?.name || a.serviceId, price: s?.price ?? null, staffName: st?.name || null, patient: patientView(store.patient(a.patientId)) };
  }
  const later = (x) => new Promise((r) => setTimeout(() => r(structuredClone(x)), 60));
  const fail = (msg) => Promise.reject(Object.assign(new Error(msg), { status: 400 }));

  return {
    mode: 'demo',
    clinic,
    login: () => later({ ok: true }),
    logout: () => later({ ok: true }),
    password: () => fail('No disponible en la demo'),
    me: () => later({ user: { id: 1, name: 'Recepción', email: 'demo', role: 'admin' }, clinic, mode: 'demo' }),
    today() {
      const t = now();
      const today = local(t, clinic.tz).dateKey;
      const from = toUtc(today, 0, clinic.tz), to = toUtc(addDays(today, 1), 0, clinic.tz);
      const appts = store.listAppointments(1, t - 45 * DAY, t + 3 * DAY);
      return later({
        now: t, today,
        appointments: store.listAppointments(1, from, to).filter((a) => a.status !== 'cancelled').sort((a, b) => a.start - b.start).map(apptView),
        metrics: computeMetrics({ clinic, appointments: appts, messages: store.db.messages, waitlist: store.db.waitlist, nowMs: t }),
        attention: store.listConversations(1).filter((c) => c.attention).slice(0, 8).map((c) => ({ id: c.id, reason: c.reason, urgent: !!c.urgent, lastAt: c.lastAt, patient: patientView(store.patient(c.patientId)) })),
        deposits: appts.filter((a) => a.status === 'pending_deposit' && a.end > t).map(apptView),
      });
    },
    appointments: (from, to) => later(store.listAppointments(1, from, to).sort((a, b) => a.start - b.start).map(apptView)),
    slots(serviceId, day, staffId) {
      const service = clinic.services.find((s) => s.id === serviceId) || clinic.services[0];
      return later(findSlots({ clinic, appointments: store.listAppointments(1, now() - DAY, now() + 40 * DAY), service, pref: day ? { days: [day] } : null, nowMs: now(), limit: 40, staffId: staffId || null }));
    },
    createAppointment(b) {
      try {
        const phone = normalizePhone(b.phone, clinic.country);
        return later(apptView(staffCreateAppointment({ store, clinic, input: { ...b, phone }, nowMs: now() })));
      } catch (e) { return fail(e.message); }
    },
    updateAppointment(id, patch) {
      try { return later(apptView(staffUpdateAppointment({ store, clinic, id, patch, nowMs: now() }).appt)); } catch (e) { return fail(e.message); }
    },
    conversations() {
      return later(store.listConversations(1).slice(0, 150).map((c) => {
        const ms = store.listMessages(c.id);
        const last = ms[ms.length - 1];
        return { id: c.id, patient: patientView(store.patient(c.patientId)), attention: !!c.attention, urgent: !!c.urgent, reason: c.reason, human: !!c.human, unread: c.unread, lastAt: c.lastAt, last: last ? { body: last.body, direction: last.direction, author: last.author } : null };
      }));
    },
    conversation(id) {
      const c = store.conversation(id);
      store.updateConversation(id, { unread: 0 });
      const p = store.patient(c.patientId);
      const mine = store.db.appointments.filter((a) => a.patientId === p.id).sort((a, b) => b.start - a.start);
      return later({
        conversation: { id: c.id, attention: !!c.attention, urgent: !!c.urgent, reason: c.reason, human: !!c.human, lastInboundAt: c.lastInboundAt },
        patient: patientView(p), messages: store.listMessages(c.id),
        upcoming: mine.filter((a) => ACTIVE.has(a.status) && a.end > now()).map(apptView),
        history: mine.filter((a) => a.end <= now()).slice(0, 10).map(apptView),
        windowOpen: true,
      });
    },
    reply(id, text) {
      const c = store.conversation(id);
      store.addMessage({ clinicId: 1, conversationId: id, direction: 'out', author: 'staff', kind: 'text', body: text, at: now() });
      store.updateConversation(id, { human: now(), attention: 0, urgent: 0, lastAt: now(), state: { ...c.state, human: now() } });
      return later({ ok: true });
    },
    release(id) {
      const c = store.conversation(id);
      store.updateConversation(id, { human: null, attention: 0, urgent: 0, reason: null, state: { ...c.state, human: null, step: null, unknown: 0 } });
      return later({ ok: true });
    },
    takeover(id) {
      const c = store.conversation(id);
      store.updateConversation(id, { human: now(), state: { ...c.state, human: now() } });
      return later({ ok: true });
    },
    patients(q = '') {
      const svc = Object.fromEntries(clinic.services.map((s) => [s.id, s]));
      let list = store.listPatients(1).filter((p) => !String(p.phone).startsWith('sim')).map((p) => {
        const mine = store.db.appointments.filter((a) => a.patientId === p.id);
        const last = mine.filter((a) => a.status === 'completed').sort((a, b) => b.start - a.start)[0];
        const next = mine.filter((a) => ACTIVE.has(a.status) && a.start > now()).sort((a, b) => a.start - b.start)[0];
        const due = last && svc[last.serviceId]?.recallMonths ? last.start + svc[last.serviceId].recallMonths * 30 * DAY : null;
        return { ...patientView(p), visits: mine.filter((a) => a.status === 'completed').length, noShows: mine.filter((a) => a.status === 'no_show').length, lastVisit: last?.start || null, lastService: last ? svc[last.serviceId]?.name : null, next: next?.start || null, recallDue: due && !next && due < now() + 15 * DAY ? due : null };
      });
      q = q.toLowerCase();
      if (q) list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || p.phone.includes(q.replace(/\D/g, '') || '~'));
      return later(list.sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0)));
    },
    updatePatient(id, b) { store.updatePatient(id, b); return later(patientView(store.patient(id))); },
    waitlist: () => later(store.listWaitlist(1).filter((w) => ['waiting', 'offered'].includes(w.status)).map((w) => ({ ...w, patient: patientView(store.patient(w.patientId)), serviceName: clinic.services.find((s) => s.id === w.serviceId)?.name || '' }))),
    saveClinic(cfg) { Object.assign(clinic, cfg); return later(clinic); },
    simulate(b) {
      const msg = b.id ? { type: 'button', id: b.id, title: b.title || b.id, text: b.title || '' } : { type: b.type || 'text', text: String(b.text || '') };
      const r = processInbound({ store, clinic, phone: 'sim1' + (b.session || ''), profileName: 'Prueba', msg, nowMs: now() });
      return later({ replies: r.replies, events: r.events.map((e) => e.type) });
    },
    simReset(b = {}) {
      const p = store.patientByPhone(1, 'sim1' + (b.session || ''));
      if (p) {
        for (const a of store.db.appointments) if (a.patientId === p.id && ACTIVE.has(a.status)) a.status = 'cancelled';
        const c = store.conversationFor(1, p.id);
        if (c) { store.db.messages = store.db.messages.filter((m) => m.conversationId !== c.id); store.updateConversation(c.id, { state: {}, attention: 0, human: null, urgent: 0 }); }
        store.updatePatient(p.id, { name: null });
      }
      return later({ ok: true });
    },
    admin: null,
  };
}
