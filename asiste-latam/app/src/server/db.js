// Base de datos SQLite (incluida en Node 22, sin instalar nada). Un archivo, copias de seguridad simples.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { enc, dec } from './crypto.js';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL,
  wa_phone_id TEXT UNIQUE, wa_token TEXT, wa_display TEXT, active INTEGER NOT NULL DEFAULT 1,
  plan TEXT DEFAULT 'clinica', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, pass TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','staff')), clinic_id INTEGER REFERENCES clinics(id),
  created_at INTEGER NOT NULL, last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id INTEGER, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY, clinic_id INTEGER NOT NULL REFERENCES clinics(id), phone TEXT NOT NULL, name TEXT, wa_name TEXT,
  opted_out INTEGER NOT NULL DEFAULT 0, notes TEXT, last_recall_at INTEGER, created_at INTEGER NOT NULL,
  UNIQUE (clinic_id, phone)
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY, clinic_id INTEGER NOT NULL, patient_id INTEGER NOT NULL REFERENCES patients(id),
  state TEXT, human INTEGER, attention INTEGER NOT NULL DEFAULT 0, urgent INTEGER NOT NULL DEFAULT 0, reason TEXT,
  unread INTEGER NOT NULL DEFAULT 0, last_at INTEGER, last_inbound_at INTEGER, created_at INTEGER NOT NULL,
  UNIQUE (clinic_id, patient_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, clinic_id INTEGER NOT NULL, conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  direction TEXT NOT NULL, author TEXT NOT NULL, kind TEXT, body TEXT, meta TEXT, at INTEGER NOT NULL,
  wa_id TEXT, status TEXT
);
CREATE INDEX IF NOT EXISTS messages_convo ON messages (conversation_id, at);
CREATE INDEX IF NOT EXISTS messages_clinic ON messages (clinic_id, at);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY, clinic_id INTEGER NOT NULL, patient_id INTEGER NOT NULL REFERENCES patients(id),
  service_id TEXT, staff_id TEXT, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, status TEXT NOT NULL,
  source TEXT, deposit_status TEXT, reminded_day_before INTEGER DEFAULT 0, reminded_same_day INTEGER DEFAULT 0,
  followed_up INTEGER DEFAULT 0, confirmed_at INTEGER, cancelled_by TEXT, rescheduled INTEGER DEFAULT 0,
  from_waitlist INTEGER DEFAULT 0, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS appts_clinic_time ON appointments (clinic_id, start_ms);
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY, clinic_id INTEGER NOT NULL, patient_id INTEGER NOT NULL, service_id TEXT, pref TEXT,
  status TEXT NOT NULL, offered_at INTEGER, offered_start INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, clinic_id INTEGER, user_id INTEGER, action TEXT NOT NULL, detail TEXT, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seen_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, first_at INTEGER NOT NULL);
