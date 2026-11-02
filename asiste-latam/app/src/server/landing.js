// Páginas públicas con SEO local: una por país (precios, moneda y forma de decir "cita") y una por
// especialidad. Contenido distinto en cada una para no competir entre sí en Google.
import { COUNTRIES, country, money, words } from '../shared/countries.js';
import { SPECIALTIES, specialty } from '../shared/specialties.js';
import { escapeHtml as e } from '../shared/text.js';
import { hoursText } from '../shared/conversation.js';

const CC = ['pe', 'mx', 'co', 'cl', 'ar', 'ec', 'bo', 'uy', 'py', 'cr', 'pa', 'do', 'gt'];
export const LANDING_PATHS = new Set(['/', ...CC.filter((c) => c !== 'pe').map((c) => `/${c}/`), ...Object.keys(SPECIALTIES).map((s) => `/para/${s}`)]);

const PLANS_PE = [
  { name: 'Consultorio', price: 'S/ 149', per: 'al mes', who: '1 a 2 profesionales', items: ['Responde y agenda por WhatsApp 24/7', 'Recordatorio con botones un día antes', 'Panel con agenda y conversaciones', 'Hasta 300 citas al mes'] },
  { name: 'Clínica', price: 'S/ 299', per: 'al mes', who: '3 a 8 profesionales', items: ['Todo lo de Consultorio', 'Adelantos por Yape o Plin', 'Lista de espera que llena cancelaciones', 'Controles periódicos automáticos', 'Hasta 900 citas al mes'], featured: true },
  { name: 'Centro médico', price: 'desde S/ 590', per: 'al mes', who: 'Varias sedes o especialidades', items: ['Todo lo de Clínica', 'Una cuenta por sede', 'Reporte mensual para gerencia', 'Soporte prioritario'] },
];
const PLANS_USD = [
  { name: 'Consultorio', price: 'US$ 39', per: 'al mes', who: '1 a 2 profesionales', items: ['Responde y agenda por WhatsApp 24/7', 'Recordatorio con botones un día antes', 'Panel con agenda y conversaciones', 'Hasta 300 citas al mes'] },
  { name: 'Clínica', price: 'US$ 79', per: 'al mes', who: '3 a 8 profesionales', items: ['Todo lo de Consultorio', 'Adelantos por transferencia o billetera', 'Lista de espera que llena cancelaciones', 'Controles periódicos automáticos', 'Hasta 900 citas al mes'], featured: true },
  { name: 'Centro médico', price: 'desde US$ 159', per: 'al mes', who: 'Varias sedes o especialidades', items: ['Todo lo de Clínica', 'Una cuenta por sede', 'Reporte mensual para gerencia', 'Soporte prioritario'] },
];

function faqs(c, W) {
  return [
    ['¿Tengo que cambiar mi número de WhatsApp?', `No necesariamente. Conectamos Asiste a la API oficial de WhatsApp Business de Meta. Puede usar el número actual de la clínica (si Meta lo permite en su país, incluso seguir usándolo en la app del celular) o uno nuevo solo para ${W.citas}. Lo vemos juntos en la instalación.`],
    ['¿Qué pasa si un paciente pregunta algo médico?', 'Asiste no da diagnósticos ni indicaciones. Si la consulta es clínica, la pasa a recepción. Si el mensaje suena a emergencia, indica el número de emergencias de su país y alerta a su equipo al instante.'],
    ['¿Puede inventar precios u horarios?', 'No. Solo ofrece horarios libres de su agenda real y precios que usted cargó. Antes de reservar vuelve a verificar que el espacio siga libre, para que nunca haya dos pacientes a la misma hora.'],
    ['¿Cuánto demora la instalación?', 'Entre 2 y 5 días hábiles. Nosotros cargamos sus servicios, horarios y profesionales, conectamos WhatsApp y dejamos las plantillas aprobadas por Meta. Usted revisa y aprueba.'],
    ['¿Mis datos y los de mis pacientes están protegidos?', c.code === 'PE' ? 'Sí. Los mensajes se guardan cifrados (AES-256) y cada acceso del equipo queda registrado. Trabajamos según la Ley 29733 de Protección de Datos Personales y su reglamento (D. S. 016-2024-JUS), que tratan los datos de salud como sensibles.' : 'Sí. Los mensajes se guardan cifrados (AES-256), cada acceso del equipo queda registrado y adaptamos el aviso de privacidad a la ley de datos personales de su país.'],
    ['¿Y si mi recepcionista quiere responder ella misma?', 'Puede hacerlo desde el panel en cualquier momento. Cuando una persona responde, Asiste se pausa en esa conversación para no interrumpir.'],
    ['¿Hay contrato de permanencia?', 'No. Se paga mes a mes. Empezamos con un piloto de 30 días: si en ese mes Asiste no agenda más de lo que cuesta, ese mes no lo paga.'],
    ['¿Funciona con mi software de historias clínicas?', 'Asiste maneja su propia agenda y puede convivir con su software actual. Si su sistema tiene integración disponible, la conectamos; si no, su equipo ve todas las citas en el panel de Asiste.'],
  ];
}

