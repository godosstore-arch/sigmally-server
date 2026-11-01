// Datos por país: moneda, zona horaria, cómo se le dice a la cita, emergencias y medios de pago.
// Los números de emergencia se muestran tal cual al paciente: revisarlos al abrir un país nuevo.

const W_CITA = { word: 'cita', the: 'la', a: 'una', your: 'su', gender: 'f' };
const W_TURNO = { word: 'turno', the: 'el', a: 'un', your: 'su', gender: 'm' };
const W_HORA = { word: 'hora', the: 'la', a: 'una', your: 'su', gender: 'f' };

export const COUNTRIES = {
  PE: {
    code: 'PE', name: 'Perú', locale: 'es-PE', currency: 'PEN', tz: 'America/Lima', dial: '51',
    term: W_CITA, emergency: '106 (SAMU)', mental: 'la Línea 113, opción 5',
    payments: 'Yape, Plin, tarjeta o efectivo', idName: 'DNI',
    cities: ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Piura', 'Cusco', 'Huancayo', 'Iquitos', 'Ica', 'Tacna', 'Sullana', 'Paita'],
  },
  MX: {
    code: 'MX', name: 'México', locale: 'es-MX', currency: 'MXN', tz: 'America/Mexico_City', dial: '52',
    term: W_CITA, emergency: '911', mental: 'la Línea de la Vida, 800 911 2000',
    payments: 'transferencia, tarjeta o efectivo', idName: 'CURP',
    cities: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Querétaro', 'Mérida'],
  },
  CO: {
    code: 'CO', name: 'Colombia', locale: 'es-CO', currency: 'COP', tz: 'America/Bogota', dial: '57',
    term: W_CITA, emergency: '123', mental: 'la línea 192, opción 4',
    payments: 'Nequi, Daviplata, PSE, tarjeta o efectivo', idName: 'cédula',
    cities: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga'],
  },
  CL: {
    code: 'CL', name: 'Chile', locale: 'es-CL', currency: 'CLP', tz: 'America/Santiago', dial: '56',
    term: W_HORA, emergency: '131 (SAMU)', mental: 'la línea *4141',
    payments: 'transferencia, tarjeta o efectivo', idName: 'RUT',
    cities: ['Santiago', 'Valparaíso', 'Concepción', 'Antofagasta'],
  },
  AR: {
    code: 'AR', name: 'Argentina', locale: 'es-AR', currency: 'ARS', tz: 'America/Argentina/Buenos_Aires', dial: '54',
    term: W_TURNO, emergency: '107 (SAME)', mental: 'el 135 (CABA y GBA) o el 0800 345 1435',
    payments: 'Mercado Pago, transferencia, tarjeta o efectivo', idName: 'DNI',
    cities: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza'],
  },
  EC: {
    code: 'EC', name: 'Ecuador', locale: 'es-EC', currency: 'USD', tz: 'America/Guayaquil', dial: '593',
    term: W_CITA, emergency: '911', mental: 'el 171, opción 6',
    payments: 'transferencia, tarjeta o efectivo', idName: 'cédula',
    cities: ['Guayaquil', 'Quito', 'Cuenca'],
  },
  BO: {
    code: 'BO', name: 'Bolivia', locale: 'es-BO', currency: 'BOB', tz: 'America/La_Paz', dial: '591',
    term: W_CITA, emergency: null, mental: null,
    payments: 'QR, transferencia o efectivo', idName: 'CI',
    cities: ['Santa Cruz', 'La Paz', 'Cochabamba'],
  },
  UY: {
    code: 'UY', name: 'Uruguay', locale: 'es-UY', currency: 'UYU', tz: 'America/Montevideo', dial: '598',
    term: W_TURNO, emergency: '911', mental: 'el 0800 0767 o *0767',
    payments: 'transferencia, tarjeta o efectivo', idName: 'cédula',
    cities: ['Montevideo'],
  },
  PY: {
    code: 'PY', name: 'Paraguay', locale: 'es-PY', currency: 'PYG', tz: 'America/Asuncion', dial: '595',
    term: W_TURNO, emergency: '911', mental: null,
    payments: 'transferencia, tarjeta o efectivo', idName: 'cédula',
    cities: ['Asunción'],
  },
  CR: {
    code: 'CR', name: 'Costa Rica', locale: 'es-CR', currency: 'CRC', tz: 'America/Costa_Rica', dial: '506',
    term: W_CITA, emergency: '911', mental: null,
    payments: 'SINPE Móvil, tarjeta o efectivo', idName: 'cédula',
    cities: ['San José'],
  },
  PA: {
    code: 'PA', name: 'Panamá', locale: 'es-PA', currency: 'USD', tz: 'America/Panama', dial: '507',
    term: W_CITA, emergency: '911', mental: null,
    payments: 'Yappy, tarjeta o efectivo', idName: 'cédula',
    cities: ['Ciudad de Panamá'],
  },
  DO: {
    code: 'DO', name: 'República Dominicana', locale: 'es-DO', currency: 'DOP', tz: 'America/Santo_Domingo', dial: '1',
    term: W_CITA, emergency: '911', mental: null,
    payments: 'transferencia, tarjeta o efectivo', idName: 'cédula',
    cities: ['Santo Domingo', 'Santiago de los Caballeros'],
  },
  GT: {
    code: 'GT', name: 'Guatemala', locale: 'es-GT', currency: 'GTQ', tz: 'America/Guatemala', dial: '502',
    term: W_CITA, emergency: null, mental: null,
    payments: 'transferencia, tarjeta o efectivo', idName: 'DPI',
    cities: ['Ciudad de Guatemala'],
  },
};

