# APP WEB CX

Web App de gestión quirúrgica desarrollada para Google Apps Script.

## Objetivo técnico

El repositorio contiene únicamente código que puede copiarse a un proyecto de Google Apps Script sin compilación, Node.js, npm, React, TypeScript ni bundlers.

## Arquitectura inicial

- `Code.gs`: entrada de la Web App y API pública.
- `Config.gs`: configuración, constantes y esquema de hojas.
- `Utils.gs`: utilidades, respuestas y seguridad.
- `Database.gs`: acceso centralizado a Google Sheets.
- `Auth.gs`: usuarios, autenticación y token de sesión.
- `Audit.gs`: trazabilidad.
- `Surgery.gs`: programación quirúrgica.
- `Cancellations.gs`: cancelaciones.
- `Assignments.gs`: asignaciones.
- `Rounds.gs`: rondas.
- `Index.html`: aplicación.
- `Styles.html`: estilos.
- `Scripts.html`: lógica del cliente.
- `appsscript.json`: manifiesto.

## Puesta en marcha

1. Crear un proyecto de Google Apps Script.
2. Copiar cada archivo del repositorio respetando su nombre.
3. Si el script es independiente, ejecutar `setSpreadsheetId('ID_DEL_SHEET')`.
4. Ejecutar una vez `setupSystem()`.
5. Ejecutar `createInitialAdmin(usuario, clave, nombre)`.
6. Implementar como Aplicación web.

La autenticación usa hash SHA-256 para credenciales almacenadas y tokens de sesión firmados con HMAC-SHA256. Nunca se guarda la contraseña en texto plano.

## Estado

Base reconstruida desde cero. Versión inicial: 5.0.0-dev.
