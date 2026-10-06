function minutesBetweenDateValues_(a, b) {
  var da = normalDate_(a);
  var db = normalDate_(b);
  if (!da || !db) return '';
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / 60000));
}

function boardApp_(token, dateIso) {
  var session = requireSession_(token);
  if (!hasPermission_(session, 'OPERACION_VER') &&
      !hasPermission_(session, 'PROGRAMACION_VER')) {
    throw new Error('No tiene permiso para consultar la programación.');
  }

  var rows = readCasesForDate_(dateIso || todayIso_(), true);
  return jsonSafe_({
    rows: rows,
    metrics: boardMetrics_(rows),
    config: operationalConfig_()
  });
}

function moveCaseApp_(token, body) {
  var session = requirePermission_(token, 'OPERACION_GESTIONAR');
  body = body || {};

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) throw new Error('El sistema está procesando otro movimiento.');

  try {
    var hit = findCaseRow_(body.id);
    if (!hit) throw new Error('Paciente no encontrado.');

    var chief = normalizeText_(body.jefeTurno);
    if (!chief) throw new Error('Debe registrar el Jefe de turno antes de mover al paciente.');

    var from = normalizeText_(hit.object['ESTADO ACTUAL'] || 'PROGRAMADO').toUpperCase();
    var to = normalizeText_(body.destino).toUpperCase();
    var allowed = operationalConfig_().flow;

    if (!allowed[from] || allowed[from].indexOf(to) === -1) {
      throw new Error('Transición no permitida: ' + from + ' → ' + to);
    }

    var now = new Date();
    var patch = {
      'ESTADO ACTUAL': to,
      'ENFERMERO JEFE': chief
    };

    if (to === 'PREPARACIÓN') {
      if (!hit.object['PRIMER INGRESO PREPARACIÓN']) {
        patch['PRIMER INGRESO PREPARACIÓN'] = now;
      }
      patch['ÚLTIMO INGRESO PREPARACIÓN'] = now;
      patch['PREPARACIÓN'] = 'TRUE';
    }

    if (to === 'QUIRÓFANO') {
      patch['EN QNO'] = 'TRUE';
      if (!hit.object['PRIMER INGRESO QNO']) patch['PRIMER INGRESO QNO'] = now;
      patch['ÚLTIMO INGRESO QNO'] = now;

      var prepStart = hit.object['ÚLTIMO INGRESO PREPARACIÓN'] ||
        hit.object['PRIMER INGRESO PREPARACIÓN'];
      var prepaMin = minutesBetweenDateValues_(prepStart, now);
      if (prepaMin !== '') patch['TIEMPO PREPA → QNO (MIN)'] = prepaMin;
    }

    if (from === 'QUIRÓFANO' &&
        ['RECUPERACIÓN', 'ALTA', 'HOSPITALIZACIÓN'].indexOf(to) !== -1) {
      var required = [
        'horaAnestesia',
        'horaFinAnestesia',
        'horaInicioCirugia',
        'horaFinCirugia',
        'profilaxisAdministrada',
        'clasificacionCirugia'
      ];

      var missing = required.some(function(k) {
        return !normalizeText_(body[k]);
      });
      if (missing) {
        throw new Error(
          'Antes de salir de QNO debe completar tiempos intraoperatorios, profilaxis y clasificación de cirugía.'
        );
      }

      var tqx = elapsedMinutes_(body.horaInicioCirugia, body.horaFinCirugia);
      var tan = elapsedMinutes_(body.horaAnestesia, body.horaFinAnestesia);
      if (tqx == null || tqx <= 0 || tan == null || tan <= 0) {
        throw new Error('Revise los horarios de anestesia y cirugía.');
      }

      var profNorm = normalizeHeader_(body.profilaxisAdministrada);
      var prof = profNorm === 'SI' ? 'SÍ' : (profNorm === 'NO' ? 'NO' : '');
      if (!prof) throw new Error('Seleccione si se administró profilaxis.');

      var profMin = '';
      if (prof === 'SÍ') {
        if (!normalizeText_(body.antibioticoProfilaxis) ||
            hhmmMinutes_(body.horaProfilaxis) == null) {
          throw new Error('Registre antibiótico y hora de profilaxis.');
        }
        profMin = elapsedMinutes_(body.horaProfilaxis, body.horaInicioCirugia);
      }

      var clas = normalizeText_(body.clasificacionCirugia).toUpperCase();
      if (['LIMPIA', 'CONTAMINADA', 'SUCIA'].indexOf(clas) === -1) {
        throw new Error('Clasificación de cirugía no válida.');
      }

      Object.assign(patch, {
        'HORA INICIO ANESTESIA': body.horaAnestesia,
        'HORA FIN ANESTESIA': body.horaFinAnestesia,
        'HORA INICIO CIRUGÍA / INCISIÓN': body.horaInicioCirugia,
        'HORA FIN CIRUGÍA': body.horaFinCirugia,
        'TIEMPO QUIRÚRGICO REAL (MIN)': tqx,
        'PROFILAXIS ADMINISTRADA': prof,
        'PROFILAXIS ANTIBIÓTICA / MEDICAMENTO':
          prof === 'SÍ' ? normalizeText_(body.antibioticoProfilaxis) : '',
        'HORA ADMINISTRACIÓN PROFILAXIS':
          prof === 'SÍ' ? body.horaProfilaxis : '',
        'PROFILAXIS → INCISIÓN (MIN)': profMin,
        'CLASIFICACIÓN CIRUGÍA': clas,
        'OPERADO': 'TRUE'
      });

      if (to === 'RECUPERACIÓN') {
        patch['RECUPERACIÓN'] = 'TRUE';
        if (!hit.object['PRIMER INGRESO RECUPERACIÓN']) {
          patch['PRIMER INGRESO RECUPERACIÓN'] = now;
        }
        patch['ÚLTIMO INGRESO RECUPERACIÓN'] = now;

        var qnoStart = hit.object['ÚLTIMO INGRESO QNO'] ||
          hit.object['PRIMER INGRESO QNO'];
        var qnoMin = minutesBetweenDateValues_(qnoStart, now);
        if (qnoMin !== '') patch['TIEMPO QNO → RECUPERACIÓN (MIN)'] = qnoMin;
      }

      if (['ALTA', 'HOSPITALIZACIÓN'].indexOf(to) !== -1) {
        patch['DESTINO POSTOP'] = to;
        patch['OBSERVACIÓN EGRESO / HOSPITALIZACIÓN'] =
          normalizeText_(body.observacion);
      }
    }

    var updated = updateCase_(session, body.id, patch, 'MOVER PACIENTE');
    var movementPayload = Object.assign({}, hit.object, patch);
    movementPayload.__rowNumber = hit.rowNumber;
    appendMovement_(session, movementPayload, from, to, 'Movimiento Web App');

    var notice = autoNotifyCompanion_(session, body.id, to);
    return jsonSafe_(notice || updated);
  } finally {
    lock.releaseLock();
  }
}

