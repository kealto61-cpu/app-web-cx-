function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties()
    .getProperty(APP.PROPERTY_SPREADSHEET_ID);

  if (id) return SpreadsheetApp.openById(id);

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error(
    'No hay Google Sheets configurado. Ejecute setSpreadsheetId("ID_DEL_SHEET").'
  );
}

function setupSystem() {
  var ss = getSpreadsheet_();

  Object.keys(SCHEMA).forEach(function(sheetName) {
    ensureSheet_(ss, sheetName, SCHEMA[sheetName]);
  });

  getTokenSecret_();

  return ok_({
    spreadsheetId: ss.getId(),
    sheets: Object.keys(SCHEMA),
    version: APP.VERSION
  }, 'Sistema inicializado correctamente.');
}

function ensureSheet_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var mismatch = headers.some(function(header, index) {
    return normalizeText_(current[index]) !== header;
  });

  if (mismatch) {
    throw new Error(
      'La hoja ' + sheetName + ' existe pero sus encabezados no coinciden con el esquema esperado.'
    );
  }

  return sheet;
}

function getSheet_(sheetName) {
  var schema = SCHEMA[sheetName];
  if (!schema) throw new Error('Hoja no registrada: ' + sheetName);
  return ensureSheet_(getSpreadsheet_(), sheetName, schema);
}

function rowsToObjects_(headers, rows) {
  return rows.map(function(row) {
    var obj = {};
    headers.forEach(function(header, index) {
      obj[header] = row[index];
    });
    return obj;
  });
}

function dbAll_(sheetName) {
  var sheet = getSheet_(sheetName);
  var headers = SCHEMA[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return rowsToObjects_(headers, rows);
}

function dbFindById_(sheetName, id) {
  var target = normalizeText_(id);
  if (!target) return null;
  var rows = dbAll_(sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (normalizeText_(rows[i].ID) === target) return rows[i];
  }
  return null;
}

function dbAppend_(sheetName, record) {
  var sheet = getSheet_(sheetName);
  var headers = SCHEMA[sheetName];
  var row = headers.map(function(header) {
    return record[header] == null ? '' : record[header];
  });
  sheet.appendRow(row);
  return record;
}

function dbUpdateById_(sheetName, id, patch) {
  var sheet = getSheet_(sheetName);
  var headers = SCHEMA[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Registro no encontrado.');

  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var target = normalizeText_(id);
  var rowNumber = -1;

  for (var i = 0; i < idValues.length; i++) {
    if (normalizeText_(idValues[i][0]) === target) {
      rowNumber = i + 2;
      break;
    }
  }

  if (rowNumber === -1) throw new Error('Registro no encontrado.');

  var current = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var updated = {};

  headers.forEach(function(header, index) {
    updated[header] = Object.prototype.hasOwnProperty.call(patch, header)
      ? patch[header]
      : current[index];
  });

  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([
    headers.map(function(header) { return updated[header]; })
  ]);

  return updated;
}
