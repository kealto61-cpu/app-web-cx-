function assignmentMonthCode_(date) {
  var codes = [
    'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
    'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'
  ];
  return codes[date.getMonth()];
}

function assignmentSheetName_(dateIso) {
  var date = parseIsoDate_(dateIso || todayIso_());
  return assignmentMonthCode_(date) + ' ' +
    String(date.getDate()).padStart(2, '0');
}

function readAssignmentsForDate_(dateIso) {
  var sourceId = dataSourceId_(DATA_SOURCES.ASSIGNMENTS);

  if (!sourceId) {
    return {
      configured: false,
      date: dateIso || todayIso_(),
      rows: []
    };
  }

  var sheetName = assignmentSheetName_(dateIso || todayIso_());
  var spreadsheet = getSpreadsheet_(DATA_SOURCES.ASSIGNMENTS);
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    return {
      configured: true,
      date: dateIso || todayIso_(),
      sheetName: sheetName,
      rows: []
    };
  }

  var lastColumn = Math.max(1, Math.min(sheet.getLastColumn(), 12));
  var lastRow = sheet.getLastRow();

  if (lastRow < 4) {
    return {
      configured: true,
      date: dateIso || todayIso_(),
      sheetName: sheetName,
      rows: []
    };
  }

  var headers = sheet
    .getRange(4, 1, 1, lastColumn)
    .getDisplayValues()[0];

  var map = {};
  headers.forEach(function(header, index) {
    var key = normalizeHeader_(header);
    if (key) map[key] = index;
  });

  function idx(header) {
    var i = map[normalizeHeader_(header)];
    return i == null ? -1 : i;
  }

  var values = lastRow >= 5 ?
    sheet.getRange(5, 1, lastRow - 4, lastColumn).getDisplayValues() :
    [];

  var rows = values.map(function(row) {
    function get(header) {
      var i = idx(header);
      return i >= 0 ? normalizeText_(row[i]) : '';
    }

    return {
      asignacion: get('ASIGNACIÓN'),
      personal1: get('PERSONAL 1'),
      turno1: get('TURNO 1'),
      personal2: get('PERSONAL 2'),
      turno2: get('TURNO 2'),
      observacion: get('OBSERVACIÓN'),
      origen1: get('ORIGEN P1'),
      origen2: get('ORIGEN P2'),
      actualizado: get('ACTUALIZADO'),
      modoFila: get('MODO FILA')
    };
  }).filter(function(item) {
    return Boolean(item.asignacion);
  });

  return {
    configured: true,
    date: dateIso || todayIso_(),
    sheetName: sheetName,
    rows: rows
  };
}

// Vista informativa: no modifica el motor ni las hojas de asignación.
function apiGetAssignments(dateIso) {
  return jsonSafe_(
    readAssignmentsForDate_(dateIso || todayIso_())
  );
}