function changeQnoApp_(token, body) {
  var session = requirePermission_(token, 'OPERACION_GESTIONAR');
  body = body || {};
  var qno = normalizeText_(body.qno).toUpperCase();
  var chief = normalizeText_(body.jefeTurno);

  if (!chief) throw new Error('Debe registrar el Jefe de turno.');
  if (operationalConfig_().qnos.indexOf(qno) === -1) {
    throw new Error('QNO inválido o no habilitado.');
  }

  return jsonSafe_(updateCase_(
    session,
    body.id,
    { 'SALA / QNO': qno, 'ENFERMERO JEFE': chief },
    'CAMBIO QNO'
  ));
}

function insertCancellationApp_(session, old, body) {
  var date = formatDate_(old['FECHA CIRUGÍA']);
  appendRecord_(SHEETS.CANCELACIONES, {
    'ID CASO': old['ID CASO'] || '',
    'CÓDIGO': 'CAN-' + String(old['ID CASO'] || '').slice(-8),
    'MARCA TEMPORAL': new Date(),
    'FECHA CIRUGÍA CANCELADA': old['FECHA CIRUGÍA'] || '',
    'HORA PROGRAMADA': old['HORA PROGRAMADA'] || '',
    'PACIENTE': old['PACIENTE'] || '',
    'DOCUMENTO': old['DOCUMENTO'] || '',
    'CUPS': old['CUPS'] || '',
    'UVR': old['UVR'] || '',
    'PROCEDIMIENTO PROGRAMADO': old['PROCEDIMIENTO'] || '',
    'ESPECIALIDAD': old['ESPECIALIDAD'] || '',
    'ESPECIALISTA TRATANTE': old['ESPECIALISTA'] || '',
    'SALA / QNO': old['SALA / QNO'] || '',
    'ESTADO AL CANCELAR': old['ESTADO ACTUAL'] || '',
    'JEFE DE QUIRÓFANOS QUE REALIZA LA CANCELACIÓN EN EL SISTEMA':
      normalizeText_(body.jefeTurno),
    'MOMENTO DE LA CANCELACIÓN': normalizeText_(body.momento),
    'CAUSA PRINCIPAL': normalizeText_(body.causa),
    'MOTIVO ESPECÍFICO': normalizeText_(body.motivo),
    'EVALUACIÓN DEL CASO': '',
    'OPORTUNIDAD DE MEJORA / HALLAZGO DE ENFERMERÍA':
      normalizeText_(body.hallazgo),
    'GESTIÓN REALIZADA': normalizeText_(body.gestion),
    'RECURSO / INSUMO / MEDICAMENTO ASOCIADO': '',
    'CLASIFICACIÓN DEL RECURSO': normalizeText_(body.clasificacionRecurso),
    'TIEMPO QX REFERENCIA (MIN)': old['TIEMPO QX ESTIMADO (MIN)'] || '',
    'RETRASO / IMPACTO (MIN)': '',
    'RESULTADO FINAL': 'CANCELADA',
    'OPORTUNIDAD DEL REGISTRO': '',
    'PREVENIBLE': normalizeText_(body.prevenible),
    'OBSERVACIONES': normalizeText_(body.observaciones),
    'CUMPLIMIENTO DEL REGISTRO': 'COMPLETO',
    'MES': date ? date.slice(5, 7) : '',
    'AÑO': date ? date.slice(0, 4) : '',
    'ATRIBUIBLE A': normalizeText_(body.atribuible)
  }, DATA_SOURCES.MAIN);
}

