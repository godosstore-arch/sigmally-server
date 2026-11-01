// Plantillas por especialidad: servicios, duración, precios de referencia (en soles) y control periódico.
// Se usan para configurar una clínica en minutos y para la demo. Cada clínica ajusta sus precios reales.

const H_STD = { 0: [], 1: [['09:00', '13:00'], ['15:00', '20:00']], 2: [['09:00', '13:00'], ['15:00', '20:00']], 3: [['09:00', '13:00'], ['15:00', '20:00']], 4: [['09:00', '13:00'], ['15:00', '20:00']], 5: [['09:00', '13:00'], ['15:00', '20:00']], 6: [['09:00', '14:00']] };
const H_LONG = { 0: [], 1: [['08:00', '20:00']], 2: [['08:00', '20:00']], 3: [['08:00', '20:00']], 4: [['08:00', '20:00']], 5: [['08:00', '20:00']], 6: [['08:00', '13:00']] };
const H_ESTETICA = { 0: [], 1: [['10:00', '20:00']], 2: [['10:00', '20:00']], 3: [['10:00', '20:00']], 4: [['10:00', '20:00']], 5: [['10:00', '20:00']], 6: [['10:00', '17:00']] };

export const SPECIALTIES = {
  dental: {
    label: 'Clínica dental', short: 'dental', plural: 'clínicas dentales', sample: 'Clínica Dental Sonrisa Norte',
    hours: H_STD,
    staff: [['Dra. Lucía Paredes', 'Odontología general'], ['Dr. Martín Quispe', 'Ortodoncia']],
    services: [
      ['eval', 'Consulta y evaluación', 30, 50, false, ['consulta', 'evaluacion', 'revision', 'chequeo', 'diagnostico', 'me duele', 'dolor de muela', 'dolor']],
      ['limpieza', 'Limpieza dental', 40, 80, false, ['limpieza', 'profilaxis', 'destartraje', 'sarro'], 6],
      ['resina', 'Curación con resina', 45, 90, true, ['curacion', 'resina', 'caries', 'empaste', 'calza', 'tapadura']],
      ['endo', 'Endodoncia', 90, 350, true, ['endodoncia', 'tratamiento de conducto', 'conducto', 'nervio']],
      ['extraccion', 'Extracción simple', 45, 100, true, ['extraccion', 'sacar muela', 'sacarme', 'muela del juicio', 'cordal']],
      ['blanqueamiento', 'Blanqueamiento', 60, 450, true, ['blanqueamiento', 'blanquear', 'aclarar dientes']],
      ['orto_eval', 'Evaluación de ortodoncia', 30, 50, false, ['ortodoncia', 'brackets', 'frenillos', 'alineadores', 'invisalign']],
      ['orto_control', 'Control de ortodoncia', 20, 100, false, ['control de ortodoncia', 'control de brackets', 'ajuste', 'control'], 1],
    ],
    pains: [
      'Los pacientes escriben de noche preguntando precios y nadie responde hasta el día siguiente.',
      'Los controles de ortodoncia se olvidan y el tratamiento se alarga.',
      'Las limpiezas de cada 6 meses dependen de que alguien se acuerde de llamar.',
    ],
    urgent: /se me (cayo|salio|rompio) (un|el|mi) diente|diente (roto|partido) por golpe|hinchazon (en la|de la) cara|absceso/,
  },
  estetica: {
    label: 'Centro estético', short: 'estética', plural: 'centros estéticos', sample: 'Lumière Estética',
    hours: H_ESTETICA,
    staff: [['Dra. Andrea Saavedra', 'Medicina estética'], ['Lic. Fiorella Vega', 'Cosmiatría']],
    services: [
      ['eval', 'Evaluación facial', 30, 50, false, ['evaluacion', 'consulta', 'diagnostico', 'valoracion']],
      ['limpieza', 'Limpieza facial profunda', 60, 120, false, ['limpieza facial', 'limpieza', 'facial', 'puntos negros', 'hydrafacial'], 1],
      ['botox', 'Toxina botulínica', 45, 650, true, ['botox', 'toxina', 'arrugas', 'lineas de expresion']],
      ['hialuronico', 'Ácido hialurónico', 60, 900, true, ['hialuronico', 'relleno', 'labios', 'ojeras', 'rinomodelacion']],
      ['laser', 'Depilación láser', 30, 150, true, ['depilacion', 'laser', 'vello'], 1],
      ['peeling', 'Peeling químico', 45, 200, false, ['peeling', 'manchas', 'acne', 'cicatrices']],
    ],
    pains: [
      'La mayoría de consultas llegan por Instagram y WhatsApp fuera de horario, y se enfrían.',
      'Las sesiones de paquetes se pierden porque nadie recuerda la siguiente cita.',
      'Las clientas preguntan precio y desaparecen sin agendar.',
    ],
    urgent: /reaccion alergica|se me hincho|necrosis|ampollas|quemadura/,
  },
  fisioterapia: {
    label: 'Centro de terapia física', short: 'fisioterapia', plural: 'centros de terapia física', sample: 'Movimiento Fisioterapia',
    hours: H_LONG,
    staff: [['Lic. Diego Ramos', 'Terapia física'], ['Lic. Paola Ruiz', 'Rehabilitación deportiva']],
    services: [
      ['eval', 'Evaluación fisioterapéutica', 45, 70, false, ['evaluacion', 'consulta', 'primera vez', 'diagnostico']],
      ['sesion', 'Sesión de terapia física', 45, 60, false, ['sesion', 'terapia', 'rehabilitacion', 'fisioterapia', 'lumbalgia', 'espalda', 'cuello', 'rodilla', 'hombro', 'ciatica']],
      ['deportiva', 'Rehabilitación deportiva', 60, 80, false, ['deportiva', 'lesion', 'esguince', 'desgarro', 'futbol', 'running']],
      ['puncion', 'Punción seca', 30, 70, false, ['puncion', 'aguja', 'contractura']],
    ],
    pains: [
      'Los pacientes dejan el tratamiento a la mitad y nadie les hace seguimiento.',
      'Las sesiones se cancelan el mismo día y el espacio queda vacío.',
      'La recepción pasa la mañana coordinando horarios por WhatsApp.',
    ],
    urgent: null,
  },
  psicologia: {
    label: 'Consultorio de psicología', short: 'psicología', plural: 'consultorios de psicología', sample: 'Centro Psicológico Encuentro',
    hours: { 0: [], 1: [['09:00', '21:00']], 2: [['09:00', '21:00']], 3: [['09:00', '21:00']], 4: [['09:00', '21:00']], 5: [['09:00', '21:00']], 6: [['09:00', '14:00']] },
    staff: [['Ps. Carla Medina', 'Psicología clínica'], ['Ps. Renzo Alvarado', 'Terapia de pareja']],
    services: [
      ['primera', 'Primera consulta', 50, 120, false, ['primera consulta', 'primera vez', 'consulta', 'evaluacion', 'ansiedad', 'depresion', 'estres']],
      ['terapia', 'Terapia individual', 50, 100, false, ['terapia', 'sesion', 'psicoterapia', 'individual']],
      ['pareja', 'Terapia de pareja', 60, 150, false, ['pareja', 'esposo', 'esposa', 'novio', 'novia', 'matrimonio']],
      ['virtual', 'Sesión virtual', 50, 90, false, ['virtual', 'online', 'en linea', 'zoom', 'meet', 'videollamada']],
    ],
    pains: [
      'Muchas personas escriben de noche, cuando más lo necesitan, y no reciben respuesta.',
      'Las inasistencias pesan más porque cada sesión es de una hora.',
      'Coordinar horarios entre sesiones quita tiempo clínico.',
    ],
    urgent: null,
  },
  pediatria: {
    label: 'Consultorio pediátrico', short: 'pediatría', plural: 'consultorios pediátricos', sample: 'Pediatría Pequeños Pasos',
    hours: H_STD,
    staff: [['Dra. Mariela Chávez', 'Pediatría'], ['Dr. Jorge Benites', 'Pediatría']],
    services: [
      ['consulta', 'Consulta pediátrica', 30, 120, false, ['consulta', 'fiebre', 'tos', 'gripe', 'resfrio', 'diarrea', 'evaluacion']],
      ['control', 'Control de niño sano', 30, 100, false, ['control', 'crecimiento', 'nino sano', 'peso', 'talla'], 2],
      ['vacuna', 'Vacunación', 15, 60, true, ['vacuna', 'vacunacion', 'vacunar', 'inmunizacion']],
      ['recien', 'Control de recién nacido', 40, 130, false, ['recien nacido', 'bebe', 'neonato']],
    ],
    pains: [
      'Las mamás escriben a cualquier hora y esperan respuesta rápida.',
      'Los controles de crecimiento y vacunas se pasan de fecha.',
      'La recepción se satura en temporada de enfermedades respiratorias.',
    ],
    urgent: /convulsion|no respira|labios morados|fiebre (de|mayor a) (40|41)|deshidrat|no reacciona/,
  },
  ginecologia: {
    label: 'Consultorio ginecológico', short: 'ginecología', plural: 'consultorios ginecológicos', sample: 'Ginecología Vida Mujer',
    hours: H_STD,
    staff: [['Dra. Rocío Távara', 'Ginecología y obstetricia']],
    services: [
      ['consulta', 'Consulta ginecológica', 30, 120, false, ['consulta', 'evaluacion', 'chequeo', 'revision']],
      ['prenatal', 'Control prenatal', 30, 120, false, ['prenatal', 'embarazo', 'embarazada', 'gestacion'], 1],
      ['pap', 'Papanicolaou', 20, 80, false, ['papanicolaou', 'pap', 'citologia'], 12],
      ['eco', 'Ecografía', 30, 120, true, ['ecografia', 'eco', 'ultrasonido', 'transvaginal', 'obstetrica']],
    ],
    pains: [
      'Los controles prenatales necesitan seguimiento constante.',
      'El Papanicolaou anual depende de que la paciente se acuerde.',
      'Las preguntas de precio y disponibilidad se repiten todo el día.',
    ],
    urgent: /sangrado (abundante|fuerte|mucho)|perdida de liquido|no siento al bebe|contracciones/,
  },
  oftalmologia: {
    label: 'Centro oftalmológico', short: 'oftalmología', plural: 'centros oftalmológicos', sample: 'Visión Clara Oftalmología',
    hours: H_STD,
    staff: [['Dr. Ricardo Salazar', 'Oftalmología'], ['Lic. Karen Ortiz', 'Optometría']],
    services: [
      ['consulta', 'Consulta oftalmológica', 30, 100, false, ['consulta', 'evaluacion', 'oftalmologo', 'ojo', 'vista']],
      ['medida', 'Medida de vista', 20, 50, false, ['medida', 'medir la vista', 'lentes', 'anteojos', 'lunas', 'graduacion'], 12],
      ['fondo', 'Fondo de ojo', 30, 120, false, ['fondo de ojo', 'retina', 'diabetes']],
    ],
    pains: [
      'La medida de vista anual se olvida y el paciente compra lentes en otro lado.',
      'Las campañas generan muchas consultas a la vez por WhatsApp.',
      'Las citas de fondo de ojo necesitan indicaciones previas que se repiten a mano.',
    ],
    urgent: /perdi la vision|no veo de un ojo|golpe en el ojo|quimico en el ojo/,
  },
  nutricion: {
    label: 'Consultorio de nutrición', short: 'nutrición', plural: 'consultorios de nutrición', sample: 'Nutrición Equilibrio',
    hours: H_LONG,
    staff: [['Lic. Valeria Campos', 'Nutrición clínica']],
    services: [
      ['consulta', 'Consulta nutricional', 45, 80, false, ['consulta', 'primera vez', 'dieta', 'bajar de peso', 'plan', 'evaluacion']],
      ['control', 'Control nutricional', 30, 60, false, ['control', 'seguimiento'], 1],
      ['bioimpedancia', 'Bioimpedancia', 20, 40, false, ['bioimpedancia', 'grasa', 'composicion corporal']],
    ],
    pains: [
      'Los pacientes abandonan cuando pasan semanas sin control.',
      'Las preguntas de precio se responden a mano todo el día.',
      'Los controles mensuales dependen de la memoria del paciente.',
    ],
    urgent: null,
  },
  general: {
    label: 'Policlínico', short: 'medicina general', plural: 'policlínicos', sample: 'Policlínico San Miguel',
    hours: H_LONG,
    staff: [['Dr. Luis Herrera', 'Medicina general'], ['Dra. Patricia Rojas', 'Medicina interna']],
    services: [
      ['consulta', 'Consulta de medicina general', 20, 60, false, ['consulta', 'medico', 'medicina general', 'evaluacion', 'chequeo', 'malestar', 'fiebre']],
      ['interna', 'Consulta de medicina interna', 30, 100, false, ['medicina interna', 'internista', 'presion', 'diabetes']],
      ['certificado', 'Certificado médico', 15, 40, false, ['certificado', 'certificado medico', 'constancia']],
      ['preventivo', 'Chequeo preventivo', 40, 150, false, ['chequeo preventivo', 'chequeo completo', 'check up', 'despistaje'], 12],
    ],
    pains: [
      'El teléfono suena todo el día con las mismas preguntas.',
      'Los pacientes crónicos se olvidan de sus controles.',
      'Los espacios cancelados quedan vacíos.',
    ],
    urgent: null,
  },
  dermatologia: {
    label: 'Consultorio dermatológico', short: 'dermatología', plural: 'consultorios dermatológicos', sample: 'Dermacentro Piel Sana',
    hours: H_STD,
    staff: [['Dra. Claudia Reátegui', 'Dermatología']],
    services: [
      ['consulta', 'Consulta dermatológica', 30, 120, false, ['consulta', 'evaluacion', 'piel', 'lunar', 'alergia', 'hongos']],
      ['acne', 'Control de acné', 20, 100, false, ['acne', 'granos', 'isotretinoina', 'control'], 1],
      ['crio', 'Crioterapia', 20, 150, true, ['crioterapia', 'verruga', 'queratosis']],
    ],
    pains: [
      'Los tratamientos de acné requieren controles mensuales que se pierden.',
      'Las consultas de precio llegan a toda hora.',
      'Las inasistencias en agenda de especialista cuestan caro.',
    ],
    urgent: null,
  },
};

