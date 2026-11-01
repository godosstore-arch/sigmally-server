// API JSON del panel. Todas las rutas (excepto login) requieren sesión.
import { readJson, json, cookies, clientIp } from './http.js';
import { hashPassword, verifyPassword, token, sha256 } from './crypto.js';
import { processInbound, staffUpdateAppointment, staffCreateAppointment, systemMessage } from '../shared/pipeline.js';
import { computeMetrics } from '../shared/metrics.js';
import { makeClinic, slugify } from '../shared/clinic.js';
import { findSlots, ACTIVE } from '../shared/slots.js';
import { local, toUtc, addDays } from '../shared/time.js';
import { normalizePhone } from '../shared/countries.js';
import { seedDemo } from '../shared/demo-data.js';
import { sendWhatsApp, canSend } from './whatsapp.js';

const DAY = 86400000;
const SESSION_DAYS = 14;
const COOKIE = 'asiste_s';

export function createApi({ store, now = () => Date.now(), deliver }) {
  const routes = [];
  const on = (method, pattern, fn, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, opts });

  function session(req) {
    const t = cookies(req)[COOKIE];
    if (!t) return null;
    const s = store.st('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(t));
    if (!s || s.expires < now()) return null;
    const u = store.st('SELECT id, email, name, role, clinic_id FROM users WHERE id = ?').get(s.user_id);
    if (!u) return null;
    const clinicId = u.role === 'owner' ? s.clinic_id : u.clinic_id;
    return { user: u, clinicId, tokenHash: s.token_hash };
  }

  function clinicOf(ctx) {
    if (!ctx.clinicId) throw Object.assign(new Error('Elija una clínica'), { status: 409 });
    const c = store.clinic(ctx.clinicId);
    if (!c) throw Object.assign(new Error('Clínica no encontrada'), { status: 404 });
    return c;
  }

  const publicClinic = (c) => { const { waToken, ...rest } = c; return { ...rest, waConnected: !!(c.waPhoneId && waToken) }; };
  const audit = (ctx, action, detail) => store.audit(ctx.clinicId, ctx.user.id, action, detail, now());

  function patientView(p) {
    return p ? { id: p.id, name: p.name || p.waName || null, phone: p.phone, optedOut: !!p.optedOut, notes: p.notes || '' } : null;
  }

  function apptView(clinic, a, pmap) {
    const s = (clinic.services || []).find((x) => x.id === a.serviceId);
    const st = (clinic.staff || []).find((x) => x.id === a.staffId);
    const p = pmap ? pmap.get(a.patientId) : store.patient(a.patientId);
    return { ...a, serviceName: s?.name || a.serviceId, price: s?.price ?? null, staffName: st?.name || null, patient: patientView(p) };
  }

  // ---------- Autenticación ----------
  on('POST', '/api/login', async (req, res) => {
    const { email, password } = await readJson(req);
    const key = clientIp(req) + '|' + String(email || '').toLowerCase();
    const att = store.st('SELECT * FROM login_attempts WHERE key = ?').get(key);
    if (att && att.count >= 8 && now() - att.first_at < 15 * 60000) return json(res, 429, { error: 'Demasiados intentos. Espere 15 minutos.' });
    const u = store.st('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
    if (!u || !verifyPassword(password, u.pass)) {
      if (!att || now() - att.first_at > 15 * 60000) store.st('INSERT OR REPLACE INTO login_attempts (key, count, first_at) VALUES (?, 1, ?)').run(key, now());
      else store.st('UPDATE login_attempts SET count = count + 1 WHERE key = ?').run(key);
      return json(res, 401, { error: 'Correo o contraseña incorrectos' });
    }
    store.st('DELETE FROM login_attempts WHERE key = ?').run(key);
    const t = token();
    const firstClinic = u.role === 'owner' ? store.st('SELECT id FROM clinics ORDER BY id LIMIT 1').get()?.id ?? null : u.clinic_id;
    store.st('INSERT INTO sessions (token_hash, user_id, clinic_id, expires) VALUES (?,?,?,?)').run(sha256(t), u.id, firstClinic, now() + SESSION_DAYS * DAY);
    store.st('UPDATE users SET last_login = ? WHERE id = ?').run(now(), u.id);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
    store.audit(firstClinic, u.id, 'login', null, now());
    json(res, 200, { ok: true });
  }, { public: true });

  on('POST', '/api/logout', async (req, res, ctx) => {
    store.st('DELETE FROM sessions WHERE token_hash = ?').run(ctx.tokenHash);
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    json(res, 200, { ok: true });
  });

  on('GET', '/api/me', async (req, res, ctx) => {
    const clinic = ctx.clinicId ? store.clinic(ctx.clinicId) : null;
    json(res, 200, { user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: ctx.user.role }, clinic: clinic ? publicClinic(clinic) : null, mode: 'live' });
  });

  on('POST', '/api/password', async (req, res, ctx) => {
    const { current, next } = await readJson(req);
    const u = store.st('SELECT * FROM users WHERE id = ?').get(ctx.user.id);
    if (!verifyPassword(current, u.pass)) return json(res, 400, { error: 'La contraseña actual no coincide' });
    if (String(next || '').length < 10) return json(res, 400, { error: 'Use al menos 10 caracteres' });
    store.st('UPDATE users SET pass = ? WHERE id = ?').run(hashPassword(next), u.id);
    store.st('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(u.id, ctx.tokenHash);
    json(res, 200, { ok: true });
  });

  // ---------- Hoy y métricas ----------
  on('GET', '/api/today', async (req, res, ctx) => {
    const clinic = clinicOf(ctx);
    const t = now();
    const today = local(t, clinic.tz).dateKey;
    const from = toUtc(today, 0, clinic.tz), to = toUtc(addDays(today, 1), 0, clinic.tz);
    const pmap = new Map(store.listPatients(clinic.id).map((p) => [p.id, p]));
    const todays = store.listAppointments(clinic.id, from, to).filter((a) => a.status !== 'cancelled').map((a) => apptView(clinic, a, pmap));
    const appts = store.listAppointments(clinic.id, t - 45 * DAY, t + 3 * DAY);
    const messages = store.messagesSince(clinic.id, t - 30 * DAY);
    const metrics = computeMetrics({ clinic, appointments: appts, messages, waitlist: [], nowMs: t });
    const attention = store.listConversations(clinic.id).filter((c) => c.attention).slice(0, 8).map((c) => ({ id: c.id, reason: c.reason, urgent: !!c.urgent, lastAt: c.lastAt, patient: patientView(pmap.get(c.patientId)) }));
    const deposits = appts.filter((a) => a.status === 'pending_deposit' && a.end > t).map((a) => apptView(clinic, a, pmap));
    json(res, 200, { now: t, today, appointments: todays, metrics, attention, deposits });
  });

  // ---------- Agenda ----------
  on('GET', '/api/appointments', async (req, res, ctx, url) => {
    const clinic = clinicOf(ctx);
    const from = +url.searchParams.get('from') || now() - DAY;
    const to = +url.searchParams.get('to') || now() + 7 * DAY;
    if (to - from > 62 * DAY) return json(res, 400, { error: 'Rango demasiado grande' });
    const pmap = new Map(store.listPatients(clinic.id).map((p) => [p.id, p]));
    json(res, 200, store.listAppointments(clinic.id, from, to).map((a) => apptView(clinic, a, pmap)));
  });

  on('GET', '/api/slots', async (req, res, ctx, url) => {
    const clinic = clinicOf(ctx);
    const service = (clinic.services || []).find((s) => s.id === url.searchParams.get('serviceId')) || clinic.services[0];
    const day = url.searchParams.get('day');
    const appts = store.listAppointments(clinic.id, now() - DAY, now() + 40 * DAY);
    const slots = findSlots({ clinic, appointments: appts, service, pref: day ? { days: [day] } : null, nowMs: now(), limit: 40, staffId: url.searchParams.get('staffId') || null });
    json(res, 200, slots);
  });

  on('POST', '/api/appointments', async (req, res, ctx) => {
    const clinic = clinicOf(ctx);
    const b = await readJson(req);
    const phone = normalizePhone(b.phone, clinic.country);
    if (!b.patientId && phone.length < 8) return json(res, 400, { error: 'Teléfono no válido' });
    const appt = staffCreateAppointment({ store, clinic, input: { ...b, phone }, nowMs: now() });
    audit(ctx, 'cita_creada', `${appt.id}`);
    json(res, 200, apptView(clinic, appt));
  });

  on('PATCH', '/api/appointments/:id', async (req, res, ctx, url, params) => {
    const clinic = clinicOf(ctx);
    const b = await readJson(req);
    const allowed = {};
    for (const k of ['status', 'start', 'staffId', 'depositStatus', 'notes', 'serviceId']) if (k in b) allowed[k] = b[k];
    if (allowed.status && !['booked', 'confirmed', 'cancelled', 'completed', 'no_show', 'pending_deposit'].includes(allowed.status)) return json(res, 400, { error: 'Estado no válido' });
    if (allowed.status === 'cancelled') allowed.cancelledBy = 'staff';
    const r = staffUpdateAppointment({ store, clinic, id: +params.id, patch: allowed, nowMs: now() });
    audit(ctx, 'cita_actualizada', `${params.id} ${JSON.stringify(allowed)}`);
    await deliver(clinic, r.outbound);
    json(res, 200, apptView(clinic, r.appt));
  });

  // ---------- Conversaciones ----------
  on('GET', '/api/conversations', async (req, res, ctx) => {
    const clinic = clinicOf(ctx);
    const pmap = new Map(store.listPatients(clinic.id).map((p) => [p.id, p]));
    const list = store.listConversations(clinic.id, 150).map((c) => {
      const last = store.lastMessage(c.id);
      return { id: c.id, patient: patientView(pmap.get(c.patientId)), attention: !!c.attention, urgent: !!c.urgent, reason: c.reason, human: !!c.human, unread: c.unread, lastAt: c.lastAt, last: last ? { body: last.body, direction: last.direction, author: last.author } : null };
    });
    json(res, 200, list);
  });

  on('GET', '/api/conversations/:id', async (req, res, ctx, url, params) => {
    const clinic = clinicOf(ctx);
    const c = store.conversation(+params.id);
    if (!c || c.clinicId !== clinic.id) return json(res, 404, { error: 'No encontrada' });
    store.updateConversation(c.id, { unread: 0 });
    const p = store.patient(c.patientId);
    const upcoming = store.patientAppointments(p.id).filter((a) => ACTIVE.has(a.status) && a.end > now()).map((a) => apptView(clinic, a));
    const history = store.patientAppointments(p.id).filter((a) => a.end <= now()).slice(0, 10).map((a) => apptView(clinic, a));
    json(res, 200, { conversation: { id: c.id, attention: !!c.attention, urgent: !!c.urgent, reason: c.reason, human: !!c.human, lastInboundAt: c.lastInboundAt }, patient: patientView(p), messages: store.listMessages(c.id), upcoming, history, windowOpen: !!c.lastInboundAt && now() - c.lastInboundAt < DAY });
  });

  on('POST', '/api/conversations/:id/reply', async (req, res, ctx, url, params) => {
    const clinic = clinicOf(ctx);
    const { text: body } = await readJson(req);
    const c = store.conversation(+params.id);
    if (!c || c.clinicId !== clinic.id) return json(res, 404, { error: 'No encontrada' });
    if (!String(body || '').trim()) return json(res, 400, { error: 'Mensaje vacío' });
    const p = store.patient(c.patientId);
    const windowOpen = !!c.lastInboundAt && now() - c.lastInboundAt < DAY;
    if (!windowOpen && canSend(clinic)) return json(res, 409, { error: 'Pasaron más de 24 h desde el último mensaje del paciente. WhatsApp solo permite plantillas aprobadas; use un recordatorio o llame al paciente.' });
    const msg = store.addMessage({ clinicId: clinic.id, conversationId: c.id, direction: 'out', author: 'staff', kind: 'text', body: String(body).slice(0, 4000), at: now() });
    // Si recepción escribe, el asistente se pausa en esta conversación.
    store.updateConversation(c.id, { human: now(), attention: 0, urgent: 0, lastAt: now(), state: { ...c.state, human: now() } });
    audit(ctx, 'respuesta_manual', `${c.id}`);
    try {
      const r = await sendWhatsApp(clinic, p.phone, { type: 'text', text: String(body) }, { windowOpen: true });
      if (r?.id) store.setMessageWaId(msg.id, r.id);
    } catch (e) { return json(res, 502, { error: 'No se pudo enviar por WhatsApp: ' + e.message }); }
    json(res, 200, { ok: true });
  });

  on('POST', '/api/conversations/:id/release', async (req, res, ctx, url, params) => {
    const clinic = clinicOf(ctx);
    const c = store.conversation(+params.id);
    if (!c || c.clinicId !== clinic.id) return json(res, 404, { error: 'No encontrada' });
    store.updateConversation(c.id, { human: null, attention: 0, urgent: 0, reason: null, state: { ...c.state, human: null, step: null, unknown: 0 } });
    audit(ctx, 'asistente_reactivado', `${c.id}`);
    json(res, 200, { ok: true });
  });

  on('POST', '/api/conversations/:id/takeover', async (req, res, ctx, url, params) => {
    const clinic = clinicOf(ctx);
    const c = store.conversation(+params.id);
    if (!c || c.clinicId !== clinic.id) return json(res, 404, { error: 'No encontrada' });
    store.updateConversation(c.id, { human: now(), state: { ...c.state, human: now() } });
    json(res, 200, { ok: true });
  });

  // ---------- Pacientes ----------
  on('GET', '/api/patients', async (req, res, ctx, url) => {
    const clinic = clinicOf(ctx);
    const q = String(url.searchParams.get('q') || '').toLowerCase();
    const appts = store.listAppointments(clinic.id, now() - 400 * DAY, now() + 60 * DAY);
    const byP = new Map();
    for (const a of appts) { if (!byP.has(a.patientId)) byP.set(a.patientId, []); byP.get(a.patientId).push(a); }
    const svc = Object.fromEntries((clinic.services || []).map((s) => [s.id, s]));
    let list = store.listPatients(clinic.id).map((p) => {
      const mine = byP.get(p.id) || [];
      const last = mine.filter((a) => a.status === 'completed').sort((a, b) => b.start - a.start)[0];
      const next = mine.filter((a) => ACTIVE.has(a.status) && a.start > now()).sort((a, b) => a.start - b.start)[0];
      const due = last && svc[last.serviceId]?.recallMonths ? last.start + svc[last.serviceId].recallMonths * 30 * DAY : null;
      return { ...patientView(p), visits: mine.filter((a) => a.status === 'completed').length, noShows: mine.filter((a) => a.status === 'no_show').length, lastVisit: last?.start || null, lastService: last ? svc[last.serviceId]?.name : null, next: next?.start || null, recallDue: due && !next && due < now() + 15 * DAY ? due : null };
    });
    if (q) list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || p.phone.includes(q.replace(/\D/g, '') || '~'));
    list.sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0));
    json(res, 200, list.slice(0, 500));
  });

  on('PATCH', '/api/patients/:id', async (req, res, ctx, url, params) => {
    const clinic = clinicOf(ctx);
    const p = store.patient(+params.id);
    if (!p || p.clinicId !== clinic.id) return json(res, 404, { error: 'No encontrado' });
    const b = await readJson(req);
    const patch = {};
    if ('name' in b) patch.name = String(b.name || '').slice(0, 80);
    if ('notes' in b) patch.notes = String(b.notes || '').slice(0, 2000);
    if ('optedOut' in b) patch.optedOut = b.optedOut ? 1 : 0;
    store.updatePatient(p.id, patch);
    audit(ctx, 'paciente_actualizado', `${p.id}`);
    json(res, 200, patientView(store.patient(p.id)));
  });

  on('GET', '/api/waitlist', async (req, res, ctx) => {
    const clinic = clinicOf(ctx);
    json(res, 200, store.listWaitlist(clinic.id).map((w) => ({ ...w, patient: patientView(store.patient(w.patientId)), serviceName: (clinic.services || []).find((s) => s.id === w.serviceId)?.name || '' })));
  });

  // ---------- Configuración ----------
  on('PUT', '/api/clinic', async (req, res, ctx) => {
    const clinic = clinicOf(ctx);
    if (ctx.user.role === 'staff') return json(res, 403, { error: 'Solo el administrador de la clínica puede cambiar la configuración' });
    const b = await readJson(req);
    const keep = ['id', 'slug', 'waPhoneId', 'waToken', 'waDisplay', 'active', 'plan', 'createdAt', 'waConnected'];
    const next = { ...clinic };
    for (const [k, v] of Object.entries(b)) if (!keep.includes(k)) next[k] = v;
    if (!Array.isArray(next.services) || !next.services.length) return json(res, 400, { error: 'Debe haber al menos un servicio' });
    for (const s of next.services) {
      if (!s.id) s.id = slugify(s.name) || 's' + Math.random().toString(36).slice(2, 6);
      s.duration = Math.max(5, Math.min(480, +s.duration || 30));
      s.price = s.price === '' || s.price == null ? null : +s.price;
    }
    const cfg = Object.fromEntries(Object.entries(next).filter(([k]) => !keep.includes(k)));
    store.saveClinicConfig(clinic.id, { ...cfg, slug: clinic.slug });
    audit(ctx, 'configuracion', Object.keys(b).join(','));
    json(res, 200, publicClinic(store.clinic(clinic.id)));
  });

  // ---------- Simulador (probar como paciente, sin enviar por WhatsApp) ----------
  on('POST', '/api/simulate', async (req, res, ctx) => {
    const clinic = clinicOf(ctx);
    const b = await readJson(req);
    const phone = 'sim' + ctx.user.id + (b.session || '');
    const msg = b.id ? { type: 'button', id: b.id, title: b.title || b.id, text: b.title || '' } : { type: b.type || 'text', text: String(b.text || '').slice(0, 1000) };
    const r = processInbound({ store, clinic, phone, profileName: 'Prueba', msg, nowMs: now() });
    json(res, 200, { replies: r.replies, events: r.events.map((e) => e.type) });
  });

  on('POST', '/api/simulate/reset', async (req, res, ctx) => {
    const clinic = clinicOf(ctx);
    const b = await readJson(req);
    const p = store.patientByPhone(clinic.id, 'sim' + ctx.user.id + (b.session || ''));
    if (p) {
      store.transaction(() => {
        for (const a of store.patientAppointments(p.id)) if (ACTIVE.has(a.status)) store.updateAppointment(a.id, { status: 'cancelled', cancelledBy: 'simulator' });
        const c = store.conversationFor(clinic.id, p.id);
        if (c) { store.st('DELETE FROM messages WHERE conversation_id = ?').run(c.id); store.updateConversation(c.id, { state: {}, attention: 0, human: null, urgent: 0 }); }
        store.updatePatient(p.id, { name: null });
      });
    }
    json(res, 200, { ok: true });
  });

  // ---------- Dueño de la cuenta (usted): clínicas, accesos y WhatsApp ----------
  const ownerOnly = (ctx) => { if (ctx.user.role !== 'owner') throw Object.assign(new Error('Solo el dueño de la cuenta'), { status: 403 }); };

  on('GET', '/api/admin/clinics', async (req, res, ctx) => {
    ownerOnly(ctx);
    const t = now();
    json(res, 200, store.clinics().map((c) => {
      const appts = store.listAppointments(c.id, t - 30 * DAY, t + 30 * DAY);
      return { id: c.id, name: c.name, slug: c.slug, country: c.country, city: c.city, specialty: c.specialty, active: c.active, waConnected: !!(c.waPhoneId && c.waToken), waDisplay: c.waDisplay, waPhoneId: c.waPhoneId, bookedByBot30: appts.filter((a) => a.source === 'assistant' && a.createdAt > t - 30 * DAY).length, users: store.st('SELECT id, email, name, role FROM users WHERE clinic_id = ?').all(c.id) };
    }));
  });

  on('POST', '/api/admin/clinics', async (req, res, ctx) => {
    ownerOnly(ctx);
    const b = await readJson(req);
    if (!String(b.name || '').trim()) return json(res, 400, { error: 'Ponga el nombre de la clínica' });
    const cfg = makeClinic({ name: String(b.name).trim(), countryCode: b.country || 'PE', specialtyKey: b.specialty || 'dental', city: b.city || '', address: b.address || '' });
    let slug = cfg.slug, i = 2;
    while (store.clinicBySlug(slug)) slug = `${cfg.slug}-${i++}`;
    const clinic = store.createClinic({ ...cfg, slug }, now());
    if (b.demo) seedDemo(store, clinic, now());
    store.st('UPDATE sessions SET clinic_id = ? WHERE token_hash = ?').run(clinic.id, ctx.tokenHash);
    store.audit(clinic.id, ctx.user.id, 'clinica_creada', clinic.name, now());
    json(res, 200, { id: clinic.id });
  });

  on('POST', '/api/admin/use-clinic', async (req, res, ctx) => {
    ownerOnly(ctx);
    const { id } = await readJson(req);
    if (!store.clinic(+id)) return json(res, 404, { error: 'No existe' });
    store.st('UPDATE sessions SET clinic_id = ? WHERE token_hash = ?').run(+id, ctx.tokenHash);
    json(res, 200, { ok: true });
  });

  on('PATCH', '/api/admin/clinics/:id', async (req, res, ctx, url, params) => {
    ownerOnly(ctx);
    const c = store.clinic(+params.id);
    if (!c) return json(res, 404, { error: 'No existe' });
    const b = await readJson(req);
    if ('waPhoneId' in b || 'waToken' in b) {
      const pid = String(b.waPhoneId ?? c.waPhoneId ?? '').trim() || null;
      if (pid && !/^\d{6,20}$/.test(pid)) return json(res, 400, { error: 'El Phone Number ID son solo números (lo ve en Meta > WhatsApp > Configuración de la API)' });
      const other = pid ? store.clinicByPhoneId(pid) : null;
      if (other && other.id !== c.id) return json(res, 400, { error: 'Ese número ya está conectado a otra clínica' });
      store.setClinicWhatsApp(c.id, { phoneId: pid, token: b.waToken ? String(b.waToken).trim() : c.waToken, display: b.waDisplay ?? c.waDisplay });
    }
    if ('active' in b) store.setClinicActive(c.id, !!b.active);
    store.audit(c.id, ctx.user.id, 'clinica_admin', Object.keys(b).filter((k) => k !== 'waToken').join(','), now());
    json(res, 200, { ok: true });
  });

  on('POST', '/api/admin/clinics/:id/users', async (req, res, ctx, url, params) => {
    ownerOnly(ctx);
    const c = store.clinic(+params.id);
    if (!c) return json(res, 404, { error: 'No existe' });
    const b = await readJson(req);
    const email = String(b.email || '').toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'Correo no válido' });
    if (store.st('SELECT id FROM users WHERE email = ?').get(email)) return json(res, 400, { error: 'Ese correo ya tiene acceso' });
    const pw = b.password && String(b.password).length >= 10 ? String(b.password) : token(9);
    store.st('INSERT INTO users (email, name, pass, role, clinic_id, created_at) VALUES (?,?,?,?,?,?)').run(email, b.name || null, hashPassword(pw), b.role === 'admin' ? 'admin' : 'staff', c.id, now());
    store.audit(c.id, ctx.user.id, 'usuario_creado', email, now());
    json(res, 200, { email, password: pw });
  });

  async function handle(req, res, url) {
    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) return json(res, 404, { error: 'Ruta no encontrada' });
    if (req.method !== 'GET' && req.headers['x-asiste'] !== '1') return json(res, 403, { error: 'Solicitud no permitida' });
    let ctx = null;
    if (!route.opts.public) {
      ctx = session(req);
      if (!ctx) return json(res, 401, { error: 'Sesión vencida. Ingrese de nuevo.' });
    }
    const params = url.pathname.match(route.re).groups || {};
    try {
      await route.fn(req, res, ctx, url, params);
    } catch (e) {
      const status = e.status || (/ocupado|no válido|no encontrad/i.test(e.message) ? 400 : 500);
      if (status === 500) console.error('[asiste] Error en', req.method, url.pathname, e);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'Error interno. Intente de nuevo.' : e.message });
    }
  }

  return { handle, systemMessage };
}