const ICON = {
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

function chatMock(c, W, sp) {
  const svc = sp.services[1] || sp.services[0];
  const doc = sp.staff[0][0];
  return `<div class="phone" aria-label="Ejemplo de conversación por WhatsApp">
  <div class="phone-top"><span class="avatar">${e(sp.sample.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span><div><b>${e(sp.sample)}</b><small>en línea</small></div></div>
  <div class="phone-body">
    <div class="day">Hoy</div>
    <div class="b in">Hola, buenas noches. ¿Tienen ${W.cita} para ${e(svc[1].toLowerCase())} mañana en la tarde?<i>22:47</i></div>
    <div class="b out">Buenas noches. Tengo estos horarios mañana con ${doc.startsWith('Dra') ? 'la ' : doc.startsWith('Dr') ? 'el ' : ''}${e(doc)}:<br><br>1) 3:00 p. m.<br>2) 4:30 p. m.<br>3) 6:15 p. m.<i>22:47</i></div>
    <div class="qr"><span>Mañ · 3:00 pm</span><span>Mañ · 4:30 pm</span><span>Mañ · 6:15 pm</span></div>
    <div class="b in">La de las 4:30<i>22:48</i></div>
    <div class="b out">Listo. ${W.La} ${W.cita} quedó ${W.reservada} para mañana a las 4:30 p. m. Le recordaré un día antes.<i>22:48</i></div>
  </div>
</div>`;
}

function page({ title, desc, canonical, hreflang, body, jsonld }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(desc)}">
<link rel="canonical" href="${e(canonical)}">
${hreflang || ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:url" content="${e(canonical)}">
<meta property="og:image" content="${e(canonical.replace(/\/[^/]*\/?$/, ''))}/assets/og.png">
<meta property="og:locale" content="es_PE">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0f4c3a">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
${body}
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

function logo() {
  return `<a class="logo" href="/" aria-label="Asiste, inicio"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0f4c3a"/><path d="M9 21.5l5-11h4l5 11" fill="none" stroke="#f5f2ec" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.2 17.5h7.6" stroke="#e7b58f" stroke-width="2.4" stroke-linecap="round"/></svg><span>Asiste</span></a>`;
}

export function renderLanding(pathname, brand, base) {
  const spMatch = pathname.match(/^\/para\/([a-z]+)$/);
  const ccMatch = pathname.match(/^\/([a-z]{2})\/$/);
  const code = ccMatch ? ccMatch[1].toUpperCase() : 'PE';
  const c = country(code);
  const W = words(c.code);
  const spKey = spMatch ? spMatch[1] : 'dental';
  const sp = specialty(spKey);
  const isPE = c.code === 'PE';
  const plans = isPE ? PLANS_PE : PLANS_USD;
  const wa = `https://wa.me/${brand.salesWhatsApp}?text=${encodeURIComponent('Hola, quiero ver Asiste funcionando en mi clínica')}`;

  if (pathname === '/404') {
    return page({ title: 'Página no encontrada · Asiste', desc: 'La página no existe.', canonical: base + '/', jsonld: [], body: `<main class="wrap notfound"><h1>Esta página no existe.</h1><p><a href="/">Volver al inicio</a></p></main>` });
  }

  const where = spMatch ? sp.plural : `clínicas y consultorios`;
  const h1 = spMatch
    ? `La recepción por WhatsApp para ${sp.plural} que agenda, confirma y llena su agenda.`
    : `Su recepción por WhatsApp agenda, confirma y llena la agenda. También a las 11 de la noche.`;
  const title = spMatch
    ? `WhatsApp para ${sp.plural}: ${W.citas} automáticas | Asiste`
    : isPE ? 'Asiste | Citas por WhatsApp para clínicas en Perú' : `Asiste | ${W.Cita}s por WhatsApp para clínicas en ${c.name}`;
  const desc = spMatch
    ? `Asiste responde a sus pacientes por WhatsApp, agenda en horarios reales y confirma un día antes. Hecho para ${sp.plural} en Perú y Latinoamérica.`
    : `Asistente de WhatsApp para ${where} en ${c.name}: responde al instante, agenda en su agenda real, confirma ${W.citas} y reduce inasistencias.${isPE ? ' Adelantos por Yape y Plin.' : ''}`;
  const canonical = base + pathname;
  const hreflang = spMatch ? '' : [`<link rel="alternate" hreflang="es-PE" href="${base}/">`, ...CC.filter((x) => x !== 'pe').map((x) => `<link rel="alternate" hreflang="${country(x).locale}" href="${base}/${x}/">`), `<link rel="alternate" hreflang="x-default" href="${base}/">`].join('\n');
  const pay = isPE ? 'Yape o Plin' : c.payments.split(',')[0];
  const fq = faqs(c, W);
  const cities = c.cities.slice(0, 8).join(', ');

  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: brand.name, url: base + '/', logo: base + '/assets/favicon.svg', founder: brand.founder, address: { '@type': 'PostalAddress', addressLocality: 'Paita', addressRegion: 'Piura', addressCountry: 'PE' } },
    { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: `${brand.name}`, applicationCategory: 'BusinessApplication', operatingSystem: 'Web, WhatsApp', description: desc, offers: { '@type': 'Offer', price: isPE ? '149' : '39', priceCurrency: isPE ? 'PEN' : 'USD' }, areaServed: c.name },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: fq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];

  const specLinks = Object.entries(SPECIALTIES).map(([k, s]) => `<a href="/para/${k}"${k === spKey && spMatch ? ' aria-current="page"' : ''}>${e(cap(s.plural))}</a>`).join('');
  const countryLinks = CC.map((x) => `<a href="${x === 'pe' ? '/' : `/${x}/`}"${x.toUpperCase() === c.code && !spMatch ? ' aria-current="page"' : ''}>${e(country(x).name)}</a>`).join('');

  const pains = spMatch ? sp.pains : [
    `Los pacientes escriben de noche o el domingo y nadie responde hasta el día siguiente. Para entonces, ya agendaron en otro lado.`,
    `Entre 15 y 30 de cada 100 pacientes no llegan a su ${W.cita} en muchas consultas externas de la región. Cada espacio vacío es plata que no vuelve.`,
    `Cuando alguien cancela, el espacio queda libre porque nadie tiene tiempo de llamar uno por uno a los que esperaban.`,
  ];

  const body = `
<header class="top"><div class="wrap row">
  ${logo()}
  <nav aria-label="Principal"><a href="#como">Cómo funciona</a><a href="#precios" class="keep">Precios</a><a href="#preguntas">Preguntas</a></nav>
  <div class="top-cta">${brand.appUrl ? `<a class="btn ghost sm" href="${e(brand.appUrl.replace(/\/$/, ''))}/app/">Ingresar</a>` : ''}<a class="btn sm" href="/demo/?pais=${c.code}&tipo=${spKey}">Ver demo</a></div>
</div></header>
<main>
<section class="hero"><div class="wrap grid2">
  <div>
    <p class="eyebrow">${spMatch ? `Para ${e(sp.plural)}` : `Para clínicas y consultorios en ${e(c.name)}`}</p>
    <h1>${e(h1)}</h1>
    <p class="lead">Asiste responde a sus pacientes en segundos, ofrece solo horarios que de verdad están libres, confirma un día antes con botones${isPE ? ' y cobra el adelanto por Yape o Plin' : ''}. Su equipo atiende pacientes; Asiste atiende el WhatsApp.</p>
    <form class="demo-form" action="/demo/" method="get">
      <label for="clinica">Vea la demo con el nombre de su clínica</label>
      <div class="field-row">
        <input id="clinica" name="clinica" placeholder="Ej.: ${e(sp.sample)}" required maxlength="60" autocomplete="organization">
        <input type="hidden" name="pais" value="${c.code}"><input type="hidden" name="tipo" value="${spKey}">
        <button class="btn" type="submit">Ver mi demo</button>
      </div>
      <small>Sin registro. La demo se arma al instante con datos de ejemplo.</small>
    </form>
    <p class="alt">¿Prefiere conversar? <a href="${e(wa)}" rel="noopener">Escríbanos por WhatsApp</a></p>
  </div>
  <div class="hero-visual">${chatMock(c, W, sp)}</div>
</div></section>

<section class="strip"><div class="wrap strip-row">
  <div><b>24/7</b><span>responde de noche, feriados y domingos</span></div>
  <div><b>0</b><span>horarios inventados: usa su agenda real</span></div>
  <div><b>1 día antes</b><span>recordatorio con Confirmo · Cambiar · Cancelar</span></div>
  <div><b>2–5 días</b><span>de instalación, la hacemos nosotros</span></div>
</div></section>

<section class="wrap block">
  <h2>Lo que hoy le cuesta pacientes</h2>
  <div class="pains">${pains.map((p, i) => `<div class="pain"><span class="num">0${i + 1}</span><p>${e(p)}</p></div>`).join('')}</div>
</section>

<section class="wrap block" id="como">
  <h2>Cómo funciona</h2>
  <ol class="steps">
    <li><span>1</span><h3>El paciente escribe</h3><p>Al WhatsApp de su clínica, a la hora que sea, como escribe siempre: "¿tienen para mañana en la tarde?".</p></li>
    <li><span>2</span><h3>Asiste agenda</h3><p>Entiende el día y la hora, ofrece 3 horarios libres de su agenda y registra ${W.la} ${W.cita} con nombre y servicio.</p></li>
    <li><span>3</span><h3>Recuerda y confirma</h3><p>Un día antes envía un recordatorio con botones. Si cambia de fecha, Asiste lo reprograma solo.</p></li>
    <li><span>4</span><h3>Llena los huecos</h3><p>Si alguien cancela, ofrece el espacio a la lista de espera. El primero que acepta, lo toma.</p></li>
  </ol>
</section>

<section class="wrap block">
  <h2>Todo lo que hace una buena recepcionista por WhatsApp</h2>
  <div class="feats">
    <div>${ic('cal')}<h3>Agenda real, sin cruces</h3><p>Horarios por profesional, duración por servicio y doble verificación antes de reservar.</p></div>
    <div>${ic('coin')}<h3>Adelantos por ${e(pay)}</h3><p>Opcional: separa ${W.la} ${W.cita} con un adelanto. Si no llega a tiempo, libera el espacio sola.</p></div>
    <div>${ic('bell')}<h3>Recordatorios que se responden</h3><p>Un día antes y el mismo día, con la dirección y la ubicación en el mapa.</p></div>
    <div>${ic('list')}<h3>Lista de espera</h3><p>Convierte cada cancelación en una ${W.cita} nueva, sin que nadie llame por teléfono.</p></div>
    <div>${ic('repeat')}<h3>Controles periódicos</h3><p>Avisa cuando le toca al paciente su ${e((sp.services.find((s) => s[6]) || sp.services[0])[1].toLowerCase())} y le ofrece horario.</p></div>
    <div>${ic('user')}<h3>Pasa a una persona</h3><p>Reclamos, seguros, dudas médicas o emergencias van directo a su equipo, con alerta.</p></div>
    <div>${ic('chart')}<h3>Panel con números claros</h3><p>${W.Cita}s agendadas por Asiste, monto agendado, confirmaciones e inasistencias del mes.</p></div>
    <div>${ic('shield')}<h3>Datos protegidos</h3><p>Mensajes cifrados, registro de accesos y aviso de privacidad para sus pacientes.</p></div>
  </div>
</section>

<section class="calc-wrap"><div class="wrap grid2">
  <div>
    <h2>¿Cuánto se le va en ${W.citas} perdidas?</h2>
    <p>Mueva los valores con los números de su consulta. Los recordatorios con confirmación suelen reducir las inasistencias; aquí usamos un supuesto conservador de reducirlas a la mitad.</p>
  </div>
  <div class="calc" data-currency="${isPE ? 'PEN' : 'USD'}" data-locale="${c.locale}">
    <label>${W.Cita}s por semana <output id="o-citas">60</output><input type="range" id="citas" min="10" max="400" step="5" value="60"></label>
    <label>Ticket promedio por ${W.cita} <output id="o-ticket"></output><input type="range" id="ticket" min="${isPE ? 30 : 10}" max="${isPE ? 600 : 200}" step="${isPE ? 10 : 5}" value="${isPE ? 120 : 40}"></label>
    <label>Pacientes que no llegan <output id="o-ns">15 %</output><input type="range" id="ns" min="3" max="35" step="1" value="15"></label>
    <div class="calc-out"><div><small>Se pierde al mes</small><b id="lost">—</b></div><div><small>Recuperable con Asiste</small><b id="won">—</b></div></div>
  </div>
</div></section>

<section class="wrap block" id="precios">
  <h2>Precios claros, sin permanencia</h2>
  <p class="sub">Instalación incluida. Piloto de 30 días: si Asiste no agenda más de lo que cuesta, ese mes no se paga.${isPE ? ' Precios sin IGV.' : ' Facturamos en dólares.'}</p>
  <div class="plans">${plans.map((p) => `<div class="plan${p.featured ? ' featured' : ''}">${p.featured ? '<span class="tag">El más elegido</span>' : ''}<h3>${p.name}</h3><p class="who">${p.who}</p><p class="price">${p.price} <small>${p.per}</small></p><ul>${p.items.map((i) => `<li>${ic('check')}${e(i)}</li>`).join('')}</ul><a class="btn${p.featured ? '' : ' ghost'}" href="${e(`https://wa.me/${brand.salesWhatsApp}?text=${encodeURIComponent(`Hola, quiero empezar el piloto gratis de 30 días de Asiste con el plan ${p.name} (${p.price} ${p.per}). Mi clínica es: `)}`)}" rel="noopener">Empezar piloto gratis</a></div>`).join('')}</div>
  ${isPE ? `<p class="founder"><b>Precio fundador:</b> las primeras 10 clínicas de Piura pagan <b>S/ 99</b> (Consultorio) o <b>S/ 199</b> (Clínica) durante 12 meses.</p>` : ''}
  <p class="note"><b>Cómo empieza:</b> toca "Empezar piloto gratis", nos escribe por WhatsApp y en 2 a 5 días le entregamos su cuenta con usuario y clave, ya configurada con sus horarios y servicios. No pedimos tarjeta para el piloto.</p>
  <p class="note">El costo de los mensajes de WhatsApp que cobra Meta por recordatorios está incluido hasta el límite de cada plan. Las respuestas a pacientes que escriben primero no tienen costo de Meta.</p>
</section>

<section class="wrap block compare">
  <h2>Comparado con lo que usa hoy</h2>
  <table>
    <thead><tr><th></th><th>Recepción sola</th><th>Bot genérico</th><th class="us">Asiste</th></tr></thead>
    <tbody>
      <tr><td>Responde de noche y domingos</td><td>No</td><td>Sí</td><td class="us">Sí</td></tr>
      <tr><td>Agenda en horarios realmente libres</td><td>Sí</td><td>No, toma datos y alguien llama</td><td class="us">Sí</td></tr>
      <tr><td>Confirma y reprograma solo</td><td>Llamando uno por uno</td><td>No</td><td class="us">Sí</td></tr>
      <tr><td>Entiende "mañana en la tarde"</td><td>Sí</td><td>Menús de números</td><td class="us">Sí</td></tr>
      <tr><td>Deriva emergencias y reclamos</td><td>Sí</td><td>No</td><td class="us">Sí, con alerta</td></tr>
    </tbody>
  </table>
</section>

<section class="wrap block" id="preguntas">
  <h2>Preguntas frecuentes</h2>
  <div class="faq">${fq.map(([q, a]) => `<details><summary>${e(q)}</summary><p>${e(a)}</p></details>`).join('')}</div>
</section>

<section class="cta"><div class="wrap">
  <h2>Vea Asiste con el nombre de su clínica en 1 minuto.</h2>
  <p>Escriba como si fuera un paciente y mire cómo se llena la agenda.</p>
  <div class="cta-row"><a class="btn light" href="/demo/?pais=${c.code}&tipo=${spKey}">Abrir la demo</a><a class="btn outline-light" href="${e(wa)}" rel="noopener">Hablar con ${e(brand.founder.split(' ')[0])}</a></div>
</div></section>

<section class="wrap block links">
  <div><h3>Por especialidad</h3><div class="chips">${specLinks}</div></div>
  <div><h3>Por país</h3><div class="chips">${countryLinks}</div></div>
  <p class="cities">Atendemos clínicas en ${e(cities)} y el resto de ${e(c.name)}.</p>
</section>
</main>
<footer class="foot"><div class="wrap row">
  ${logo()}
  <p>${e(brand.tagline)}<br>Hecho en ${e(brand.city)}${brand.salesEmail ? ` · <a href="mailto:${e(brand.salesEmail)}">${e(brand.salesEmail)}</a>` : ''} · <a href="https://wa.me/${e(brand.salesWhatsApp)}" rel="noopener">WhatsApp</a></p>
  <p class="small">WhatsApp es una marca de Meta Platforms, Inc. Asiste usa la API oficial de WhatsApp Business.</p>
</div></footer>`;

  return page({ title, desc, canonical, hreflang, body, jsonld });
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function sitemap(base) {
  const urls = [...LANDING_PATHS];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc><changefreq>monthly</changefreq><priority>${u === '/' ? '1.0' : '0.7'}</priority></url>`).join('\n')}\n</urlset>\n`;
}

export function renderPrivacy(clinic, brand) {
  const c = country(clinic.country);
  const isPE = c.code === 'PE';
  const body = `<main class="wrap legal">
  <h1>Aviso de privacidad · ${e(clinic.name)}</h1>
  <p><b>Responsable:</b> ${e(clinic.name)}, ${e(clinic.address || '')}${clinic.legalId ? ` (${isPE ? 'RUC' : 'ID'} ${e(clinic.legalId)})` : ''}.</p>
  <p><b>Qué datos usamos:</b> su número de WhatsApp, su nombre, los mensajes que nos envía y la información de sus ${words(c.code).citas} (servicio, fecha, profesional y asistencia).</p>
  <p><b>Para qué:</b> responder sus consultas, agendar, recordar, confirmar o cambiar sus ${words(c.code).citas} y avisarle cuando le corresponde un control. No vendemos ni cedemos sus datos para publicidad de terceros.</p>
  <p><b>Datos de salud:</b> ${isPE ? 'La Ley N.º 29733 y su reglamento (D. S. 016-2024-JUS) consideran sensibles los datos de salud.' : 'Los datos de salud son datos sensibles.'} Al escribirnos y agendar, usted autoriza su uso solo para estos fines. No envíe por este medio resultados, diagnósticos ni documentos si no es necesario.</p>
  <p><b>Encargado del tratamiento:</b> la plataforma ${e(brand.name)} procesa los mensajes por cuenta de la clínica, guarda los mensajes cifrados y registra los accesos del personal. WhatsApp (Meta) transporta los mensajes según sus propias condiciones.</p>
  <p><b>Cuánto tiempo:</b> mientras sea paciente de la clínica y lo que exija la normativa de historias clínicas.</p>
  <p><b>Sus derechos:</b> puede pedir acceso, rectificación, cancelación u oposición escribiendo "DATOS" por WhatsApp o a la clínica. Para dejar de recibir recordatorios escriba "BAJA".${isPE ? ' También puede acudir a la Autoridad Nacional de Protección de Datos Personales.' : ''}</p>
  <p><b>Horario de atención:</b><br>${e(hoursText(clinic)).replace(/\n/g, '<br>')}</p>
</main>`;
  return page({ title: `Aviso de privacidad · ${clinic.name}`, desc: `Cómo ${clinic.name} usa sus datos al escribir por WhatsApp.`, canonical: `/privacidad/${clinic.slug}`, jsonld: [], body: `<header class="top"><div class="wrap row">${logo()}</div></header>${body}` });
}

export { COUNTRIES, money };
