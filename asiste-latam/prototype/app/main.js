// Panel de Asiste: arranque, ingreso y navegación.
import { h, icon, toast } from './ui.js';
import { createHttpApi } from './api-http.js';
import { createDemoApi } from './api-demo.js';
import { renderToday } from './views/today.js';
import { renderInbox } from './views/inbox.js';
import { renderAgenda } from './views/agenda.js';
import { renderPatients } from './views/patients.js';
import { renderTry } from './views/try.js';
import { renderSettings } from './views/settings.js';
import { renderClinics } from './views/clinics.js';

const params = new URLSearchParams(location.search);
const DEMO = document.documentElement.dataset.mode === 'demo';
const api = DEMO ? createDemoApi(params) : createHttpApi();
const root = document.getElementById('root');

const NAV = [
  ['hoy', 'Hoy', 'today', renderToday],
  ['bandeja', 'Conversaciones', 'inbox', renderInbox],
  ['agenda', 'Agenda', 'cal', renderAgenda],
  ['pacientes', 'Pacientes', 'users', renderPatients],
  ['probar', 'Probar como paciente', 'phone', renderTry],
  ['ajustes', 'Ajustes', 'gear', renderSettings],
];

let me = null;
let current = null;
let cleanup = null;

function loginView(err) {
  root.innerHTML = '';
  const email = h('input', { type: 'email', required: true, autocomplete: 'username', placeholder: 'correo@clinica.com' });
  const pass = h('input', { type: 'password', required: true, autocomplete: 'current-password', placeholder: 'Contraseña' });
  const msg = h('p', { class: 'login-err', role: 'alert' }, err || '');
  const form = h('form', { class: 'login-card', onsubmit: async (ev) => {
    ev.preventDefault();
    msg.textContent = '';
    try { await api.login(email.value, pass.value); await start(); } catch (e) { msg.textContent = e.message; }
  } },
  h('div', { class: 'brand' }, logo(), h('span', null, 'Asiste')),
  h('h1', null, 'Ingresar al panel'),
  h('label', { class: 'field' }, h('span', null, 'Correo'), email),
  h('label', { class: 'field' }, h('span', null, 'Contraseña'), pass),
  msg,
  h('button', { class: 'btn wide', type: 'submit' }, 'Ingresar'),
  h('p', { class: 'muted small' }, '¿Olvidó su contraseña? Escriba a soporte por WhatsApp.'));
  root.append(h('div', { class: 'login' }, form));
  email.focus();
}

function logo() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 32 32');
  s.setAttribute('class', 'logo-mark');
  s.innerHTML = '<rect width="32" height="32" rx="8" fill="#0f4c3a"/><path d="M9 21.5l5-11h4l5 11" fill="none" stroke="#f5f2ec" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.2 17.5h7.6" stroke="#e7b58f" stroke-width="2.4" stroke-linecap="round"/>';
  return s;
}

function shell() {
  root.innerHTML = '';
  const nav = NAV.filter(([key]) => key !== 'ajustes' || me.user.role !== 'staff');
  if (me.user.role === 'owner') nav.push(['clinicas', 'Mis clínicas', 'building', renderClinics]);
  const links = nav.map(([key, label, ic]) => h('a', { href: '#/' + key, 'data-k': key, class: 'nav-link' }, icon(ic), h('span', null, label), h('b', { class: 'count', hidden: true })));
  const side = h('aside', { class: 'side' },
    h('div', { class: 'brand' }, logo(), h('span', null, 'Asiste')),
    me.clinic ? h('div', { class: 'clinic-name' }, h('small', null, 'Clínica'), h('b', null, me.clinic.name)) : null,
    h('nav', { 'aria-label': 'Secciones' }, links),
    h('div', { class: 'side-foot' },
      h('div', { class: 'who' }, h('b', null, me.user.name || me.user.email), h('small', null, DEMO ? 'Modo demostración' : roleName(me.user.role))),
      DEMO ? null : h('button', { class: 'icon-btn', title: 'Salir', 'aria-label': 'Salir', onclick: async () => { await api.logout(); loginView(); } }, icon('logout'))));
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  const banner = DEMO ? demoBanner() : null;
  const mobileTop = h('header', { class: 'mtop' }, h('div', { class: 'brand' }, logo(), h('span', null, me.clinic?.name || 'Asiste')));
  root.append(h('div', { class: 'layout' + (DEMO ? ' has-banner' : '') }, banner, mobileTop, side, main));
  window.onhashchange = route;
  route();
  refreshCounts();
}

function roleName(r) {
  return r === 'owner' ? 'Dueño de la cuenta' : r === 'admin' ? 'Administración' : 'Recepción';
}

function demoBanner() {
  const wa = `https://wa.me/${document.documentElement.dataset.wa || ''}?text=` + encodeURIComponent(`Hola, vi la demo de Asiste para ${me.clinic.name} y quiero más información`);
  return h('div', { class: 'demo-banner' },
    h('span', null, h('b', null, 'Demo para ' + me.clinic.name + '. '), 'Datos de ejemplo. Pruebe escribir como paciente en ', h('a', { href: '#/probar' }, 'Probar como paciente'), '.'),
    h('a', { class: 'btn sm light', href: wa, target: '_blank', rel: 'noopener' }, 'Lo quiero para mi clínica'));
}

async function refreshCounts() {
  try {
    const list = await api.conversations();
    const n = list.filter((c) => c.attention).length;
    const b = root.querySelector('.nav-link[data-k="bandeja"] .count');
    if (b) { b.hidden = !n; b.textContent = n; }
  } catch { /* silencioso */ }
}

async function route() {
  const key = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'hoy';
  const arg = location.hash.split('/')[2] || null;
  const item = NAV.find(([k]) => k === key) || (key === 'clinicas' && me.user.role === 'owner' ? ['clinicas', 'Mis clínicas', 'building', renderClinics] : NAV[0]);
  root.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.k === item[0]));
  const main = document.getElementById('main');
  if (cleanup) { try { cleanup(); } catch { /* */ } cleanup = null; }
  main.innerHTML = '';
  current = item[0];
  if (!me.clinic && item[0] !== 'clinicas') { location.hash = '#/clinicas'; return; }
  try {
    cleanup = await item[3](main, { api, me, arg, demo: DEMO, refreshCounts, reloadMe }) || null;
  } catch (e) {
    if (e.status === 401) return loginView('Su sesión venció. Ingrese de nuevo.');
    main.append(h('div', { class: 'empty' }, h('p', null, 'No se pudo cargar esta sección.'), h('small', null, e.message)));
  }
  main.focus({ preventScroll: true });
}

async function reloadMe() {
  me = await api.me();
  shell();
}

async function start() {
  try {
    me = await api.me();
    shell();
  } catch (e) {
    if (e.status === 401) loginView();
    else { root.innerHTML = ''; root.append(h('div', { class: 'empty' }, h('p', null, 'No se pudo conectar con el servidor.'), h('small', null, e.message))); }
  }
}

window.addEventListener('unhandledrejection', (ev) => { toast(ev.reason?.message || 'Ocurrió un error', 'err'); });
setInterval(() => { if (document.visibilityState === 'visible' && me) refreshCounts(); }, 30000);
start();