`;

const APPT_COLS = {
  clinicId: 'clinic_id', patientId: 'patient_id', serviceId: 'service_id', staffId: 'staff_id', start: 'start_ms', end: 'end_ms',
  status: 'status', source: 'source', depositStatus: 'deposit_status', remindedDayBefore: 'reminded_day_before',
  remindedSameDay: 'reminded_same_day', followedUp: 'followed_up', confirmedAt: 'confirmed_at', cancelledBy: 'cancelled_by',
  rescheduled: 'rescheduled', fromWaitlist: 'from_waitlist', notes: 'notes', createdAt: 'created_at', updatedAt: 'updated_at',
};
const PAT_COLS = { clinicId: 'clinic_id', phone: 'phone', name: 'name', waName: 'wa_name', optedOut: 'opted_out', notes: 'notes', lastRecallAt: 'last_recall_at', createdAt: 'created_at' };
const CONV_COLS = { clinicId: 'clinic_id', patientId: 'patient_id', state: 'state', human: 'human', attention: 'attention', urgent: 'urgent', reason: 'reason', unread: 'unread', lastAt: 'last_at', lastInboundAt: 'last_inbound_at', createdAt: 'created_at' };
const WL_COLS = { clinicId: 'clinic_id', patientId: 'patient_id', serviceId: 'service_id', pref: 'pref', status: 'status', offeredAt: 'offered_at', offeredStart: 'offered_start', createdAt: 'created_at' };

function rowAppt(r) {
  if (!r) return null;
  return {
    id: r.id, clinicId: r.clinic_id, patientId: r.patient_id, serviceId: r.service_id, staffId: r.staff_id,
    start: r.start_ms, end: r.end_ms, status: r.status, source: r.source, depositStatus: r.deposit_status,
    remindedDayBefore: r.reminded_day_before, remindedSameDay: r.reminded_same_day, followedUp: r.followed_up,
    confirmedAt: r.confirmed_at, cancelledBy: r.cancelled_by, rescheduled: r.rescheduled, fromWaitlist: r.from_waitlist,
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function rowPatient(r) {
  if (!r) return null;
  return { id: r.id, clinicId: r.clinic_id, phone: r.phone, name: r.name, waName: r.wa_name, optedOut: r.opted_out, notes: dec(r.notes) || '', lastRecallAt: r.last_recall_at, createdAt: r.created_at };
}
function rowConvo(r) {
  if (!r) return null;
  return { id: r.id, clinicId: r.clinic_id, patientId: r.patient_id, state: r.state ? JSON.parse(r.state) : {}, human: r.human, attention: r.attention, urgent: r.urgent, reason: r.reason, unread: r.unread, lastAt: r.last_at, lastInboundAt: r.last_inbound_at, createdAt: r.created_at };
}
function rowMsg(r) {
  return { id: r.id, clinicId: r.clinic_id, conversationId: r.conversation_id, direction: r.direction, author: r.author, kind: r.kind, body: dec(r.body), meta: r.meta ? JSON.parse(r.meta) : null, at: r.at, waId: r.wa_id, status: r.status };
}
function rowWl(r) {
  return { id: r.id, clinicId: r.clinic_id, patientId: r.patient_id, serviceId: r.service_id, pref: r.pref ? JSON.parse(r.pref) : null, status: r.status, offeredAt: r.offered_at, offeredStart: r.offered_start, createdAt: r.created_at };
}

function toDb(map, obj, transform = {}) {
  const cols = [], vals = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!(k in map)) continue;
    cols.push(map[k]);
    let val = transform[k] ? transform[k](v) : v;
    if (typeof val === 'boolean') val = val ? 1 : 0;
    if (val === undefined) val = null;
    vals.push(val);
  }
  return { cols, vals };
}

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  let depth = 0;
  const q = new Map();
  const st = (sql) => { let s = q.get(sql); if (!s) { s = db.prepare(sql); q.set(sql, s); } return s; };

  function insert(table, map, obj, transform) {
    const { cols, vals } = toDb(map, obj, transform);
    const r = st(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    return Number(r.lastInsertRowid);
  }
  function update(table, map, id, patch, transform) {
    const { cols, vals } = toDb(map, patch, transform);
    if (!cols.length) return;
    st(`UPDATE ${table} SET ${cols.map((c) => c + ' = ?').join(', ')} WHERE id = ?`).run(...vals, id);
  }
  const convT = { state: (v) => JSON.stringify(v || {}) };
  const patT = { notes: (v) => enc(v || '') };
  const wlT = { pref: (v) => (v ? JSON.stringify(v) : null) };

  const store = {
    raw: db,
    st,
    transaction(fn) {
      if (depth > 0) { depth++; try { return fn(); } finally { depth--; } }
      depth = 1;
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { depth = 0; }
    },
    // Pacientes
    patientByPhone: (clinicId, phone) => rowPatient(st('SELECT * FROM patients WHERE clinic_id = ? AND phone = ?').get(clinicId, phone)),
    patient: (id) => rowPatient(st('SELECT * FROM patients WHERE id = ?').get(id)),
    createPatient: (p) => store.patient(insert('patients', PAT_COLS, { optedOut: 0, ...p }, patT)),
    updatePatient: (id, patch) => update('patients', PAT_COLS, id, patch, patT),
    listPatients: (clinicId) => st('SELECT * FROM patients WHERE clinic_id = ?').all(clinicId).map(rowPatient),
    // Conversaciones
    conversationFor: (clinicId, patientId) => rowConvo(st('SELECT * FROM conversations WHERE clinic_id = ? AND patient_id = ?').get(clinicId, patientId)),
    conversation: (id) => rowConvo(st('SELECT * FROM conversations WHERE id = ?').get(id)),
    createConversation: (c) => store.conversation(insert('conversations', CONV_COLS, { lastAt: c.createdAt, ...c }, convT)),
    updateConversation: (id, patch) => update('conversations', CONV_COLS, id, patch, convT),
    listConversations: (clinicId, limit = 200) => st('SELECT * FROM conversations WHERE clinic_id = ? ORDER BY last_at DESC LIMIT ?').all(clinicId, limit).map(rowConvo),
    // Mensajes (cuerpo cifrado)
    addMessage: (m) => {
      const r = st('INSERT INTO messages (clinic_id, conversation_id, direction, author, kind, body, meta, at, wa_id, status) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(m.clinicId, m.conversationId, m.direction, m.author, m.kind || 'text', enc(m.body || ''), m.meta ? JSON.stringify(m.meta) : null, m.at, m.waId || null, m.status || null);
      return { id: Number(r.lastInsertRowid), ...m };
    },
    listMessages: (conversationId, limit = 300) => st('SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY at DESC, id DESC LIMIT ?) ORDER BY at, id').all(conversationId, limit).map(rowMsg),
    lastMessage: (conversationId) => { const r = st('SELECT * FROM messages WHERE conversation_id = ? ORDER BY at DESC, id DESC LIMIT 1').get(conversationId); return r ? rowMsg(r) : null; },
    messagesSince: (clinicId, from) => st('SELECT id, direction, author, at FROM messages WHERE clinic_id = ? AND at >= ?').all(clinicId, from),
    setMessageStatus: (waId, status) => st('UPDATE messages SET status = ? WHERE wa_id = ?').run(status, waId),
    setMessageWaId: (id, waId) => st('UPDATE messages SET wa_id = ? WHERE id = ?').run(waId, id),
    // Citas
    listAppointments: (clinicId, from, to) => st('SELECT * FROM appointments WHERE clinic_id = ? AND end_ms > ? AND start_ms < ? ORDER BY start_ms').all(clinicId, from, to).map(rowAppt),
    appointment: (id) => rowAppt(st('SELECT * FROM appointments WHERE id = ?').get(id)),
    insertAppointment: (a) => store.appointment(insert('appointments', APPT_COLS, { depositStatus: a.status === 'pending_deposit' ? 'pending' : null, ...a })),
    updateAppointment: (id, patch) => update('appointments', APPT_COLS, id, patch),
    patientAppointments: (patientId) => st('SELECT * FROM appointments WHERE patient_id = ? ORDER BY start_ms DESC LIMIT 50').all(patientId).map(rowAppt),
    // Lista de espera
    addWaitlist: (w) => insert('waitlist', WL_COLS, w, wlT),
    listWaitlist: (clinicId) => st("SELECT * FROM waitlist WHERE clinic_id = ? AND status IN ('waiting','offered') ORDER BY created_at").all(clinicId).map(rowWl),
    updateWaitlist: (id, patch) => update('waitlist', WL_COLS, id, patch, wlT),
    // Clínicas y usuarios
    clinics: () => st('SELECT * FROM clinics ORDER BY id').all().map(rowClinic),
    clinic: (id) => rowClinic(st('SELECT * FROM clinics WHERE id = ?').get(id)),
    clinicBySlug: (slug) => rowClinic(st('SELECT * FROM clinics WHERE slug = ?').get(slug)),
    clinicByPhoneId: (pid) => rowClinic(st('SELECT * FROM clinics WHERE wa_phone_id = ? AND active = 1').get(pid)),
    createClinic: (cfg, now) => {
      const r = st('INSERT INTO clinics (slug, name, config, created_at) VALUES (?,?,?,?)').run(cfg.slug, cfg.name, JSON.stringify(cfg), now);
      return store.clinic(Number(r.lastInsertRowid));
    },
    saveClinicConfig: (id, cfg) => st('UPDATE clinics SET config = ?, name = ? WHERE id = ?').run(JSON.stringify(cfg), cfg.name, id),
    setClinicWhatsApp: (id, { phoneId, token, display }) => st('UPDATE clinics SET wa_phone_id = ?, wa_token = ?, wa_display = ? WHERE id = ?').run(phoneId || null, token ? enc(token) : null, display || null, id),
    setClinicActive: (id, active) => st('UPDATE clinics SET active = ? WHERE id = ?').run(active ? 1 : 0, id),
    audit: (clinicId, userId, action, detail, at) => st('INSERT INTO audit (clinic_id, user_id, action, detail, at) VALUES (?,?,?,?,?)').run(clinicId ?? null, userId ?? null, action, detail ? String(detail).slice(0, 500) : null, at),
    seen: (id, at) => { try { st('INSERT INTO seen_events (id, at) VALUES (?, ?)').run(id, at); return false; } catch { return true; } },
  };
  return store;
}

function rowClinic(r) {
  if (!r) return null;
  const cfg = JSON.parse(r.config);
  const pub = process.env.PUBLIC_URL || '';
  cfg.privacyUrl = pub ? `${pub.replace(/\/$/, '')}/privacidad/${r.slug}` : '';
  return { ...cfg, id: r.id, slug: r.slug, name: r.name, waPhoneId: r.wa_phone_id, waToken: r.wa_token ? dec(r.wa_token) : null, waDisplay: r.wa_display, active: !!r.active, plan: r.plan, createdAt: r.created_at };
}
