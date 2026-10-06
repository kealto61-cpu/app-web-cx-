function pctApp_(a, b) {
  return b ? Math.round((a * 1000) / b) / 10 : 0;
}

function avgApp_(values) {
  var nums = (values || []).map(Number).filter(function(n) {
    return isFinite(n) && n > 0;
  });
  if (!nums.length) return 0;
  return Math.round(
    (nums.reduce(function(sum, n) { return sum + n; }, 0) / nums.length) * 10
  ) / 10;
}

function profilaxisScoreApp_(query, row) {
  if (!query) return 1;
  var fields = [
    row['ESPECIALIDAD'],
    row['PROCEDIMIENTO'],
    row['TÉRMINOS SIMILARES / SINÓNIMOS'],
    row['CUPS / GRUPO']
  ].map(normalizeHeader_);

  var haystack = fields.join(' | ');
  var score = haystack.indexOf(query) !== -1 ? 100 : 0;
  var stop = {
    DE: true, DEL: true, LA: true, EL: true, LOS: true, LAS: true,
    EN: true, CON: true, Y: true, POR: true, PARA: true, VIA: true
  };

  query.split(/\s+/).filter(function(t) {
    return t.length >= 3 && !stop[t];
  }).forEach(function(t) {
    if (haystack.indexOf(t) !== -1) score += 10;
  });

  if (fields[1] === query) score += 200;
  if (fields[2] && fields[2].indexOf(query) !== -1) score += 50;
  return score;
}

function profilaxisCatalogApp_(token, query, specialty) {
  requirePermission_(token, 'PROFILAXIS_PREQX');

  var sheet = mainSpreadsheet_().getSheetByName(SHEETS.PROFILAXIS);
  if (!sheet) return { rows: [] };

  var meta = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rows: [] };

  var rows = sheet.getRange(2, 1, lastRow - 1, meta.headers.length)
    .getValues()
    .map(function(row) { return rowToObject_(meta.headers, row); })
    .filter(function(row) {
      return normalizeHeader_(row['ESTADO']) === 'ACTIVO';
    });

  var q = normalizeHeader_(query);
  var esp = normalizeHeader_(specialty);

  if (esp) {
    rows = rows.filter(function(row) {
      return normalizeHeader_(row['ESPECIALIDAD']) === esp;
    });
  }

  rows = rows.map(function(row) {
    return { row: row, score: profilaxisScoreApp_(q, row) };
  }).filter(function(item) {
    return item.score > 0;
  }).sort(function(a, b) {
    return b.score - a.score;
  }).map(function(item) {
    return item.row;
  }).slice(0, 100);

  return {
    rows: rows.map(function(r) {
      return {
        id: normalizeText_(r['ID REGLA']),
        especialidad: normalizeText_(r['ESPECIALIDAD']),
        procedimiento: normalizeText_(r['PROCEDIMIENTO']),
        similares: normalizeText_(r['TÉRMINOS SIMILARES / SINÓNIMOS']),
        antibiotico: normalizeText_(r['ANTIBIÓTICO PRIMERA ELECCIÓN']),
        dosis: normalizeText_(r['DOSIS ADULTO']),
        momento: normalizeText_(r['MOMENTO ADMINISTRACIÓN']),
        consideraciones: normalizeText_(r['AJUSTES / CONSIDERACIONES']),
        fuente: normalizeText_(r['FUENTE DOCUMENTAL']),
        version: normalizeText_(r['VERSIÓN']),
        dilucion: normalizeText_(r['DILUCIÓN (FARMACIA)']),
        administracion: normalizeText_(r['ADMINISTRACIÓN (FARMACIA)']),
        interacciones: normalizeText_(r['INTERACCIONES (FARMACIA)']),
        efectosAdversos: normalizeText_(r['EFECTOS ADVERSOS (FARMACIA)'])
      };
    })
  };
}

