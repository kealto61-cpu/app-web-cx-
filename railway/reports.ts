// Reporting calculations preserved from Apps Script; inputs come from the isolated database.
import {calculateSurgicalProductivity} from './nursing-productivity.ts';
import {calculateSpecialistProductivity,specialistReportSection} from './specialist-productivity.ts';
import {cancellationSummary} from './cancellation-summary.ts';
export function createReports({cases,reporting,permissions,session,config,boardMetrics,reportRange=null,indicatorMetadata={},cancellations=[]}){
const normalizeText_=value=>String(value??'').trim();
const normalizeHeader_=value=>normalizeText_(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const parseIsoDate_=value=>new Date(String(value).slice(0,10)+'T12:00:00Z');
const todayIso_=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
const normalDate_=value=>{if(value instanceof Date)return value;const s=String(value||''),m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);const d=parseIsoDate_(m?m[3]+'-'+m[2]+'-'+m[1]:s);return Number.isNaN(d.getTime())?null:d;};
const formatDate_=value=>{const d=normalDate_(value);return d?d.toISOString().slice(0,10):''};
const jsonSafe_=value=>JSON.parse(JSON.stringify(value));
const rowToObject_=(headers,row)=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??'']));
const requirePermission_=(_,permission)=>{if(!permissions.includes('*')&&!permissions.includes(permission))throw Object.assign(new Error('No tiene permiso para esta acción.'),{status:403});return session};
const selectedCases_=()=>cases.filter(row=>row.fecha>=reportRange.from&&row.fecha<=reportRange.to);
const readCasesForDate_=date=>reportRange?selectedCases_():cases.filter(row=>row.fecha===date);
const readCasesForMonth_=date=>reportRange?selectedCases_():cases.filter(row=>row.fecha.slice(0,7)===date.slice(0,7));
const programmingRowsMatching_=predicate=>cases.filter(row=>predicate(row.fecha)).map(row=>({object:row}));
const surgeryCaseFromRow_=row=>row;
const boardMetrics_=boardMetrics;
const operationalConfig_=()=>config;
const auditEvent_=()=>{};
const SHEETS={PROFILAXIS:'BD PROFILAXIS QX'};
function mainSpreadsheet_(){return {getSheetByName(name){const data=reporting.filter(r=>r.dataset===name).map(r=>r.payload);if(!data.length)return null;const headers=[...new Set(data.flatMap(Object.keys))],values=[headers,...data.map(row=>headers.map(h=>row[h]??''))];return {getLastRow:()=>values.length,getLastColumn:()=>headers.length,getRange:(row,col,count,width)=>({getValues:()=>values.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),getDisplayValues:()=>values.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width).map(String))})}}}}
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

function profilaxisHeaderApp_(sheet) {
  var columns = sheet.getLastColumn();
  var scan = Math.min(sheet.getLastRow(), 5);
  if (!columns || !scan) throw new Error('La hoja BD PROFILAXIS QX no tiene encabezados.');
  var sample = sheet.getRange(1, 1, scan, columns).getDisplayValues();
  var required = ['ID REGLA', 'ESTADO', 'ESPECIALIDAD', 'PROCEDIMIENTO'];
  var canonical = ['ID REGLA','ESTADO','ESPECIALIDAD','PROCEDIMIENTO','TÉRMINOS SIMILARES / SINÓNIMOS','CUPS / GRUPO','ANTIBIÓTICO PRIMERA ELECCIÓN','DOSIS ADULTO','MOMENTO ADMINISTRACIÓN','AJUSTES / CONSIDERACIONES','FUENTE DOCUMENTAL','VERSIÓN','DILUCIÓN (FARMACIA)','ADMINISTRACIÓN (FARMACIA)','INTERACCIONES (FARMACIA)','EFECTOS ADVERSOS (FARMACIA)'];
  var names = {};
  canonical.forEach(function(name) { names[normalizeHeader_(name)] = name; });
  for (var index = 0; index < sample.length; index++) {
    var normalized = sample[index].map(normalizeHeader_);
    if (required.every(function(name) { return normalized.indexOf(name) !== -1; })) {
      return { row: index + 1, headers: sample[index].map(function(name) {
        return names[normalizeHeader_(name)] || normalizeText_(name);
      }) };
    }
  }
  throw new Error('No se encontraron los encabezados ID REGLA, ESTADO, ESPECIALIDAD y PROCEDIMIENTO en las primeras cinco filas de BD PROFILAXIS QX.');
}

