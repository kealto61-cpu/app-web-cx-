var DEFAULT_QNOS_APP = ['QNO 1', 'QNO 2', 'QNO 3'];

var DEFAULT_FLOW_APP = {
  'PROGRAMADO': ['PREPARACIÓN', 'QUIRÓFANO'],
  'PREPARACIÓN': ['PROGRAMADO', 'QUIRÓFANO'],
  'QUIRÓFANO': ['PREPARACIÓN', 'RECUPERACIÓN', 'ALTA', 'HOSPITALIZACIÓN'],
  'RECUPERACIÓN': ['ALTA', 'HOSPITALIZACIÓN']
};

var FLOW_STATES_APP = [
  'PROGRAMADO',
  'PREPARACIÓN',
  'QUIRÓFANO',
  'RECUPERACIÓN',
  'ALTA',
  'HOSPITALIZACIÓN'
];

var ROLE_PERMISSION_CATALOG_APP = [
  'OPERACION_VER',
  'OPERACION_GESTIONAR',
  'PROGRAMACION_VER',
  'PROGRAMACION_EDITAR',
  'CARGUE_MASIVO',
  'COORDINACION_VER',
  'INDICADORES_VER',
  'DESCARGAS',
  'REPORTES_PDF',
  'USUARIOS_GESTIONAR',
  'REINTERVENCIONES_REVISAR',
  'REINTERVENCIONES_CERRAR',
  'PROFILAXIS_PREQX',
  'CUIDADOS_POSTOP',
  'SINCRONIZAR'
];

function requireSuperAdmin_(token) {
  var session = requireSession_(token);
  if (normalizeText_(session.role).toUpperCase() !== 'SUPERADMIN') {
    throw new Error('Configuración es exclusiva de SUPERADMIN.');
  }
  return session;
}

function operationalConfig_() {
  var qnos = getJsonSystemParameter_('QNO HABILITADOS', DEFAULT_QNOS_APP);
  var flow = getJsonSystemParameter_('FLUJO QUIRÚRGICO', DEFAULT_FLOW_APP);

  if (!Array.isArray(qnos) || !qnos.length) qnos = DEFAULT_QNOS_APP.slice();
  qnos = Array.from(new Set(qnos.map(function(q) {
    return normalizeText_(q).toUpperCase();
  }).filter(Boolean)));

  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) {
    flow = JSON.parse(JSON.stringify(DEFAULT_FLOW_APP));
  }

  var clean = {};
  ['PROGRAMADO', 'PREPARACIÓN', 'QUIRÓFANO', 'RECUPERACIÓN'].forEach(function(from) {
    var arr = Array.isArray(flow[from]) ? flow[from] : [];
    clean[from] = Array.from(new Set(arr.map(function(x) {
      return normalizeText_(x).toUpperCase();
    }).filter(function(x) {
      return FLOW_STATES_APP.indexOf(x) !== -1 && x !== from;
    })));
  });

  return {
    qnos: qnos,
    flow: clean,
    states: FLOW_STATES_APP.slice()
  };
}

function saveOperationalConfig_(token, body) {
  var session = requireSuperAdmin_(token);
  body = body || {};

  var qnos = Array.isArray(body.qnos) ? body.qnos.map(function(q) {
    return normalizeText_(q).toUpperCase();
  }).filter(Boolean) : [];

  qnos = Array.from(new Set(qnos));

  if (!qnos.length) throw new Error('Debe existir al menos un QNO habilitado.');
  if (qnos.length > 20) throw new Error('Máximo 20 QNO habilitados.');

  var flow = body.flow || {};
  var clean = {};
  ['PROGRAMADO', 'PREPARACIÓN', 'QUIRÓFANO', 'RECUPERACIÓN'].forEach(function(from) {
    var arr = Array.isArray(flow[from]) ? flow[from] : [];
    clean[from] = Array.from(new Set(arr.map(function(x) {
      return normalizeText_(x).toUpperCase();
    }).filter(function(x) {
      return FLOW_STATES_APP.indexOf(x) !== -1 && x !== from;
    })));
  });

  upsertSystemParameter_('QNO HABILITADOS', qnos);
  upsertSystemParameter_('FLUJO QUIRÚRGICO', clean);

  auditEvent_(
    session,
    'ACTUALIZAR CONFIGURACIÓN',
    'CONFIGURACIÓN',
    '',
    '',
    'QNO y flujo quirúrgico actualizados.',
    'OK'
  );

  return jsonSafe_(operationalConfig_());
}

