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
