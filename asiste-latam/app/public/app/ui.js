// Mini-utilidades de interfaz (sin frameworks): crear nodos, formatos, íconos, avisos y ventanas.
import { money as fmtMoney } from '../shared/countries.js';
import { local, timeLabel, DAYS, MONTHS, MONTHS_SHORT, DAYS_SHORT } from '../shared/time.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const PATHS = {
  today: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  inbox: '<path d="M4 5h16v11H8l-4 4z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2 .6 3.5 2.3 3.5 5.5"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  building: '<path d="M4 21V5l8-3v19M12 8h8v13M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01M2 21h20"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.01"/>',
  send: '<path d="M4 12l16-8-6 16-2-6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12v1M15 12v1M9 16h6"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 10V4.5a1.5 1.5 0 013 0V11M14 10.5V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6.5 7S5 17 4.5 14L3.5 11a1.5 1.5 0 012.6-1.4L8 12"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'i ' + cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = PATHS[name] || '';
  return s;
}

export const fmt = {
  money: (n, country) => fmtMoney(n, country),
  time: (ms, tz) => timeLabel(local(ms, tz).minutes),
  day: (ms, tz) => { const l = local(ms, tz); return `${DAYS[l.dow]} ${l.d} de ${MONTHS[l.m - 1]}`; },
  dayShort: (ms, tz) => { const l = local(ms, tz); return `${DAYS_SHORT[l.dow]} ${l.d} ${MONTHS_SHORT[l.m - 1]}`; },
  rel(ms, now) {
    const d = Math.round((now - ms) / 60000);
    if (d < 1) return 'ahora';
    if (d < 60) return `hace ${d} min`;
    if (d < 1440) return `hace ${Math.round(d / 60)} h`;
    const days = Math.round(d / 1440);
    return days === 1 ? 'ayer' : `hace ${days} días`;
  },
  phone(p) {
    const d = String(p || '').replace(/\D/g, '');
    if (String(p).startsWith('sim')) return 'Simulador';
    if (d.startsWith('51') && d.length === 11) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
    return d ? '+' + d : '';
  },
  pct: (x) => `${Math.round(x * 100)} %`,
};

export const STATUS = {
  booked: ['Agendada', 'st-booked'],
  confirmed: ['Confirmada', 'st-confirmed'],
  pending_deposit: ['Espera adelanto', 'st-deposit'],
  completed: ['Atendida', 'st-done'],
  no_show: ['No vino', 'st-noshow'],
  cancelled: ['Cancelada', 'st-cancel'],
};
export function pill(status) {
  const [label, cls] = STATUS[status] || [status, ''];
  return h('span', { class: 'pill ' + cls }, label);
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

let toastTimer;
export function toast(msg, kind = 'ok') {
  let t = document.querySelector('.toast');
  if (!t) { t = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.className = 'toast show ' + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

export function modal(title, body, actions = []) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  const wrap = h('div', { class: 'modal-wrap', onclick: (ev) => { if (ev.target === wrap) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, icon('x'))),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', { class: 'btn ' + (a.kind || ''), onclick: async () => { const keep = await a.onClick?.(); if (keep !== true) close(); } }, a.label))) : null,
    ));
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  setTimeout(() => wrap.querySelector('input,select,textarea,button.btn')?.focus(), 30);
  return close;
}

export function empty(text, sub) {
  return h('div', { class: 'empty' }, h('p', null, text), sub ? h('small', null, sub) : null);
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
}
