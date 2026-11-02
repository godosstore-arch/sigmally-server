# Asiste — la recepción por WhatsApp para clínicas de Perú y Latinoamérica

Producto propio para vender a clínicas y consultorios (dental, estética, fisioterapia, psicología, pediatría, ginecología, oftalmología, nutrición, dermatología, policlínicos). Responde el WhatsApp de la clínica a cualquier hora, **agenda en la agenda real**, confirma un día antes con botones, reprograma, cancela, **cobra adelantos por Yape o Plin**, llena cancelaciones con la **lista de espera** y avisa a cada paciente cuando le toca su control.

**Marca de trabajo:** Asiste (el paciente *asiste* a su cita, y es su *asistente*). Para cambiarla: `app/brand.json`. Antes de lanzar, verifique el dominio en punto.pe y la marca en Indecopi.

**Autor:** Godos Salvador · Paita, Piura — Perú.

## Qué hay en esta carpeta

| Carpeta | Qué es | Para qué |
|---|---|---|
| `prototype/` | **Demo** (estática, sin servidor) | El "boceto" que manda a clínicas. Se arma con el nombre de cada clínica desde el link. |
| `app/` | **App real** (Node.js 22, sin dependencias externas) | Lo que instala cuando una clínica paga: WhatsApp oficial, panel, varias clínicas, automatizaciones. |
| `sales/` | One-pager PDF, mensajes de WhatsApp, guion de demo, contrato, capturas, lista de prospectos | Para vender. |
| `videos/` | Video para clínicas (80 s) y guía de instalación | Para mandar por WhatsApp y para usted. |
| `docs/` | 6 guías | Mercado LATAM, precios, cómo vender, puesta en marcha, legal, SEO y marketing. |

## Empezar hoy (orden recomendado)

1. Lea `docs/01-mercado-latam.md` y `docs/02-oferta-y-precios.md` (15 minutos).
2. Ponga su WhatsApp real en `app/brand.json` y en `sales/one-pager.html` (hoy dice +51 900 000 000).
3. Publique la demo: `cd app && npm run build:prototype` y suba `prototype/` a https://app.netlify.com/drop.
4. Haga su lista de 50 clínicas de Piura (`sales/lista-prospectos.csv`) y escriba con `sales/mensajes-whatsapp.md`.
5. Cuando una diga sí: `docs/04-puesta-en-marcha.md`.

## Página oficial + demo gratis en Netlify

```bash
cd app && npm run build:web -- https://SU-SITIO.netlify.app
```

Arrastre la carpeta `web/` a Netlify (Deploys). Queda la web de ventas en `/`, la demo en `/demo/`, y los links viejos con `?clinica=` siguen abriendo la demo.

## La demo (2 minutos)

```
https://SU-DEMO/?clinica=Clínica%20Dental%20San%20Miguel&ciudad=Piura&tipo=dental&pais=PE
```

La clínica ve **su nombre**, su agenda de ejemplo, conversaciones y números del mes, y puede **escribir como paciente** y ver la cita aparecer en la agenda. Tipos: `dental`, `estetica`, `fisioterapia`, `psicologia`, `pediatria`, `ginecologia`, `oftalmologia`, `nutricion`, `general`, `dermatologia`. Países: `PE`, `MX`, `CO`, `CL`, `AR`, `EC`, `BO`, `UY`, `PY`, `CR`, `PA`, `DO`, `GT`.

## La app real en su computadora

```bash
cd app
cp .env.example .env            # ponga OWNER_EMAIL y OWNER_PASSWORD
DEMO_SEED=true npm start        # http://localhost:3000
npm test                        # 36 pruebas automáticas
```

- `/` página de ventas con SEO (y `/mx/`, `/co/`, `/para/dental`…)
- `/app/` panel de la clínica · `/demo/` demo · `/privacidad/<clínica>` aviso de privacidad

## Cómo está construido (por qué no falla)

- **Nunca inventa horarios ni precios.** Los horarios salen del motor de disponibilidad (`app/src/shared/slots.js`) y se vuelven a verificar justo antes de reservar: dos pacientes no pueden quedar a la misma hora (hay una prueba para eso).
- **Español de verdad.** Entiende "mañana en la tarde", "pasado mañana a las 4 y media", "el sábado temprano", "la próxima semana", "15/11", "kiero cita", "la de las 4". Dice "cita", "turno" (Argentina, Uruguay) u "hora" (Chile) con la concordancia correcta.
- **Reglas primero, IA opcional.** Todo funciona sin IA (rápido, gratis, predecible). Si se activa, la IA solo responde preguntas raras con la ficha de la clínica y nunca agenda ni da consejo médico.
- **Seguridad clínica:** emergencias → número de emergencias del país (SAMU 106 en Perú) y alerta urgente; crisis de salud mental → línea gratuita del país (113 opción 5 en Perú). Reclamos, seguros y "quiero hablar con alguien" pasan a una persona. Si recepción escribe, el asistente se calla.
- **WhatsApp oficial (Cloud API de Meta):** botones y listas, plantillas para fuera de las 24 h, firma del webhook verificada, mensajes repetidos de Meta ignorados.
- **Datos protegidos:** mensajes y notas cifrados (AES-256-GCM), contraseñas con scrypt, roles, registro de accesos, BAJA/ALTA. Pensado para la Ley 29733 y su reglamento de 2024.
- **Mismo motor en la demo y en producción:** la demo usa exactamente los archivos de `app/src/shared/` (una prueba lo verifica).
