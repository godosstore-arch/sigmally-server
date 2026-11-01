import { makeClinic } from '../src/shared/clinic.js';
import { toUtc } from '../src/shared/time.js';

export function clinic(opts = {}) {
  return { id: 1, ...makeClinic({ name: 'Clínica Dental Sonrisa Norte', countryCode: 'PE', specialtyKey: 'dental', city: 'Piura', ...opts }) };
}
// Lunes 2 de noviembre de 2026, 9:15 p. m. en Lima
export const MON_NIGHT = toUtc('2026-11-02', 21 * 60 + 15, 'America/Lima');
// Martes 3 de noviembre de 2026, 10:30 a. m. en Lima
export const TUE_MORNING = toUtc('2026-11-03', 10 * 60 + 30, 'America/Lima');
