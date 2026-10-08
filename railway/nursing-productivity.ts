// Aggregate only documented activity; never infer a nurse from the current shift chief.
const clean = value => String(value ?? '').trim();
const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const rate = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 10000) / 100 : null;
function date(value) {
  const text = clean(value);
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text + 'T12:00:00Z')) || new Date(text + 'T12:00:00Z').toISOString().slice(0, 10) !== text) throw Error('Seleccione fechas válidas para productividad.');
  return text;
}
function range(filters) {
  const from = date(filters.from || filters.desde), to = date(filters.to || filters.hasta);
  if (from && to && from > to) throw Error('La fecha inicial no puede ser posterior a la final.');
  return { from, to, inclusive: true };
}
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const inRange = (value, filters) => validDate(value) && (!filters.from || value >= filters.from) && (!filters.to || value <= filters.to);
function distinctRecords(records) {
  const seen = new Set();
  return (records || []).filter(row => { const key = clean(row.id); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}

export function calculateCallProductivity(inputEpisodes, inputCalls, filters = {}) {
  const selected = range(filters), episodes = new Map((inputEpisodes || []).map(e => [e.id, e]));
  const records = distinctRecords(inputCalls).filter(c => episodes.has(c.episodeId));
  // Legacy records have a username. Link it to a stable account ID only when unambiguous.
  const accountIds = new Map();
  for (const call of records) if (clean(call.recordedBy) && clean(call.professionalUserId)) {
    const key = normalized(call.recordedBy); if (!accountIds.has(key)) accountIds.set(key, new Set()); accountIds.get(key).add(clean(call.professionalUserId));
  }
  const calls = records.filter(c => inRange(c.realDate, selected)), groups = new Map();
  for (const call of calls) {
    const username = clean(call.recordedBy), ids = accountIds.get(normalized(username));
    const userId = clean(call.professionalUserId) || (ids?.size === 1 ? [...ids][0] : '');
    const key = userId ? 'ID:' + userId : username ? 'USER:' + normalized(username) : 'UNASSIGNED';
    if (!groups.has(key)) groups.set(key, { key, user: username, professional: username ? clean(call.professional) || username : 'SIN RESPONSABLE VERIFICABLE', attributed: Boolean(username || userId), attempts: 0, effectiveContacts: 0, withoutEffectiveContact: 0, firstCalls: 0, secondCalls: 0, additionalCalls: 0, patients: new Set(), episodes: new Set(), lastRecorded: '' });
    const row = groups.get(key);
    if (username && clean(call.recordedAt) >= row.lastRecorded) { row.professional = clean(call.professional) || username; row.user = username; row.lastRecorded = clean(call.recordedAt); }
    row.attempts++; row.episodes.add(call.episodeId);
    if (Number(call.number) === 1) row.firstCalls++; else if (Number(call.number) === 2) row.secondCalls++; else row.additionalCalls++;
    if (call.contactResult === 'Sí') { row.effectiveContacts++; row.patients.add(clean(episodes.get(call.episodeId).documentNumber) || call.episodeId); } else row.withoutEffectiveContact++;
  }
  const rows = [...groups.values()].map(({ patients, episodes, lastRecorded, ...row }) => ({ ...row, patientsContacted: patients.size, episodesWorked: episodes.size, contactRate: rate(row.effectiveContacts, row.attempts), callsPerWorkedHour: null })).sort((a, b) => b.attempts - a.attempts || a.professional.localeCompare(b.professional, 'es'));
  return { ok: true, sourceKind: 'SIMULADO', dateBasis: 'CALL_DATE', filters: { ...selected, dateBasis: 'CALL_DATE' }, rows, totals: { attempts: calls.length, effectiveContacts: calls.filter(c => c.contactResult === 'Sí').length, unassignedAttempts: rows.filter(r => !r.attributed).reduce((n, r) => n + r.attempts, 0), professionals: rows.filter(r => r.attributed).length }, notes: ['La fecha real de la llamada determina el período, aunque la cirugía sea anterior.', 'Una ficha original cuenta una actividad; las adendas y los reintentos de guardado no suman llamadas.', 'Contactos efectivos: resultado Sí. Pacientes contactados: documentos distintos por profesional con contacto efectivo; un paciente puede figurar con más de un profesional.', 'El responsable se toma de la sesión que registró la ficha. El jefe de turno actual no recibe las actividades de otras personas.', 'Sin horas trabajadas registradas, llamadas por hora es No evaluable. Este reporte mide volumen documentado, no calidad clínica ni desempeño ajustado por carga.'] };
}

export function calculateSurgicalProductivity(inputCases) {
  const cases = distinctRecords(inputCases), groups = new Map();
  for (const item of cases) {
    const nurse = clean(item.enfermeroJefeCirugia), key = nurse ? normalized(nurse) : 'UNASSIGNED';
    if (!groups.has(key)) groups.set(key, { professional: nurse || 'SIN RESPONSABLE HISTÓRICO VERIFICABLE', attributed: Boolean(nurse), casesWithResponsible: 0, surgeries: 0, discharge: 0, hospitalization: 0, recovery: 0 });
    const row = groups.get(key); row.casesWithResponsible++;
    if (item.operado !== true) continue;
    row.surgeries++;
    const destination = normalized(item.destino || item.estado);
    if (destination === 'ALTA') row.discharge++; else if (destination === 'HOSPITALIZACION') row.hospitalization++; else if (normalized(item.estado) === 'RECUPERACION') row.recovery++;
  }
  const rows = [...groups.values()].sort((a, b) => b.surgeries - a.surgeries || a.professional.localeCompare(b.professional, 'es'));
  return { dateBasis: 'SURGERY_DATE', rows, totals: { surgeries: cases.filter(c => c.operado === true).length, unassignedSurgeries: rows.filter(r => !r.attributed).reduce((n, r) => n + r.surgeries, 0), professionals: rows.filter(r => r.attributed).length }, notes: ['Conteo por fecha de cirugía y por responsable conservado al registrar la cirugía realizada; admite evidencia histórica del mismo registro en Auditoría.', 'Una cirugía cuenta una vez; mover el paciente o guardar de nuevo no agrega producción.', 'Los casos programados sin cirugía realizada no cuentan como cirugías. Alta, Hospitalización y Recuperación corresponden al estado/destino registrado al consultar.', 'El campo mutable ENFERMERO JEFE del último movimiento no prueba quién era responsable al realizar la cirugía. Sin registro histórico verificable, el caso queda sin atribuir; no se asigna al jefe del turno actual.', 'El responsable registrado no identifica a todo el equipo ni sustituye un registro de turnos. Sin horas trabajadas registradas, productividad por hora es No evaluable.'] };
}

export function surgicalNurseSnapshot(previous, chief) {
  const alreadyOperated = ['TRUE','SI','SÍ','1'].includes(normalized(previous.OPERADO));
  if (alreadyOperated || clean(previous['ENFERMERO JEFE CIRUGÍA'])) return {};
  return { 'ENFERMERO JEFE CIRUGÍA': clean(chief) };
}

export function resolveSurgeryNurses(cases, auditRows = []) {
  const evidence = new Map();
  for (const entry of [...auditRows].sort((a, b) => clean(a['MARCA TEMPORAL']).localeCompare(clean(b['MARCA TEMPORAL'])))) {
    if (normalized(entry['ACCIÓN']) !== 'MOVER PACIENTE' || evidence.has(clean(entry['ID CASO']))) continue;
    let patch; try { patch = typeof entry.DETALLE === 'string' ? JSON.parse(entry.DETALLE) : entry.DETALLE; } catch { continue; }
    if (!patch || !['TRUE','SI','SÍ','1'].includes(normalized(patch.OPERADO)) || !['RECUPERACION','ALTA','HOSPITALIZACION'].includes(normalized(patch['ESTADO ACTUAL'])) || !clean(patch['ENFERMERO JEFE'])) continue;
    evidence.set(clean(entry['ID CASO']), clean(patch['ENFERMERO JEFE']));
  }
  return cases.map(c => ({ ...c, enfermeroJefeCirugia: clean(c.enfermeroJefeCirugia) || evidence.get(clean(c.id)) || '' }));
}

export function callProductivityReport(data, period = 'RANGO') {
  const { from, to } = data.filters;
  const headers = ['Enfermero jefe / profesional', 'Usuario', 'Fichas / intentos', 'Contactos efectivos', 'Sin contacto efectivo', 'Pacientes contactados distintos', 'Episodios trabajados', 'Primera llamada', 'Segunda llamada', 'Llamadas adicionales', 'Contacto efectivo (%)', 'Llamadas por hora trabajada'];
  const rows = data.rows.map(r => [r.professional, r.user || 'Sin usuario verificable', r.attempts, r.effectiveContacts, r.withoutEffectiveContact, r.patientsContacted, r.episodesWorked, r.firstCalls, r.secondCalls, r.additionalCalls, r.contactRate ?? 'No evaluable', 'No evaluable']);
  const sections = [{ title: 'Periodo de actividad', headers: ['Periodo', 'Desde (incluido)', 'Hasta (incluido)', 'Base de fecha', 'Modo'], rows: [[period, from, to, 'Fecha real de llamada', 'SIMULADO']] }, { title: 'Productividad de llamadas por enfermero jefe / profesional', headers, rows }, { title: 'Definiciones y límites', headers: ['Criterio'], rows: data.notes.map(n => [n]) }];
  const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
  return { filename: 'PASP_PRODUCTIVIDAD_ENFERMERIA_' + from + '_' + to + '.csv', title: 'Productividad de llamadas por enfermero jefe', from, to, period, sourceKind: 'SIMULADO', sections, csv: '\uFEFF' + sections.map(s => [s.title, [s.headers, ...s.rows].map(row => row.map(cell).join(';')).join('\r\n')].join('\r\n')).join('\r\n\r\n') };
}
