// WhatsApp Business Platform (Cloud API de Meta). Envío de mensajes, plantillas y lectura del webhook.
import crypto from 'node:crypto';

const API = () => `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v23.0'}`;

export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret) return true; // en desarrollo; en producción WA_APP_SECRET es obligatorio
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

// Convierte el payload del webhook en mensajes simples para el motor.
export function parseWebhook(body) {
  const out = { messages: [], statuses: [] };
  for (const entry of body?.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const phoneId = v.metadata?.phone_number_id;
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || null]));
      for (const m of v.messages || []) {
        const base = { phoneId, from: m.from, waId: m.id, at: Number(m.timestamp) * 1000 || Date.now(), profileName: names[m.from] || null };
        if (m.type === 'text') out.messages.push({ ...base, msg: { type: 'text', text: m.text?.body || '' } });
        else if (m.type === 'interactive') {
          const r = m.interactive?.button_reply || m.interactive?.list_reply || {};
          out.messages.push({ ...base, msg: { type: 'button', id: r.id, title: r.title, text: r.title } });
        } else if (m.type === 'button') {
          out.messages.push({ ...base, msg: { type: 'button', id: m.button?.payload, title: m.button?.text, text: m.button?.text } });
        } else if (m.type === 'image') out.messages.push({ ...base, msg: { type: 'image', mediaId: m.image?.id, text: m.image?.caption || '' } });
        else if (m.type === 'document') out.messages.push({ ...base, msg: { type: 'document', mediaId: m.document?.id, text: m.document?.caption || '' } });
        else if (m.type === 'audio') out.messages.push({ ...base, msg: { type: 'audio', mediaId: m.audio?.id } });
        else out.messages.push({ ...base, msg: { type: m.type || 'other' } });
      }
      for (const s of v.statuses || []) out.statuses.push({ waId: s.id, status: s.status, phoneId });
    }
  }
  return out;
}

function payloadFor(to, m) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (m.type === 'buttons' && m.buttons?.length) {
    return { ...base, type: 'interactive', interactive: { type: 'button', body: { text: m.text.slice(0, 1024) }, action: { buttons: m.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) } } };
  }
  if (m.type === 'list' && m.rows?.length) {
    return { ...base, type: 'interactive', interactive: { type: 'list', body: { text: m.text.slice(0, 1024) }, action: { button: (m.button || 'Ver opciones').slice(0, 20), sections: [{ title: 'Opciones', rows: m.rows.slice(0, 10).map((r) => ({ id: r.id, title: r.title.slice(0, 24), ...(r.description ? { description: r.description.slice(0, 72) } : {}) })) }] } } };
  }
  return { ...base, type: 'text', text: { body: m.text.slice(0, 4096), preview_url: /https?:\/\//.test(m.text) } };
}

// Plantilla aprobada por Meta (obligatoria fuera de la ventana de 24 h).
function templatePayload(to, m, lang) {
  const t = m.template;
  const components = [{ type: 'body', parameters: (t.params || []).map((p) => ({ type: 'text', text: String(p).slice(0, 1000) })) }];
  (m.buttons || []).forEach((b, i) => components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: b.id }] }));
  return { messaging_product: 'whatsapp', to, type: 'template', template: { name: t.name, language: { code: lang || 'es' }, components } };
}

async function post(clinic, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${API()}/${clinic.waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinic.waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${json?.error?.message || 'error'}`);
    return json?.messages?.[0]?.id || null;
  } finally {
    clearTimeout(timer);
  }
}

export function canSend(clinic) {
  return !!(clinic.waPhoneId && clinic.waToken);
}

// windowOpen: el paciente escribió en las últimas 24 h -> se puede mandar texto libre y botones.
export async function sendWhatsApp(clinic, to, message, { windowOpen }) {
  if (!canSend(clinic)) return { skipped: 'sin_whatsapp' };
  if (windowOpen) return { id: await post(clinic, payloadFor(to, message)) };
  if (!message.template) return { skipped: 'fuera_de_ventana' };
  const names = clinic.templates || {};
  const name = names[message.template.name] ?? message.template.name;
  if (!name) return { skipped: 'plantilla_desactivada' };
  return { id: await post(clinic, templatePayload(to, { ...message, template: { ...message.template, name } }, clinic.templateLang || 'es')) };
}

export async function markRead(clinic, waId) {
  if (!canSend(clinic) || !waId) return;
  try { await post(clinic, { messaging_product: 'whatsapp', status: 'read', message_id: waId }); } catch { /* no crítico */ }
}