function validPinApp_(pin) {
  var p = String(pin || '');
  if (!/^[A-Za-z0-9]{4,16}$/.test(p)) return false;
  if (/^([A-Za-z0-9])\1+$/i.test(p)) return false;
  if (/^\d+$/.test(p) && (
    '0123456789012345'.indexOf(p) !== -1 ||
    '9876543210987654'.indexOf(p) !== -1
  )) return false;
  return true;
}

function apiChangeOwnPinApp_(token, body) {
  var session = session_(token);
  if (!session) throw new Error('Sesión no autorizada o vencida.');
  body = body || {};

  var currentPin = String(body.currentPin || '');
  var newPin = String(body.newPin || '');
  if (!validPinApp_(newPin)) {
    throw new Error(
      'El nuevo PIN debe tener 4–16 caracteres: letras A–Z o números, sin espacios, secuencias numéricas simples ni un único carácter repetido.'
    );
  }

  var user = findUserById_(session.userId);
  if (!user) throw new Error('Usuario no encontrado.');
  if (!verifyUserPin_(user, currentPin)) throw new Error('PIN actual incorrecto.');

  var salt = newPinSalt_();
  var version = Number(user.sessionVersion || 1) + 1;
  var updated = patchRow_(
    getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN),
    user.rowNumber,
    {
      'HASH PIN': hashSecurePin_(newPin, salt),
      'SALT PIN': salt,
      'PIN ACTUALIZADO EN': new Date(),
      'CAMBIO PIN REQUERIDO': 'NO',
      'VERSIÓN SESIÓN': version,
      'ACTUALIZADO EN': new Date()
    }
  );

  invalidateUserSecurity_(user.id);
  apiLogout(token);

  auditEvent_(
    session,
    'CAMBIO PIN',
    'USUARIOS',
    user.id,
    user.nombre,
    'Cambio de PIN propio',
    'OK'
  );

  return { ok: true, user: updated['USUARIO'] || user.usuario };
}

function roleRowsApp_() {
  var table = readTable_(SHEETS.ROLES, DATA_SOURCES.MAIN);
  return table.rows.map(function(entry) {
    var r = entry.object;
    var permissions = [];
    try {
      permissions = JSON.parse(String(r['PERMISOS JSON'] || '[]'));
      if (!Array.isArray(permissions)) permissions = [];
    } catch (error) {
      permissions = [];
    }

    return {
      rowNumber: entry.rowNumber,
      id: normalizeText_(r['ID ROL']).toUpperCase(),
      nombre: normalizeText_(r['NOMBRE']),
      descripcion: normalizeText_(r['DESCRIPCIÓN']),
      permisos: permissions.map(function(p) { return String(p).toUpperCase(); }),
      estado: normalizeText_(r['ESTADO']).toUpperCase() || 'ACTIVO',
      sistema: normalizeText_(r['SISTEMA']).toUpperCase() === 'SI'
    };
  }).filter(function(r) { return r.id; });
}

function listRolesApp_(token, includeInactive) {
  requireSuperAdmin_(token);
  var rows = roleRowsApp_();
  if (!includeInactive) {
    rows = rows.filter(function(r) { return r.estado === 'ACTIVO'; });
  }
  return { rows: rows };
}

function listRolesAdminApp_(token) {
  requireSuperAdmin_(token);
  return {
    rows: roleRowsApp_().sort(function(a, b) {
      return a.id.localeCompare(b.id);
    }),
    catalog: ROLE_PERMISSION_CATALOG_APP.slice()
  };
}

