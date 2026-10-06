# APP WEB CX

Reconstrucción desde cero de la Web App de gestión quirúrgica para Google Apps Script.

## Principio de arquitectura

**Google Drive / Google Sheets es la fuente de verdad. GitHub contiene solamente el código.**

La aplicación no crea una base paralela, no reemplaza las hojas existentes y no cambia los encabezados de la base real para adaptarlos al código. El código se adapta a las hojas existentes.

La base principal contiene, entre otras:

- `BD PROGRAMACIÓN`
- `CANCELACIONES QX`
- `USUARIOS`
- `ROLES`
- `LOG AUDITORÍA`
- `HISTORIAL MOVIMIENTOS`
- `REINTERVENCIONES QX`
- `CONFIGURACIÓN SISTEMA`
- hojas diarias de programación

Las asignaciones de personal se manejan mediante su Google Sheet operativo independiente.

## Seguridad del repositorio

Este repositorio es público. Por esa razón:

- no se almacenan IDs de Google Sheets;
- no se almacenan credenciales;
- no se almacenan PIN, salts ni pepper;
- no se almacenan datos de pacientes.

Los IDs de las fuentes se guardan en **Script Properties** de Google Apps Script.

## Compatibilidad

Solo se utiliza código ejecutable directamente en Google Apps Script V8:

- archivos `.gs`;
- HTML;
- CSS;
- JavaScript nativo del navegador;
- `google.script.run`.

No se usa Node.js, npm, React, TypeScript, Vite ni bundlers.

## Configuración

La aplicación reutiliza la propiedad histórica `SPREADSHEET_ID` si ya existe en el proyecto Apps Script. Esto permite conservar la conexión con la base actual al reemplazar el código.

También reconoce:

- `QX_MAIN_DB_ID`
- `QX_ASSIGNMENTS_DB_ID`
- `QX_AUTH_PEPPER_V1`

El valor de `QX_AUTH_PEPPER_V1` es crítico para validar los PIN que ya fueron migrados a hash + salt. **No debe eliminarse ni regenerarse al reemplazar el código.**

Si fuera necesario configurar las fuentes manualmente:

```javascript
setDataSources('ID_BASE_PRINCIPAL', 'ID_BASE_ASIGNACIONES');
```

Después:

```javascript
setupSystem();
```

`setupSystem()` valida la estructura existente pero no crea ni modifica hojas.

## Estado

Versión de reconstrucción: `5.0.0-alpha.1`.
