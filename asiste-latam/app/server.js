// Asiste — servidor principal. Sin dependencias externas: Node 22+ y nada más.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './src/server/db.js';
import { initKey, hashPassword } from './src/server/crypto.js';
import { createApi } from './src/server/api.js';
import { securityHeaders, readBody, json, html, text, serveFile } from './src/server/http.js';
import { parseWebhook, verifySignature, sendWhatsApp, markRead, canSend } from './src/server/whatsapp.js';
import { answerWithLlm, llmEnabled } from './src/server/llm.js';
import { processInbound, runAutomations, systemMessage } from './src/shared/pipeline.js';
import { renderLanding, renderPrivacy, sitemap, LANDING_PATHS } from './src/server/landing.js';
import { makeClinic } from './src/shared/clinic.js';
import { seedDemo } from './src/shared/demo-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// .env sencillo (sin librería)
const envFile = path.join(here, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(here, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
initKey(DATA_DIR);
const store = openDb(process.env.DATABASE_PATH || path.join(DATA_DIR, 'asiste.db'));
const brand = JSON.parse(fs.readFileSync(path.join(here, 'brand.json'), 'utf8'));
const PUBLIC = path.join(here, 'public');
const SHARED = path.join(here, 'src', 'shared');
const DAY = 86400000;

// ---------- Arranque: dueño de la cuenta y clínica demo ----------
function bootstrap() {
  const n = store.st('SELECT COUNT(*) AS n FROM users').get().n;
  if (!n && process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    store.st('INSERT INTO users (email, name, pass, role, created_at) VALUES (?,?,?,?,?)')
      .run(process.env.OWNER_EMAIL.toLowerCase(), process.env.OWNER_NAME || brand.founder, hashPassword(process.env.OWNER_PASSWORD), 'owner', Date.now());
    console.log(`[asiste] Usuario dueño creado: ${process.env.OWNER_EMAIL}`);
  }
  if (process.env.DEMO_SEED === 'true' && !store.clinics().length) {
    const cfg = makeClinic({ name: 'Clínica Dental Sonrisa Norte', countryCode: 'PE', specialtyKey: 'dental', city: 'Piura', address: 'Av. Grau 1250, Piura' });
    const clinic = store.createClinic(cfg, Date.now());
    seedDemo(store, clinic, Date.now());
    console.log('[asiste] Clínica demo creada con datos de ejemplo.');
  }
}
bootstrap();

// ---------- Envío de mensajes salientes ----------
async function deliver(clinic, outbound) {
  for (const o of outbound || []) {
    const convo = store.conversationFor(clinic.id, o.patient.id);
    const windowOpen = !!convo?.lastInboundAt && Date.now() - convo.lastInboundAt < DAY - 5 * 60000;
    try {
      const r = await sendWhatsApp(clinic, o.patient.phone, o.message, { windowOpen });
      if (r?.skipped && canSend(clinic)) console.warn(`[asiste] ${clinic.slug}: no se envió (${r.skipped}) ${o.kind || ''}`);
    } catch (e) {
      console.error(`[asiste] ${clinic.slug}: error enviando ${o.kind || ''}:`, e.message);
    }
  }
}

async function handleInbound(item) {
  const clinic = store.clinicByPhoneId(item.phoneId);
  if (!clinic) return console.warn('[asiste] Mensaje para un número no registrado:', item.phoneId);
  if (item.waId && store.seen(item.waId, Date.now())) return; // Meta reintenta: se procesa una sola vez
  const r = processInbound({ store, clinic, phone: item.from, profileName: item.profileName, msg: { ...item.msg, waId: item.waId }, nowMs: Date.now() });
  markRead(clinic, item.waId);
  let replies = r.replies;
  if (r.fallback && item.msg.type === 'text' && llmEnabled()) {
    const answer = await answerWithLlm(clinic, item.msg.text);
    if (answer) {
      const c = store.conversation(r.conversationId);
      store.st("DELETE FROM messages WHERE conversation_id = ? AND direction = 'out' AND at >= ? AND author = 'bot'").run(c.id, c.lastInboundAt);
      store.addMessage({ clinicId: clinic.id, conversationId: c.id, direction: 'out', author: 'bot', kind: 'text', body: answer, at: Date.now() });
      store.updateConversation(c.id, { human: null, attention: 0, state: { ...c.state, unknown: 0, human: null } });
      replies = [{ type: 'text', text: answer }];
    }
  }
  for (const rep of replies) {
    try { await sendWhatsApp(clinic, item.from, rep, { windowOpen: true }); } catch (e) { console.error('[asiste] envío:', e.message); }
  }
  await deliver(clinic, r.extra);
}

// ---------- Automatizaciones (cada minuto) ----------
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const clinic of store.clinics()) {
      if (!clinic.active) continue;
      const out = runAutomations({ store, clinic, nowMs: Date.now() });
      await deliver(clinic, out);
    }
  } catch (e) {
    console.error('[asiste] automatizaciones:', e);
  } finally {
    running = false;
  }
}
if (process.env.JOBS_ENABLED !== 'false') setInterval(tick, 60000).unref();