export function country(code) {
  return COUNTRIES[String(code || 'PE').toUpperCase()] || COUNTRIES.PE;
}

// Palabras con concordancia: "la cita quedó reservada" / "el turno quedó reservado".
export function words(c) {
  const t = country(c).term;
  const o = t.gender === 'f' ? 'a' : 'o';
  return {
    cita: t.word,
    Cita: t.word.charAt(0).toUpperCase() + t.word.slice(1),
    citas: t.word + 's',
    la: t.the,
    La: t.the.charAt(0).toUpperCase() + t.the.slice(1),
    una: t.a,
    su: t.your,
    reservada: 'reservad' + o,
    confirmada: 'confirmad' + o,
    cancelada: 'cancelad' + o,
    agendada: 'agendad' + o,
    separada: 'separad' + o,
    reprogramada: 'reprogramad' + o,
    nueva: t.gender === 'f' ? 'nueva' : 'nuevo',
    esta: t.gender === 'f' ? 'esta' : 'este',
    la_obj: t.gender === 'f' ? 'la' : 'lo',
  };
}

export function money(amount, code) {
  const c = country(code);
  const n = Number(amount || 0);
  const whole = Number.isInteger(n);
  try {
    const s = new Intl.NumberFormat(c.locale, {
      style: 'currency', currency: c.currency,
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    }).format(n);
    return s.replace(/ /g, ' ');
  } catch {
    return `${c.currency} ${n}`;
  }
}

export function emergencyLine(code) {
  const c = country(code);
  return c.emergency
    ? `llame al ${c.emergency} o acuda a la emergencia más cercana`
    : 'acuda de inmediato a la emergencia más cercana o llame al número de emergencias de su ciudad';
}

export function mentalLine(code) {
  const c = country(code);
  return c.mental
    ? `llame ahora a ${c.mental}: es gratuita y atiende las 24 horas`
    : `busque ayuda ahora llamando al número de emergencias de su país`;
}

// Normaliza un número a formato internacional sin "+": "987 654 321" (PE) -> "51987654321".
export function normalizePhone(raw, code = 'PE') {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  const dial = country(code).dial;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length <= 10 && !d.startsWith(dial)) d = dial + d.replace(/^0+/, '');
  return d;
}

export function displayPhone(intl) {
  const d = String(intl || '').replace(/\D/g, '');
  if (d.startsWith('51') && d.length === 11) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.length > 8) return `+${d.slice(0, d.length - 9)} ${d.slice(-9, -6)} ${d.slice(-6, -3)} ${d.slice(-3)}`;
  return d ? `+${d}` : '';
}
