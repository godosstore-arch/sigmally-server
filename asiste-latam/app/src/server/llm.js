// IA opcional para preguntas que las reglas no entienden. Apagada por defecto.
// Responde SOLO con la información de la clínica; si no sabe, deriva a recepción.
// Nunca agenda, nunca da precios u horarios que no estén en la ficha, nunca da consejo médico.
import { hoursText } from '../shared/conversation.js';
import { money, country } from '../shared/countries.js';

let clientPromise = null;

async function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk')
      .then((m) => new m.default())
      .catch(() => {
        console.warn('[asiste] Falta el paquete @anthropic-ai/sdk (npm install). La IA opcional queda apagada.');
        return null;
      });
  }
  return clientPromise;
}

export function llmEnabled() {
  return !!process.env.ANTHROPIC_API_KEY && process.env.LLM_ENABLED !== 'false';
}

function clinicSheet(clinic) {
  const c = country(clinic.country);
  const svcs = (clinic.services || []).map((s) => `- ${s.name}: ${s.priceFrom ? 'desde ' : ''}${money(s.price, clinic.country)} (${s.duration} min)`).join('\n');
  const faqs = (clinic.faqs || []).map((f) => `P: ${f.q}\nR: ${f.a}`).join('\n');
  return [
    `Clínica: ${clinic.name} (${clinic.city}, ${c.name})`,
    `Dirección: ${clinic.address}${clinic.reference ? ` (${clinic.reference})` : ''}`,
    `Horario:\n${hoursText(clinic)}`,
    `Servicios y precios de referencia:\n${svcs}`,
    `Medios de pago: ${clinic.payments || c.payments}`,
    clinic.insurance ? `Seguros: ${clinic.insurance}` : '',
    clinic.parking ? `Estacionamiento: ${clinic.parking}` : '',
    faqs ? `Preguntas frecuentes:\n${faqs}` : '',
  ].filter(Boolean).join('\n\n');
}

const SYSTEM = `Eres el asistente de WhatsApp de una clínica en Latinoamérica. Respondes a pacientes en español neutro, trato de "usted", tono cálido y breve (máximo 3 frases, sin emojis, sin markdown).

Reglas:
- Usa únicamente la ficha de la clínica que recibes. Si la respuesta no está en la ficha, responde exactamente: DERIVAR
- No inventes precios, horarios, doctores, promociones ni políticas.
- No des diagnósticos, indicaciones de medicamentos ni consejo médico. Si preguntan algo clínico, responde exactamente: DERIVAR
- No agendes ni confirmes citas: si quieren agendar, invita a escribir "agendar".
- Si el mensaje sugiere una emergencia, responde exactamente: DERIVAR`;

// Devuelve un texto para el paciente, o null si hay que derivar a recepción.
export async function answerWithLlm(clinic, question) {
  if (!llmEnabled()) return null;
  const client = await getClient();
  if (!client) return null;
  try {
    const response = await client.beta.messages.create({
      model: process.env.LLM_MODEL || 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Ficha de la clínica:\n\n${clinicSheet(clinic)}\n\nMensaje del paciente:\n${String(question).slice(0, 1000)}` }],
    }, { timeout: 20000 });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text || /DERIVAR/.test(text)) return null;
    return text.slice(0, 900);
  } catch (e) {
    console.warn('[asiste] IA no disponible:', e?.status || '', e?.message || e);
    return null;
  }
}