function saveRoleApp_(token, body, updating) {
  var session = requireSuperAdmin_(token);
  body = body || {};
  var id = normalizeText_(body.id).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  var name = normalizeText_(body.nombre);
  var description = normalizeText_(body.descripcion);
  var status = normalizeText_(body.estado || 'ACTIVO').toUpperCase();
  var permissions = Array.isArray(body.permisos) ? body.permisos.map(function(p) {
    return normalizeText_(p).toUpperCase();
  }).filter(Boolean) : [];

  if (!/^[A-Z0-9_]{2,40}$/.test(id)) {
    throw new Error('Código de rol inválido.');
  }
  if (!name) throw new Error('El nombre del rol es obligatorio.');

  var hit = findRowByHeader_(SHEETS.ROLES, 'ID ROL', id, DATA_SOURCES.MAIN);

  if (!updating && hit) throw new Error('Ese código de rol ya existe.');
  if (updating && !hit) throw new Error('Rol no encontrado.');

  if (id === 'SUPERADMIN') {
    status = 'ACTIVO';
    permissions = ['*'];
  } else if (['ACTIVO', 'INACTIVO'].indexOf(status) === -1) {
    throw new Error('Estado de rol inválido.');
  }

  var now = new Date();
  var record = {
    'ID ROL': id,
    'NOMBRE': name,
    'DESCRIPCIÓN': description,
    'PERMISOS JSON': JSON.stringify(permissions),
    'ESTADO': status,
    'SISTEMA': id === 'SUPERADMIN' ? 'SI' : (hit ? hit.object['SISTEMA'] || 'NO' : 'NO'),
    'ACTUALIZADO EN': now,
    'ACTUALIZADO POR': session.user
  };

  if (hit) {
    patchRow_(hit.sheet, hit.rowNumber, record);
  } else {
    record['CREADO EN'] = now;
    record['CREADO POR'] = session.user;
    appendRecord_(SHEETS.ROLES, record, DATA_SOURCES.MAIN);
  }

  auditEvent_(
    session,
    updating ? 'EDITAR ROL' : 'CREAR ROL',
    'USUARIOS',
    id,
    '',
    name + ' · ' + status,
    'OK'
  );

  CacheService.getScriptCache().removeAll([]);
  return { ok: true, id: id };
}

function listUsersApp_(token) {
  requireSuperAdmin_(token);
  var table = readTable_(SHEETS.USUARIOS, DATA_SOURCES.MAIN);
  return {
    rows: table.rows.map(function(entry) {
      var r = entry.object;
      return {
        id: normalizeText_(r['ID USUARIO']),
        usuario: normalizeText_(r['USUARIO']),
        nombre: normalizeText_(r['NOMBRE']),
        rol: normalizeText_(r['ROL']).toUpperCase(),
        estado: normalizeText_(r['ESTADO']).toUpperCase(),
        ultimoIngreso: formatDateTime_(r['ÚLTIMO INGRESO']),
        cambioPin: ['SI', 'SÍ'].indexOf(
          normalizeText_(r['CAMBIO PIN REQUERIDO']).toUpperCase()
        ) !== -1
      };
    })
  };
}

function ensureRoleActiveApp_(roleId) {
  var role = getRole_(normalizeText_(roleId).toUpperCase());
  if (!role.id || role.estado !== 'ACTIVO') {
    throw new Error('Rol no válido o inactivo.');
  }
  return role;
}