function cancelCaseApp_(token, body) {
  var session = requirePermission_(token, 'OPERACION_GESTIONAR');
  body = body || {};

  if (!normalizeText_(body.jefeTurno)) throw new Error('Debe registrar el Jefe de turno.');
  ['momento', 'causa', 'motivo', 'atribuible'].forEach(function(field) {
    if (!normalizeText_(body[field])) throw new Error('Complete los campos obligatorios de cancelación.');
  });

  var hit = findCaseRow_(body.id);
  if (!hit) throw new Error('Paciente no encontrado.');

  insertCancellationApp_(session, hit.object, body);

  var obs = [body.causa, body.motivo, body.observaciones]
    .filter(Boolean)
    .join(' | ');

  var updated = updateCase_(
    session,
    body.id,
    {
      'ESTADO ACTUAL': 'CANCELADO',
      'CANCELAR': 'TRUE',
      'ENFERMERO JEFE': normalizeText_(body.jefeTurno),
      'OBSERVACIONES': obs,
      'CANCELACIÓN COMPLETADA': 'TRUE'
    },
    'CANCELAR PACIENTE'
  );

  var movement = Object.assign({}, hit.object, { 'ESTADO ACTUAL': 'CANCELADO' });
  movement.__rowNumber = hit.rowNumber;
  appendMovement_(
    session,
    movement,
    hit.object['ESTADO ACTUAL'] || '',
    'CANCELADO',
    normalizeText_(body.motivo)
  );

  return jsonSafe_(updated);
}