export const SPECIALTY_KEYS = Object.keys(SPECIALTIES);

export function specialty(key) {
  return SPECIALTIES[key] || SPECIALTIES.dental;
}

// Factor aproximado para mostrar precios de demo en la moneda de cada país (referencial, no tipo de cambio).
const PRICE_FACTOR = { PE: 1, MX: 5, CO: 1100, CL: 250, AR: 300, EC: 0.3, BO: 2, UY: 11, PY: 2100, CR: 140, PA: 0.3, DO: 16, GT: 2.1 };

function roundNice(n) {
  if (n < 20) return Math.round(n);
  if (n < 200) return Math.round(n / 5) * 5;
  if (n < 2000) return Math.round(n / 10) * 10;
  if (n < 20000) return Math.round(n / 100) * 100;
  return Math.round(n / 1000) * 1000;
}

// Quién hace cada servicio (si no figura, cualquiera del equipo).
const WHO = {
  dental: { orto_eval: ['s2'], orto_control: ['s2'] },
  estetica: { botox: ['s1'], hialuronico: ['s1'], eval: ['s1'], limpieza: ['s2'], laser: ['s2'], peeling: ['s2'] },
  oftalmologia: { consulta: ['s1'], fondo: ['s1'], medida: ['s2'] },
  psicologia: { pareja: ['s2'] },
  fisioterapia: { deportiva: ['s2'] },
};

export function servicesFor(key, countryCode = 'PE') {
  const f = PRICE_FACTOR[countryCode] ?? 1;
  return specialty(key).services.map(([id, name, duration, price, priceFrom, aliases, recallMonths]) => ({
    id, name, duration, price: roundNice(price * f), priceFrom, aliases, recallMonths: recallMonths || null,
    ...(WHO[key]?.[id] ? { staff: WHO[key][id] } : {}),
  }));
}

export function staffForSpecialty(key) {
  return specialty(key).staff.map(([name, role], i) => ({ id: 's' + (i + 1), name, role, active: true }));
}
