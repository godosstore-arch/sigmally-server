import { h, icon, fmt, toast, modal, field, empty, initials } from '../ui.js';

export async function renderPatients(main, { api, me }) {
  const c = me.clinic;
  let tab = 'all';
  let q = '';
  let list = await api.patients('');
  let wl = await api.waitlist();
  const body = h('div');
  const search = h('input', { type: 'search', placeholder: 'Buscar por nombre o teléfono', 'aria-label': 'Buscar paciente', oninput: () => { q = search.value; clearTimeout(search._t); search._t = setTimeout(async () => { list = await api.patients(q); draw(); }, 200); } });
  const tabs = h('div', { class: 'tabs' });

  function drawTabs() {
    tabs.innerHTML = '';
    const due = list.filter((p) => p.recallDue).length;
    for (const [k, label] of [['all', `Todos (${list.length})`], ['recall', `Control pendiente (${due})`], ['wait', `Lista de espera (${wl.length})`]]) {
      tabs.append(h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; draw(); } }, label));
    }
  }

  function draw() {
    drawTabs();
    body.innerHTML = '';
    if (tab === 'wait') {
      if (!wl.length) { body.append(empty('Nadie en lista de espera.', 'Cuando no hay horario, Asiste ofrece anotar al paciente y le escribe apenas se libera un espacio.')); return; }
      body.append(h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', null, 'Paciente'), h('th', null, 'Servicio'), h('th', null, 'Desde'), h('th', null, 'Estado'))),
        h('tbody', null, wl.map((w) => h('tr', null, h('td', null, w.patient?.name || fmt.phone(w.patient?.phone)), h('td', null, w.serviceName), h('td', null, fmt.rel(w.createdAt, Date.now())), h('td', null, w.status === 'offered' ? 'Se le ofreció un espacio' : 'Esperando'))))));
      return;
    }
    const rows = tab === 'recall' ? list.filter((p) => p.recallDue) : list;
    if (!rows.length) { body.append(empty(tab === 'recall' ? 'No hay controles pendientes.' : 'Sin resultados.')); return; }
    body.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, 'Paciente'), h('th', null, 'WhatsApp'), h('th', { class: 'num' }, 'Visitas'), h('th', null, 'Última visita'), h('th', null, 'Próxima cita'), h('th', null, ''))),
      h('tbody', null, rows.slice(0, 300).map((p) => h('tr', { onclick: () => open(p), tabindex: '0', onkeydown: (ev) => { if (ev.key === 'Enter') open(p); } },
        h('td', null, h('span', { class: 'cell-person' }, h('span', { class: 'av sm' }, initials(p.name)), h('b', null, p.name || 'Sin nombre'))),
        h('td', { class: 'mono' }, fmt.phone(p.phone)),
        h('td', { class: 'num' }, p.visits, p.noShows ? h('small', { class: 'muted' }, ` · ${p.noShows} falta${p.noShows > 1 ? 's' : ''}`) : null),
        h('td', null, p.lastVisit ? `${fmt.dayShort(p.lastVisit, c.tz)}${p.lastService ? ' · ' + p.lastService : ''}` : '—'),
        h('td', null, p.next ? `${fmt.dayShort(p.next, c.tz)} · ${fmt.time(p.next, c.tz)}` : '—'),
        h('td', null, p.recallDue ? h('span', { class: 'pill st-deposit' }, 'Control pendiente') : p.optedOut ? h('span', { class: 'pill st-cancel' }, 'BAJA') : null)))))));
  }

  function open(p) {
    const name = h('input', { value: p.name || '' });
    const notes = h('textarea', { rows: 4, placeholder: 'Notas internas (no las ve el paciente). Se guardan cifradas.' }, p.notes || '');
    const opt = h('input', { type: 'checkbox', checked: p.optedOut });
    modal(p.name || fmt.phone(p.phone), h('div', { class: 'form-grid one' },
      field('Nombre', name), field('Notas', notes),
      h('label', { class: 'check' }, opt, h('span', null, 'No enviar recordatorios ni avisos (BAJA)')),
      h('p', { class: 'muted small' }, `${p.visits} visitas · ${p.noShows} inasistencias · WhatsApp ${fmt.phone(p.phone)}`)), [
      { label: 'Guardar', onClick: async () => { await api.updatePatient(p.id, { name: name.value.trim(), notes: notes.value, optedOut: opt.checked }); toast('Paciente actualizado'); list = await api.patients(q); draw(); } },
    ]);
  }

  main.append(h('div', { class: 'page-head slim' }, h('h1', null, 'Pacientes'), h('div', { class: 'search' }, icon('search'), search)), tabs, body);
  draw();
}
