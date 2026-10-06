function hexBytes_(bytes) {
  return (bytes || []).map(function(b) {
    var n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function hashLegacyPin_(pin) {
  return hexBytes_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pin || ''),
    Utilities.Charset.UTF_8
  ));
}

function getAuthPepper_() {
  var props = PropertiesService.getScriptProperties();
  var pepper = props.getProperty(APP.PROPERTY_AUTH_PEPPER);

  if (pepper) return pepper;

  var usersSheet = getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN);
  var saltColumn = requireColumn_(usersSheet, 'SALT PIN');
  var lastRow = usersSheet.getLastRow();

  if (lastRow >= 2) {
    var salts = usersSheet.getRange(
      2,
      saltColumn,
      lastRow - 1,
      1
    ).getDisplayValues();

    var hasMigratedUsers = salts.some(function(row) {
      return Boolean(normalizeText_(row[0]));
    });

    if (hasMigratedUsers) {
      throw new Error(
        'Falta la Script Property QX_AUTH_PEPPER_V1. ' +
        'No se generó una nueva para evitar invalidar los PIN existentes.'
      );
    }
  }

  pepper = uuid_().replace(/-/g, '') +
    uuid_().replace(/-/g, '') +
    uuid_().replace(/-/g, '');

  props.setProperty(APP.PROPERTY_AUTH_PEPPER, pepper);
  return pepper;
}

function newPinSalt_() {
  return uuid_().replace(/-/g, '') +
    uuid_().replace(/-/g, '').slice(0, 16);
}

function hashSecurePin_(pin, salt) {
  var pepper = getAuthPepper_();
  var s = String(salt || '');
  var acc = String(pin || '') + '|' + s;

  for (var i = 0; i < 600; i++) {
    acc = hexBytes_(Utilities.computeHmacSha256Signature(
      acc,
      pepper + '|' + s + '|' + i,
      Utilities.Charset.UTF_8
    ));
  }

  return acc;
}

function constantTimeEquals_(a, b) {
  a = String(a || '');
  b = String(b || '');

  var diff = a.length ^ b.length;
  var max = Math.max(a.length, b.length);

  for (var i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return diff === 0;
}

function userFromRecord_(hit) {
  if (!hit) return null;

  var r = hit.object;

  return {
    rowNumber: hit.rowNumber,
    id: normalizeText_(r['ID USUARIO']),
    usuario: normalizeText_(r['USUARIO']),
    nombre: normalizeText_(r['NOMBRE']),
    role: normalizeText_(r['ROL']).toUpperCase() || 'USER',
    hash: normalizeText_(r['HASH PIN']),
    estado: normalizeText_(r['ESTADO']).toUpperCase() || 'ACTIVO',
    creadoEn: r['CREADO EN'] || '',
    creadoPor: normalizeText_(r['CREADO POR']),
    ultimoIngreso: r['ÚLTIMO INGRESO'] || '',
    actualizadoEn: r['ACTUALIZADO EN'] || '',
    cambioPin: normalizeText_(r['CAMBIO PIN REQUERIDO']).toUpperCase() === 'SI',
    salt: normalizeText_(r['SALT PIN']),
    pinActualizadoEn: r['PIN ACTUALIZADO EN'] || '',
    intentos: Number(r['INTENTOS FALLIDOS'] || 0) || 0,
    bloqueadoHasta: r['BLOQUEADO HASTA'] || '',
    sessionVersion: Number(r['VERSIÓN SESIÓN'] || 1) || 1
  };
}

function findUserByUsername_(username) {
  var sheet = getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN);
  var column = requireColumn_(sheet, 'USUARIO');
  var lastRow = sheet.getLastRow();
  var target = normalizeUser_(username);

  if (!target || lastRow < 2) return null;

  var users = sheet.getRange(
    2,
    column,
    lastRow - 1,
    1
  ).getDisplayValues();

  for (var i = 0; i < users.length; i++) {
    if (normalizeUser_(users[i][0]) === target) {
      var rowNumber = i + 2;
      var headers = getHeaders_(sheet);
      var row = sheet.getRange(
        rowNumber,
        1,
        1,
        headers.length
      ).getValues()[0];

      return userFromRecord_({
        rowNumber: rowNumber,
        object: rowToObject_(headers, row)
      });
    }
  }

  return null;
}

function findUserById_(id) {
  return userFromRecord_(findRowByHeader_(
    SHEETS.USUARIOS,
    'ID USUARIO',
    id,
    DATA_SOURCES.MAIN
  ));
}

