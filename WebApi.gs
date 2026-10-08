function apiRequest(request) {
  request = request || {};
  var path = normalizeText_(request.path);
  var method = normalizeText_(request.method || 'GET').toUpperCase();
  var query = request.query || {};
  var body = request.body || {};
  var token = normalizeText_(request.token);

  if (path === '/health') return apiHealth();

  if (path === '/api/care-guides-public' && method === 'GET') return careGuidesApp_('', query, true);
  if (path === '/api/care-guides' && method === 'GET') return careGuidesApp_(token, query, false);

  if (path === '/api/tracking') {
    return publicTracking_(query.code || '');
  }

  if (path === '/api/login' && method === 'POST') {
    return apiLogin(body.user || '', body.pin || '');
  }

  if (path === '/api/logout' && method === 'POST') {
    return apiLogout(token);
  }

  if (path === '/api/me') {
    var me = apiSession(token);
    if (!me.valid) throw new Error('Sesión no autorizada o vencida.');
    return me;
  }

  if (path === '/api/config-operativa' && method === 'GET') {
    requireSuperAdmin_(token);
    return operationalConfig_();
  }

  if (path === '/api/config-operativa' && method === 'POST') {
    return saveOperationalConfig_(token, body);
  }

  if (path === '/api/companion-messages' && method === 'GET') {
    var cs = requireSession_(token);
    if (!hasPermission_(cs, 'OPERACION_VER') &&
        !hasPermission_(cs, 'OPERACION_GESTIONAR') &&
        normalizeText_(cs.role).toUpperCase() !== 'SUPERADMIN') {
      throw new Error('No tiene permiso para consultar mensajes de acompañantes.');
    }
    return { rows: companionMessagesConfig_() };
  }

  if (path === '/api/companion-messages' && method === 'POST') {
    return saveCompanionMessages_(token, body);
  }

  if (path === '/api/companion/notify' && method === 'POST') {
    var ns = requirePermission_(token, 'OPERACION_GESTIONAR');
    return {
      ok: true,
      case: jsonSafe_(
        setCompanionNotice_(ns, body.id, body.messageId, 'MANUAL')
      )
    };
  }

  if (path === '/api/change-pin' && method === 'POST') {
    return apiChangeOwnPinApp_(token, body);
  }

  if (path === '/api/users' && method === 'GET') {
    return listUsersApp_(token);
  }

  if (path === '/api/users' && method === 'POST') {
    return createUserApp_(token, body);
  }

  if (path === '/api/users/update' && method === 'POST') {
    return updateUserApp_(token, body);
  }

  if (path === '/api/users/reset-pin' && method === 'POST') {
    return resetUserPinApp_(token, body);
  }

  if (path === '/api/roles' && method === 'GET') {
    return listRolesApp_(token, false);
  }

  if (path === '/api/roles-admin' && method === 'GET') {
    return listRolesAdminApp_(token);
  }

  if (path === '/api/roles' && method === 'POST') {
    return saveRoleApp_(token, body, false);
  }

  if (path === '/api/roles/update' && method === 'POST') {
    return saveRoleApp_(token, body, true);
  }

  if (path === '/api/tracking-admin' && method === 'GET') {
    return trackingAdmin_(token, query.date || todayIso_());
  }

  if (path === '/api/board' && method === 'GET') {
    return boardApp_(token, query.date || todayIso_());
  }

  if (path === '/api/case/move' && method === 'POST') {
    return moveCaseApp_(token, body);
  }

  if (path === '/api/case/qno' && method === 'POST') {
    return changeQnoApp_(token, body);
  }

  if (path === '/api/case/cancel' && method === 'POST') {
    return cancelCaseApp_(token, body);
  }

  if (path === '/api/case/finish' && method === 'POST') {
    return finishCaseApp_(token, body);
  }

  if (path === '/api/patient/update' && method === 'POST') {
    return updatePatientApp_(token, body);
  }

  if (path === '/api/patient' && method === 'POST') {
    return createPatientApp_(token, body);
  }

  if (path === '/api/bulk' && method === 'POST') {
    return bulkImportApp_(token, body);
  }

  if (path === '/api/profilaxis-catalog' && method === 'GET') {
    return profilaxisCatalogApp_(
      token,
      query.q || '',
      query.especialidad || ''
    );
  }

  if (path === '/api/profilaxis' && method === 'GET') {
    return profilaxisApp_(token, query.date || todayIso_());
  }

  if (path === '/api/postop' && method === 'GET') {
    return postopApp_(token, query.date || todayIso_());
  }

  if (path === '/api/coord' && method === 'GET') {
    return coordApp_(token, query.date || todayIso_());
  }

  if (path === '/api/kpi' && method === 'GET') {
    return kpiApp_(
      token,
      query.date || todayIso_(),
      query.period || 'MES'
    );
  }

  if (path === '/api/mci' && method === 'GET') {
    return mciApp_(token, query.date || todayIso_());
  }

  if (path === '/api/reinterventions' && method === 'GET') {
    return reinterventionsApp_(token, query.date || todayIso_());
  }

  if (path === '/api/download' && method === 'GET') {
    return downloadApp_(
      token,
      query.date || todayIso_(),
      query.period || 'DIA',
      query.type || 'PROGRAMACION'
    );
  }

  throw new Error('Ruta no implementada en Apps Script: ' + path);
}

function attachmentsFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(APP.PROPERTY_ATTACHMENTS_FOLDER_ID);

  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (error) {}
  }

  var folder = DriveApp.createFolder('APP WEB CX - SOPORTES');
  props.setProperty(APP.PROPERTY_ATTACHMENTS_FOLDER_ID, folder.getId());
  return folder;
}

function apiUploadAttachment(token, payload) {
  var session = requireSession_(token);
  payload = payload || {};

  var name = normalizeText_(payload.name || 'archivo');
  var mime = normalizeText_(payload.mime || 'application/octet-stream');
  var base64 = String(payload.base64 || '');
  var caseId = normalizeText_(payload.caseId);
  var context = normalizeText_(payload.context || 'GENERAL');

  if (!base64) throw new Error('No se recibió contenido del archivo.');

  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > 25 * 1024 * 1024) {
    throw new Error('El archivo supera el límite de 25 MB.');
  }

  var folder = attachmentsFolder_();
  var caseFolder = folder;
  if (caseId) {
    var it = folder.getFoldersByName(caseId);
    caseFolder = it.hasNext() ? it.next() : folder.createFolder(caseId);
  }

  var blob = Utilities.newBlob(bytes, mime, name);
  var file = caseFolder.createFile(blob);
  file.setDescription(
    'APP WEB CX | ' + context +
    ' | Usuario: ' + session.user +
    ' | ' + formatDateTime_(new Date())
  );

  auditEvent_(
    session,
    'CARGA ARCHIVO',
    'ARCHIVOS',
    caseId,
    '',
    name + ' · ' + bytes.length + ' bytes · ' + context,
    'OK'
  );

  return {
    ok: true,
    id: file.getId(),
    name: file.getName(),
    size: bytes.length,
    url: file.getUrl(),
    caseId: caseId,
    context: context
  };
}
