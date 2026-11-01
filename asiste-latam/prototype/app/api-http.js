// Cliente de la API real (servidor).
async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json', 'X-Asiste': '1' } : { 'X-Asiste': '1' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Error de conexión');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function createHttpApi() {
  return {
    mode: 'live',
    login: (email, password) => call('POST', '/api/login', { email, password }),
    logout: () => call('POST', '/api/logout', {}),
    me: () => call('GET', '/api/me'),
    password: (current, next) => call('POST', '/api/password', { current, next }),
    today: () => call('GET', '/api/today'),
    appointments: (from, to) => call('GET', `/api/appointments?from=${from}&to=${to}`),
    slots: (serviceId, day, staffId) => call('GET', `/api/slots?serviceId=${encodeURIComponent(serviceId)}&day=${day || ''}${staffId ? `&staffId=${encodeURIComponent(staffId)}` : ''}`),
    createAppointment: (b) => call('POST', '/api/appointments', b),
    updateAppointment: (id, patch) => call('PATCH', `/api/appointments/${id}`, patch),
    conversations: () => call('GET', '/api/conversations'),
    conversation: (id) => call('GET', `/api/conversations/${id}`),
    reply: (id, text) => call('POST', `/api/conversations/${id}/reply`, { text }),
    release: (id) => call('POST', `/api/conversations/${id}/release`, {}),
    takeover: (id) => call('POST', `/api/conversations/${id}/takeover`, {}),
    patients: (q = '') => call('GET', `/api/patients?q=${encodeURIComponent(q)}`),
    updatePatient: (id, b) => call('PATCH', `/api/patients/${id}`, b),
    waitlist: () => call('GET', '/api/waitlist'),
    saveClinic: (cfg) => call('PUT', '/api/clinic', cfg),
    simulate: (b) => call('POST', '/api/simulate', b),
    simReset: (b) => call('POST', '/api/simulate/reset', b || {}),
    admin: {
      clinics: () => call('GET', '/api/admin/clinics'),
      create: (b) => call('POST', '/api/admin/clinics', b),
      use: (id) => call('POST', '/api/admin/use-clinic', { id }),
      update: (id, b) => call('PATCH', `/api/admin/clinics/${id}`, b),
      addUser: (id, b) => call('POST', `/api/admin/clinics/${id}/users`, b),
    },
  };
}