function profilaxisApp_(token, dateIso) {
  requirePermission_(token, 'PROFILAXIS_PREQX');
  var rows = readCasesForDate_(dateIso || todayIso_(), true)
    .filter(function(x) {
      return x.prof || x.profHora || x.clasif || x.antibiotico;
    });

  var metrics = {
    total: rows.length,
    registrada: 0,
    noRegistrada: 0,
    pendiente: 0,
    conMedicamento: 0,
    conTiempo: 0
  };

  var out = rows.map(function(x) {
    var a = normalizeHeader_(x.prof);
    if (a === 'SI') metrics.registrada++;
    else if (a === 'NO') metrics.noRegistrada++;
    else metrics.pendiente++;
    if (x.antibiotico) metrics.conMedicamento++;
    if (x.profMin !== '' && x.profMin != null) metrics.conTiempo++;

    return {
      paciente: x.paciente,
      procedimiento: x.procedimiento,
      administrada: x.prof,
      medicamento: x.antibiotico,
      hora: x.profHora,
      minutos: x.profMin,
      clasificacion: x.clasif
    };
  });

  return { rows: out, metrics: metrics };
}

function postopApp_(token, dateIso) {
  requirePermission_(token, 'CUIDADOS_POSTOP');
  var rows = readCasesForDate_(dateIso || todayIso_(), true)
    .filter(function(x) {
      return ['RECUPERACIÓN', 'ALTA', 'HOSPITALIZACIÓN'].indexOf(x.estado) !== -1 ||
        ['ALTA', 'HOSPITALIZACIÓN'].indexOf(x.destino) !== -1;
    });

  var metrics = {
    total: rows.length,
    alta: 0,
    hospitalizacion: 0,
    recuperacion: 0,
    conSeguimiento: 0,
    pendientes: 0
  };

  var out = rows.map(function(x) {
    if (x.estado === 'ALTA' || x.destino === 'ALTA') metrics.alta++;
    else if (x.estado === 'HOSPITALIZACIÓN' || x.destino === 'HOSPITALIZACIÓN') {
      metrics.hospitalizacion++;
    } else if (x.estado === 'RECUPERACIÓN') metrics.recuperacion++;

    if (x.codigo) metrics.conSeguimiento++;
    else metrics.pendientes++;

    return {
      paciente: x.paciente,
      procedimiento: x.procedimiento,
      estado: x.estado,
      destino: x.destino,
      salida: x.salida,
      observacion: x.observacionEgreso,
      codigo: x.codigo
    };
  });

  return { rows: out, metrics: metrics };
}

function coordApp_(token, dateIso) {
  requirePermission_(token, 'COORDINACION_VER');
  var rows = readCasesForDate_(dateIso || todayIso_(), true);
  var m = boardMetrics_(rows);
  var grouped = {};

  rows.forEach(function(r) {
    var key = r.especialidad || 'SIN ESPECIALIDAD';
    if (!grouped[key]) {
      grouped[key] = { especialidad: key, total: 0, operados: 0, cancelados: 0 };
    }
    grouped[key].total++;
    if (r.operado) grouped[key].operados++;
    if (r.estado === 'CANCELADO') grouped[key].cancelados++;
  });

  return {
    metrics: m,
    specialties: Object.keys(grouped).map(function(k) {
      return grouped[k];
    }).sort(function(a, b) {
      return b.total - a.total;
    })
  };
}