function finishCaseApp_(token, body) {
  var session = requirePermission_(token, 'OPERACION_GESTIONAR');
  body = body || {};
  var destination = normalizeText_(body.destino).toUpperCase();
  var chief = normalizeText_(body.jefeTurno);

  if (!chief) throw new Error('Debe registrar el Jefe de turno.');
  if (['ALTA', 'HOSPITALIZACIÓN'].indexOf(destination) === -1) {
    throw new Error('Destino inválido.');
  }

  var updated = updateCase_(
    session,
    body.id,
    {
      'ESTADO ACTUAL': destination,
      'DESTINO POSTOP': destination,
      'HORA SALIDA RECUPERACIÓN': new Date(),
      'OBSERVACIÓN EGRESO / HOSPITALIZACIÓN': normalizeText_(body.observacion),
      'ENFERMERO JEFE': chief,
      'ESTADO FINAL': destination
    },
    'CIERRE RECUPERACIÓN'
  );

  var notice = autoNotifyCompanion_(session, body.id, destination);
  return jsonSafe_(notice || updated);
}

function normalizePatientPayloadApp_(body, original) {
  body = body || {};
  var p = Object.assign({}, original || {});

  var map = {
    fecha: 'FECHA CIRUGÍA',
    hora: 'HORA PROGRAMADA',
    documento: 'DOCUMENTO',
    telefono: 'TELÉFONO',
    paciente: 'PACIENTE',
    edad: 'EDAD',
    sexo: 'SEXO',
    cups: 'CUPS',
    procedimiento: 'PROCEDIMIENTO',
    especialidad: 'ESPECIALIDAD',
    especialista: 'ESPECIALISTA',
    qno: 'SALA / QNO',
    tipoAtencion: 'TIPO DE ATENCIÓN',
    cama: 'CAMA / UBICACIÓN PROGRAMADA',
    uvr: 'UVR',
    tiempoQx: 'TIEMPO QX ESTIMADO (MIN)',
    recursos: 'RECURSOS / ALERTAS PREQUIRÚRGICAS',
    observaciones: 'OBSERVACIONES'
  };

  Object.keys(map).forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      p[map[key]] = normalizeText_(body[key]);
    }
  });

  if (!normalizeText_(p['FECHA CIRUGÍA']) ||
      !normalizeText_(p['HORA PROGRAMADA']) ||
      !normalizeText_(p['DOCUMENTO']) ||
      !normalizeText_(p['PACIENTE']) ||
      !normalizeText_(p['PROCEDIMIENTO'])) {
    throw new Error('Fecha, hora, documento, paciente y procedimiento son obligatorios.');
  }

  var config = operationalConfig_();
  var qno = normalizeText_(p['SALA / QNO']).toUpperCase();
  if (qno && config.qnos.indexOf(qno) === -1) throw new Error('QNO no habilitado.');

  p['FECHA CIRUGÍA'] = parseIsoDate_(formatDate_(p['FECHA CIRUGÍA']));
  p['HORA PROGRAMADA'] = normalizeText_(p['HORA PROGRAMADA']).slice(0, 5);
  p['PACIENTE'] = normalizeText_(p['PACIENTE']).toUpperCase();
  p['PROCEDIMIENTO'] = normalizeText_(p['PROCEDIMIENTO']).toUpperCase();
  p['ESPECIALIDAD'] = normalizeText_(p['ESPECIALIDAD']).toUpperCase();
  p['ESPECIALISTA'] = normalizeText_(p['ESPECIALISTA']).toUpperCase();
  p['SALA / QNO'] = qno;
  p['TIPO DE ATENCIÓN'] = normalizeText_(p['TIPO DE ATENCIÓN']).toUpperCase();
  p['ÚLTIMA ACTUALIZACIÓN WEB'] = new Date();

  return p;
}

