// Normalización de texto en español (sin dependencias; corre en navegador y Node).

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:()"'«»“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function has(text, re) {
  return re.test(text);
}

export function cap(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const NUM_WORDS = {
  una: 1, uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, primera: 1, primero: 1,
  segunda: 2, segundo: 2, tercera: 3, tercero: 3,
};

export function wordNumber(w) {
  return NUM_WORDS[w] ?? null;
}

export function firstName(name) {
  const p = String(name || '').trim().split(/\s+/)[0] || '';
  return cap(p.toLowerCase());
}

export function titleCase(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 2 && /^(de|la|del|y)$/i.test(w) ? w.toLowerCase() : cap(w.toLowerCase())))
    .join(' ');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
