# 5. Cumplimiento legal (Perú primero, luego la región)

> Esto es una guía práctica, no asesoría legal. Antes de firmar con la primera clínica, pague una consulta de 1 hora con un abogado de protección de datos (en Piura o virtual). Lleve este documento.

## 5.1 Perú: Ley 29733 y su nuevo reglamento

- **Norma:** Ley N.º 29733, Ley de Protección de Datos Personales, y su **nuevo reglamento, D. S. 016-2024-JUS** (publicado el 30 de noviembre de 2024; vigente desde el 31 de marzo de 2025; reemplazó al de 2013).
- **Datos de salud = datos sensibles.** Requieren consentimiento **expreso** del paciente.
- El reglamento exige un **documento de seguridad** (art. 47.1) y crea la figura del **oficial de protección de datos** para tratamientos sensibles o a gran escala.
- También refuerza reglas de **transferencias internacionales**, **incidentes de seguridad** y **sanciones**.

### Quién es quién

| Rol | Quién | Qué le toca |
|---|---|---|
| **Titular del banco de datos (responsable)** | La clínica | Informar a sus pacientes, recabar consentimiento, inscribir su banco de datos de pacientes en el Registro Nacional de Protección de Datos Personales, atender derechos ARCO. |
| **Encargado del tratamiento** | Usted (Asiste) | Tratar los datos solo por cuenta de la clínica, con medidas de seguridad, y firmar un **contrato de encargo**. |
| **Proveedores (subencargados)** | Meta (WhatsApp), su hosting (Render/Railway), y el proveedor de IA si la activa | Informar a la clínica cuáles son y en qué país procesan. |

### Lo que la app ya hace por usted

- **Aviso de privacidad por clínica** en `https://su-dominio/privacidad/<clínica>`, enlazado en el primer mensaje del asistente ("Al escribirnos acepta nuestro aviso de privacidad").
- **Mensajes y notas cifrados** (AES-256-GCM) en la base de datos; contraseñas con scrypt.
- **Registro de accesos y cambios** del personal (tabla `audit`).
- **Roles:** la recepción no puede cambiar configuraciones.
- **BAJA:** el paciente puede dejar de recibir mensajes escribiendo "BAJA"; "ALTA" para volver.
- **No es historia clínica:** Asiste guarda citas y conversaciones, no diagnósticos. Dígaselo a la clínica: la historia clínica electrónica (Ley 30024 y RENHICE) sigue en su sistema actual.
- **Derivación** de emergencias y temas médicos a personas, nunca consejo médico.

### Lo que usted debe hacer

1. **Contrato con cada clínica** (`sales/contrato-piloto.md` trae cláusulas base): servicio, precio, piloto, confidencialidad y **encargo de tratamiento de datos** (finalidad, medidas de seguridad, subencargados, devolución/eliminación de datos al terminar).
2. **Documento de seguridad** propio (1–3 páginas): quién accede, cómo se guardan las llaves (`DATA_KEY`), copias de seguridad, qué hacer si hay un incidente.
3. Que la clínica revise el **aviso de privacidad** (agregue su RUC en Ajustes) y tenga inscrito su banco de datos.
4. Si activa la IA opcional: informar que algunas preguntas se procesan con un proveedor en el extranjero (transferencia internacional).
5. **Libro de reclamaciones**: es obligación de la clínica frente a sus pacientes; Asiste deriva los reclamos a recepción.

## 5.2 Reglas de WhatsApp (Meta)

- Use solo la **API oficial** (WhatsApp Business Platform). Nada de "WhatsApp Web automatizado": Meta bloquea esos números.
- **Opt-in:** el paciente debe haber dado su número a la clínica y aceptado recibir mensajes. Pídale a la clínica que lo diga al agendar ("le enviaremos recordatorios por WhatsApp").
- Fuera de 24 h, solo **plantillas aprobadas** (ver `04-puesta-en-marcha.md`). No ponga diagnósticos ni resultados en las plantillas.
- Respete la **BAJA** de inmediato (la app ya lo hace).

## 5.3 Su empresa (Perú)

- RUC en **Régimen MYPE Tributario** para emitir facturas electrónicas.
- Marca: registre "Asiste" (o el nombre final) en **Indecopi**, clase 42 (software) y 44 (servicios médicos de apoyo, opcional). Antes, busque si ya existe una marca igual o parecida.
- Dominio: verifique y registre en **punto.pe** (`.pe` / `.com.pe`).

## 5.4 Otros países (cuando expanda)

| País | Norma principal | Nota |
|---|---|---|
| México | LFPDPPP (nueva ley publicada en 2025) | Datos de salud sensibles; aviso de privacidad obligatorio. |
| Colombia | Ley 1581 de 2012 | Registro Nacional de Bases de Datos (RNBD) para la clínica. |
| Chile | Ley 19.628, reemplazada por la Ley 21.719 (entra en vigencia en diciembre de 2026) | Nueva agencia y multas altas: revise antes de vender allí. |
| Argentina | Ley 25.326 | Registro de bases ante la AAIP. |
| Ecuador | LOPDP (2021) | Datos de salud sensibles; delegado de protección de datos en casos de alto volumen. |
| Brasil | LGPD | Requiere traducir el producto al portugués. |

Verifique la vigencia de cada norma con un abogado local antes de firmar en ese país.

## Fuentes

- Nuevo reglamento (MINJUS): https://www.gob.pe/institucion/minjus/noticias/1067368-ejecutivo-aprueba-nuevo-reglamento-de-la-ley-de-proteccion-de-datos-personales
- Resumen del marco (La Ley): https://laley.pe/todo-sobre-el-nuevo-marco-legal-de-proteccion-de-datos-personales-en-peru/
- Lex Mundi, vigencia: https://www.lexmundi.com/guides/data-privacy-guide/jurisdictions/latin-america/peru/
- IAPP: https://iapp.org/news/a/se-publica-el-nuevo-reglamento-de-protecci-n-de-datos-personales-en-per-
- Cámara de Comercio de Lima: https://lacamara.pe/nuevo-reglamento-refuerza-la-proteccion-de-datos-personales/
