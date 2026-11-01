import { h, icon, fmt, pill, toast, empty, initials } from '../ui.js';

export async function renderInbox(main, { api, me, arg, refreshCounts }) {
  const c = me.clinic;
  let filter = 'all';
  let list = await api.conversations();
  let openId = arg ? +arg || arg : null;
  const now = Date.now();

  const listEl = h('ul', { class: 'conv-list' });
  const pane = h('section', { class: 'conv-pane' });
  const tabs = h('div', { class: 'tabs' },
    tab('all', 'Todas'), tab('attention', 'Por atender'), tab('human', 'Con recepción'));

  function tab(k, label) {
    return h('button', { class: 'tab' + (filter === k ? ' on' : ''), onclick: () => { filter = k; tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.textContent === label)); drawList(); } }, label);
  }

  function drawList() {
    listEl.innerHTML = '';
    const rows = list.filter((x) => filter === 'all' || (filter === 'attention' ? x.attention : x.human));
    if (!rows.length) { listEl.append(h('li', { class: 'none' }, 'No hay conversaciones aquí.')); return; }
    for (const x of rows) {
      const who = x.patient?.name || fmt.phone(x.patient?.phone);
      const last = x.last ? (x.last.direction === 'out' ? (x.last.author === 'staff' ? 'Recepción: ' : 'Asiste: ') : '') + x.last.body.replace(/\s+/g, ' ') : '';
      listEl.append(h('li', { class: (x.id === openId ? 'open ' : '') + (x.attention ? 'att ' : '') + (x.urgent ? 'urgent' : '') },
        h('button', { onclick: () => open(x.id) },
          h('span', { class: 'av' }, initials(who)),
          h('span', { class: 'meta' },
            h('span', { class: 'line1' }, h('b', null, who), h('small', null, fmt.rel(x.lastAt, Date.now()))),
            h('span', { class: 'line2' }, x.attention ? h('em', { class: x.urgent ? 'tag urgent' : 'tag' }, x.urgent ? 'Urgente' : 'Persona') : x.human ? h('em', { class: 'tag soft' }, 'Recepción') : null, h('span', null, last.slice(0, 90)))),
          x.unread && x.attention ? h('i', { class: 'dot' }) : null)));
    }
  }

  async function open(id) {
    openId = id;
    history.replaceState(null, '', `#/bandeja/${id}`);
    drawList();
    main.classList.add('conv-open');
    const d = await api.conversation(id);
    const conv = list.find((x) => x.id === id);
    if (conv) conv.unread = 0;
    pane.innerHTML = '';
    const who = d.patient.name || fmt.phone(d.patient.phone);
    const human = d.conversation.human;
    const head = h('div', { class: 'conv-head' },
      h('button', { class: 'icon-btn back', 'aria-label': 'Volver', onclick: () => { main.classList.remove('conv-open'); } }, icon('left')),
      h('span', { class: 'av lg' }, initials(who)),
      h('div', null, h('b', null, who), h('small', null, fmt.phone(d.patient.phone))),
      h('div', { class: 'conv-actions' },
        human
          ? h('button', { class: 'btn sm ghost', onclick: async () => { await api.release(id); toast('Asiste vuelve a responder esta conversación'); await reload(id); } }, icon('bot'), 'Devolver a Asiste')
          : h('button', { class: 'btn sm ghost', onclick: async () => { await api.takeover(id); toast('Asiste se pausó en esta conversación'); await reload(id); } }, icon('hand'), 'Tomar conversación')));
    const reason = d.conversation.attention ? h('div', { class: 'conv-alert' + (d.conversation.urgent ? ' urgent' : '') }, icon('alert'), h('span', null, d.conversation.reason || 'El paciente necesita a una persona')) : null;
    const msgs = h('div', { class: 'msgs' }, groupByDay(d.messages).map(([day, ms]) => [h('div', { class: 'msg-day' }, day), ms.map(bubble)]));
    const input = h('textarea', { rows: 1, placeholder: human ? 'Escriba su respuesta…' : 'Escriba para responder (Asiste se pausará en esta conversación)', 'aria-label': 'Respuesta' });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; });
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); } });
    async function send() {
      const t = input.value.trim();
      if (!t) return;
      try { await api.reply(id, t); input.value = ''; await reload(id); refreshCounts(); } catch (e) { toast(e.message, 'err'); }
    }
    const composer = h('div', { class: 'composer' }, input, h('button', { class: 'btn', onclick: send, 'aria-label': 'Enviar' }, icon('send')));
    const info = h('aside', { class: 'conv-info' },
      h('h3', null, 'Próximas citas'),
      d.upcoming.length ? d.upcoming.map((a) => h('div', { class: 'mini-appt' }, h('b', null, `${cap(fmt.dayShort(a.start, c.tz))} · ${fmt.time(a.start, c.tz)}`), h('small', null, a.serviceName + (a.staffName ? ' · ' + a.staffName : '')), pill(a.status))) : h('p', { class: 'muted small' }, 'Sin citas próximas.'),
      h('h3', null, 'Historial'),
      d.history.length ? d.history.slice(0, 6).map((a) => h('div', { class: 'mini-appt past' }, h('b', null, fmt.dayShort(a.start, c.tz)), h('small', null, a.serviceName), pill(a.status))) : h('p', { class: 'muted small' }, 'Paciente nuevo.'),
      d.patient.optedOut ? h('p', { class: 'muted small' }, 'Pidió no recibir recordatorios (BAJA).') : null);
    pane.append(h('div', { class: 'conv-main' }, head, reason, msgs, composer), info);
    msgs.scrollTop = msgs.scrollHeight;
    if (d.conversation.attention) { const x = list.find((y) => y.id === id); refreshCounts(); if (x) x.unread = 0; }
  }

  async function reload(id) {
    list = await api.conversations();
    await open(id);
  }

  function groupByDay(ms) {
    const out = [];
    for (const m of ms) {
      const day = cap(fmt.day(m.at, c.tz));
      if (!out.length || out[out.length - 1][0] !== day) out.push([day, []]);
      out[out.length - 1][1].push(m);
    }
    return out;
  }

  function bubble(m) {
    const side = m.direction === 'in' ? 'in' : 'out';
    const tag = m.direction === 'out' ? h('span', { class: 'by ' + m.author }, m.author === 'staff' ? 'Recepción' : 'Asiste') : null;
    const btns = m.meta?.buttons?.length ? h('div', { class: 'qr' }, m.meta.buttons.map((b) => h('span', null, b.title))) : m.meta?.rows?.length ? h('div', { class: 'qr list' }, h('span', null, '☰ ' + (m.meta.button || 'Ver opciones'))) : null;
    return h('div', { class: `bubble ${side} ${m.author}` }, tag, h('p', null, m.body), h('time', null, fmt.time(m.at, c.tz)), btns);
  }

  main.append(h('div', { class: 'page-head slim' }, h('h1', null, 'Conversaciones'), h('p', { class: 'muted' }, 'Todo lo que escriben los pacientes y lo que Asiste responde. Si usted escribe, Asiste se pausa en esa conversación.')),
    h('div', { class: 'inbox' }, h('div', { class: 'conv-side' }, tabs, listEl), pane));
  drawList();
  if (openId) await open(openId);
  else if (list.length && window.innerWidth > 900) await open((list.find((x) => x.attention) || list[0]).id);
  else pane.append(empty('Elija una conversación.'));
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
