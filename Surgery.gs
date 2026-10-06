function parseIsoDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );
  }

  var text = normalizeText_(value);
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error('Fecha inválida. Use formato YYYY-MM-DD.');
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
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

function surgeryCaseFromRow_(row) {
  return {
    id: normalizeText_(row['ID CASO']),
    fecha: formatDate_(row['FECHA CIRUGÍA']),
    hora: formatTime_(row['HORA PROGRAMADA']),
    documento: normalizeText_(row['DOCUMENTO']),
    paciente: normalizeText_(row['PACIENTE']),
    edad: row['EDAD'] == null ? '' : row['EDAD'],
    sexo: normalizeText_(row['SEXO']),
    procedimiento: normalizeText_(row['PROCEDIMIENTO']),
    especialidad: normalizeText_(row['ESPECIALIDAD']),
    especialista: normalizeText_(row['ESPECIALISTA']),
    qno: normalizeText_(row['SALA / QNO']),
    estado: normalizeText_(row['ESTADO ACTUAL']).toUpperCase() || 'PROGRAMADO',
    observaciones: normalizeText_(row['OBSERVACIONES']),
    destinoPostop: normalizeText_(row['DESTINO POSTOP']),
    estadoFinal: normalizeText_(row['ESTADO FINAL']),
    tipoAtencion: normalizeText_(row['TIPO DE ATENCIÓN']),
    cama: normalizeText_(row['CAMA / UBICACIÓN PROGRAMADA']),
    cups: normalizeText_(row['CUPS']),
    uvr: row['UVR'] == null ? '' : row['UVR'],
    tiempoQxEstimado: row['TIEMPO QX ESTIMADO (MIN)'] == null ?
      '' : row['TIEMPO QX ESTIMADO (MIN)'],
    recursos: normalizeText_(row['RECURSOS / ALERTAS PREQUIRÚRGICAS']),
    ultimaActualizacion: formatDateTime_(row['ÚLTIMA ACTUALIZACIÓN WEB'])
  };
}

function readCasesForDate_(dateIso, includeTerminal) {
  var target = parseIsoDate_(dateIso || todayIso_());
  var table = readTable_(
    SHEETS.PROGRAMACION,
    DATA_SOURCES.MAIN
  );

  return table.rows
    .filter(function(entry) {
      return sameDate_(
        entry.object['FECHA CIRUGÍA'],
        target
      );
    })
    .map(function(entry) {
      return surgeryCaseFromRow_(entry.object);
    })
    .filter(function(item) {
      return includeTerminal ||
        TERMINAL_STATES.indexOf(item.estado) === -1;
    })
    .sort(function(a, b) {
      return String(a.hora || '').localeCompare(
        String(b.hora || '')
      );
    });
}

function boardMetrics_(cases) {
  var metrics = {
    total: cases.length,
    programado: 0,
    preparacion: 0,
    quirofano: 0,
    recuperacion: 0,
    cancelado: 0,
    alta: 0,
    hospitalizacion: 0
  };

  cases.forEach(function(item) {
    var state = item.estado;

    if (state === 'PROGRAMADO') metrics.programado++;
    if (state === 'PREPARACIÓN') metrics.preparacion++;
    if (state === 'QUIRÓFANO') metrics.quirofano++;
    if (state === 'RECUPERACIÓN') metrics.recuperacion++;
    if (state === 'CANCELADO') metrics.cancelado++;

    if (normalizeHeader_(item.destinoPostop) === 'ALTA') {
      metrics.alta++;
    }

    if (normalizeHeader_(item.destinoPostop) === 'HOSPITALIZACION') {
      metrics.hospitalizacion++;
    }
  });

  return metrics;
}

// Operación/Vista se mantiene disponible sin autenticación.
function apiGetBoard(dateIso) {
  var allCases = readCasesForDate_(dateIso || todayIso_(), true);

  return jsonSafe_({
    date: dateIso || todayIso_(),
    patients: allCases.filter(function(item) {
      return TERMINAL_STATES.indexOf(item.estado) === -1;
    }),
    allPatients: allCases,
    metrics: boardMetrics_(allCases),
    timestamp: formatDateTime_(new Date())
  });
}

// Programación sí requiere autorización.
function apiGetProgramming(token, dateIso, includeTerminal) {
  requirePermission_(token, 'PROGRAMACION_VER');

  return jsonSafe_({
    date: dateIso || todayIso_(),
    patients: readCasesForDate_(
      dateIso || todayIso_(),
      Boolean(includeTerminal)
    )
  });
}