const api = createApi({ store, deliver });

// ---------- Servidor ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  securityHeaders(res);
  try {
    if (p === '/healthz') return json(res, 200, { ok: true });

    if (p === '/webhook/whatsapp') {
      if (req.method === 'GET') {
        const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === process.env.WA_VERIFY_TOKEN && !!process.env.WA_VERIFY_TOKEN;
        return ok ? text(res, 200, url.searchParams.get('hub.challenge') || '') : text(res, 403, 'forbidden');
      }
      if (req.method === 'POST') {
        const raw = await readBody(req, 3 * 1024 * 1024);
        if (process.env.NODE_ENV === 'production' && !process.env.WA_APP_SECRET) return text(res, 500, 'WA_APP_SECRET requerido');
        if (!verifySignature(raw, req.headers['x-hub-signature-256'], process.env.WA_APP_SECRET)) return text(res, 401, 'firma inválida');
        text(res, 200, 'ok'); // Meta espera respuesta rápida; el trabajo sigue después
        let body; try { body = JSON.parse(raw.toString('utf8')); } catch { return; }
        const { messages, statuses } = parseWebhook(body);
        for (const s of statuses) store.setMessageStatus(s.waId, s.status);
        for (const m of messages) await handleInbound(m).catch((e) => console.error('[asiste] inbound:', e));
        return;
      }
    }

    if (p.startsWith('/api/')) return await api.handle(req, res, url);

    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Método no permitido');

    if (p === '/robots.txt') return text(res, 200, `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /api/\nSitemap: ${process.env.PUBLIC_URL || ''}/sitemap.xml\n`);
    if (p === '/sitemap.xml') return text(res, 200, sitemap(process.env.PUBLIC_URL || `https://${brand.domain}`), 'application/xml; charset=utf-8');
    if (LANDING_PATHS.has(p)) return html(res, 200, renderLanding(p, brand, process.env.PUBLIC_URL || `https://${brand.domain}`));
    const priv = p.match(/^\/privacidad\/([a-z0-9-]+)$/);
    if (priv) {
      const c = store.clinicBySlug(priv[1]);
      return c ? html(res, 200, renderPrivacy(c, brand)) : text(res, 404, 'No encontrado');
    }
    if (p === '/app' || p === '/app/') return serveFile(res, PUBLIC, 'app/index.html', { cache: 'no-cache' });
    if (p === '/demo' || p === '/demo/') {
      const page = fs.readFileSync(path.join(PUBLIC, 'demo', 'index.html'), 'utf8').replace(/data-wa="\d*"/, `data-wa="${brand.salesWhatsApp}"`);
      return html(res, 200, page, { 'Cache-Control': 'no-cache' });
    }
    if (p.startsWith('/shared/')) return serveFile(res, SHARED, p.slice(8), { cache: 'no-cache' }) || text(res, 404, 'No encontrado');
    if (serveFile(res, PUBLIC, p.slice(1), { cache: p.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache' })) return;
    html(res, 404, renderLanding('/404', brand, process.env.PUBLIC_URL || ''));
  } catch (e) {
    console.error('[asiste]', e);
    if (!res.headersSent) json(res, e.status || 500, { error: 'Error interno' });
  }
});

server.listen(PORT, () => {
  console.log(`[asiste] Listo en http://localhost:${PORT}  ·  panel: /app/  ·  demo: /demo/`);
  if (!process.env.WA_VERIFY_TOKEN) console.log('[asiste] WhatsApp aún no configurado (WA_VERIFY_TOKEN). El simulador del panel funciona igual.');
});

export { server, store };