function kpiApp_(token, dateIso, period) {
  requirePermission_(token, 'INDICADORES_VER');
  var rows = normalizeText_(period).toUpperCase() === 'DIA' ?
    readCasesForDate_(dateIso || todayIso_(), true) :
    readCasesForMonth_(dateIso || todayIso_());

  var gross = rows.length;
  var cancelled = rows.filter(function(x) { return x.estado === 'CANCELADO'; }).length;
  var net = gross - cancelled;
  var executed = rows.filter(function(x) { return x.operado; }).length;

  var specialties = {};
  rows.forEach(function(r) {
    var key = r.especialidad || 'SIN ESPECIALIDAD';
    if (!specialties[key]) {
      specialties[key] = {
        especialidad: key,
        programadasBrutas: 0,
        canceladas: 0,
        programadasNetas: 0,
        ejecutadas: 0,
        prepa: [],
        qnoRec: [],
        muertos: []
      };
    }

    var g = specialties[key];
    g.programadasBrutas++;
    if (r.estado === 'CANCELADO') g.canceladas++;
    else g.programadasNetas++;
    if (r.operado) g.ejecutadas++;
    if (r.tPrepa) g.prepa.push(r.tPrepa);
    if (r.tQnoRec) g.qnoRec.push(r.tQnoRec);
    if (r.tMuerto) g.muertos.push(r.tMuerto);
  });

  var specialtyRows = Object.keys(specialties).map(function(key) {
    var g = specialties[key];
    return {
      especialidad: g.especialidad,
      programadasBrutas: g.programadasBrutas,
      canceladas: g.canceladas,
      programadasNetas: g.programadasNetas,
      ejecutadas: g.ejecutadas,
      tasaRealizacion: pctApp_(g.ejecutadas, g.programadasNetas),
      tasaCancelacion: pctApp_(g.canceladas, g.programadasBrutas),
      tiempoPrepaQno: avgApp_(g.prepa),
      tiempoQnoRec: avgApp_(g.qnoRec),
      tiempoMuerto: avgApp_(g.muertos)
    };
  }).sort(function(a, b) {
    return b.programadasBrutas - a.programadasBrutas;
  });

  var qnos = {};
  rows.forEach(function(r) {
    var q = r.qno || 'SIN QNO';
    if (!qnos[q]) qnos[q] = { qno: q, t: [], m: [] };
    if (r.tQnoRec) qnos[q].t.push(r.tQnoRec);
    if (r.tMuerto) qnos[q].m.push(r.tMuerto);
  });

  var qnoRows = Object.keys(qnos).map(function(key) {
    return {
      qno: qnos[key].qno,
      tiempoQnoRec: avgApp_(qnos[key].t),
      tiempoMuerto: avgApp_(qnos[key].m)
    };
  });

  var causes = {};
  rows.filter(function(x) { return x.estado === 'CANCELADO'; })
    .forEach(function(x) {
      var key = x.observaciones || 'SIN MOTIVO';
      causes[key] = (causes[key] || 0) + 1;
    });

  return {
    summary: {
      programadasBrutas: gross,
      canceladas: cancelled,
      programadasNetas: net,
      ejecutadas: executed,
      tasaCancelacion: pctApp_(cancelled, gross),
      tasaRealizacion: pctApp_(executed, net),
      tiempoPrepaQno: avgApp_(rows.map(function(x) { return x.tPrepa; })),
      tiempoQnoRec: avgApp_(rows.map(function(x) { return x.tQnoRec; })),
      tiempoMuerto: avgApp_(rows.map(function(x) { return x.tMuerto; }))
    },
    especialidades: specialtyRows,
    qnos: qnoRows,
    flujo: [
      { label: 'PROGRAMADO', value: rows.filter(function(x) { return x.estado === 'PROGRAMADO'; }).length },
      { label: 'PREPARACIÓN', value: rows.filter(function(x) { return x.estado === 'PREPARACIÓN'; }).length },
      { label: 'QUIRÓFANO', value: rows.filter(function(x) { return x.estado === 'QUIRÓFANO'; }).length },
      { label: 'RECUPERACIÓN', value: rows.filter(function(x) { return x.estado === 'RECUPERACIÓN'; }).length },
      { label: 'FINALIZADOS', value: rows.filter(function(x) {
        return ['ALTA', 'HOSPITALIZACIÓN'].indexOf(x.estado) !== -1;
      }).length },
      { label: 'CANCELADOS', value: cancelled }
    ],
    cancelaciones: {
      causas: Object.keys(causes).map(function(label) {
        return { label: label, value: causes[label] };
      }).sort(function(a, b) { return b.value - a.value; })
    }
  };
}

function spanishMonthNameApp_(month) {
  return [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ][month - 1] || '';
}

function findValueIgnoreCase_(row, names) {
  var keys = Object.keys(row || {});
  for (var i = 0; i < names.length; i++) {
    var target = normalizeHeader_(names[i]);
    for (var j = 0; j < keys.length; j++) {
      if (normalizeHeader_(keys[j]) === target) return row[keys[j]];
    }
  }
  return '';
}

