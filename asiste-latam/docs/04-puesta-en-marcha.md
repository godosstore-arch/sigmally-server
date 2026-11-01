# 4. Puesta en marcha (técnica, paso a paso)

## 4.1 Probar en su computadora (5 minutos)

Requisito: **Node.js 22.5 o más nuevo** (https://nodejs.org). No hay que instalar nada más.

```bash
cd asiste-latam/app
cp .env.example .env        # edite OWNER_EMAIL y OWNER_PASSWORD
DEMO_SEED=true npm start    # crea una clínica de ejemplo la primera vez
```

- `http://localhost:3000/` — página de ventas (SEO)
- `http://localhost:3000/app/` — panel (ingrese con OWNER_EMAIL y OWNER_PASSWORD)
- `http://localhost:3000/demo/?clinica=Mi%20Clínica&tipo=dental` — demo
- `npm test` — 36 pruebas automáticas

## 4.2 Publicar la demo para clínicas (gratis)

```bash
cd asiste-latam/app && npm run build:prototype
```

Suba la carpeta `asiste-latam/prototype/` completa a **https://app.netlify.com/drop**. Le da un link. Personalícelo por clínica con `?clinica=…&ciudad=…&tipo=…&pais=…` (ver `prototype/LEEME.txt`).

## 4.3 Publicar la app real

**Opción recomendada: Render** (Starter, con disco persistente) o **Railway**. La base de datos es un archivo SQLite: necesita **disco persistente**.

1. Suba el repositorio a GitHub.
2. En Render: *New → Web Service* → el repo → *Root Directory* `asiste-latam/app` → *Start command* `npm start`.
3. Agregue un **Disk** montado en `/var/data` y la variable `DATA_DIR=/var/data`.
4. Variables de entorno (copie de `.env.example`):
   - `NODE_ENV=production`, `PUBLIC_URL=https://su-dominio`
   - `OWNER_EMAIL`, `OWNER_PASSWORD` (larga), `OWNER_NAME`
   - `DATA_KEY` → genere con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y **guárdela en un lugar seguro**: sin ella no se pueden leer los mensajes guardados.
   - `WA_VERIFY_TOKEN` (una palabra que usted invente), `WA_APP_SECRET` (de Meta)
5. Conecte su dominio (`asiste.pe` o el que elija; verifique disponibilidad en punto.pe).

Con Docker: hay un `Dockerfile` en `asiste-latam/app/`.

**Copias de seguridad:** una vez al día copie `asiste.db` (por ejemplo con `sqlite3 asiste.db ".backup copia.db"`) a otro lugar. Junto con `DATA_KEY`, es todo lo que necesita para restaurar.

**Salud:** `https://su-dominio/healthz` responde `{"ok":true}`. Úselo en un monitor gratuito (UptimeRobot).

## 4.4 Conectar WhatsApp (API oficial de Meta)

Una sola vez, para usted (proveedor):

1. Cree un **portafolio comercial** en business.facebook.com y verifique su negocio (RUC, documentos).
2. En **developers.facebook.com** cree una app tipo *Business* y agregue el producto **WhatsApp**.
3. En la app: *WhatsApp → Configuración → Webhook*:
   - URL: `https://su-dominio/webhook/whatsapp`
   - Token de verificación: el mismo `WA_VERIFY_TOKEN`
   - Suscríbase al campo **messages**.
4. Copie la **clave secreta de la app** (Configuración básica) en `WA_APP_SECRET`.
5. Cree un **usuario del sistema** con permiso `whatsapp_business_messaging` y genere un **token permanente**.

Por cada clínica:

1. Agregue el número de la clínica a la cuenta de WhatsApp Business (o use el registro integrado / *Embedded Signup* cuando lo active). Revise con Meta si el número puede seguir funcionando en la app del celular (*coexistencia*) en el país de la clínica.
2. Copie su **Phone Number ID**.
3. En el panel → **Mis clínicas** → *Conectar*: pegue el Phone Number ID, el token y el número visible.
4. Escriba desde su celular al número de la clínica: debe responder Asiste.

## 4.5 Plantillas que debe aprobar Meta

Fuera de la ventana de 24 h, WhatsApp solo deja enviar **plantillas aprobadas**. Créelas en *WhatsApp Manager → Plantillas*, idioma **Español (es)**, con estos nombres exactos (o cámbielos en la configuración `templates` de la clínica):

| Nombre | Categoría | Texto | Botones (respuesta rápida) |
|---|---|---|---|
| `recordatorio_cita` | Utilidad | Hola, {{1}}. Le recordamos su cita en {{2}}: {{3}}. ¿Nos confirma su asistencia? | Confirmo · Cambiar fecha · Cancelar |
| `recordatorio_hoy` | Utilidad | Hola, {{1}}. Le esperamos hoy en {{2}}: {{3}}. | — |
| `cupo_disponible` | Utilidad | Hola, {{1}}. Se liberó un espacio en {{2}}: {{3}}. ¿Lo quiere? Se asigna al primero que responda. | Sí, lo tomo · No, gracias |
| `reagendar_inasistencia` | Utilidad | Hola, {{1}}. Le extrañamos hoy en {{2}}. ¿Le buscamos una nueva fecha? | Sí, reagendar · Hablar con recepción |
| `control_pendiente` | Marketing | Hola, {{1}}. Ya le toca su {{2}} en {{3}}. ¿Le reservamos una cita? | Sí, agendar · Tengo una consulta |

Para Argentina y Uruguay use "turno"; para Chile, "hora".

## 4.6 IA opcional

Por defecto Asiste funciona **solo con reglas** (rápido, sin costo y predecible). Si quiere que responda preguntas raras con la información de la clínica, defina `ANTHROPIC_API_KEY` y ejecute `npm install @anthropic-ai/sdk`. La IA nunca agenda, nunca inventa precios u horarios y nunca da consejo médico; si duda, pasa a recepción. Usa el modelo `claude-opus-5-5` con esfuerzo bajo y respaldo automático ante rechazos (`fallbacks: "default"`).

Tenga en cuenta que activar la IA envía el texto de esas preguntas a un proveedor en el extranjero: inclúyalo en el aviso de privacidad (ver `05-cumplimiento-legal.md`).

## 4.7 Cambiar la marca

Edite `app/brand.json` (nombre, dominio, WhatsApp de ventas, correo) y los textos de `src/server/landing.js`. El logo está en `public/assets/favicon.svg`.
