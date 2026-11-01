// Crea la configuración completa de una clínica a partir de lo mínimo (nombre, país, especialidad).
import { country } from './countries.js';
import { specialty, servicesFor, staffForSpecialty } from './specialties.js';
import { defaultAutomations } from './automations.js';

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'clinica';
}

export function makeClinic({ name, countryCode = 'PE', specialtyKey = 'dental', city = '', address = '', phone = '' } = {}) {
  const c = country(countryCode);
  const sp = specialty(specialtyKey);
  const nm = name || sp.sample;
  return {
    name: nm,
    slug: slugify(nm),
    country: c.code,
    tz: c.tz,
    specialty: specialtyKey,
    city: city || c.cities[0],
    address: address || `Av. Principal 123, ${city || c.cities[0]}`,
    reference: '',
    mapsUrl: '',
    phone,
    hours: JSON.parse(JSON.stringify(sp.hours)),
    closedDates: [],
    services: servicesFor(specialtyKey, c.code),
    staff: staffForSpecialty(specialtyKey),
    capacity: 1,
    slotStep: 15,
    minNoticeMinutes: 60,
    maxDaysAhead: 30,
    deposit: { enabled: false, amount: 0, methods: c.code === 'PE' ? 'Yape o Plin' : 'transferencia', holdMinutes: 120, services: [] },
    payments: c.payments,
    insurance: '',
    parking: '',
    faqs: [],
    automations: defaultAutomations(),
    urgentPattern: sp.urgent ? sp.urgent.source : null,
    reviewUrl: '',
    privacyUrl: '',
  };
}
