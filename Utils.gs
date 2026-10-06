function nowIso_() {
  return Utilities.formatDate(new Date(), APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd');
}

function uuid_() {
  return Utilities.getUuid();
}

function normalizeText_(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeUser_(value) {
  return normalizeText_(value).toLowerCase();
}

function sha256Hex_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function base64UrlEncode_(value) {
  return Utilities.base64EncodeWebSafe(String(value), Utilities.Charset.UTF_8)
    .replace(/=+$/g, '');
}

function base64UrlDecode_(value) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(value)).getDataAsString();
}

function getTokenSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty(APP.PROPERTY_TOKEN_SECRET);
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(APP.PROPERTY_TOKEN_SECRET, secret);
  }
  return secret;
}

function signText_(text) {
  var signature = Utilities.computeHmacSha256Signature(
    String(text),
    getTokenSecret_(),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '');
}

function createSessionToken_(user) {
  var payload = {
    sub: user.ID,
    usuario: user.USUARIO,
    nombre: user.NOMBRE,
    rol: user.ROL,
    exp: Math.floor(Date.now() / 1000) + APP.SESSION_SECONDS
  };
  var body = base64UrlEncode_(JSON.stringify(payload));
  return body + '.' + signText_(body);
}

function validateSessionToken_(token) {
  try {
    var raw = normalizeText_(token);
    var parts = raw.split('.');
    if (parts.length !== 2) throw new Error('Token inválido.');
    if (signText_(parts[0]) !== parts[1]) throw new Error('Firma inválida.');

    var payload = JSON.parse(base64UrlDecode_(parts[0]));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Sesión vencida.');
    }
    return payload;
  } catch (error) {
    throw new Error('Sesión no válida. Inicie sesión nuevamente.');
  }
}

function requireSession_(token, allowedRoles) {
  var session = validateSessionToken_(token);
  if (allowedRoles && allowedRoles.length && allowedRoles.indexOf(session.rol) === -1) {
    throw new Error('No tiene permisos para ejecutar esta acción.');
  }
  return session;
}

function ok_(data, message) {
  return {
    ok: true,
    message: message || '',
    data: data == null ? null : data,
    version: APP.VERSION
  };
}

function fail_(error) {
  return {
    ok: false,
    message: error && error.message ? error.message : String(error),
    data: null,
    version: APP.VERSION
  };
}

function safeApi_(fn) {
  try {
    return fn();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return fail_(error);
  }
}

function assertRequired_(obj, fields) {
  fields.forEach(function(field) {
    if (!normalizeText_(obj && obj[field])) {
      throw new Error('Campo requerido: ' + field);
    }
  });
}