function createPatientApp_(token, body) {
  var session = requirePermission_(token, 'PROGRAMACION_EDITAR');
  var p = normalizePatientPayloadApp_(body, {});
  var date = formatDate_(p['FECHA CIRUGÍA']);

  p['ID CASO'] =
    'QX-' + date.replace(/-/g, '') + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  p['ESTADO ACTUAL'] = 'PROGRAMADO';
  p['FUENTE DE PROGRAMACIÓN'] = 'WEB APP APPS SCRIPT';
  p['CÓDIGO SEGUIMIENTO'] =
    'SEG-' + date.replace(/-/g, '') + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  p['TOKEN SEGUIMIENTO'] = uniqueTrackingToken_();
  p['CREADO SEGUIMIENTO'] = new Date();

  appendRecord_(SHEETS.PROGRAMACION, p, DATA_SOURCES.MAIN);

  auditEvent_(
    session,
    'CREAR PACIENTE',
    'PROGRAMACIÓN',
    p['ID CASO'],
    p['PACIENTE'],
    'Nuevo paciente',
    'OK'
  );

  var notice = autoNotifyCompanion_(session, p['ID CASO'], 'PROGRAMADO');

  return jsonSafe_({
    ok: true,
    id: p['ID CASO'],
    trackingCode: p['CÓDIGO SEGUIMIENTO'],
    case: notice || surgeryCaseFromRow_(p)
  });
}

function updatePatientApp_(token, body) {
  var session = requirePermission_(token, 'PROGRAMACION_EDITAR');
  body = body || {};
  var hit = findCaseRow_(body.id);
  if (!hit) throw new Error('Paciente no encontrado.');

  var p = normalizePatientPayloadApp_(body, hit.object);
  p['USUARIO ÚLTIMO MOVIMIENTO'] = session.user;

  var updated = patchRow_(
    hit.sheet,
    hit.rowNumber,
    p
  );

  auditEvent_(
    session,
    'EDITAR PACIENTE',
    'PROGRAMACIÓN',
    p['ID CASO'] || body.id,
    p['PACIENTE'],
    'Actualización desde Programación',
    'OK'
  );

  return { ok: true, case: jsonSafe_(surgeryCaseFromRow_(updated)) };
}

function existingProgrammingKeysApp_() {
  var sheet = getSheet_(SHEETS.PROGRAMACION, DATA_SOURCES.MAIN);
  var meta = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  var dateCol = meta.map[normalizeHeader_('FECHA CIRUGÍA')];
  var docCol = meta.map[normalizeHeader_('DOCUMENTO')];
  var procCol = meta.map[normalizeHeader_('PROCEDIMIENTO')];

  var dates = sheet.getRange(2, dateCol, lastRow - 1, 1).getValues();
  var docs = sheet.getRange(2, docCol, lastRow - 1, 1).getDisplayValues();
  var procs = sheet.getRange(2, procCol, lastRow - 1, 1).getDisplayValues();
  var keys = {};

  for (var i = 0; i < dates.length; i++) {
    var date = formatDate_(dates[i][0]);
    var doc = normalizeText_(docs[i][0]);
    var proc = normalizeHeader_(procs[i][0]);
    if (date && doc && proc) keys[date + '|' + doc + '|' + proc] = true;
  }
  return keys;
}


function existingTrackingTokensSetApp_() {
  var sheet = getSheet_(SHEETS.PROGRAMACION, DATA_SOURCES.MAIN);
  var col = requireColumn_(sheet, 'TOKEN SEGUIMIENTO');
  var lastRow = sheet.getLastRow();
  var tokens = {};
  if (lastRow >= 2) {
    sheet.getRange(2, col, lastRow - 1, 1)
      .getDisplayValues()
      .forEach(function(row) {
        var token = normalizeText_(row[0]);
        if (token) tokens[token] = true;
      });
  }
  return tokens;
}

function uniqueTrackingTokenFromSetApp_(tokens) {
  for (var i = 0; i < 100; i++) {
    var token = String(Math.floor(10000 + Math.random() * 90000));
    if (!tokens[token]) {
      tokens[token] = true;
      return token;
    }
  }
  throw new Error('No fue posible generar un token de seguimiento único.');
}

