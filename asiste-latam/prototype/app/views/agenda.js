import { h, icon, fmt, pill, toast, modal, field } from '../ui.js';
import { local, toUtc, addDays, dowOf, hm, DAYS_SHORT, MONTHS_SHORT } from '../../shared/time.js';
import { words } from '../../shared/countries.js';

export async function renderAgenda(main, { api, me }) {
  const c = me.clinic;
  const W = words(c.country);
  const tz = c.tz;
  const todayKey = local(Date.now(), tz).dateKey;
  let start = addDays(todayKey, -((dowOf(todayKey) + 6) % 7)); // lunes
  let staffFilter = '';
  let dayMode = window.innerWidth < 760;
  let dayKey = todayKey;

  const hoursAll = Object.values(c.hours).flat();
  const minH = Math.floor(Math.min(...hoursAll.map(([a]) => hm(a)), 8 * 60) / 60);
  const maxH = Math.ceil(Math.max(...hoursAll.map(([, b]) => hm(b)), 18 * 60) / 60);
  const PX = 52; // píxeles por hora

  const title = h('h2', { class: 'week-title' });
  const grid = h('div', { class: 'cal' });
  const staffSel = h('select', { 'aria-label': 'Profesional', onchange: () => { staffFilter = staffSel.value; draw(); } },
    h('option', { value: '' }, 'Todos los profesionales'), c.staff.map((s) => h('option', { value: s.id }, s.name)));

  const bar = h('div', { class: 'cal-bar' },
    h('div', { class: 'nav-week' },
      h('button', { class: 'icon-btn', 'aria-label': 'Anterior', onclick: () => { if (dayMode) dayKey = addDays(dayKey, -1); else start = addDays(start, -7); draw(); } }, icon('left')),
      h('button', { class: 'btn sm ghost', onclick: () => { start = addDays(todayKey, -((dowOf(todayKey) + 6) % 7)); dayKey = todayKey; draw(); } }, 'Hoy'),
      h('button', { class: 'icon-btn', 'aria-label': 'Siguiente', onclick: () => { if (dayMode) dayKey = addDays(dayKey, 1); else start = addDays(start, 7); draw(); } }, icon('right')),
      title),
    h('div', { class: 'cal-tools' }, c.staff.length > 1 ? staffSel : null, h('button', { class: 'btn sm', onclick: () => newAppt() }, icon('plus'), `Nueva ${W.cita}`)));

  main.append(h('div', { class: 'page-head slim' }, h('h1', null, 'Agenda'), h('p', { class: 'muted' }, `Lo que agenda Asiste aparece aquí al instante. Toque ${W.una} ${W.cita} para confirmarla, moverla o cancelarla.`)), bar, h('div', { class: 'cal-scroll' }, grid),
    h('div', { class: 'cal-legend' }, ['booked', 'confirmed', 'pending_deposit', 'completed', 'no_show'].map((s) => pill(s))));

  async function draw() {
    const days = dayMode ? [dayKey] : Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((d) => (c.hours[dowOf(d)] || []).length || dowOf(d) !== 0);
    const from = toUtc(days[0], 0, tz), to = toUtc(addDays(days[days.length - 1], 1), 0, tz);
    const appts = (await api.appointments(from, to)).filter((a) => a.status !== 'cancelled' && (!staffFilter || a.staffId === staffFilter));
    const [y1, m1, d1] = days[0].split('-').map(Number), [, m2, d2] = days[days.length - 1].split('-').map(Number);
    title.textContent = dayMode ? cap(fmt.day(toUtc(dayKey, 600, tz), tz)) : `${d1} ${MONTHS_SHORT[m1 - 1]} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y1}`;
    grid.innerHTML = '';
    grid.style.setProperty('--cols', days.length);
    grid.append(h('div', { class: 'cal-corner' }), ...days.map((d) => {
      const [, , dd] = d.split('-').map(Number);
      return h('div', { class: 'cal-dayhead' + (d === todayKey ? ' today' : '') }, h('small', null, DAYS_SHORT[dowOf(d)]), h('b', null, dd));
    }));
    const hours = h('div', { class: 'cal-hours' }, Array.from({ length: maxH - minH }, (_, i) => h('div', { style: { height: PX + 'px' } }, `${minH + i}:00`)));
    grid.append(hours);
    for (const d of days) {
      const col = h('div', { class: 'cal-col', style: { height: (maxH - minH) * PX + 'px' } });
      const wins = c.hours[dowOf(d)] || c.hours[String(dowOf(d))] || [];
      for (const [a, b] of wins) col.append(h('div', { class: 'open', style: { top: ((hm(a) - minH * 60) / 60) * PX + 'px', height: ((hm(b) - hm(a)) / 60) * PX + 'px' } }));
      const mine = appts.filter((a) => local(a.start, tz).dateKey === d);
      // columnas paralelas por profesional
      const lanes = staffFilter || c.staff.length < 2 ? [null] : c.staff.map((s) => s.id);
      for (const a of mine) {
        const l = local(a.start, tz);
        const top = ((l.minutes - minH * 60) / 60) * PX;
        const height = Math.max(20, ((a.end - a.start) / 3600000) * PX - 2);
        const lane = lanes.length > 1 ? Math.max(0, lanes.indexOf(a.staffId)) : 0;
        const w = 100 / lanes.length;
        col.append(h('button', {
          class: `ev st-${a.status}` + (a.source === 'assistant' ? ' by-bot' : ''),
          style: { top: top + 'px', height: height + 'px', left: `calc(${lane * w}% + 2px)`, width: `calc(${w}% - 4px)` },
          title: `${fmt.time(a.start, tz)} · ${a.patient?.name || ''} · ${a.serviceName}`,
          onclick: () => detail(a),
        }, h('b', null, `${fmt.time(a.start, tz).replace(' a. m.', '').replace(' p. m.', '')} ${a.patient?.name?.split(' ')[0] || ''}`), height > 34 ? h('small', null, a.serviceName) : null));
      }
      if (d === todayKey) {
        const nl = local(Date.now(), tz).minutes;
        if (nl > minH * 60 && nl < maxH * 60) col.append(h('div', { class: 'now-line', style: { top: ((nl - minH * 60) / 60) * PX + 'px' } }));
      }
      grid.append(col);
    }
  }

  function detail(a) {
    const actions = [];
    if (['booked', 'pending_deposit'].includes(a.status)) actions.push({ label: 'Confirmar', onClick: () => upd(a, { status: 'confirmed' }, `${W.Cita} confirmada`) });
    if (a.status === 'pending_deposit') actions.push({ label: 'Adelanto recibido', onClick: () => upd(a, { depositStatus: 'received' }, 'Adelanto validado; se avisó al paciente') });
    if (['booked', 'confirmed'].includes(a.status) && a.start < Date.now() + 3600000) {
      actions.push({ label: 'Llegó', kind: 'ghost', onClick: () => upd(a, { status: 'completed' }, 'Marcada como atendida') });
      actions.push({ label: 'No vino', kind: 'ghost', onClick: () => upd(a, { status: 'no_show' }, 'Inasistencia registrada') });
    }
    if (['booked', 'confirmed', 'pending_deposit'].includes(a.status)) {
      actions.push({ label: 'Mover', kind: 'ghost', onClick: () => { move(a); } });
      actions.push({ label: 'Cancelar', kind: 'ghost danger', onClick: () => upd(a, { status: 'cancelled' }, `${W.Cita} cancelada. Si hay lista de espera, Asiste ofrecerá el espacio.`) });
    }
    modal(`${cap(fmt.day(a.start, tz))}, ${fmt.time(a.start, tz)}`, h('div', { class: 'detail' },
      h('p', null, h('b', null, a.patient?.name || 'Paciente'), h('br'), fmt.phone(a.patient?.phone)),
      h('p', null, a.serviceName, a.staffName ? ` · ${a.staffName}` : '', a.price != null ? ` · ${fmt.money(a.price, c.country)}` : ''),
      h('p', null, pill(a.status), ' ', a.source === 'assistant' ? h('span', { class: 'muted small' }, 'Agendada por Asiste') : h('span', { class: 'muted small' }, 'Agendada por recepción')),
      a.depositStatus === 'review' ? h('p', { class: 'note-warn' }, 'El paciente envió su constancia de pago. Revísela en Conversaciones.') : null), actions);
  }

  async function upd(a, patch, msg) {
    try { await api.updateAppointment(a.id, patch); toast(msg); draw(); } catch (e) { toast(e.message, 'err'); }
  }

  function move(a) {
    const day = h('input', { type: 'date', value: local(a.start, tz).dateKey, min: todayKey });
    const slotsBox = h('div', { class: 'slot-grid' });
    let chosen = null;
    async function load() {
      slotsBox.innerHTML = '';
      const s = await api.slots(a.serviceId, day.value, a.staffId);
      if (!s.length) { slotsBox.append(h('p', { class: 'muted small' }, 'Sin horarios libres ese día.')); return; }
      s.forEach((x) => slotsBox.append(h('button', { class: 'slot', onclick: (ev) => { chosen = x; slotsBox.querySelectorAll('.slot').forEach((b) => b.classList.remove('on')); ev.currentTarget.classList.add('on'); } }, fmt.time(x.start, tz))));
    }
    day.addEventListener('change', load);
    load();
    modal(`Mover ${W.la} ${W.cita} de ${a.patient?.name || 'paciente'}`, h('div', null, field('Día', day), h('p', { class: 'muted small' }, 'Horarios libres'), slotsBox, h('p', { class: 'muted small' }, 'Asiste le avisará al paciente por WhatsApp.')), [
      { label: 'Guardar', onClick: async () => { if (!chosen) { toast('Elija un horario', 'err'); return true; } await upd(a, { start: chosen.start, staffId: chosen.staffId }, `${W.Cita} movida y paciente avisado`); } },
    ]);
  }

  function newAppt() {
    const phone = h('input', { type: 'tel', placeholder: c.country === 'PE' ? '987 654 321' : 'Teléfono', required: true });
    const name = h('input', { placeholder: 'Nombre y apellido' });
    const svc = h('select', null, c.services.map((s) => h('option', { value: s.id }, `${s.name} · ${s.duration} min`)));
    const day = h('input', { type: 'date', value: dayMode ? dayKey : todayKey, min: todayKey });
    const slotsBox = h('div', { class: 'slot-grid' });
    let chosen = null;
    async function load() {
      chosen = null;
      slotsBox.innerHTML = '';
      const s = await api.slots(svc.value, day.value);
      if (!s.length) { slotsBox.append(h('p', { class: 'muted small' }, 'Sin horarios libres ese día.')); return; }
      s.forEach((x) => slotsBox.append(h('button', { class: 'slot', type: 'button', onclick: (ev) => { chosen = x; slotsBox.querySelectorAll('.slot').forEach((b) => b.classList.remove('on')); ev.currentTarget.classList.add('on'); } }, fmt.time(x.start, tz) + (c.staff.length > 1 && x.staffId ? ' · ' + (c.staff.find((t) => t.id === x.staffId)?.name.split(' ').slice(-1)[0] || '') : ''))));
    }
    svc.addEventListener('change', load);
    day.addEventListener('change', load);
    load();
    modal(`Nueva ${W.cita}`, h('div', { class: 'form-grid' }, field('WhatsApp del paciente', phone), field('Nombre', name), field('Servicio', svc), field('Día', day), h('div', { class: 'full' }, h('p', { class: 'muted small' }, 'Horarios libres'), slotsBox)), [
      { label: `Guardar ${W.cita}`, onClick: async () => {
        if (!chosen) { toast('Elija un horario', 'err'); return true; }
        try { await api.createAppointment({ phone: phone.value, patientName: name.value.trim(), serviceId: svc.value, staffId: chosen.staffId, start: chosen.start }); toast(`${W.Cita} guardada. Asiste enviará el recordatorio.`); draw(); } catch (e) { toast(e.message, 'err'); return true; }
      } },
    ]);
  }

  const onResize = () => { const m = window.innerWidth < 760; if (m !== dayMode) { dayMode = m; draw(); } };
  window.addEventListener('resize', onResize);
  await draw();
  return () => window.removeEventListener('resize', onResize);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
