function parseIsoDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  var text = normalizeText_(value);
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Fecha inválida. Use formato YYYY-MM-DD.');
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function sameDate_(value, target) {
  var date = normalDate_(value);
  return Boolean(
    date &&
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  );
}

function booleanValue_(value) {
  var v = normalizeHeader_(value);
  return ['TRUE', 'SI', 'SÍ', '1', 'YES'].indexOf(v) !== -1;
}

function surgeryCaseFromRow_(row) {
  return {
    id: normalizeText_(row['ID CASO']),
    fecha: formatDate_(row['FECHA CIRUGÍA']),
    hora: formatTime_(row['HORA PROGRAMADA']),
    documento: normalizeText_(row['DOCUMENTO']),
    telefono: normalizeText_(row['TELÉFONO']),
    paciente: normalizeText_(row['PACIENTE']),
    edad: row['EDAD'] == null ? '' : row['EDAD'],
    sexo: normalizeText_(row['SEXO']),
    procedimiento: normalizeText_(row['PROCEDIMIENTO']),
    especialidad: normalizeText_(row['ESPECIALIDAD']),
    especialista: normalizeText_(row['ESPECIALISTA']),
    qno: normalizeText_(row['SALA / QNO']),
    estado: normalizeText_(row['ESTADO ACTUAL']).toUpperCase() || 'PROGRAMADO',
    observaciones: normalizeText_(row['OBSERVACIONES']),
    tipoAtencion: normalizeText_(row['TIPO DE ATENCIÓN']),
    operado: booleanValue_(row['OPERADO']),
    destino: normalizeText_(row['DESTINO POSTOP']).toUpperCase(),
    salida: formatDateTime_(row['HORA SALIDA RECUPERACIÓN']),
    observacionEgreso: normalizeText_(row['OBSERVACIÓN EGRESO / HOSPITALIZACIÓN']),
    codigo: normalizeText_(row['CÓDIGO SEGUIMIENTO']),
    token: normalizeText_(row['TOKEN SEGUIMIENTO']),
    actualizado: formatDateTime_(
      row['ÚLTIMA ACTUALIZACIÓN WEB'] || row['FECHA/HORA ÚLTIMO MOVIMIENTO']
    ),
    tPrepa: Number(row['TIEMPO PREPA → QNO (MIN)'] || 0) || 0,
    tQnoRec: Number(row['TIEMPO QNO → RECUPERACIÓN (MIN)'] || 0) || 0,
    tMuerto: Number(row['INTERVALO ENTRE PACIENTES QNO (MIN)'] || 0) || 0,
    prof: normalizeText_(row['PROFILAXIS ADMINISTRADA']),
    profHora: formatTime_(row['HORA ADMINISTRACIÓN PROFILAXIS']),
    profMin: row['PROFILAXIS → INCISIÓN (MIN)'] == null ? '' :
      row['PROFILAXIS → INCISIÓN (MIN)'],
    clasif: normalizeText_(row['CLASIFICACIÓN CIRUGÍA']),
    antibiotico: normalizeText_(row['PROFILAXIS ANTIBIÓTICA / MEDICAMENTO']),
    cups: normalizeText_(row['CUPS']),
    uvr: row['UVR'] == null ? '' : row['UVR'],
    tiempoQx: row['TIEMPO QX ESTIMADO (MIN)'] == null ? '' :
      row['TIEMPO QX ESTIMADO (MIN)'],
    recursos: normalizeText_(row['RECURSOS / ALERTAS PREQUIRÚRGICAS']),
    cama: normalizeText_(row['CAMA / UBICACIÓN PROGRAMADA']),
    enfermeroJefe: normalizeText_(row['ENFERMERO JEFE']),
    horaAnestesia: formatTime_(row['HORA INICIO ANESTESIA']),
    horaFinAnestesia: formatTime_(row['HORA FIN ANESTESIA']),
    horaInicioCirugia: formatTime_(row['HORA INICIO CIRUGÍA / INCISIÓN']),
    horaFinCirugia: formatTime_(row['HORA FIN CIRUGÍA']),
    aviso: normalizeText_(row['AVISO ACOMPAÑANTE']),
    avisoFecha: formatDateTime_(row['FECHA/HORA AVISO ACOMPAÑANTE']),
    avisoOrigen: normalizeText_(row['ORIGEN AVISO ACOMPAÑANTE']),
    avisoId: normalizeText_(row['ID MENSAJE ACOMPAÑANTE'])
  };
}

