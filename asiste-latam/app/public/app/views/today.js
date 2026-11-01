import { h, icon, fmt, pill, toast, empty, initials } from '../ui.js';
import { words } from '../../shared/countries.js';

export async function renderToday(main, { api, me }) {
  const c = me.clinic;
  const W = words(c.country);
  const d = await api.today();
  const m = d.metrics;

  const head = h('div', { class: 'page-head' },
    h('div', null, h('p', { class: 'eyebrow' }, cap(fmt.day(d.now, c.tz))), h('h1', null, greeting(d.now, c.tz, me.user.name))),
    h('div', { class: 'head-note' }, icon('bot'), h('span', null, 'Asiste está respondiendo el WhatsApp de la clínica')));

  const kpis = h('div', { class: 'kpis' },
    kpi(`${W.Cita}s agendadas por Asiste`, m.bookedByBot, 'últimos 30 días', 'accent'),
    kpi('Monto agendado por Asiste', fmt.money(m.bookedValue, c.country), 'a precios de referencia'),
    kpi('Confirmadas (próx. 48 h)', `${m.confirmed48} de ${m.upcoming48}`, m.upcoming48 ? `${Math.round((m.confirmed48 / m.upcoming48) * 100)} % confirmado` : 'sin citas próximas'),
    kpi('Inasistencias', fmt.pct(m.noShowRate), `${m.noShows} de ${m.pastVisits} ${W.citas} · 30 días`),
    kpi('Mensajes fuera de horario', m.afterHours, 'respondidos al instante'),
  );

  const chart = h('section', { class: 'card chart-card' },
    h('div', { class: 'card-head' }, h('h2', null, `${W.Cita}s nuevas por día`), h('div', { class: 'legend' }, h('span', { class: 'lg bot' }, 'Asiste'), h('span', { class: 'lg staff' }, 'Recepción'))),
    barChart(m.series));

  const list = d.appointments;
  const nowMs = d.now;
  const agenda = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, `Agenda de hoy`), h('span', { class: 'muted' }, `${list.length} ${list.length === 1 ? W.cita : W.citas}`)),
    list.length ? h('ul', { class: 'day-list' }, list.map((a) => apptRow(a))) : empty(`No hay ${W.citas} para hoy.`, 'Las que agende Asiste aparecerán aquí al instante.'));

  function apptRow(a) {
    const past = a.end < nowMs;
    const actions = h('div', { class: 'row-actions' });
    if (['booked', 'confirmed'].includes(a.status) && a.start < nowMs + 30 * 60000) {
      actions.append(
        h('button', { class: 'btn xs ghost', onclick: () => setStatus(a, 'completed') }, 'Llegó'),
        h('button', { class: 'btn xs ghost danger', onclick: () => setStatus(a, 'no_show') }, 'No vino'));
    }
    return h('li', { class: past && a.status === 'completed' ? 'done' : '' },
      h('span', { class: 'time' }, fmt.time(a.start, c.tz)),
      h('span', { class: 'who' }, h('b', null, a.patient?.name || fmt.phone(a.patient?.phone)), h('small', null, `${a.serviceName}${a.staffName ? ' · ' + a.staffName : ''}`)),
      a.source === 'assistant' ? h('span', { class: 'src', title: 'Agendada por Asiste' }, icon('bot')) : h('span', { class: 'src' }),
      pill(a.status), actions);
  }

  async function setStatus(a, status) {
    await api.updateAppointment(a.id, { status });
    toast(status === 'completed' ? 'Marcado como atendido' : 'Marcado como inasistencia. Asiste le escribirá para reagendar.');
    main.innerHTML = '';
    renderToday(main, { api, me });
  }

  const att = d.attention;
  const attention = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Necesitan a una persona'), att.length ? h('span', { class: 'badge' }, att.length) : null),
    att.length ? h('ul', { class: 'att-list' }, att.map((x) => h('li', { class: x.urgent ? 'urgent' : '' },
      h('a', { href: `#/bandeja/${x.id}` },
        h('span', { class: 'av' }, initials(x.patient?.name || '?')),
        h('span', null, h('b', null, x.patient?.name || fmt.phone(x.patient?.phone)), h('small', null, x.reason || 'Pidió hablar con recepción')),
        h('small', { class: 'muted' }, fmt.rel(x.lastAt, nowMs)))))) : empty('Nada pendiente.', 'Asiste resolvió todas las conversaciones.'));

  const deposits = d.deposits.length ? h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Adelantos por validar'), h('span', { class: 'badge warn' }, d.deposits.length)),
    h('ul', { class: 'att-list' }, d.deposits.map((a) => h('li', null,
      h('div', { class: 'dep' },
        h('span', { class: 'av' }, icon('coin')),
        h('span', null, h('b', null, a.patient?.name || fmt.phone(a.patient?.phone)), h('small', null, `${fmt.dayShort(a.start, c.tz)} · ${fmt.time(a.start, c.tz)} · ${a.serviceName}${a.depositStatus === 'review' ? ' · envió constancia' : ''}`)),
        h('button', { class: 'btn xs', onclick: async () => { await api.updateAppointment(a.id, { depositStatus: 'received' }); toast(`Adelanto validado. Se avisó al paciente.`); main.innerHTML = ''; renderToday(main, { api, me }); } }, 'Recibido')))))) : null;

  main.append(head, kpis, h('div', { class: 'grid-main' }, h('div', { class: 'col' }, agenda, chart), h('div', { class: 'col' }, attention, deposits)));
}

function kpi(label, value, sub, cls = '') {
  return h('div', { class: 'kpi ' + cls }, h('small', null, label), h('b', null, String(value)), h('span', null, sub));
}

function barChart(series) {
  const W = 640, H = 170, pad = 22;
  const max = Math.max(4, ...series.map((s) => s.bot + s.staff));
  const bw = (W - pad * 2) / series.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 24}`);
  svg.setAttribute('class', 'bars');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Citas nuevas por día en las últimas dos semanas');
  let s = '';
  for (let i = 0; i <= 2; i++) { const y = H - (H - 10) * (i / 2); s += `<line x1="${pad}" x2="${W - pad}" y1="${y}" y2="${y}" class="grid"/>`; }
  series.forEach((d, i) => {
    const x = pad + i * bw + bw * 0.18, w = bw * 0.64;
    const hb = ((H - 10) * d.bot) / max, hs = ((H - 10) * d.staff) / max;
    s += `<rect x="${x}" y="${H - hb}" width="${w}" height="${hb}" rx="2" class="b-bot"><title>${d.day}: ${d.bot} por Asiste</title></rect>`;
    s += `<rect x="${x}" y="${H - hb - hs - (hs ? 2 : 0)}" width="${w}" height="${hs}" rx="2" class="b-staff"><title>${d.day}: ${d.staff} por recepción</title></rect>`;
    if (i % 2 === 1 || series.length < 10) s += `<text x="${x + w / 2}" y="${H + 16}" text-anchor="middle">${+d.day.slice(8)}</text>`;
  });
  svg.innerHTML = s;
  return svg;
}

function greeting(ms, tz, name) {
  const hr = new Date(ms).toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
  const g = +hr < 12 ? 'Buenos días' : +hr < 19 ? 'Buenas tardes' : 'Buenas noches';
  const first = String(name || '').split(' ')[0];
  return first && first !== 'Recepción' ? `${g}, ${first}` : `${g}`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