function getRole_(roleId) {
  var hit = findRowByHeader_(
    SHEETS.ROLES,
    'ID ROL',
    roleId,
    DATA_SOURCES.MAIN
  );

  if (!hit) {
    return {
      id: normalizeText_(roleId).toUpperCase(),
      nombre: normalizeText_(roleId),
      estado: 'ACTIVO',
      permisos: []
    };
  }

  var r = hit.object;
  var permissions = [];

  try {
    permissions = JSON.parse(String(r['PERMISOS JSON'] || '[]'));
    if (!Array.isArray(permissions)) permissions = [];
  } catch (error) {
    permissions = [];
  }

  return {
    id: normalizeText_(r['ID ROL']).toUpperCase(),
    nombre: normalizeText_(r['NOMBRE']),
    descripcion: normalizeText_(r['DESCRIPCIÓN']),
    estado: normalizeText_(r['ESTADO']).toUpperCase(),
    sistema: normalizeText_(r['SISTEMA']).toUpperCase() === 'SI',
    permisos: permissions.map(function(p) {
      return String(p).toUpperCase();
    })
  };
}

function verifyUserPin_(user, pin) {
  if (!user) return false;

  var expected = user.salt ?
    hashSecurePin_(pin, user.salt) :
    hashLegacyPin_(pin);

  return constantTimeEquals_(expected, user.hash);
}

function loginBlocked_(user) {
  if (!user || !user.bloqueadoHasta) return false;

  var until = normalDate_(user.bloqueadoHasta);
  return Boolean(until && until.getTime() > Date.now());
}

function registerLoginFailure_(user) {
  if (!user) return;

  var failures = Number(user.intentos || 0) + 1;
  var blockedUntil = '';

  if (failures >= 5) {
    var level = Math.max(0, Math.floor((failures - 5) / 5));
    var minutes = Math.min(60, 15 * Math.pow(2, level));
    blockedUntil = new Date(Date.now() + minutes * 60000);
  }

  var sheet = getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN);

  patchRow_(sheet, user.rowNumber, {
    'INTENTOS FALLIDOS': failures,
    'BLOQUEADO HASTA': blockedUntil || '',
    'ACTUALIZADO EN': new Date()
  });

  invalidateUserSecurity_(user.id);

  if (blockedUntil) {
    auditEvent_(
      { user: user.usuario, role: user.role },
      'BLOQUEO DE ACCESO',
      'ACCESO',
      user.id,
      user.nombre,
      'Cuenta bloqueada temporalmente por intentos fallidos.',
      'ALERTA'
    );
  }
}

function clearLoginFailures_(user) {
  if (!user) return;

  patchRow_(
    getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN),
    user.rowNumber,
    {
      'INTENTOS FALLIDOS': 0,
      'BLOQUEADO HASTA': ''
    }
  );

  invalidateUserSecurity_(user.id);
}

function migrateLegacyPin_(user, pin) {
  if (!user || user.salt) return user;

  var salt = newPinSalt_();
  var now = new Date();

  patchRow_(
    getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN),
    user.rowNumber,
    {
      'HASH PIN': hashSecurePin_(pin, salt),
      'SALT PIN': salt,
      'PIN ACTUALIZADO EN': now,
      'ACTUALIZADO EN': now
    }
  );

  invalidateUserSecurity_(user.id);
  return findUserById_(user.id) || user;
}

function invalidateUserSecurity_(userId) {
  if (!userId) return;
  CacheService.getScriptCache().remove(
    APP.USER_SECURITY_CACHE_PREFIX + String(userId)
  );
}

function getUserSecurity_(userId) {
  var cache = CacheService.getScriptCache();
  var key = APP.USER_SECURITY_CACHE_PREFIX + String(userId || '');
  var cached = cache.get(key);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {}
  }

  var user = findUserById_(userId);
  if (!user) return null;

  var role = getRole_(user.role);

  var security = {
    id: user.id,
    user: user.usuario,
    name: user.nombre,
    role: user.role,
    estado: user.estado,
    cambioPin: user.cambioPin,
    sessionVersion: user.sessionVersion,
    permissions: role.permisos
  };

  cache.put(key, JSON.stringify(security), 15);
  return security;
}

function session_(token) {
  var rawToken = normalizeText_(token);
  if (!rawToken) return null;

  var cache = CacheService.getScriptCache();
  var key = APP.SESSION_CACHE_PREFIX + rawToken;
  var raw = cache.get(key);

  if (!raw) return null;

  try {
    var session = JSON.parse(raw);

    if (!session.expires || Date.now() > session.expires) {
      cache.remove(key);
      return null;
    }

    var security = getUserSecurity_(session.userId);

    if (
      !security ||
      security.estado !== 'ACTIVO' ||
      Number(security.sessionVersion || 1) !== Number(session.version || 1)
    ) {
      cache.remove(key);
      return null;
    }

    session.role = security.role;
    session.permissions = security.permissions || [];
    session.mustChangePin = Boolean(security.cambioPin);

    return session;
  } catch (error) {
    cache.remove(key);
    return null;
  }
}

