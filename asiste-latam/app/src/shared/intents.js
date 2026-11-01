// Clasificación por reglas (rápida, predecible y sin costo). Escrita para cómo escribe la gente en
// WhatsApp: sin tildes, abreviado y con errores ("kiero", "xfa", "q dias atienden").
import { norm } from './text.js';

function clean(text) {
  return ' ' + norm(text)
    .replace(/\bkiero\b/g, 'quiero').replace(/\bxfa\b|\bxfavor\b|\bporfa\b/g, 'por favor')
    .replace(/\bq\b/g, 'que').replace(/\bxq\b|\bpq\b/g, 'porque').replace(/\btmb\b/g, 'tambien')
    .replace(/\bcuanto\s*esta\b/g, 'cuanto cuesta').replace(/\bcita\s*s\b/g, 'citas')
    .replace(/\bd\b/g, 'de') + ' ';
}

const R = {
  emergency: / (sangra(do|ndo)? (mucho|abundante|sin parar)|no (para|deja) de sangrar|dolor (fuerte |intenso )?(en el|de|del) pecho|no puedo respirar|me (ahogo|falta el aire)|me desmaye|desmayo|convulsi|inconsciente|perdio el conocimiento|accidente|infarto|derrame|paralisis|fractura|me cai fuerte|envenen|intoxica)/,
  crisis: / (suicid|quitarme la vida|no quiero vivir|hacerme dano|matarme|acabar con todo|no vale la pena vivir|lastimarme)/,
  human: / (hablar|comunicarme|conversar) con (alguien|una persona|recepcion|la recepcion|el doctor|la doctora|un humano|una persona real|el encargado|la encargada|administracion)| (asesor|asesora|operador|operadora|persona real|humano|recepcionista)( | por favor)|llamenme|me pueden llamar|me llaman|quiero que me llamen|numero de telefono para llamar/,
  complaint: / (queja|reclamo|libro de reclamaciones|pesima atencion|mala atencion|estafa|denuncia|indecopi|devolucion de dinero|reembolso)/,
  cancel: / (cancelar|cancela|cancelo|anular|anula|desagendar|no (voy a poder|podre|puedo|voy a) (ir|asistir|llegar)|ya no (voy|ire|podre ir|necesito la cita))/,
  reschedule: / (reprogramar|reprograma|reprogramo|reagendar|cambiar (mi|la|el|de) (cita|turno|hora|horario|dia|fecha)|cambio de (cita|hora|turno|fecha)|mover (mi|la|el) (cita|turno)|otro dia|otra hora|otro horario|postergar|adelantar (mi|la|el))/,
  confirm: /^ (si|sii+|si claro|claro|ok|okey|okay|dale|de acuerdo|perfecto|listo|confirmo|confirmado|confirmada|si confirmo|ahi estare|alli estare|si voy|si asistire|ahi nos vemos|va|vale|correcto|esta bien|bueno)( gracias| por favor| doctora?| senorita)? $| (confirmo|confirmar (mi|la|el) (cita|turno|hora)|si asistire|ahi estare|alli estare)/,
  deny: /^ (no|no gracias|nop|nel|ninguno|ninguna|ninguna me sirve|no puedo|no me acomoda)( gracias)? $/,
  book: / (cita|turno|agendar|agenda|reservar|reserva|separar|sacar (una )?(cita|hora|turno)|pedir (una )?(cita|hora|turno)|quiero (ir|atenderme|una consulta|que me atiendan|ser atendid)|me (pueden|puede) atender|atienden (hoy|manana)|disponib|tienen (espacio|cupo|turno|horario)|hay (espacio|cupo|horario|turno)|horarios? (libre|disponible)|para (hoy|manana)|consulta para|una consulta|quisiera (una|un|atenderme|ir)|necesito (una|un) (cita|consulta|turno|hora)|programar)/,
  price: / (precio|precios|cuanto (cuesta|cuestan|sale|salen|vale|valen|es|seria|cobran|me cobran)|costo|costos|tarifa|valor|presupuesto|cotiza|promocion|promo|descuento|oferta)/,
  hours: / (horario|horarios de atencion|a que hora (abren|cierran|atienden)|abren|cierran|atienden (los )?(sabados|domingos|feriados)|que dias atienden|dias de atencion|hasta que hora)/,
  location: / (donde (estan|queda|quedan|se ubican|es|esta)|direccion|ubicacion|como llego|referencia|mapa|en que (calle|distrito|zona)|sede|local)/,
  payment: / (yape|yapear|plin|tarjeta|efectivo|transferencia|formas? de pago|medios? de pago|metodos? de pago|aceptan|visa|mastercard|pos |nequi|daviplata|mercado pago|cuotas)/,
  insurance: / (seguro|seguros|eps|sis|essalud|aseguradora|cobertura|convenio|isapre|fonasa|obra social|prepaga|prepagada|reembolso de seguro)/,
  parking: / (estacionamiento|parqueo|cochera|parking|donde estaciono)/,
  greeting: /^ (hola|holaa+|buenas|buenos dias|buen dia|buenas tardes|buenas noches|alo|hey|saludos|que tal)( .{0,20})? $/,
  thanks: / (gracias|muchas gracias|mil gracias|muy amable|genial|excelente|chevere|bacan|super)( |$)/,
  bye: / (chau|chao|adios|hasta luego|nos vemos|bye)( |$)/,
  optout: /^ (baja|stop|no me escriban mas|no quiero recibir (mas )?mensajes|dejar de recibir|desuscribir)( por favor)? $/,
  optin: /^ (alta|suscribir|volver a recibir)( por favor)? $/,
  myAppt: / (mi cita|mi turno|mi hora|cuando es mi|a que hora es mi|tengo (una )?(cita|turno|hora)|para cuando (tengo|es)|que dia (tengo|es) mi)/,
  paid: / (ya (yapee|yapie|plinee|pague|deposite|transferi|hice el (pago|yape|deposito))|envie (el|la) (pago|captura|voucher|constancia|comprobante)|adjunto (el|la) (voucher|constancia|comprobante)|aqui (esta )?(el|la) (voucher|constancia|captura|comprobante))/,
  menu: /^ (menu|inicio|opciones|ayuda|empezar)$/,
};