function profilaxisCatalogApp_(token, query, specialty) {
  requirePermission_(token, 'PROFILAXIS_PREQX');

  var sheet = mainSpreadsheet_().getSheetByName(SHEETS.PROFILAXIS);
  if (!sheet) throw new Error('No existe la pestaña BD PROFILAXIS QX en la base configurada.');

  var meta = profilaxisHeaderApp_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow <= meta.row) return { rows: [], source: { sheet: SHEETS.PROFILAXIS, headerRow: meta.row, activeRules: 0 } };

  var rows = sheet.getRange(meta.row + 1, 1, lastRow - meta.row, meta.headers.length)
    .getValues()
    .map(function(row) { return rowToObject_(meta.headers, row); })
    .filter(function(row) {
      return normalizeHeader_(row['ESTADO']) === 'ACTIVO';
    });

  var activeRules = rows.length;
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
    source: { sheet: SHEETS.PROFILAXIS, headerRow: meta.row, activeRules: activeRules },
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
  return profilaxisDataApp_(readCasesForDate_(dateIso || todayIso_(), true));
}

function profilaxisDataApp_(cases) {
  var rows = cases.filter(function(x) {
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
  return postopDataApp_(readCasesForDate_(dateIso || todayIso_(), true));
}

function postopDataApp_(cases) {
  var rows = cases.filter(function(x) {
      return x.operado === true;
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
    enfermeria: calculateSurgicalProductivity(rows),
    especialistas: calculateSpecialistProductivity(rows),
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
    cancelaciones: cancellationSummary(rows, cancellations)
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

function mciHeaderApp_(sheet, required) {
  var count = Math.min(sheet.getLastRow(), 8), columns = sheet.getLastColumn();
  if (!count || !columns) throw new Error('La hoja ' + sheet.getName() + ' no contiene encabezados.');
  var rows = sheet.getRange(1, 1, count, columns).getDisplayValues();
  for (var index = 0; index < rows.length; index++) {
    var normalized = rows[index].map(normalizeHeader_);
    if (required.every(function(name) { return normalized.indexOf(normalizeHeader_(name)) !== -1; })) {
      return { row: index + 1, headers: rows[index] };
    }
  }
  throw new Error('No se encontraron los encabezados de MCI en ' + sheet.getName() + '.');
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
    var sm = mciHeaderApp_(summarySheet, ['Mes', 'Meta', 'Programadas netas', 'Ejecutadas']);
    var vals = summarySheet.getLastRow() > sm.row ? summarySheet.getRange(
      sm.row + 1, 1, summarySheet.getLastRow() - sm.row, sm.headers.length
    ).getValues() : [];

    for (var i = 0; i < vals.length; i++) {
      var row = rowToObject_(sm.headers, vals[i]);
      if (normalizeHeader_(findValueIgnoreCase_(row, ['Mes'])) === normalizeHeader_(month)) {
        metrics.meta = findValueIgnoreCase_(row, ['Meta']) || '0';
        metrics.programadas = findValueIgnoreCase_(row, ['Programadas netas']) || '0';
        metrics.ejecutadas = findValueIgnoreCase_(row, ['Ejecutadas']) || '0';
        var displayed = rowToObject_(sm.headers, summarySheet.getRange(sm.row + 1 + i, 1, 1, sm.headers.length).getDisplayValues()[0]);
        metrics.cumplimiento = findValueIgnoreCase_(displayed, ['Cumplimiento']) || '—';
        metrics.tasaRealizacion = findValueIgnoreCase_(displayed, ['Tasa realización']) || '—';
        metrics.brecha = findValueIgnoreCase_(row, ['Brecha']) || '0';
        var projection = findValueIgnoreCase_(row, ['Proyección']);
        metrics.proyeccion = projection === '' || projection == null ? '—' : projection;
        metrics.estado = findValueIgnoreCase_(row, ['Estado']) || 'SIN DATOS';
        break;
      }
    }
  }

  var daily = [];
  if (baseSheet && baseSheet.getLastRow() >= 2) {
    var bm = mciHeaderApp_(baseSheet, ['Mes', 'Fecha', 'Meta diaria', 'Cirugías programadas netas', 'Cirugías ejecutadas']);
    var bvals = baseSheet.getLastRow() > bm.row ? baseSheet.getRange(
      bm.row + 1, 1, baseSheet.getLastRow() - bm.row, bm.headers.length
    ).getValues() : [];

    daily = bvals.map(function(values) {
      return rowToObject_(bm.headers, values);
    }).filter(function(row) {
      return normalizeHeader_(findValueIgnoreCase_(row, ['Mes'])) ===
        normalizeHeader_(month);
    }).map(function(row) {
      return {
        fecha: formatDate_(findValueIgnoreCase_(row, ['Fecha'])),
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

  daily.sort(function(a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
  return { metrics: jsonSafe_(metrics), daily: jsonSafe_(daily) };
}

function reinterventionsApp_(token, dateIso) {
  requirePermission_(token, 'REINTERVENCIONES_REVISAR');
  var end = parseIsoDate_(reportRange?.to || dateIso || todayIso_());
  var start = new Date(parseIsoDate_(reportRange?.from || dateIso || todayIso_()).getTime() - 30 * 86400000);

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
      if (days >= 0 && days < 30 && (!reportRange || (arr[i].fecha >= reportRange.from && arr[i].fecha <= reportRange.to))) {
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
    reviewed: null,
    pending: null,
    reviewAvailability: "SIN REGISTRO DE REVISION VERIFICABLE",
    rows: candidates
  };
}

function mciRangeApp_(token) {
  requirePermission_(token,'INDICADORES_VER');
  const num=value=>{if(value===''||value==null)return null;const n=Number(String(value).replace(',','.'));return Number.isFinite(n)?n:null};
  const daily=reporting.filter(r=>/^BASE ANUAL \d{4}$/.test(r.dataset)).map(r=>r.payload).map(row=>({fecha:formatDate_(findValueIgnoreCase_(row,['Fecha'])),dia:findValueIgnoreCase_(row,['Día','Dia']),qxDisponibles:findValueIgnoreCase_(row,['Qx disponibles']),metaDiaria:num(findValueIgnoreCase_(row,['Meta diaria'])),programadas:num(findValueIgnoreCase_(row,['Cirugías programadas netas'])),ejecutadas:num(findValueIgnoreCase_(row,['Cirugías ejecutadas'])),cumple:findValueIgnoreCase_(row,['Cumple meta diaria']),diferencia:findValueIgnoreCase_(row,['Diferencia vs meta diaria']),acumulado:findValueIgnoreCase_(row,['Acumulado mensual'])})).filter(r=>r.fecha>=reportRange.from&&r.fecha<=reportRange.to).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  function totals(rows){const sum=key=>rows.length&&rows.every(r=>r[key]!=null)?rows.reduce((n,r)=>n+r[key],0):null;const meta=sum('metaDiaria'),programadas=sum('programadas'),ejecutadas=sum('ejecutadas');return {meta,programadas,ejecutadas,cumplimiento:meta>0&&ejecutadas!=null?pctApp_(ejecutadas,meta):null,tasaRealizacion:programadas>0&&ejecutadas!=null?pctApp_(ejecutadas,programadas):null,brecha:meta!=null&&ejecutadas!=null?ejecutadas-meta:null,proyeccion:null,estado:rows.length?'BASE DIARIA':'SIN DATOS',mes:''};}
  const monthly=[],cursor=new Date(reportRange.from.slice(0,7)+'-01T12:00:00Z');
  while(cursor.toISOString().slice(0,7)<=reportRange.to.slice(0,7)){
   const month=cursor.toISOString().slice(0,7),rows=daily.filter(r=>r.fecha.startsWith(month)),m=totals(rows);
   const fullFrom=month+'-01',fullTo=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0,12)).toISOString().slice(0,10);
   const from=reportRange.from>fullFrom?reportRange.from:fullFrom,to=reportRange.to<fullTo?reportRange.to:fullTo;
   const matching=reporting.filter(r=>r.dataset==='RESUMEN ANUAL').map(r=>r.payload).filter(r=>normalizeHeader_(findValueIgnoreCase_(r,['Mes']))===normalizeHeader_(spanishMonthNameApp_(cursor.getUTCMonth()+1))&&String(findValueIgnoreCase_(r,['Año','Anio','Year']))===month.slice(0,4));
   if(from===fullFrom&&to===fullTo&&matching.length===1)m.proyeccion=num(findValueIgnoreCase_(matching[0],['Proyección']));
   monthly.push({month,from,to,availableDates:rows.length,...m});cursor.setUTCMonth(cursor.getUTCMonth()+1);
  }
  const metrics=totals(daily);metrics.mes=reportRange.from+' a '+reportRange.to;
  if(monthly.length===1)metrics.proyeccion=monthly[0].proyeccion;
  return {metrics,daily,monthly};
}
function csvCellApp_(value) {
  var s = String(value == null ? '' : value);
  if(typeof value==='string'&&/^[=+@\-\t\r]/.test(s))s="'"+s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function indicatorDownloadCatalogApp_() { return [{"group":"KPI · Indicadores individuales","type":"KPI_PROGRAMADAS_BRUTAS","label":"Programadas brutas","field":"programadasBrutas","unit":"Cirugías","family":"kpi"},{"group":"KPI · Indicadores individuales","type":"KPI_PROGRAMADAS_NETAS","label":"Programadas netas","field":"programadasNetas","unit":"Cirugías","family":"kpi"},{"group":"KPI · Indicadores individuales","type":"KPI_REALIZADAS","label":"Cirugías realizadas","field":"ejecutadas","unit":"Cirugías","family":"kpi"},{"group":"KPI · Indicadores individuales","type":"KPI_CANCELADAS","label":"Cirugías canceladas","field":"canceladas","unit":"Cirugías","family":"kpi"},{"group":"KPI · Indicadores individuales","type":"KPI_TASA_CANCELACION","label":"Tasa de cancelación","field":"tasaCancelacion","unit":"%","family":"kpi"},{"group":"KPI · Indicadores individuales","type":"KPI_TASA_REALIZACION","label":"Tasa de realización","field":"tasaRealizacion","unit":"%","family":"kpi"},{"group":"KPI · Indicadores individuales","type":"KPI_TIEMPO_PREPA_QNO","label":"Tiempo promedio Preparación → QNO","field":"tiempoPrepaQno","unit":"Minutos","family":"kpi"},{"group":"KPI · Indicadores individuales","type":"KPI_TIEMPO_QNO_REC","label":"Tiempo promedio QNO → Recuperación","field":"tiempoQnoRec","unit":"Minutos","family":"kpi"},{"group":"KPI · Indicadores individuales","type":"KPI_TIEMPO_MUERTO","label":"Tiempo muerto promedio","field":"tiempoMuerto","unit":"Minutos","family":"kpi"},{"group":"KPI · Reportes por separado","type":"KPI_GENERAL","label":"KPI general","family":"kpi"},{"group":"KPI · Reportes por separado","type":"KPI_PRODUCTIVIDAD","label":"Productividad quirúrgica","family":"kpi"},{"group":"KPI · Reportes por separado","type":"KPI_ENFERMERIA","label":"Productividad quirúrgica por enfermero jefe","family":"kpi"},{"group":"KPI · Por especialista","type":"KPI_ESPECIALISTAS","label":"Especialistas: productividad y tasas","family":"kpi"},{"group":"KPI · Por especialista","type":"KPI_PRODUCTIVIDAD_ESPECIALISTA","label":"Productividad por especialista","family":"kpi"},{"group":"KPI · Por especialista","type":"KPI_CANCELACIONES_ESPECIALISTA","label":"Cancelaciones por especialista","family":"kpi"},{"group":"KPI · Por especialista","type":"KPI_TASA_REALIZACION_ESPECIALISTA","label":"Tasa de realización por especialista","family":"kpi"},{"group":"KPI · Por especialista","type":"KPI_TASA_CANCELACION_ESPECIALISTA","label":"Tasa de cancelación por especialista","family":"kpi"},{"group":"KPI · Reportes por separado","type":"KPI_TIEMPOS","label":"Tiempos por QNO","family":"kpi"},{"group":"KPI · Reportes por separado","type":"KPI_MUERTOS_QNO","label":"Tiempos muertos por QNO","family":"kpi"},{"group":"KPI · Reportes por separado","type":"KPI_ESPECIALIDADES","label":"Indicadores por especialidad","family":"kpi"},{"group":"KPI · Reportes por separado","type":"KPI_CANCELACIONES","label":"Indicadores de cancelación","family":"kpi"},{"group":"KPI · Reportes por separado","type":"KPI_FLUJO","label":"Flujo de pacientes por etapa","family":"kpi"},{"group":"MCI","type":"MCI_DIARIO","label":"MCI diario: meta, programadas y realizadas","family":"mci"},{"group":"MCI","type":"MCI_META_DIARIA","label":"Meta diaria por fecha","dailyField":"metaDiaria","family":"mci"},{"group":"MCI","type":"MCI_PROGRAMADAS_DIARIAS","label":"Programadas netas por fecha","dailyField":"programadas","family":"mci"},{"group":"MCI","type":"MCI_REALIZADAS_DIARIAS","label":"Realizadas por fecha","dailyField":"ejecutadas","family":"mci"},{"group":"MCI","type":"MCI_MENSUAL","label":"MCI: todos los indicadores mensuales","family":"mci","fixedPeriod":"MES"},{"group":"MCI","type":"MCI_META_MENSUAL","label":"Meta mensual","field":"meta","unit":"Cirugías","family":"mci","fixedPeriod":"MES"},{"group":"MCI","type":"MCI_PROGRAMADAS_MENSUAL","label":"Programadas netas del mes","field":"programadas","unit":"Cirugías","family":"mci","fixedPeriod":"MES"},{"group":"MCI","type":"MCI_REALIZADAS_MENSUAL","label":"Realizadas del mes","field":"ejecutadas","unit":"Cirugías","family":"mci","fixedPeriod":"MES"},{"group":"MCI","type":"MCI_CUMPLIMIENTO","label":"Cumplimiento de la meta mensual","field":"cumplimiento","unit":"%","family":"mci","fixedPeriod":"MES"},{"group":"MCI","type":"MCI_TASA_REALIZACION","label":"Tasa de realización mensual","field":"tasaRealizacion","unit":"%","family":"mci","fixedPeriod":"MES"},{"group":"MCI","type":"MCI_BRECHA","label":"Brecha frente a la meta mensual","field":"brecha","unit":"Cirugías","family":"mci","fixedPeriod":"MES"},{"group":"MCI","type":"MCI_PROYECCION","label":"Proyección mensual","field":"proyeccion","unit":"Cirugías","family":"mci","fixedPeriod":"MES"},{"group":"Profilaxis · Indicadores","type":"PROF_CASOS","label":"Casos con registro de profilaxis","field":"total","unit":"Casos","family":"prof"},{"group":"Profilaxis · Indicadores","type":"PROF_ADMINISTRADA","label":"Profilaxis administrada","field":"registrada","unit":"Casos","family":"prof"},{"group":"Profilaxis · Indicadores","type":"PROF_NO_ADMINISTRADA","label":"Profilaxis no administrada","field":"noRegistrada","unit":"Casos","family":"prof"},{"group":"Profilaxis · Indicadores","type":"PROF_PENDIENTE","label":"Registro de profilaxis pendiente","field":"pendiente","unit":"Casos","family":"prof"},{"group":"Profilaxis · Indicadores","type":"PROF_MEDICAMENTO","label":"Casos con medicamento registrado","field":"conMedicamento","unit":"Casos","family":"prof"},{"group":"Profilaxis · Indicadores","type":"PROF_TIEMPO","label":"Casos con tiempo a incisión registrado","field":"conTiempo","unit":"Casos","family":"prof"},{"group":"Profilaxis · Indicadores","type":"PROF_INDICADORES","label":"Profilaxis: todos los indicadores","family":"prof"},{"group":"Cuidados POP · Indicadores","type":"POP_CASOS","label":"Casos postoperatorios","field":"total","unit":"Casos","family":"pop"},{"group":"Cuidados POP · Indicadores","type":"POP_ALTA","label":"Altas postoperatorias","field":"alta","unit":"Casos","family":"pop"},{"group":"Cuidados POP · Indicadores","type":"POP_HOSPITALIZACION","label":"Hospitalizaciones postoperatorias","field":"hospitalizacion","unit":"Casos","family":"pop"},{"group":"Cuidados POP · Indicadores","type":"POP_RECUPERACION","label":"Pacientes en recuperación","field":"recuperacion","unit":"Casos","family":"pop"},{"group":"Cuidados POP · Indicadores","type":"POP_SEGUIMIENTO","label":"Casos POP con código de seguimiento","field":"conSeguimiento","unit":"Casos","family":"pop"},{"group":"Cuidados POP · Indicadores","type":"POP_PENDIENTES","label":"Casos POP sin código de seguimiento","field":"pendientes","unit":"Casos","family":"pop"},{"group":"Cuidados POP · Indicadores","type":"POP_INDICADORES","label":"Cuidados POP: todos los indicadores","family":"pop"},{"group":"Seguridad · Ventana de 30 días","type":"SEG_CANDIDATOS","label":"Candidatos a reintervención","field":"total","unit":"Casos","family":"security","fixedPeriod":"VENTANA_30_DIAS"},{"group":"Seguridad · Ventana de 30 días","type":"SEG_REVISADOS","label":"Candidatos revisados","field":"reviewed","unit":"Casos","family":"security","fixedPeriod":"VENTANA_30_DIAS"},{"group":"Seguridad · Ventana de 30 días","type":"SEG_PENDIENTES","label":"Candidatos pendientes de revisión","field":"pending","unit":"Casos","family":"security","fixedPeriod":"VENTANA_30_DIAS"},{"group":"Seguridad · Ventana de 30 días","type":"SEG_DETALLE","label":"Detalle de candidatos a reintervención","family":"security","fixedPeriod":"VENTANA_30_DIAS"}]; }

function downloadIndicatorApp_(token, date, period, type, session) {
  var option = indicatorDownloadCatalogApp_().filter(function(item) { return item.type === type; })[0];
  if (!option) return null;
  if (!reportRange && option.fixedPeriod) period = option.fixedPeriod;
  if (indicatorMetadata[type]) option = {...option,...indicatorMetadata[type]};
  var sections = [], chart = null;
  function section(title, headers, rows) { sections.push({ title: title, headers: headers, rows: rows }); }
  function metricValue(value, unit) {
    if(value==null)return "No evaluable";
    if (unit === '%' && typeof value === 'string' && value.indexOf('%') !== -1) {
      var number = value.replace(/\s|%/g, '');
      if (number.indexOf(',') !== -1) number = number.replace(/\./g, '').replace(',', '.');
      if (isFinite(Number(number))) value = Number(number);
    }
    return value;
  }
  function metricSection(metrics) {
    section(option.label, ['Indicador', 'Valor', 'Unidad', 'Periodo', 'Fecha de referencia'], [[option.label, metrics[option.field]==null?'No evaluable':metricValue(metrics[option.field], option.unit), option.unit, period, reportRange?reportRange.from+' a '+reportRange.to:date]]);
  }
  if (option.family === 'kpi') {
    var kpi = kpiApp_(token, date, period);
    if (option.field) metricSection(kpi.summary);
    else {
      var metrics = indicatorDownloadCatalogApp_().filter(function(item) { return item.family === 'kpi' && item.field; });
      section('Resumen de indicadores', ['Indicador', 'Valor', 'Unidad'], metrics.map(function(item) { return [item.label, kpi.summary[item.field], item.unit]; }));
      if (['KPI_PRODUCTIVIDAD', 'KPI_ESPECIALIDADES'].indexOf(type) !== -1) {
        section('Detalle por especialidad', ['Especialidad', 'Brutas', 'Canceladas', 'Netas', 'Realizadas', 'Realización (%)', 'Cancelación (%)', 'Preparación → QNO (min)', 'QNO → Recuperación (min)', 'Tiempo muerto (min)'], kpi.especialidades.map(function(row) { return [row.especialidad, row.programadasBrutas, row.canceladas, row.programadasNetas, row.ejecutadas, row.tasaRealizacion, row.tasaCancelacion, row.tiempoPrepaQno, row.tiempoQnoRec, row.tiempoMuerto]; }));
      }
      if (['KPI_PRODUCTIVIDAD', 'KPI_ENFERMERIA'].includes(type)) {
        section('Productividad por enfermero jefe registrado en el caso', ['Enfermero jefe', 'Casos registrados', 'Cirugías realizadas', 'Alta', 'Hospitalización', 'Recuperación', 'Cirugías por hora trabajada'], kpi.enfermeria.rows.map(row => [row.professional,row.casesWithResponsible,row.surgeries,row.discharge,row.hospitalization,row.recovery,'No evaluable']));
        section('Definiciones y límites de enfermería', ['Criterio'], kpi.enfermeria.notes.map(note => [note]));
      }
      if (type === 'KPI_PRODUCTIVIDAD' || type.endsWith('_ESPECIALISTA') || type === 'KPI_ESPECIALISTAS') {
        const detail=specialistReportSection(kpi.especialistas,type==='KPI_PRODUCTIVIDAD'?'KPI_ESPECIALISTAS':type);
        section(detail.title,detail.headers,detail.rows);
        section('Definiciones por especialista',['Criterio'],kpi.especialistas.notes.map(note=>[note]));
      }
      if (['KPI_TIEMPOS','KPI_MUERTOS_QNO'].indexOf(type) !== -1) section('Detalle por QNO', ['QNO', 'QNO → Recuperación promedio (min)', 'Tiempo muerto promedio (min)'], kpi.qnos.map(function(row) { return [row.qno, row.tiempoQnoRec, row.tiempoMuerto]; }));
      if (type === 'KPI_CANCELACIONES') {
        section('Cancelaciones por motivo seleccionado', ['Motivo seleccionado', 'Casos'], kpi.cancelaciones.causas.map(function(row) { return [row.label, row.value]; }));
        section('Motivos específicos asociados', ['Motivo seleccionado', 'Motivo específico', 'Casos'], kpi.cancelaciones.motivos.map(function(row) { return [row.motivoSeleccionado, row.motivoEspecifico, row.value]; }));
      }
      if (type === 'KPI_FLUJO') section('Flujo por etapa', ['Etapa', 'Pacientes'], kpi.flujo.map(function(row) { return [row.label, row.value]; }));
    }
  } else if (option.family === 'mci') {
    var mci = reportRange?mciRangeApp_(token):mciApp_(token, date);
    if (option.field) metricSection(mci.metrics);
    else if (option.dailyField) {
      section(option.label, ['Fecha', option.label + ' (cirugías)'], mci.daily.filter(function(row) { return !!reportRange || period === 'MES' || row.fecha === date; }).map(function(row) { return [row.fecha, row[option.dailyField]]; }));
    } else if (type === 'MCI_MENSUAL') {
      section(option.label, ['Indicador', 'Valor', 'Unidad'], indicatorDownloadCatalogApp_().filter(function(item) { return item.family === 'mci' && item.field; }).map(function(item) { return [item.label, metricValue(mci.metrics[item.field], item.unit), item.unit]; }));
    }
    else {
      var daily = mci.daily.filter(function(row) { return !!reportRange || period === 'MES' || row.fecha === date; });
      section('MCI diario', ['Fecha', 'Día', 'QNO disponibles', 'Meta diaria', 'Programadas netas', 'Realizadas', 'Diferencia vs meta', 'Cumple meta', 'Acumulado mensual'], daily.map(function(row) { return [row.fecha, row.dia, row.qxDisponibles, row.metaDiaria, row.programadas, row.ejecutadas, row.diferencia, row.cumple, row.acumulado]; }));
      if (period === 'MES') chart = { date: reportRange?.from || date, rows: daily };
    }
    if(reportRange&&option.field) section('Desglose mensual del periodo',['Mes','Desde','Hasta','Fechas con registro',option.label,'Unidad'],mci.monthly.map(r=>[r.month,r.from,r.to,r.availableDates,r[option.field]==null?'No evaluable':r[option.field],option.unit]));
    if(reportRange&&type==='MCI_MENSUAL') section('Desglose mensual del periodo',['Mes','Desde','Hasta','Fechas con registro','Meta','Programadas netas','Realizadas','Cumplimiento (%)','Realización (%)','Brecha','Proyección'],mci.monthly.map(r=>[r.month,r.from,r.to,r.availableDates,...['meta','programadas','ejecutadas','cumplimiento','tasaRealizacion','brecha','proyeccion'].map(k=>r[k]==null?'No evaluable':r[k])]));
  } else if (option.family === 'prof' || option.family === 'pop') {
    requirePermission_(token, option.family === 'prof' ? 'PROFILAXIS_PREQX' : 'CUIDADOS_POSTOP');
    var cases = period === 'MES' ? readCasesForMonth_(date) : readCasesForDate_(date, true);
    var metrics = (option.family === 'prof' ? profilaxisDataApp_(cases) : postopDataApp_(cases)).metrics;
    if (option.field) metricSection(metrics);
    else section(option.label, ['Indicador', 'Valor', 'Unidad'], indicatorDownloadCatalogApp_().filter(function(item) { return item.family === option.family && item.field; }).map(function(item) { return [item.label, metrics[item.field], item.unit]; }));
  } else if (option.family === 'security') {
    var security = reinterventionsApp_(token, date);
    if (option.field) metricSection(security);
    else section(option.label, ['Paciente', 'Documento', 'Cirugía previa', 'Nueva cirugía', 'Días', 'Especialidad'], security.rows.map(function(row) { return [row.paciente, row.documento, row.fechaPrevia, row.fechaNueva, row.dias, row.especialidad]; }));
  }
  if(reportRange) sections.unshift({title:'Periodo de la descarga',headers:['Periodo','Desde (incluido)','Hasta (incluido)','Base de fecha','Modo','Meta configurada'],rows:[[reportRange.period,reportRange.from,reportRange.to,'Fecha de cirugía; MCI: fecha del registro diario','SIMULADO',option.goal||'Informativo']]});
  var csv = sections.map(function(item) {
    return (sections.length > 1 ? csvCellApp_(item.title) + '\n' : '') + [item.headers].concat(item.rows).map(function(row) { return row.map(csvCellApp_).join(','); }).join('\n');
  }).join('\n\n');
  auditEvent_(session, 'DESCARGA', 'INDICADORES', '', '', type + ' ' + period, 'OK');
  return { title: option.label, period: period, date: date,from:reportRange?.from,to:reportRange?.to, filename: 'Indicador_' + type + '_' + (reportRange?reportRange.from+'_'+reportRange.to:date) + '.csv', csv: '\ufeff' + csv, sections: sections, chart: chart };
}

function downloadApp_(token, dateIso, period, type) {
  var session = requirePermission_(token, 'DESCARGAS');
  var date = dateIso || todayIso_();
  var p = normalizeText_(period || 'DIA').toUpperCase();
  var t = normalizeText_(type || 'PROGRAMACION').toUpperCase();
  var indicator = downloadIndicatorApp_(token, date, p, t, session);
  if (indicator) return indicator;
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
    'Tipo atención', 'Fecha cita POP', 'Hora cita POP', 'Observaciones'
  ];

  var data = rows.map(function(x) {
    return [
      x.fecha, x.hora, x.paciente, x.documento, x.procedimiento,
      x.especialidad, x.especialista, x.qno, x.estado,
      x.tipoAtencion, x.fechaCitaPop || "", x.horaCitaPop || "", x.observaciones
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
    filename: 'Cirugia_' + t.replace(/\s+/g, '_') + '_' + (reportRange?reportRange.from+'_'+reportRange.to:date) + '.csv',
    title:t,period:p,from:reportRange?.from,to:reportRange?.to,
    sections:[...(reportRange?[{title:'Periodo de la descarga',headers:['Periodo','Desde (incluido)','Hasta (incluido)','Modo'],rows:[[p,reportRange.from,reportRange.to,'SIMULADO']]}]:[]),{title:t,headers,rows:data}],
    csv: '\ufeff' + (reportRange?'Periodo,Desde (incluido),Hasta (incluido),Modo\n'+[p,reportRange.from,reportRange.to,'SIMULADO'].join(',')+'\n\n':'')+csv
  };
}

return {kpi:kpiApp_,mci:mciApp_,download:downloadApp_,reinterventions:reinterventionsApp_,profilaxis:profilaxisApp_,postop:postopApp_,catalog:indicatorDownloadCatalogApp_};
}
