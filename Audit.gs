function auditEvent_(actor, action, moduleName, caseId, patient, detail, result) {
  try {
    var user = actor && (actor.user || actor.usuario) ?
      String(actor.user || actor.usuario) : 'SISTEMA';

    var role = actor && (actor.role || actor.rol) ?
      String(actor.role || actor.rol) : 'SISTEMA';

    appendRecord_(SHEETS.AUDITORIA, {
      'MARCA TEMPORAL': new Date(),
      'USUARIO': user,
      'ROL': role,
      'ACCIÓN': normalizeText_(action),
      'ID CASO': normalizeText_(caseId),
      'PACIENTE': normalizeText_(patient),
      'MÓDULO': normalizeText_(moduleName),
      'DETALLE': normalizeText_(detail),
      'RESULTADO': normalizeText_(result || 'OK'),
      'VERSIÓN': APP.VERSION
    }, DATA_SOURCES.MAIN);
  } catch (error) {
    console.error('No fue posible registrar auditoría: ' + error.message);
  }
}
