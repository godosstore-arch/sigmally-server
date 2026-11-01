// Simulador: escribir como paciente y ver exactamente lo que respondería Asiste por WhatsApp.
import { h, icon, fmt, toast } from '../ui.js';
import { words } from '../../shared/countries.js';

export async function renderTry(main, { api, me, refreshCounts }) {
  const c = me.clinic;
  const W = words(c.country);
  const svc = c.services[1] || c.services[0];
  const ideas = [
    'Hola, buenas noches',
    `¿Cuánto cuesta ${svc.name.toLowerCase()}?`,
    `Quiero ${W.una} ${W.cita} mañana en la tarde`,
    'el sábado temprano',
    `Necesito cambiar mi ${W.cita}`,
    `¿A qué hora es mi ${W.cita}?`,
    'Atienden los domingos? dónde quedan?',
    'Quiero hablar con una persona',
    c.country === 'PE' ? '¿Aceptan Yape?' : '¿Formas de pago?',
    'Me sangra mucho y no para',
  ];
  const session = String(Date.now() % 100000);
  const msgs = h('div', { class: 'sim-msgs', 'aria-live': 'polite' });
  const input = h('input', { placeholder: 'Escriba como paciente…', 'aria-label': 'Mensaje', autocomplete: 'off' });
  const log = h('ul', { class: 'sim-log' });

  function add(side, text, buttons, rows, button) {
    const b = h('div', { class: 'wb ' + side }, h('p', null, text), h('time', null, fmt.time(Date.now(), c.tz)));
    msgs.append(b);
    if (buttons?.length) msgs.append(h('div', { class: 'wqr' }, buttons.map((x) => h('button', { onclick: () => send({ id: x.id, title: x.title }) }, x.title))));
    if (rows?.length) {
      const sheet = h('div', { class: 'wlist', hidden: true }, rows.map((r) => h('button', { onclick: () => { sheet.hidden = true; send({ id: r.id, title: r.title }); } }, h('b', null, r.title), r.description ? h('small', null, r.description) : null)));
      msgs.append(h('div', { class: 'wqr' }, h('button', { onclick: () => { sheet.hidden = !sheet.hidden; msgs.scrollTop = msgs.scrollHeight; } }, '☰ ' + (button || 'Ver opciones'))), sheet);
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function send(m) {
    const text = m.title || m.text;
    if (!text) return;
    add('in', text);
    input.value = '';
    msgs.append(h('div', { class: 'typing' }, h('i'), h('i'), h('i')));
    msgs.scrollTop = msgs.scrollHeight;
    try {
      const r = await api.simulate({ ...m, session });
      msgs.querySelector('.typing')?.remove();
      for (const rep of r.replies) add('out', rep.text, rep.buttons, rep.rows, rep.button);
      const ev = r.events.filter((e) => ['booked', 'freed', 'handoff'].includes(e));
      for (const e of ev) log.prepend(h('li', null, e === 'booked' ? `✓ ${W.Cita} registrada en la agenda` : e === 'freed' ? '↺ Se liberó un horario (lista de espera avisada)' : '! Se avisó a recepción'));
      if (ev.length) refreshCounts();
    } catch (e) {
      msgs.querySelector('.typing')?.remove();
      toast(e.message, 'err');
    }
  }

  const phone = h('div', { class: 'sim-phone' },
    h('div', { class: 'sim-top' }, h('span', { class: 'av' }, c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')), h('div', null, h('b', null, c.name), h('small', null, 'en línea'))),
    msgs,
    h('form', { class: 'sim-input', onsubmit: (ev) => { ev.preventDefault(); send({ text: input.value.trim() }); } }, input, h('button', { class: 'send', 'aria-label': 'Enviar' }, icon('send'))));

  main.append(
    h('div', { class: 'page-head slim' }, h('h1', null, 'Probar como paciente'), h('p', { class: 'muted' }, 'Lo que escriba aquí recibe la misma respuesta que recibiría un paciente por WhatsApp, con su agenda real. Las citas que agende aparecen en Agenda.')),
    h('div', { class: 'sim' }, phone,
      h('div', { class: 'sim-side' },
        h('h3', null, 'Ideas para probar'),
        h('div', { class: 'chips' }, ideas.map((t) => h('button', { class: 'chip', onclick: () => send({ text: t }) }, t))),
        h('h3', null, 'Qué pasó en la clínica'), log,
        h('button', { class: 'btn sm ghost', onclick: async () => { await api.simReset({ session }); msgs.innerHTML = ''; log.innerHTML = ''; toast('Conversación reiniciada'); } }, icon('refresh'), 'Empezar de nuevo'))));
  input.focus();
}
