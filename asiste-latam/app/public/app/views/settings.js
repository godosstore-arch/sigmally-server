// Ajustes de la clínica: lo que Asiste sabe y puede decir.
import { h, icon, toast, field, modal } from '../ui.js';
import { DAYS } from '../../shared/time.js';
import { country, words } from '../../shared/countries.js';

export async function renderSettings(main, { api, me, demo, reloadMe }) {
  const cfg = structuredClone(me.clinic);
  const W = words(cfg.country);
  const C = country(cfg.country);
  const inp = (obj, key, attrs = {}) => {
    const el = h(attrs.tag || 'input', { ...attrs, tag: null, value: obj[key] ?? '' });
    if (attrs.tag === 'textarea') el.value = obj[key] ?? '';
    el.addEventListener('input', () => { obj[key] = attrs.type === 'number' ? (el.value === '' ? null : +el.value) : el.value; });
    return el;
  };

  // --- Datos generales
  const general = section('Clínica', 'Lo que Asiste responde cuando preguntan dónde están o cómo pagar.',
    h('div', { class: 'form-grid' },
      field('Nombre', inp(cfg, 'name')),
      field('Ciudad', inp(cfg, 'city')),
      field('Dirección', inp(cfg, 'address'), 'Se envía en la confirmación y el recordatorio.'),
      field('Referencia', inp(cfg, 'reference', { placeholder: 'Frente al parque, 2.º piso' })),
      field('Link de Google Maps', inp(cfg, 'mapsUrl', { placeholder: 'https://maps.app.goo.gl/…' })),
      field('Medios de pago', inp(cfg, 'payments', { placeholder: C.payments })),
      field('Seguros / convenios', inp(cfg, 'insurance', { tag: 'textarea', rows: 2, placeholder: 'Atendemos particular y EPS. Consulte su cobertura.' })),
      field('Estacionamiento', inp(cfg, 'parking', { placeholder: 'Contamos con cochera para 4 autos' })),
      field(C.code === 'PE' ? 'RUC (para el aviso de privacidad)' : 'Identificación fiscal', inp(cfg, 'legalId'))));

  // --- Horario
  const hoursBox = h('div', { class: 'hours' });
  function drawHours() {
    hoursBox.innerHTML = '';
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      const wins = cfg.hours[d] || (cfg.hours[d] = []);
      const row = h('div', { class: 'hour-row' }, h('b', null, cap(DAYS[d])));
      const box = h('div', { class: 'wins' });
      if (!wins.length) box.append(h('span', { class: 'muted' }, 'Cerrado'));
      wins.forEach((w, i) => {
        const a = h('input', { type: 'time', value: w[0], step: 900, onchange: () => { w[0] = a.value; } });
        const b = h('input', { type: 'time', value: w[1], step: 900, onchange: () => { w[1] = b.value; } });
        box.append(h('span', { class: 'win' }, a, '–', b, h('button', { class: 'icon-btn', 'aria-label': 'Quitar turno', onclick: () => { wins.splice(i, 1); drawHours(); } }, icon('x'))));
      });
      row.append(box, h('button', { class: 'btn xs ghost', onclick: () => { wins.push(wins.length ? ['15:00', '19:00'] : ['09:00', '13:00']); drawHours(); } }, '+ turno'));
      hoursBox.append(row);
    }
  }
  drawHours();
  const closed = inp({ v: (cfg.closedDates || []).join(', ') }, 'v', { placeholder: '2026-12-25, 2027-01-01' });
  closed.addEventListener('input', () => { cfg.closedDates = closed.value.split(/[,\s]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)); });
  const hours = section('Horario de atención', 'Asiste solo ofrece horarios dentro de estos turnos.', hoursBox,
    h('div', { class: 'form-grid' },
      field('Feriados y días cerrados', closed, 'Formato AAAA-MM-DD, separados por coma.'),
      field(`Anticipación mínima para agendar (minutos)`, inp(cfg, 'minNoticeMinutes', { type: 'number', min: 0, step: 15 })),
      field('Agenda abierta hasta (días)', inp(cfg, 'maxDaysAhead', { type: 'number', min: 1, max: 120 })),
      field('Pacientes a la vez (si no separa por profesional)', inp(cfg, 'capacity', { type: 'number', min: 1, max: 20 }))));

  // --- Servicios
  const svcBox = h('div', { class: 'svc-table' });
  function drawSvcs() {
    svcBox.innerHTML = '';
    svcBox.append(h('div', { class: 'svc-row head' }, h('span', null, 'Servicio'), h('span', null, 'Min'), h('span', null, `Precio (${C.currency})`), h('span', null, '"Desde"'), h('span', null, 'Control (meses)'), h('span', null, 'Palabras que usa el paciente'), h('span')));
    cfg.services.forEach((s, i) => {
      const al = h('input', { value: (s.aliases || []).join(', '), placeholder: 'limpieza, profilaxis, sarro', oninput: () => { s.aliases = al.value.split(',').map((x) => x.trim()).filter(Boolean); } });
      const from = h('input', { type: 'checkbox', checked: !!s.priceFrom, onchange: () => { s.priceFrom = from.checked; } });
      svcBox.append(h('div', { class: 'svc-row' }, inp(s, 'name', { 'aria-label': 'Nombre' }), inp(s, 'duration', { type: 'number', min: 5, step: 5, 'aria-label': 'Duración' }), inp(s, 'price', { type: 'number', min: 0, 'aria-label': 'Precio' }), h('label', { class: 'check center' }, from), inp(s, 'recallMonths', { type: 'number', min: 0, max: 24, 'aria-label': 'Control en meses' }), al,
        h('button', { class: 'icon-btn', 'aria-label': 'Quitar servicio', onclick: () => { if (cfg.services.length > 1) { cfg.services.splice(i, 1); drawSvcs(); } } }, icon('x'))));
    });
    svcBox.append(h('button', { class: 'btn xs ghost', onclick: () => { cfg.services.push({ id: '', name: 'Nuevo servicio', duration: 30, price: 0, priceFrom: false, aliases: [], recallMonths: null }); drawSvcs(); } }, '+ servicio'));
  }
  drawSvcs();
  const services = section('Servicios y precios', `Asiste nunca inventa precios: responde con estos. Marque "desde" si el precio final depende de la evaluación.`, svcBox);

  // --- Profesionales
  const staffBox = h('div', { class: 'staff-list' });
  function drawStaff() {
    staffBox.innerHTML = '';
    cfg.staff.forEach((s, i) => {
      const days = h('div', { class: 'day-checks' }, [1, 2, 3, 4, 5, 6, 0].map((d) => {
        const cb = h('input', { type: 'checkbox', checked: !s.days || s.days.includes(d), onchange: () => { const set = new Set(s.days || [0, 1, 2, 3, 4, 5, 6]); if (cb.checked) set.add(d); else set.delete(d); s.days = [...set]; } });
        return h('label', null, cb, DAYS[d].slice(0, 2));
      }));
      const act = h('input', { type: 'checkbox', checked: s.active !== false, onchange: () => { s.active = act.checked; } });
      staffBox.append(h('div', { class: 'staff-row' }, inp(s, 'name', { 'aria-label': 'Nombre' }), inp(s, 'role', { 'aria-label': 'Especialidad', placeholder: 'Especialidad' }), days, h('label', { class: 'check' }, act, 'Activo'),
        h('button', { class: 'icon-btn', 'aria-label': 'Quitar', onclick: () => { cfg.staff.splice(i, 1); drawStaff(); } }, icon('x'))));
    });
    staffBox.append(h('button', { class: 'btn xs ghost', onclick: () => { cfg.staff.push({ id: 's' + Date.now().toString(36), name: 'Dra. / Dr. ', role: '', active: true }); drawStaff(); } }, '+ profesional'));
  }
  drawStaff();
  const staff = section('Profesionales', 'Cada profesional tiene su propia agenda. Si nadie está cargado, Asiste agenda por consultorio.', staffBox);

  // --- Adelantos
  cfg.deposit = cfg.deposit || { enabled: false, amount: 0, methods: '', holdMinutes: 120 };
  const depOn = h('input', { type: 'checkbox', checked: !!cfg.deposit.enabled, onchange: () => { cfg.deposit.enabled = depOn.checked; } });
  const deposit = section(`Adelanto para separar ${W.la} ${W.cita}`, `Opcional. Reduce mucho las inasistencias en tratamientos caros. El paciente envía la captura y usted la valida con un toque.`,
    h('label', { class: 'check' }, depOn, h('span', null, 'Pedir adelanto al agendar por WhatsApp')),
    h('div', { class: 'form-grid' },
      field(`Monto (${C.currency})`, inp(cfg.deposit, 'amount', { type: 'number', min: 0 })),
      field('Cómo pagar', inp(cfg.deposit, 'methods', { placeholder: C.code === 'PE' ? 'Yape o Plin al 987 654 321 (Clínica …)' : 'Transferencia a la cuenta …' })),
      field('Tiempo para pagar (minutos)', inp(cfg.deposit, 'holdMinutes', { type: 'number', min: 15, step: 15 }), 'Si no paga en ese tiempo, se libera el espacio y se avisa al paciente.')));

  // --- Automatizaciones
  cfg.automations = cfg.automations || {};
  const auto = (key, label, hint) => {
    const cb = h('input', { type: 'checkbox', checked: cfg.automations[key] !== false, onchange: () => { cfg.automations[key] = cb.checked; } });
    return h('label', { class: 'toggle' }, cb, h('span', null, h('b', null, label), h('small', null, hint)));
  };
  const automations = section('Automatizaciones', 'Mensajes que Asiste envía por su cuenta.',
    auto('dayBefore', 'Recordatorio un día antes', 'Con botones Confirmo · Cambiar fecha · Cancelar.'),
    auto('sameDay', 'Recordatorio el mismo día', 'Unas horas antes, con dirección y mapa.'),
    auto('noShowFollowUp', 'Reagendar a quien no vino', 'Un mensaje amable el mismo día para buscar otra fecha.'),
    auto('recall', 'Controles periódicos', 'Avisa cuando le toca su control según los meses de cada servicio.'));

  // --- Preguntas frecuentes
  cfg.faqs = cfg.faqs || [];
  const faqBox = h('div', { class: 'faq-edit' });
  function drawFaq() {
    faqBox.innerHTML = '';
    cfg.faqs.forEach((f, i) => {
      const keys = h('input', { value: (f.keys || []).join(', '), placeholder: 'palabras clave: anestesia, duele', oninput: () => { f.keys = keys.value.split(',').map((x) => x.trim()).filter(Boolean); } });
      faqBox.append(h('div', { class: 'faq-row' }, inp(f, 'q', { placeholder: 'Pregunta' }), inp(f, 'a', { tag: 'textarea', rows: 2, placeholder: 'Respuesta que enviará Asiste' }), keys,
        h('button', { class: 'icon-btn', 'aria-label': 'Quitar', onclick: () => { cfg.faqs.splice(i, 1); drawFaq(); } }, icon('x'))));
    });
    faqBox.append(h('button', { class: 'btn xs ghost', onclick: () => { cfg.faqs.push({ q: '', a: '', keys: [] }); drawFaq(); } }, '+ pregunta'));
  }
  drawFaq();
  const faqs = section('Preguntas frecuentes', 'Respuestas exactas para lo que más le preguntan (por ejemplo: "¿atienden niños?", "¿la evaluación tiene costo?").', faqBox);

  // --- WhatsApp
  const wa = section('WhatsApp', null,
    h('p', null, me.clinic.waConnected ? h('span', { class: 'pill st-confirmed' }, `Conectado ${me.clinic.waDisplay || ''}`) : h('span', { class: 'pill st-deposit' }, demo ? 'Demo: sin WhatsApp real' : 'Aún no conectado')),
    h('p', { class: 'muted small' }, 'La conexión con la API oficial de WhatsApp Business la hace el equipo de Asiste durante la instalación.'));

  const saveBtn = h('button', { class: 'btn', onclick: save }, 'Guardar cambios');
  async function save() {
    try {
      saveBtn.disabled = true;
      await api.saveClinic(cfg);
      toast('Cambios guardados. Asiste ya responde con la nueva información.');
      if (!demo) await reloadMe();
    } catch (e) { toast(e.message, 'err'); } finally { saveBtn.disabled = false; }
  }

  const pw = demo ? null : section('Su contraseña', null, h('button', { class: 'btn sm ghost', onclick: changePw }, 'Cambiar contraseña'));
  function changePw() {
    const a = h('input', { type: 'password', autocomplete: 'current-password' }), b = h('input', { type: 'password', autocomplete: 'new-password' });
    modal('Cambiar contraseña', h('div', { class: 'form-grid one' }, field('Contraseña actual', a), field('Nueva contraseña', b, 'Mínimo 10 caracteres.')), [
      { label: 'Guardar', onClick: async () => { try { await api.password(a.value, b.value); toast('Contraseña actualizada'); } catch (e) { toast(e.message, 'err'); return true; } } },
    ]);
  }

  main.append(h('div', { class: 'page-head slim sticky-actions' }, h('div', null, h('h1', null, 'Ajustes'), h('p', { class: 'muted' }, 'Lo que cambie aquí lo usa Asiste en la siguiente respuesta.')), saveBtn),
    general, hours, services, staff, deposit, automations, faqs, wa, pw);
}

function section(title, sub, ...kids) {
  return h('section', { class: 'card set' }, h('h2', null, title), sub ? h('p', { class: 'muted small' }, sub) : null, ...kids);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