function mciApp_(token, dateIso) {
  requirePermission_(token, 'INDICADORES_VER');
  var d = parseIsoDate_(dateIso || todayIso_());
  var month = spanishMonthNameApp_(d.getMonth() + 1);
  var year = d.getFullYear();
  var ss = mainSpreadsheet_();
  var summarySheet = ss.getSheetByName('RESUMEN ANUAL');
  var baseSheet = ss.getSheetByName('BASE ANUAL ' + year);

  var metrics = {
    mes: month,
    meta: '0',
    programadas: '0',
    ejecutadas: '0',
    cumplimiento: '—',
    tasaRealizacion: '—',
    brecha: '0',
    proyeccion: '—',
    estado: 'SIN DATOS'
  };

  if (summarySheet && summarySheet.getLastRow() >= 2) {
    var sm = getHeaderMap_(summarySheet);
    var vals = summarySheet.getRange(
      2, 1, summarySheet.getLastRow() - 1, sm.headers.length
    ).getValues();

    for (var i = 0; i < vals.length; i++) {
      var row = rowToObject_(sm.headers, vals[i]);
      if (normalizeHeader_(findValueIgnoreCase_(row, ['Mes'])) === normalizeHeader_(month)) {
        metrics.meta = findValueIgnoreCase_(row, ['Meta']) || '0';
        metrics.programadas = findValueIgnoreCase_(row, ['Programadas netas']) || '0';
        metrics.ejecutadas = findValueIgnoreCase_(row, ['Ejecutadas']) || '0';
        metrics.cumplimiento = findValueIgnoreCase_(row, ['Cumplimiento']) || '—';
        metrics.tasaRealizacion = findValueIgnoreCase_(row, ['Tasa realización']) || '—';
        metrics.brecha = findValueIgnoreCase_(row, ['Brecha']) || '0';
        metrics.proyeccion = findValueIgnoreCase_(row, ['Proyección']) || '—';
        metrics.estado = findValueIgnoreCase_(row, ['Estado']) || 'SIN DATOS';
        break;
      }
    }
  }

  var daily = [];
  if (baseSheet && baseSheet.getLastRow() >= 2) {
    var bm = getHeaderMap_(baseSheet);
    var bvals = baseSheet.getRange(
      2, 1, baseSheet.getLastRow() - 1, bm.headers.length
    ).getValues();

    daily = bvals.map(function(values) {
      return rowToObject_(bm.headers, values);
    }).filter(function(row) {
      return normalizeHeader_(findValueIgnoreCase_(row, ['Mes'])) ===
        normalizeHeader_(month);
    }).map(function(row) {
      return {
        fecha: findValueIgnoreCase_(row, ['Fecha']),
        dia: findValueIgnoreCase_(row, ['Día', 'Dia']),
        qxDisponibles: findValueIgnoreCase_(row, ['Qx disponibles']),
        metaDiaria: findValueIgnoreCase_(row, ['Meta diaria']),
        programadas: findValueIgnoreCase_(row, ['Cirugías programadas netas']),
        ejecutadas: findValueIgnoreCase_(row, ['Cirugías ejecutadas']),
        cumple: findValueIgnoreCase_(row, ['Cumple meta diaria']),
        diferencia: findValueIgnoreCase_(row, ['Diferencia vs meta diaria']),
        acumulado: findValueIgnoreCase_(row, ['Acumulado mensual'])
      };
    });
  }

  return { metrics: jsonSafe_(metrics), daily: jsonSafe_(daily) };
}

