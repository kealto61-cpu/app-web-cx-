function normalizeText_(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeUser_(value) {
  return normalizeText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function uuid_() {
  return Utilities.getUuid();
}

function normalDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  if (!value) return null;

  var text = String(value).trim();
  var m = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0)
    );
  }

  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate_(value) {
  var date = normalDate_(value);
  return date
    ? Utilities.formatDate(date, APP.TIMEZONE, 'yyyy-MM-dd')
    : '';
}

function formatDateTime_(value) {
  var date = normalDate_(value);
  return date
    ? Utilities.formatDate(date, APP.TIMEZONE, 'dd/MM/yyyy HH:mm:ss')
    : '';
}

function formatTime_(value) {
  var date = normalDate_(value);
  if (date) {
    return Utilities.formatDate(date, APP.TIMEZONE, 'HH:mm');
  }

  var text = normalizeText_(value);
  var m = text.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';

  var hh = Number(m[1]);
  var mm = Number(m[2]);
  if (hh > 23 || mm > 59) return '';

  return String(hh).padStart(2, '0') + ':' +
    String(mm).padStart(2, '0');
}

function todayIso_() {
  return Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd');
}

function jsonSafe_(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertRequired_(object, fields) {
  fields.forEach(function(field) {
    if (!normalizeText_(object && object[field])) {
      throw new Error('Campo requerido: ' + field);
    }
  });
}

function safeApi_(fn) {
  try {
    return {
      ok: true,
      data: jsonSafe_(fn()),
      version: APP.VERSION
    };
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return {
      ok: false,
      message: error && error.message ? error.message : String(error),
      data: null,
      version: APP.VERSION
    };
  }
}