function bulkImportApp_(token, body) {
  var session = requirePermission_(token, 'CARGUE_MASIVO');
  body = body || {};
  var rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > 1000) throw new Error('Máximo 1000 filas por cargue.');

  var config = operationalConfig_();
  var existing = existingProgrammingKeysApp_();
  var trackingTokens = existingTrackingTokensSetApp_();
  var inserted = 0;
  var skipped = 0;
  var errors = [];

  var sheet = getSheet_(SHEETS.PROGRAMACION, DATA_SOURCES.MAIN);
  var headers = getHeaders_(sheet);
  var output = [];

  rows.forEach(function(raw, index) {
    try {
      raw = raw || {};
      ['fecha', 'hora', 'paciente', 'documento', 'procedimiento'].forEach(function(k) {
        if (!normalizeText_(raw[k])) throw new Error('Campos obligatorios incompletos');
      });

      var date = formatDate_(parseIsoDate_(raw.fecha));
      var qno = normalizeText_(raw.qno).toUpperCase();
      if (qno && config.qnos.indexOf(qno) === -1) {
        throw new Error('QNO no habilitado: ' + qno);
      }

      var key = date + '|' + normalizeText_(raw.documento) + '|' +
        normalizeHeader_(raw.procedimiento);
      if (existing[key]) throw new Error('Duplicado');
      existing[key] = true;

      var tipo = normalizeText_(raw.tipoAtencion).toUpperCase();
      if (tipo.indexOf('AMB') !== -1) tipo = 'AMBULATORIO';
      if (tipo.indexOf('HOSP') !== -1) tipo = 'HOSPITALIZADO';

      var record = {
        'ID CASO':
          'QX-' + date.replace(/-/g, '') + '-' +
          Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(),
        'FECHA CIRUGÍA': parseIsoDate_(date),
        'HORA PROGRAMADA': normalizeText_(raw.hora).slice(0, 5),
        'DOCUMENTO': normalizeText_(raw.documento),
        'TELÉFONO': normalizeText_(raw.telefono),
        'PACIENTE': normalizeText_(raw.paciente).toUpperCase(),
        'EDAD': raw.edad || '',
        'SEXO': normalizeText_(raw.sexo).toUpperCase(),
        'CUPS': normalizeText_(raw.cups),
        'PROCEDIMIENTO': normalizeText_(raw.procedimiento).toUpperCase(),
        'ESPECIALIDAD': normalizeText_(raw.especialidad).toUpperCase(),
        'ESPECIALISTA': normalizeText_(raw.especialista).toUpperCase(),
        'SALA / QNO': qno,
        'TIPO DE ATENCIÓN': tipo,
        'CAMA / UBICACIÓN PROGRAMADA': normalizeText_(raw.cama),
        'TIEMPO QX ESTIMADO (MIN)': normalizeText_(raw.tiempoQx),
        'OBSERVACIONES': normalizeText_(raw.observaciones),
        'ESTADO ACTUAL': 'PROGRAMADO',
        'FUENTE DE PROGRAMACIÓN': 'CARGUE WEB APPS SCRIPT',
        'CÓDIGO SEGUIMIENTO':
          'SEG-' + date.replace(/-/g, '') + '-' +
          Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(),
        'TOKEN SEGUIMIENTO': uniqueTrackingTokenFromSetApp_(trackingTokens),
        'CREADO SEGUIMIENTO': new Date(),
        'ÚLTIMA ACTUALIZACIÓN WEB': new Date()
      };

      output.push(headers.map(function(header) {
        return Object.prototype.hasOwnProperty.call(record, header) ?
          record[header] : '';
      }));

      inserted++;
    } catch (error) {
      skipped++;
      errors.push({ row: index + 1, error: error.message });
    }
  });

  if (output.length) {
    sheet.getRange(
      sheet.getLastRow() + 1,
      1,
      output.length,
      headers.length
    ).setValues(output);
  }

  auditEvent_(
    session,
    'CARGUE MASIVO',
    'PROGRAMACIÓN',
    '',
    '',
    inserted + ' insertados; ' + skipped + ' omitidos',
    'OK'
  );

  return {
    ok: true,
    inserted: inserted,
    skipped: skipped,
    errors: errors.slice(0, 50)
  };
}
