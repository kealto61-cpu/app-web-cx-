var APP = Object.freeze({
  NAME: 'APP WEB CX',
  VERSION: '5.6.0-appscript',
  TIMEZONE: 'America/Bogota',

  PROPERTY_MAIN_DB_ID: 'QX_MAIN_DB_ID',
  PROPERTY_LEGACY_MAIN_DB_ID: 'SPREADSHEET_ID',
  PROPERTY_AUTH_PEPPER: 'QX_AUTH_PEPPER_V1',
  PROPERTY_ATTACHMENTS_FOLDER_ID: 'QX_ATTACHMENTS_FOLDER_ID',

  SESSION_CACHE_PREFIX: 'QX_SESSION_',
  USER_SECURITY_CACHE_PREFIX: 'QX_USER_SECURITY_'
});

var DATA_SOURCES = Object.freeze({
  MAIN: 'MAIN'
});

var SHEETS = Object.freeze({
  PROGRAMACION: 'BD PROGRAMACIÓN',
  CANCELACIONES: 'CANCELACIONES QX',
  USUARIOS: 'USUARIOS',
  ROLES: 'ROLES',
  AUDITORIA: 'LOG AUDITORÍA',
  MOVIMIENTOS: 'HISTORIAL MOVIMIENTOS',
  REINTERVENCIONES: 'REINTERVENCIONES QX',
  CONFIGURACION: 'CONFIGURACIÓN SISTEMA',
  LISTAS: 'LISTAS',
  LOG_CARGUES: 'LOG CARGUES',
  PROFILAXIS: 'BD PROFILAXIS QX'
});

var REQUIRED_MAIN_SHEETS = Object.freeze([
  SHEETS.PROGRAMACION,
  SHEETS.CANCELACIONES,
  SHEETS.USUARIOS,
  SHEETS.ROLES,
  SHEETS.AUDITORIA,
  SHEETS.MOVIMIENTOS,
  SHEETS.CONFIGURACION
]);

var TERMINAL_STATES = Object.freeze([
  'CANCELADO',
  'ALTA',
  'HOSPITALIZACIÓN'
]);

var ACTIVE_STATES = Object.freeze([
  'PROGRAMADO',
  'PREPARACIÓN',
  'QUIRÓFANO',
  'RECUPERACIÓN'
]);

function setDataSources(mainSpreadsheetId) {
  var mainId = normalizeText_(mainSpreadsheetId);

  if (!mainId || mainId.length < 20) {
    throw new Error('Debe indicar el ID válido de la base principal de cirugía.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty(APP.PROPERTY_MAIN_DB_ID, mainId);
  props.setProperty(APP.PROPERTY_LEGACY_MAIN_DB_ID, mainId);

  return {
    ok: true,
    mainConfigured: true
  };
}

function getConfiguredDataSources() {
  var props = PropertiesService.getScriptProperties();
  return {
    main: Boolean(
      props.getProperty(APP.PROPERTY_MAIN_DB_ID) ||
      props.getProperty(APP.PROPERTY_LEGACY_MAIN_DB_ID)
    )
  };
}