function reinterventionsApp_(token, dateIso) {
  requirePermission_(token, 'REINTERVENCIONES_REVISAR');
  var end = parseIsoDate_(dateIso || todayIso_());
  var start = new Date(end.getTime() - 30 * 86400000);

  var rows = programmingRowsMatching_(function(value) {
    var d = normalDate_(value);
    return d && d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  }).map(function(entry) {
    return surgeryCaseFromRow_(entry.object);
  }).sort(function(a, b) {
    return (a.documento + a.fecha).localeCompare(b.documento + b.fecha);
  });

  var byDoc = {};
  rows.forEach(function(x) {
    if (!x.documento) return;
    if (!byDoc[x.documento]) byDoc[x.documento] = [];
    byDoc[x.documento].push(x);
  });

  var candidates = [];
  Object.keys(byDoc).forEach(function(doc) {
    var arr = byDoc[doc].sort(function(a, b) { return a.fecha.localeCompare(b.fecha); });
    for (var i = 1; i < arr.length; i++) {
      var prev = parseIsoDate_(arr[i - 1].fecha);
      var next = parseIsoDate_(arr[i].fecha);
      var days = Math.round((next.getTime() - prev.getTime()) / 86400000);
      if (days >= 0 && days < 30) {
        candidates.push({
          paciente: arr[i].paciente,
          documento: arr[i].documento,
          fechaPrevia: arr[i - 1].fecha,
          fechaNueva: arr[i].fecha,
          dias: days,
          especialidad: arr[i].especialidad
        });
      }
    }
  });

  return {
    total: candidates.length,
    reviewed: 0,
    pending: candidates.length,
    rows: candidates
  };
}

function csvCellApp_(value) {
  var s = String(value == null ? '' : value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadApp_(token, dateIso, period, type) {
  var session = requirePermission_(token, 'DESCARGAS');
  var date = dateIso || todayIso_();
  var p = normalizeText_(period || 'DIA').toUpperCase();
  var t = normalizeText_(type || 'PROGRAMACION').toUpperCase();
  var rows = p === 'MES' ? readCasesForMonth_(date) : readCasesForDate_(date, true);

  if (t === 'ACTIVOS') {
    rows = rows.filter(function(x) {
      return ['ALTA', 'HOSPITALIZACIÓN', 'CANCELADO'].indexOf(x.estado) === -1;
    });
  }
  if (t === 'EJECUTADAS') rows = rows.filter(function(x) { return x.operado; });
  if (t === 'FINALIZADOS') {
    rows = rows.filter(function(x) {
      return ['ALTA', 'HOSPITALIZACIÓN'].indexOf(x.estado) !== -1;
    });
  }
  if (t === 'CANCELADOS') rows = rows.filter(function(x) { return x.estado === 'CANCELADO'; });

  if (operationalConfig_().qnos.indexOf(t) !== -1) {
    rows = rows.filter(function(x) { return normalizeHeader_(x.qno) === normalizeHeader_(t); });
  }

  var headers = [
    'Fecha', 'Hora', 'Paciente', 'Documento', 'Procedimiento',
    'Especialidad', 'Especialista', 'QNO', 'Estado',
    'Tipo atención', 'Observaciones'
  ];

  var data = rows.map(function(x) {
    return [
      x.fecha, x.hora, x.paciente, x.documento, x.procedimiento,
      x.especialidad, x.especialista, x.qno, x.estado,
      x.tipoAtencion, x.observaciones
    ];
  });

  if (t === 'TIEMPOS_QNO') {
    headers = [
      'Fecha', 'Hora', 'Paciente', 'QNO', 'Prepa→QNO (min)',
      'QNO→Recuperación (min)', 'Tiempo muerto QNO (min)'
    ];
    data = rows.map(function(x) {
      return [x.fecha, x.hora, x.paciente, x.qno, x.tPrepa, x.tQnoRec, x.tMuerto];
    });
  }

  if (t === 'PROFILAXIS') {
    headers = [
      'Fecha', 'Hora', 'Paciente', 'Documento', 'QNO', 'Administrada',
      'Medicamento', 'Hora profilaxis', 'Minutos a incisión', 'Clasificación'
    ];
    data = rows.map(function(x) {
      return [
        x.fecha, x.hora, x.paciente, x.documento, x.qno,
        x.prof, x.antibiotico, x.profHora, x.profMin, x.clasif
      ];
    });
  }

  var csv = [headers].concat(data).map(function(row) {
    return row.map(csvCellApp_).join(',');
  }).join('\n');

  auditEvent_(
    session,
    'DESCARGA',
    'REPORTES',
    '',
    '',
    t + ' ' + p,
    'OK'
  );

  return {
    filename: 'Cirugia_' + t.replace(/\s+/g, '_') + '_' + date + '.csv',
    csv: '\ufeff' + csv
  };
}
