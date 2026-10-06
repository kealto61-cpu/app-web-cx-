# APP WEB CX — Google Apps Script 5.6

Esta carpeta raíz contiene la versión Google Apps Script de la aplicación. No depende de Railway ni PostgreSQL.

## Archivos a copiar al proyecto Apps Script

- `appsscript.json`
- `Code.gs`
- `Config.gs`
- `Utils.gs`
- `Database.gs`
- `Auth.gs`
- `Audit.gs`
- `Surgery.gs`
- `Operations.gs`
- `Companion.gs`
- `Admin.gs`
- `Reports.gs`
- `WebApi.gs`
- `Index.html`

No copiar la carpeta `railway/` al proyecto Apps Script.

## Base de datos

Google Sheets es la fuente de verdad. El ID de la base NO se guarda en GitHub.

Si se usa el mismo proyecto Apps Script anterior, conservar las Script Properties existentes, en especial:

- `QX_MAIN_DB_ID` o `SPREADSHEET_ID`
- `QX_AUTH_PEPPER_V1` — CRÍTICA para validar los PIN ya migrados.
- `QX_ATTACHMENTS_FOLDER_ID` es opcional; si no existe, la app crea una carpeta de soportes al cargar el primer archivo.

Si se crea un proyecto Apps Script nuevo, configurar la base principal ejecutando manualmente:

```javascript
setDataSources('ID_DE_LA_BASE_PRINCIPAL');
```

No publicar IDs, PIN, hashes, pepper ni datos de pacientes en GitHub.

## Validación inicial

Ejecutar desde el editor:

```javascript
setupSystem();
validateCurrentSchema();
```

`validateCurrentSchema()` debe devolver `ok: true`.

## Despliegue

Implementar como **Aplicación web**:

- Ejecutar como: el propietario/desplegador autorizado.
- Acceso: el necesario para permitir el portal de acompañantes. Si se requiere acceso público por QR, el Web App debe admitir acceso sin autenticación de Google.
- La información clínica/operativa interna sigue protegida por usuario + PIN; el único endpoint público funcional es el seguimiento por token temporal.

Después de cada cambio de código, crear una nueva versión del despliegue.

## Portal de acompañantes

La URL pública se calcula con `ScriptApp.getService().getUrl()` y Apps Script usa `google.script.url.getLocation()` para detectar `?follow=1`.

El portal muestra únicamente:

1. Logo Clínica AMA.
2. Mensaje breve.
3. Campo de token de 5 dígitos.
4. Estado/aviso del paciente.

Los textos y disparadores se administran en **Configuración → Acompañantes**.

Los mensajes de ALTA y HOSPITALIZACIÓN son terminales y obligatorios.

## Archivos

Los soportes adjuntos se almacenan en Google Drive. La carpeta se identifica mediante la Script Property `QX_ATTACHMENTS_FOLDER_ID`.

## Seguridad

- No borrar ni regenerar `QX_AUTH_PEPPER_V1` si existen usuarios con `SALT PIN`.
- `SUPERADMIN` conserva siempre permiso total.
- Usuarios, roles, QNO, flujo quirúrgico y mensajes de acompañantes se administran desde Configuración.
- Los movimientos y acciones relevantes generan auditoría.

## Módulos incluidos

- Operativo.
- Programación.
- Nuevo paciente.
- Carga masiva con lector PDF XENCO y previsualización editable.
- Profilaxis.
- Cuidados POP.
- Acompañantes / QR / fichas.
- Coordinación.
- KPI.
- MCI.
- Seguridad / reintervenciones.
- Descargas CSV / XLSX / PDF.
- Configuración de QNO y flujos.
- Usuarios.
- Roles y permisos.
- Mensajes automáticos/manuales a acompañantes.

El módulo de Asignaciones no está incluido.