export function detect(text) {
  const t = clean(text);
  const hit = {};
  for (const [k, re] of Object.entries(R)) if (re.test(t)) hit[k] = true;
  // "Cambiar mi cita" no es una cancelación.
  if (hit.reschedule) delete hit.cancel;
  // "¿Cuánto cuesta la cita?" pregunta precio; no necesariamente quiere agendar.
  if (hit.price && hit.book && !/ (quiero|quisiera|necesito|agendar|reservar|separar|para (hoy|manana)|tienen|hay) /.test(t)) delete hit.book;
  return { t, hit };
}

export function matchService(text, services) {
  const t = clean(text);
  let best = null, bestLen = 0;
  for (const s of services || []) {
    const keys = [s.name, ...(s.aliases || [])].map((k) => norm(k));
    for (const k of keys) {
      if (k.length >= 3 && t.includes(' ' + k + ' ') && k.length > bestLen) { best = s; bestLen = k.length; }
      else if (k.length >= 5 && t.includes(k) && k.length > bestLen) { best = s; bestLen = k.length; }
    }
  }
  return best;
}

export function matchFaq(text, faqs) {
  const t = clean(text);
  for (const f of faqs || []) {
    if ((f.keys || []).some((k) => t.includes(' ' + norm(k) + ' ') || (norm(k).length > 5 && t.includes(norm(k))))) return f;
  }
  return null;
}

export function looksLikeName(text) {
  const raw = String(text || '').trim();
  if (raw.length < 3 || raw.length > 60) return false;
  if (/\d|@|http/.test(raw)) return false;
  const words = raw.split(/\s+/);
  if (words.length > 5) return false;
  const t = clean(raw);
  if (R.book.test(t) || R.price.test(t) || R.cancel.test(t) || R.reschedule.test(t) || R.human.test(t) || R.hours.test(t)) return false;
  if (/^ (si|no|ok|hola|gracias|buenas|buenos dias|buenas tardes|listo|dale|perfecto|ya) $/.test(t)) return false;
  return /^[a-záéíóúüñ' .-]+$/i.test(raw);
}

export function cleanName(text) {
  return String(text || '')
    .replace(/^(soy|me llamo|mi nombre es|a nombre de|es|de)\s+/i, '')
    .replace(/[.,;!]+$/g, '')
    .trim();
}

export { clean };
