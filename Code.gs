function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Cirugía — Control de Pacientes Quirúrgicos')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1, maximum-scale=1'
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function apiBoot(token, dateIso) {
  var session = apiSession(token || '');
  var result = {
    app: {
      name: APP.NAME,
      version: APP.VERSION
    },
    config: {
      today: todayIso_(),
      timestamp: formatDateTime_(new Date()),
      autoRefreshSeconds: Number(
        getSystemParameter_('AUTOACTUALIZACIÓN (SEG)', 30)
      ) || 30,
      accessModel: normalizeText_(
        getSystemParameter_('MODELO DE ACCESO', '')
      )
    },
    session: session,
    board: null
  };

  if (session.valid) {
    try {
      result.board = boardApp_(token, dateIso || todayIso_());
    } catch (error) {
      result.boardError = error.message;
    }
  }

  return jsonSafe_(result);
}

function apiHealth() {
  return setupSystem();
}


function apiWebAppInfo() {
  return {
    url: ScriptApp.getService().getUrl() || '',
    version: APP.VERSION,
    today: todayIso_()
  };
}

function validateCurrentSchema() {
  var sheet = getSheet_(SHEETS.PROGRAMACION, DATA_SOURCES.MAIN);
  var headers = getHeaderMap_(sheet).map;
  var required = [
    'ID CASO',
    'FECHA CIRUGÍA',
    'HORA PROGRAMADA',
    'DOCUMENTO',
    'TELÉFONO',
    'PACIENTE',
    'EDAD',
    'PROCEDIMIENTO',
    'ESPECIALIDAD',
    'ESPECIALISTA',
    'SALA / QNO',
    'ESTADO ACTUAL',
    'TIPO DE ATENCIÓN',
    'CAMA / UBICACIÓN PROGRAMADA',
    'CUPS',
    'TIEMPO QX ESTIMADO (MIN)',
    'PROFILAXIS ADMINISTRADA',
    'HORA ADMINISTRACIÓN PROFILAXIS',
    'CLASIFICACIÓN CIRUGÍA',
    'CÓDIGO SEGUIMIENTO',
    'TOKEN SEGUIMIENTO',
    'AVISO ACOMPAÑANTE',
    'FECHA/HORA AVISO ACOMPAÑANTE',
    'ORIGEN AVISO ACOMPAÑANTE',
    'ID MENSAJE ACOMPAÑANTE'
  ];

  var missing = required.filter(function(header) {
    return !headers[normalizeHeader_(header)];
  });

  return {
    ok: missing.length === 0,
    missingColumns: missing,
    spreadsheet: mainSpreadsheet_().getName(),
    version: APP.VERSION
  };
}
