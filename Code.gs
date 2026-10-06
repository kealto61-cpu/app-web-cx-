function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Cirugía — Tablero Operativo')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1, maximum-scale=1'
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function apiBoot(dateIso) {
  var board = apiGetBoard(dateIso || todayIso_());

  return jsonSafe_({
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
    board: board
  });
}

function apiHealth() {
  return setupSystem();
}
