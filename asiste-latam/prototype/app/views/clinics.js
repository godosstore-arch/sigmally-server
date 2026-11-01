// Solo para el dueño de la cuenta: sus clínicas clientes, accesos y conexión de WhatsApp.
import { h, icon, toast, modal, field, empty } from '../ui.js';
import { SPECIALTIES } from '../../shared/specialties.js';
import { COUNTRIES } from '../../shared/countries.js';

export async function renderClinics(main, { api, me, reloadMe }) {
  if (!api.admin) { main.append(empty('No disponible en la demo.')); return; }
  const list = await api.admin.clinics();
  const total = list.filter((c) => c.active).length;

  function create() {
    const name = h('input', { placeholder: 'Clínica Dental Sonrisa Norte' });
    const city = h('input', { placeholder: 'Piura' });
    const address = h('input', { placeholder: 'Av. Grau 1250' });
    const ctry = h('select', null, Object.values(COUNTRIES).map((c) => h('option', { value: c.code, selected: c.code === 'PE' }, c.name)));
    const sp = h('select', null, Object.entries(SPECIALTIES).map(([k, s]) => h('option', { value: k }, s.label)));
    const demo = h('input', { type: 'checkbox' });
    modal('Nueva clínica', h('div', { class: 'form-grid' }, field('Nombre', name), field('Ciudad', city), field('Dirección', address), field('País', ctry), field('Especialidad', sp, 'Carga servicios, duraciones y precios de referencia que luego ajusta.'),
      h('label', { class: 'check full' }, demo, h('span', null, 'Llenar con datos de ejemplo (para mostrar)'))), [
      { label: 'Crear', onClick: async () => { try { await api.admin.create({ name: name.value, city: city.value, address: address.value, country: ctry.value, specialty: sp.value, demo: demo.checked }); toast('Clínica creada'); await reloadMe(); location.hash = '#/ajustes'; } catch (e) { toast(e.message, 'err'); return true; } } },
    ]);
  }

  function connect(c) {
    const pid = h('input', { value: c.waPhoneId || '', placeholder: '123456789012345', inputmode: 'numeric' });
    const tok = h('input', { type: 'password', placeholder: c.waConnected ? '•••••• (guardado; deje vacío para mantener)' : 'EAAG…' });
    const disp = h('input', { value: c.waDisplay || '', placeholder: '+51 987 654 321' });
    modal(`WhatsApp · ${c.name}`, h('div', { class: 'form-grid one' },
      field('Phone Number ID', pid, 'Meta for Developers › su app › WhatsApp › Configuración de la API.'),
      field('Token de acceso (usuario del sistema)', tok, 'Se guarda cifrado. Use un token permanente de usuario del sistema.'),
      field('Número visible', disp)), [
      { label: 'Guardar', onClick: async () => { try { await api.admin.update(c.id, { waPhoneId: pid.value, waToken: tok.value || undefined, waDisplay: disp.value }); toast('WhatsApp conectado'); reload(); } catch (e) { toast(e.message, 'err'); return true; } } },
    ]);
  }

  function addUser(c) {
    const email = h('input', { type: 'email', placeholder: 'recepcion@clinica.com' });
    const name = h('input', { placeholder: 'Nombre' });
    const role = h('select', null, h('option', { value: 'staff' }, 'Recepción (no cambia ajustes)'), h('option', { value: 'admin' }, 'Administrador de la clínica'));
    modal(`Dar acceso · ${c.name}`, h('div', { class: 'form-grid one' }, field('Correo', email), field('Nombre', name), field('Rol', role)), [
      { label: 'Crear acceso', onClick: async () => {
        try {
          const r = await api.admin.addUser(c.id, { email: email.value, name: name.value, role: role.value });
          modal('Acceso creado', h('div', null, h('p', null, 'Envíe estos datos a la clínica por un canal privado. La contraseña no se vuelve a mostrar.'), h('pre', { class: 'creds' }, `Panel: ${location.origin}/app/\nCorreo: ${r.email}\nContraseña: ${r.password}`)));
          reload();
        } catch (e) { toast(e.message, 'err'); return true; }
      } },
    ]);
  }

  async function reload() { main.innerHTML = ''; await renderClinics(main, { api, me, reloadMe }); }

  main.append(h('div', { class: 'page-head slim' }, h('div', null, h('h1', null, 'Mis clínicas'), h('p', { class: 'muted' }, `${total} activa${total === 1 ? '' : 's'}. Desde aquí crea clínicas, conecta su WhatsApp y da accesos.`)), h('button', { class: 'btn', onclick: create }, icon('plus'), 'Nueva clínica')),
    list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, 'Clínica'), h('th', null, 'País'), h('th', null, 'WhatsApp'), h('th', { class: 'num' }, 'Citas por Asiste (30 d)'), h('th', null, 'Accesos'), h('th', null, ''))),
      h('tbody', null, list.map((c) => h('tr', null,
        h('td', null, h('b', null, c.name), h('br'), h('small', { class: 'muted' }, `${SPECIALTIES[c.specialty]?.label || ''} · ${c.city || ''}`)),
        h('td', null, COUNTRIES[c.country]?.name || c.country),
        h('td', null, c.waConnected ? h('span', { class: 'pill st-confirmed' }, c.waDisplay || 'Conectado') : h('button', { class: 'btn xs ghost', onclick: () => connect(c) }, 'Conectar')),
        h('td', { class: 'num' }, c.bookedByBot30),
        h('td', null, c.users.map((u) => u.email).join(', ') || h('span', { class: 'muted' }, '—'), ' ', h('button', { class: 'btn xs ghost', onclick: () => addUser(c) }, '+')),
        h('td', null, h('button', { class: 'btn xs', onclick: async () => { await api.admin.use(c.id); await reloadMe(); location.hash = '#/hoy'; } }, 'Abrir'), ' ', c.waConnected ? h('button', { class: 'btn xs ghost', onclick: () => connect(c) }, 'WhatsApp') : null)))))) : empty('Aún no tiene clínicas.', 'Cree la primera para empezar.'));
}
