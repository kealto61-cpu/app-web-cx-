var APP = Object.freeze({
  NAME: 'APP WEB CX',
  VERSION: '5.0.0-dev',
  TIMEZONE: 'America/Bogota',
  SESSION_SECONDS: 21600,
  PROPERTY_SPREADSHEET_ID: 'SPREADSHEET_ID',
  PROPERTY_TOKEN_SECRET: 'TOKEN_SECRET'
});

var SHEETS = Object.freeze({
  USERS: 'USUARIOS',
  SURGERIES: 'CIRUGIAS',
  CANCELLATIONS: 'CANCELACIONES',
  ASSIGNMENTS: 'ASIGNACIONES',
  ROUNDS: 'RONDAS',
  AUDIT: 'AUDITORIA'
});

var SCHEMA = Object.freeze({
  USUARIOS: [
    'ID', 'USUARIO', 'NOMBRE', 'ROL', 'PASSWORD_HASH', 'ACTIVO',
    'CREADO_EN', 'ACTUALIZADO_EN'
  ],
  CIRUGIAS: [
    'ID', 'FECHA', 'HORA', 'DOCUMENTO', 'PACIENTE', 'PROCEDIMIENTO',
    'ESPECIALISTA', 'SALA', 'ESTADO', 'OBSERVACION',
    'CREADO_POR', 'CREADO_EN', 'ACTUALIZADO_EN'
  ],
  CANCELACIONES: [
    'ID', 'FECHA', 'DOCUMENTO', 'PACIENTE', 'PROCEDIMIENTO',
    'MOTIVO', 'OBSERVACION', 'RESPONSABLE',
    'CREADO_POR', 'CREADO_EN'
  ],
  ASIGNACIONES: [
    'ID', 'FECHA', 'TURNO', 'QNO', 'RESPONSABLE', 'CARGO',
    'TAREA', 'ESTADO', 'CREADO_POR', 'CREADO_EN', 'ACTUALIZADO_EN'
  ],
  RONDAS: [
    'ID', 'FECHA', 'HORA', 'AREA', 'RESPONSABLE', 'ITEM',
    'HALLAZGO', 'ACCION', 'ESTADO',
    'CREADO_POR', 'CREADO_EN', 'ACTUALIZADO_EN'
  ],
  AUDITORIA: [
    'ID', 'FECHA_HORA', 'USUARIO', 'ROL', 'ACCION',
    'MODULO', 'REGISTRO_ID', 'DETALLE'
  ]
});

var ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  COORDINADOR: 'COORDINADOR',
  ENFERMERIA: 'ENFERMERIA',
  CONSULTA: 'CONSULTA'
});

function setSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId || String(spreadsheetId).trim().length < 20) {
    throw new Error('El ID de Google Sheets no es válido.');
  }
  PropertiesService.getScriptProperties()
    .setProperty(APP.PROPERTY_SPREADSHEET_ID, String(spreadsheetId).trim());
  return { ok: true };
}