function programmingRowsMatching_(predicate) {
  var sheet = getSheet_(SHEETS.PROGRAMACION, DATA_SOURCES.MAIN);
  var meta = getHeaderMap_(sheet);
  var dateCol = meta.map[normalizeHeader_('FECHA CIRUGÍA')];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !dateCol) return [];

  var dates = sheet.getRange(2, dateCol, lastRow - 1, 1).getValues();
  var rowNumbers = [];
  for (var i = 0; i < dates.length; i++) {
    if (predicate(dates[i][0], i + 2)) rowNumbers.push(i + 2);
  }
  if (!rowNumbers.length) return [];

  var groups = [];
  var start = rowNumbers[0];
  var prev = start;
  for (var j = 1; j < rowNumbers.length; j++) {
    var current = rowNumbers[j];
    if (current !== prev + 1) {
      groups.push([start, prev]);
      start = current;
    }
    prev = current;
  }
  groups.push([start, prev]);

  var out = [];
  groups.forEach(function(group) {
    var values = sheet.getRange(
      group[0],
      1,
      group[1] - group[0] + 1,
      meta.headers.length
    ).getValues();
    values.forEach(function(row, index) {
      out.push({
        rowNumber: group[0] + index,
        object: rowToObject_(meta.headers, row)
      });
    });
  });
  return out;
}

function readCasesForDate_(dateIso, includeTerminal) {
  var target = parseIsoDate_(dateIso || todayIso_());
  return programmingRowsMatching_(function(value) {
    return sameDate_(value, target);
  }).map(function(entry) {
    var item = surgeryCaseFromRow_(entry.object);
    item.rowNumber = entry.rowNumber;
    return item;
  }).filter(function(item) {
    return includeTerminal || TERMINAL_STATES.indexOf(item.estado) === -1;
  }).sort(function(a, b) {
    return String(a.hora || '').localeCompare(String(b.hora || ''));
  });
}

function readCasesForMonth_(dateIso) {
  var target = parseIsoDate_(dateIso || todayIso_());
  return programmingRowsMatching_(function(value) {
    var d = normalDate_(value);
    return Boolean(
      d &&
      d.getFullYear() === target.getFullYear() &&
      d.getMonth() === target.getMonth()
    );
  }).map(function(entry) {
    var item = surgeryCaseFromRow_(entry.object);
    item.rowNumber = entry.rowNumber;
    return item;
  }).sort(function(a, b) {
    var ka = String(a.fecha) + ' ' + String(a.hora);
    var kb = String(b.fecha) + ' ' + String(b.hora);
    return ka.localeCompare(kb);
  });
}

function findCaseRow_(id) {
  return findRowByHeader_(
    SHEETS.PROGRAMACION,
    'ID CASO',
    id,
    DATA_SOURCES.MAIN
  );
}

function updateCase_(session, id, patch, action) {
  var hit = findCaseRow_(id);
  if (!hit) throw new Error('Paciente no encontrado.');

  var current = hit.object;
  var finalPatch = Object.assign({}, patch || {}, {
    'FECHA/HORA ÚLTIMO MOVIMIENTO': new Date(),
    'USUARIO ÚLTIMO MOVIMIENTO': session && session.user ? session.user : 'SISTEMA',
    'ÚLTIMA ACTUALIZACIÓN WEB': new Date(),
    'ESTADO ANTERIOR': current['ESTADO ACTUAL'] || ''
  });

  var updated = patchRow_(hit.sheet, hit.rowNumber, finalPatch);

  auditEvent_(
    session || { user: 'SISTEMA', role: 'SISTEMA' },
    action || 'ACTUALIZAR PACIENTE',
    'OPERACIÓN',
    id,
    updated['PACIENTE'] || '',
    JSON.stringify(patch || {}),
    'OK'
  );

  return surgeryCaseFromRow_(updated);
}

