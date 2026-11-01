import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'asiste-'));
const SECRET = 'app-secret-de-prueba';
let proc;
let cookie = '';

async function req(method, url, body, headers = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'X-Asiste': '1', Cookie: cookie, ...headers },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

before(async () => {
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DIR, OWNER_EMAIL: 'duenio@test.pe', OWNER_PASSWORD: 'clave-larga-123', DEMO_SEED: 'true', JOBS_ENABLED: 'false', WA_VERIFY_TOKEN: 'verif', WA_APP_SECRET: SECRET, PUBLIC_URL: 'https://asiste.test' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/healthz'); if (r.ok) return; } catch { /* esperando */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('el servidor no arrancó');
});
after(() => { proc?.kill(); fs.rmSync(DIR, { recursive: true, force: true }); });

test('páginas públicas con SEO', async () => {
  const home = await req('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /<title>Asiste \| Citas por WhatsApp para clínicas en Perú<\/title>/);
  assert.match(home.text, /"@type":"FAQPage"/);
  assert.match(home.text, /hreflang="es-MX"/);
  const ar = await req('GET', '/ar/');
  assert.match(ar.text, /turnos/i);
  assert.match((await req('GET', '/para/psicologia')).text, /consultorios de psicología/);
  assert.match((await req('GET', '/sitemap.xml')).text, /<loc>https:\/\/asiste\.test\/para\/dental<\/loc>/);
  assert.equal((await req('GET', '/no-existe')).status, 404);
});

test('login: rechaza clave incorrecta y exige cabecera anti-CSRF', async () => {
  assert.equal((await req('POST', '/api/login', { email: 'duenio@test.pe', password: 'mala' })).status, 401);
  assert.equal((await req('POST', '/api/login', { email: 'duenio@test.pe', password: 'clave-larga-123' }, { 'X-Asiste': '' })).status, 403);
  assert.equal((await req('GET', '/api/me')).status, 401);
  const ok = await req('POST', '/api/login', { email: 'duenio@test.pe', password: 'clave-larga-123' });
  assert.equal(ok.status, 200);
  const me = await req('GET', '/api/me');
  assert.equal(me.json.user.role, 'owner');
  assert.equal(me.json.clinic.name, 'Clínica Dental Sonrisa Norte');
  assert.equal(me.json.clinic.waToken, undefined, 'nunca exponer el token');
});

test('panel: hoy, conversaciones, pacientes y simulador', async () => {
  const t = await req('GET', '/api/today');
  assert.ok(t.json.metrics.bookedByBot > 0);
  const conv = await req('GET', '/api/conversations');
  assert.ok(conv.json.length > 5);
  const one = await req('GET', `/api/conversations/${conv.json[0].id}`);
  assert.ok(one.json.messages.length > 0);
  const sim = await req('POST', '/api/simulate', { text: '¿Cuánto cuesta la limpieza?' });
  assert.match(sim.json.replies.map((r) => r.text).join(' '), /S\/ 80/);
  const p = await req('GET', '/api/patients');
  assert.ok(p.json.length > 50);
});

test('webhook de WhatsApp: verificación, firma y agenda real', async () => {
  const v = await req('GET', '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=verif&hub.challenge=123');
  assert.equal(v.text, '123');
  assert.equal((await req('GET', '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1')).status, 403);
  // Conectar el número de prueba a la clínica (sin token: no intenta enviar a Meta)
  const clinics = await req('GET', '/api/admin/clinics');
  const id = clinics.json[0].id;
  assert.equal((await req('PATCH', `/api/admin/clinics/${id}`, { waPhoneId: '1234567890', waDisplay: '+51 900 000 000' })).status, 200);
  const send = async (text, mid) => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '1234567890' }, contacts: [{ wa_id: '51955555555', profile: { name: 'Lucía' } }], messages: [{ from: '51955555555', id: mid, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] });
    const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    return req('POST', '/webhook/whatsapp', body, { 'X-Hub-Signature-256': sig });
  };
  const bad = await req('POST', '/webhook/whatsapp', '{"entry":[]}', { 'X-Hub-Signature-256': 'sha256=00' });
  assert.equal(bad.status, 401);
  assert.equal((await send('Hola, quiero una cita para limpieza lo antes posible', 'wamid.1')).status, 200);
  await send('Hola, quiero una cita para limpieza lo antes posible', 'wamid.1'); // reintento de Meta: se ignora
  await send('1', 'wamid.2');
  await send('Lucía Távara Ipanaqué', 'wamid.3');
  await new Promise((r) => setTimeout(r, 300));
  const conv = (await req('GET', '/api/conversations')).json.find((c) => c.patient.phone === '51955555555');
  assert.ok(conv, 'conversación creada');
  const d = await req('GET', `/api/conversations/${conv.id}`);
  assert.equal(d.json.patient.name, 'Lucía Távara Ipanaqué');
  assert.equal(d.json.upcoming.length, 1, 'cita creada una sola vez');
  assert.equal(d.json.messages.filter((m) => m.direction === 'in').length, 3, 'sin duplicar el reintento');
});

test('datos sensibles cifrados en la base de datos', () => {
  const db = new DatabaseSync(path.join(DIR, 'asiste.db'), { readOnly: true });
  const row = db.prepare("SELECT body FROM messages WHERE direction = 'in' ORDER BY id DESC LIMIT 1").get();
  assert.match(row.body, /^v1:/);
  assert.doesNotMatch(row.body, /Lucía/);
  const pw = db.prepare('SELECT pass FROM users LIMIT 1').get();
  assert.match(pw.pass, /^scrypt\$/);
  db.close();
});

test('recepción (rol staff) no puede cambiar la configuración', async () => {
  const clinics = await req('GET', '/api/admin/clinics');
  const u = await req('POST', `/api/admin/clinics/${clinics.json[0].id}/users`, { email: 'recepcion@test.pe', role: 'staff' });
  assert.equal(u.status, 200);
  const ownerCookie = cookie;
  cookie = '';
  assert.equal((await req('POST', '/api/login', { email: 'recepcion@test.pe', password: u.json.password })).status, 200);
  assert.equal((await req('PUT', '/api/clinic', { name: 'Hackeada' })).status, 403);
  assert.equal((await req('GET', '/api/admin/clinics')).status, 403);
  cookie = ownerCookie;
});

test('aviso de privacidad por clínica', async () => {
  const r = await req('GET', '/privacidad/clinica-dental-sonrisa-norte');
  assert.equal(r.status, 200);
  assert.match(r.text, /29733/);
});

test('la demo estática usa exactamente el mismo motor que la app real', async () => {
  const { execFileSync } = await import('node:child_process');
  const app = path.resolve(import.meta.dirname, '..');
  execFileSync(process.execPath, ['scripts/build-prototype.mjs'], { cwd: app });
  const shared = path.join(app, 'src', 'shared');
  for (const f of fs.readdirSync(shared)) {
    assert.equal(fs.readFileSync(path.join(app, '..', 'prototype', 'shared', f), 'utf8'), fs.readFileSync(path.join(shared, f), 'utf8'), f);
  }
  const html = fs.readFileSync(path.join(app, '..', 'prototype', 'index.html'), 'utf8');
  assert.match(html, /src="\.\/app\/main\.js"/);
});
