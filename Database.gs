function dataSourceId_(source) {
  var props = PropertiesService.getScriptProperties();

  if (source === DATA_SOURCES.MAIN) {
    return props.getProperty(APP.PROPERTY_MAIN_DB_ID) ||
      props.getProperty(APP.PROPERTY_LEGACY_MAIN_DB_ID) ||
      '';
  }

  if (source === DATA_SOURCES.ASSIGNMENTS) {
    return props.getProperty(APP.PROPERTY_ASSIGNMENTS_DB_ID) || '';
  }

  throw new Error('Fuente de datos no reconocida: ' + source);
}

function getSpreadsheet_(source) {
  var id = dataSourceId_(source || DATA_SOURCES.MAIN);
  if (!id) {
    throw new Error(
      'La fuente ' + (source || DATA_SOURCES.MAIN) +
      ' no está configurada en Script Properties.'
    );
  }
  return SpreadsheetApp.openById(id);
}

function mainSpreadsheet_() {
  return getSpreadsheet_(DATA_SOURCES.MAIN);
}

function getSheet_(sheetName, source) {
  var ss = getSpreadsheet_(source || DATA_SOURCES.MAIN);
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      'No existe la hoja "' + sheetName +
      '" en la fuente ' + (source || DATA_SOURCES.MAIN) + '.'
    );
  }

  return sheet;
}

function setupSystem() {
  var ss = mainSpreadsheet_();
  var missing = REQUIRED_MAIN_SHEETS.filter(function(name) {
    return !ss.getSheetByName(name);
  });

  if (missing.length) {
    throw new Error(
      'La base principal no coincide con la estructura esperada. Faltan: ' +
      missing.join(', ')
    );
  }

  // No crea, renombra ni modifica hojas de la base real.
  return {
    ok: true,
    app: APP.NAME,
    version: APP.VERSION,
    spreadsheetTitle: ss.getName(),
    requiredSheets: REQUIRED_MAIN_SHEETS.slice(),
    sources: getConfiguredDataSources()
  };
}

function normalizeHeader_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getHeaders_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error('La hoja ' + sheet.getName() + ' no tiene encabezados.');
  }

  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  if (!headers.some(function(v) { return normalizeText_(v); })) {
    throw new Error('La hoja ' + sheet.getName() + ' tiene la fila 1 vacía.');
  }

  return headers;
}

function getHeaderMap_(sheet) {
  var headers = getHeaders_(sheet);
  var map = {};

  headers.forEach(function(header, index) {
    var key = normalizeHeader_(header);
    if (key) map[key] = index + 1;
  });

  return {
    headers: headers,
    map: map
  };
}

function requireColumn_(sheet, headerName) {
  var meta = getHeaderMap_(sheet);
  var column = meta.map[normalizeHeader_(headerName)];

  if (!column) {
    throw new Error(
      'No existe la columna "' + headerName +
      '" en la hoja "' + sheet.getName() + '".'
    );
  }

  return column;
}

function rowToObject_(headers, row) {
  var object = {};

  headers.forEach(function(header, index) {
    var key = normalizeText_(header);
    if (key) object[key] = row[index];
  });

  return object;
}

function readTable_(sheetName, source) {
  var sheet = getSheet_(sheetName, source);
  var meta = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      sheet: sheet,
      headers: meta.headers,
      rows: []
    };
  }

  var values = sheet.getRange(
    2,
    1,
    lastRow - 1,
    meta.headers.length
  ).getValues();

  return {
    sheet: sheet,
    headers: meta.headers,
    rows: values.map(function(row, index) {
      return {
        rowNumber: index + 2,
        values: row,
        object: rowToObject_(meta.headers, row)
      };
    })
  };
}

function findRowByHeader_(sheetName, headerName, value, source) {
  var sheet = getSheet_(sheetName, source);
  var column = requireColumn_(sheet, headerName);
  var lastRow = sheet.getLastRow();
  var target = normalizeText_(value);

  if (!target || lastRow < 2) return null;

  var values = sheet.getRange(2, column, lastRow - 1, 1)
    .getDisplayValues();

  for (var i = 0; i < values.length; i++) {
    if (normalizeText_(values[i][0]) === target) {
      var rowNumber = i + 2;
      var headers = getHeaders_(sheet);
      var row = sheet.getRange(
        rowNumber,
        1,
        1,
        headers.length
      ).getValues()[0];

      return {
        sheet: sheet,
        rowNumber: rowNumber,
        headers: headers,
        values: row,
        object: rowToObject_(headers, row)
      };
    }
  }

  return null;
}

function patchRow_(sheet, rowNumber, patch) {
  if (!sheet || rowNumber < 2) {
    throw new Error('Fila de actualización inválida.');
  }

  var meta = getHeaderMap_(sheet);
  var values = sheet.getRange(rowNumber, 1, 1, meta.headers.length).getValues()[0];
  var keys = Object.keys(patch || {});

  keys.forEach(function(headerName) {
    var column = meta.map[normalizeHeader_(headerName)];
    if (!column) {
      throw new Error(
        'No existe la columna "' + headerName +
        '" en "' + sheet.getName() + '".'
      );
    }
    values[column - 1] = patch[headerName];
  });

  sheet.getRange(rowNumber, 1, 1, meta.headers.length).setValues([values]);
  return rowToObject_(meta.headers, values);
}

function appendRecord_(sheetName, record, source) {
  var sheet = getSheet_(sheetName, source);
  var headers = getHeaders_(sheet);

  var row = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header)
      ? record[header]
      : '';
  });

  sheet.appendRow(row);
  return sheet.getLastRow();
}

function getSystemParameter_(name, fallback) {
  var table = readTable_(SHEETS.CONFIGURACION, DATA_SOURCES.MAIN);
  var target = normalizeHeader_(name);

  for (var i = 0; i < table.rows.length; i++) {
    var row = table.rows[i].object;
    if (normalizeHeader_(row['PARÁMETRO']) === target) {
      return row['VALOR'];
    }
  }

  return fallback;
}


function upsertSystemParameter_(name, value) {
  var sheet = getSheet_(SHEETS.CONFIGURACION, DATA_SOURCES.MAIN);
  var hit = findRowByHeader_(
    SHEETS.CONFIGURACION,
    'PARÁMETRO',
    name,
    DATA_SOURCES.MAIN
  );

  if (hit) {
    patchRow_(sheet, hit.rowNumber, {
      'PARÁMETRO': normalizeText_(name).toUpperCase(),
      'VALOR': typeof value === 'string' ? value : JSON.stringify(value)
    });
    return hit.rowNumber;
  }

  return appendRecord_(SHEETS.CONFIGURACION, {
    'PARÁMETRO': normalizeText_(name).toUpperCase(),
    'VALOR': typeof value === 'string' ? value : JSON.stringify(value)
  }, DATA_SOURCES.MAIN);
}

function getJsonSystemParameter_(name, fallback) {
  var raw = getSystemParameter_(name, '');
  if (raw === '' || raw == null) return JSON.parse(JSON.stringify(fallback));
  try {
    return JSON.parse(String(raw));
  } catch (error) {
    return JSON.parse(JSON.stringify(fallback));
  }
}
