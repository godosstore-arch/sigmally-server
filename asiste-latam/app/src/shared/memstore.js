// Store en memoria (demo y pruebas). Misma interfaz que el store SQLite del servidor.
export function createMemoryStore() {
  const db = { patients: [], conversations: [], messages: [], appointments: [], waitlist: [] };
  let seq = 1;
  const nid = (p) => p + (seq++).toString(36);
  const upd = (arr, id, patch) => { const x = arr.find((r) => r.id === id); if (x) Object.assign(x, patch); return x; };
  return {
    db,
    transaction: (fn) => fn(),
    patientByPhone: (clinicId, phone) => db.patients.find((p) => p.clinicId === clinicId && p.phone === phone) || null,
    patient: (id) => db.patients.find((p) => p.id === id) || null,
    createPatient: (p) => { const x = { id: nid('p'), optedOut: 0, notes: '', ...p }; db.patients.push(x); return x; },
    updatePatient: (id, patch) => upd(db.patients, id, patch),
    listPatients: (clinicId) => db.patients.filter((p) => p.clinicId === clinicId),
    conversationFor: (clinicId, patientId) => db.conversations.find((c) => c.clinicId === clinicId && c.patientId === patientId) || null,
    conversation: (id) => db.conversations.find((c) => c.id === id) || null,
    createConversation: (c) => { const x = { id: nid('c'), unread: 0, attention: 0, urgent: 0, human: null, lastAt: c.createdAt, ...c }; db.conversations.push(x); return x; },
    updateConversation: (id, patch) => upd(db.conversations, id, patch),
    listConversations: (clinicId) => db.conversations.filter((c) => c.clinicId === clinicId).sort((a, b) => b.lastAt - a.lastAt),
    addMessage: (m) => { const x = { id: nid('m'), ...m }; db.messages.push(x); return x; },
    listMessages: (conversationId) => db.messages.filter((m) => m.conversationId === conversationId).sort((a, b) => a.at - b.at),
    listAppointments: (clinicId, from, to) => db.appointments.filter((a) => a.clinicId === clinicId && a.end > from && a.start < to).map((a) => ({ ...a })),
    appointment: (id) => { const a = db.appointments.find((x) => x.id === id); return a ? { ...a } : null; },
    insertAppointment: (a) => { const x = { id: nid('a'), remindedDayBefore: 0, remindedSameDay: 0, followedUp: 0, depositStatus: a.status === 'pending_deposit' ? 'pending' : null, ...a }; db.appointments.push(x); return { ...x }; },
    updateAppointment: (id, patch) => upd(db.appointments, id, patch),
    addWaitlist: (w) => { const x = { id: nid('w'), ...w }; db.waitlist.push(x); return x; },
    listWaitlist: (clinicId) => db.waitlist.filter((w) => w.clinicId === clinicId),
    updateWaitlist: (id, patch) => upd(db.waitlist, id, patch),
  };
}