function requireSession_(token) {
  var session = session_(token);

  if (!session) {
    throw new Error(
      'Sesión no autorizada o vencida. Inicie sesión nuevamente.'
    );
  }

  if (session.mustChangePin) {
    throw new Error(
      'Debe cambiar el PIN temporal antes de continuar.'
    );
  }

  return session;
}

function hasPermission_(session, permission) {
  if (!session) return false;

  var permissions = session.permissions || [];
  if (permissions.indexOf('*') !== -1) return true;

  return permissions.indexOf(
    String(permission || '').toUpperCase()
  ) !== -1;
}

function requirePermission_(token, permission) {
  var session = requireSession_(token);

  if (!hasPermission_(session, permission)) {
    throw new Error(
      'Su rol no tiene permiso para ejecutar esta acción.'
    );
  }

  return session;
}

function sessionMinutesForRole_(role) {
  var elevated = role === 'ADMIN' || role === 'SUPERADMIN';

  var configured = Number(getSystemParameter_(
    elevated ? 'SESIÓN COORDINACIÓN (MIN)' : 'SESIÓN USUARIO (MIN)',
    elevated ? 240 : 360
  ));

  if (!isFinite(configured) || configured < 10) {
    configured = elevated ? 240 : 360;
  }

  return Math.max(10, Math.min(configured, 360));
}

function apiLogin(arg1, arg2, arg3) {
  var requestedRole = arg3 !== undefined ?
    normalizeText_(arg1).toUpperCase() : '';

  var username = arg3 !== undefined ? arg2 : arg1;
  var pin = arg3 !== undefined ? arg3 : arg2;

  var lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    throw new Error(
      'El sistema está validando otro acceso. Intente nuevamente.'
    );
  }

  try {
    var user = findUserByUsername_(username);

    if (user && loginBlocked_(user)) {
      Utilities.sleep(500);
      throw new Error(
        'Acceso temporalmente bloqueado. Intente nuevamente más tarde.'
      );
    }

    var valid = false;

    if (user) {
      valid = verifyUserPin_(user, pin);
    } else {
      // Coste deliberado para reducir diferencia temporal de usuario inexistente.
      hashLegacyPin_(pin);
    }

    if (!user || user.estado !== 'ACTIVO' || !valid) {
      if (user) registerLoginFailure_(user);
      Utilities.sleep(450);
      throw new Error('Usuario o PIN incorrectos.');
    }

    var role = getRole_(user.role);

    if (role.estado !== 'ACTIVO') {
      throw new Error('El rol asignado a esta cuenta está inactivo.');
    }

    if (
      requestedRole === 'ADMIN' &&
      ['ADMIN', 'SUPERADMIN'].indexOf(user.role) === -1
    ) {
      throw new Error(
        'Esta cuenta no tiene permisos de Coordinación.'
      );
    }

    clearLoginFailures_(user);
    user = migrateLegacyPin_(user, pin);

    var ttlMinutes = sessionMinutesForRole_(user.role);
    var token = uuid_().replace(/-/g, '') +
      uuid_().replace(/-/g, '');

    var session = {
      userId: user.id,
      user: user.usuario,
      name: user.nombre,
      role: user.role,
      permissions: role.permisos,
      version: Number(user.sessionVersion || 1),
      mustChangePin: Boolean(user.cambioPin),
      created: Date.now(),
      expires: Date.now() + ttlMinutes * 60000
    };

    CacheService.getScriptCache().put(
      APP.SESSION_CACHE_PREFIX + token,
      JSON.stringify(session),
      ttlMinutes * 60
    );

    patchRow_(
      getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN),
      user.rowNumber,
      { 'ÚLTIMO INGRESO': new Date() }
    );

    auditEvent_(
      session,
      'INICIO DE SESIÓN',
      'ACCESO',
      '',
      '',
      'Autenticación Web App',
      'OK'
    );

    return jsonSafe_({
      ok: true,
      token: token,
      role: session.role,
      permissions: session.permissions,
      user: session.user,
      name: session.name,
      expires: session.expires,
      mustChangePin: session.mustChangePin
    });
  } finally {
    lock.releaseLock();
  }
}

function apiSession(token) {
  var session = session_(token);

  if (!session) {
    return { valid: false };
  }

  return jsonSafe_({
    valid: true,
    user: session.user,
    name: session.name,
    role: session.role,
    permissions: session.permissions || [],
    expires: session.expires,
    mustChangePin: Boolean(session.mustChangePin)
  });
}

function apiLogout(token) {
  var session = session_(token);

  CacheService.getScriptCache().remove(
    APP.SESSION_CACHE_PREFIX + normalizeText_(token)
  );

  if (session) {
    auditEvent_(
      session,
      'CIERRE DE SESIÓN',
      'ACCESO',
      '',
      '',
      'Salida Web App',
      'OK'
    );
  }

  return { ok: true };
}