function createUserApp_(token, body) {
  var session = requireSuperAdmin_(token);
  body = body || {};
  var username = normalizeUser_(body.usuario);
  var name = normalizeText_(body.nombre);
  var role = normalizeText_(body.rol).toUpperCase();
  var pin = String(body.pin || '');

  if (!username || username.length < 3) throw new Error('Usuario inválido.');
  if (!name) throw new Error('El nombre es obligatorio.');
  ensureRoleActiveApp_(role);
  if (!validPinApp_(pin)) {
    throw new Error('El PIN debe tener 4–16 caracteres: letras A–Z o números, sin espacios, secuencias numéricas simples ni un único carácter repetido.');
  }
  if (findUserByUsername_(username)) throw new Error('Ese usuario ya existe.');

  var salt = newPinSalt_();
  var id = 'USR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  var now = new Date();

  appendRecord_(SHEETS.USUARIOS, {
    'ID USUARIO': id,
    'USUARIO': username,
    'NOMBRE': name,
    'ROL': role,
    'HASH PIN': hashSecurePin_(pin, salt),
    'ESTADO': 'ACTIVO',
    'CREADO EN': now,
    'CREADO POR': session.user,
    'ÚLTIMO INGRESO': '',
    'ACTUALIZADO EN': now,
    'CAMBIO PIN REQUERIDO': body.forceChange === false ? 'NO' : 'SI',
    'SALT PIN': salt,
    'PIN ACTUALIZADO EN': now,
    'INTENTOS FALLIDOS': 0,
    'BLOQUEADO HASTA': '',
    'VERSIÓN SESIÓN': 1
  }, DATA_SOURCES.MAIN);

  auditEvent_(
    session,
    'CREAR USUARIO',
    'USUARIOS',
    id,
    name,
    username + ' · ' + role,
    'OK'
  );

  return { ok: true, id: id };
}

function updateUserApp_(token, body) {
  var session = requireSuperAdmin_(token);
  body = body || {};
  var user = findUserById_(body.id);
  if (!user) throw new Error('Usuario no encontrado.');

  var role = normalizeText_(body.rol || user.role).toUpperCase();
  var status = normalizeText_(body.estado || user.estado).toUpperCase();
  ensureRoleActiveApp_(role);
  if (['ACTIVO', 'INACTIVO'].indexOf(status) === -1) {
    throw new Error('Estado inválido.');
  }

  patchRow_(
    getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN),
    user.rowNumber,
    {
      'NOMBRE': normalizeText_(body.nombre || user.nombre),
      'ROL': role,
      'ESTADO': status,
      'ACTUALIZADO EN': new Date(),
      'VERSIÓN SESIÓN': Number(user.sessionVersion || 1) + 1
    }
  );

  invalidateUserSecurity_(user.id);

  auditEvent_(
    session,
    'EDITAR USUARIO',
    'USUARIOS',
    user.id,
    user.nombre,
    role + ' · ' + status,
    'OK'
  );

  return { ok: true };
}

function resetUserPinApp_(token, body) {
  var session = requireSuperAdmin_(token);
  body = body || {};
  var user = findUserById_(body.id);
  if (!user) throw new Error('Usuario no encontrado.');
  var pin = String(body.pin || '');

  if (!validPinApp_(pin)) {
    throw new Error('El PIN debe tener 4–16 caracteres: letras A–Z o números, sin espacios, secuencias numéricas simples ni un único carácter repetido.');
  }

  var salt = newPinSalt_();
  patchRow_(
    getSheet_(SHEETS.USUARIOS, DATA_SOURCES.MAIN),
    user.rowNumber,
    {
      'HASH PIN': hashSecurePin_(pin, salt),
      'SALT PIN': salt,
      'PIN ACTUALIZADO EN': new Date(),
      'CAMBIO PIN REQUERIDO': body.forceChange === false ? 'NO' : 'SI',
      'INTENTOS FALLIDOS': 0,
      'BLOQUEADO HASTA': '',
      'VERSIÓN SESIÓN': Number(user.sessionVersion || 1) + 1,
      'ACTUALIZADO EN': new Date()
    }
  );

  invalidateUserSecurity_(user.id);

  auditEvent_(
    session,
    'REINICIAR PIN',
    'USUARIOS',
    user.id,
    user.nombre,
    'PIN reiniciado por SUPERADMIN',
    'OK'
  );

  return { ok: true };
}