function appendMovement_(session, payload, from, to, observation) {
  appendRecord_(SHEETS.MOVIMIENTOS, {
    'MARCA TEMPORAL': new Date(),
    'ID CASO': payload['ID CASO'] || '',
    'FECHA CIRUGÍA': payload['FECHA CIRUGÍA'] || '',
    'HORA PROGRAMADA': payload['HORA PROGRAMADA'] || '',
    'DOCUMENTO': payload['DOCUMENTO'] || '',
    'PACIENTE': payload['PACIENTE'] || '',
    'ORIGEN': from || '',
    'DESTINO': to || '',
    'USUARIO': session && session.user ? session.user : '',
    'HOJA': SHEETS.PROGRAMACION,
    'FILA': payload.__rowNumber || '',
    'OBSERVACIONES': observation || '',
    'TIPO EVENTO': 'WEB APP'
  }, DATA_SOURCES.MAIN);
}

function boardMetrics_(cases) {
  var metrics = {
    total: cases.length,
    programado: 0,
    preparacion: 0,
    quirofano: 0,
    recuperacion: 0,
    finalizados: 0,
    cancelados: 0,
    operados: 0
  };

  cases.forEach(function(item) {
    if (item.estado === 'PROGRAMADO') metrics.programado++;
    if (item.estado === 'PREPARACIÓN') metrics.preparacion++;
    if (item.estado === 'QUIRÓFANO') metrics.quirofano++;
    if (item.estado === 'RECUPERACIÓN') metrics.recuperacion++;
    if (['ALTA', 'HOSPITALIZACIÓN'].indexOf(item.estado) !== -1 ||
        ['ALTA', 'HOSPITALIZACIÓN'].indexOf(item.destino) !== -1) {
      metrics.finalizados++;
    }
    if (item.estado === 'CANCELADO') metrics.cancelados++;
    if (item.operado) metrics.operados++;
  });
  return metrics;
}

function hhmmMinutes_(value) {
  var match = normalizeText_(value).match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function elapsedMinutes_(a, b) {
  var x = hhmmMinutes_(a);
  var y = hhmmMinutes_(b);
  if (x == null || y == null) return null;
  var diff = y - x;
  if (diff < 0) diff += 1440;
  return diff;
}

function uniqueTrackingToken_() {
  var sheet = getSheet_(SHEETS.PROGRAMACION, DATA_SOURCES.MAIN);
  var col = requireColumn_(sheet, 'TOKEN SEGUIMIENTO');
  var lastRow = sheet.getLastRow();
  var existing = {};
  if (lastRow >= 2) {
    sheet.getRange(2, col, lastRow - 1, 1)
      .getDisplayValues()
      .forEach(function(row) {
        if (row[0]) existing[String(row[0]).trim()] = true;
      });
  }

  for (var i = 0; i < 80; i++) {
    var token = String(Math.floor(10000 + Math.random() * 90000));
    if (!existing[token]) return token;
  }
  throw new Error('No fue posible generar un token de seguimiento único.');
}

function trackingActiveState_(state) {
  return ACTIVE_STATES.indexOf(normalizeText_(state).toUpperCase()) !== -1;
}

function publicState_(state, destination) {
  var s = normalizeHeader_(state);
  var d = normalizeHeader_(destination);
  if (s === 'PREPARACION') return 'En preparación prequirúrgica';
  if (s === 'QUIROFANO') return 'En procedimiento quirúrgico';
  if (s === 'RECUPERACION') return 'En recuperación postanestésica';
  if (s === 'CANCELADO') return 'Procedimiento cancelado';
  if (s === 'ALTA' || d === 'ALTA') return 'Proceso quirúrgico finalizado · Alta';
  if (s === 'HOSPITALIZACION' || d === 'HOSPITALIZACION') {
    return 'Proceso quirúrgico finalizado · Hospitalización';
  }
  return 'Programado / pendiente de ingreso';
}
