const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
const percentage = (numerator, denominator) => denominator > 0 ? Math.round(numerator / denominator * 10000) / 100 : null;

export function calculateSpecialistProductivity(cases = []) {
  const seen = new Set(), groups = new Map();
  for (const item of cases) {
    const id = text(item.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const specialist = text(item.especialista), key = specialist ? norm(specialist) : 'UNASSIGNED';
    if (!groups.has(key)) groups.set(key, { specialist: specialist || 'SIN ESPECIALISTA REGISTRADO', assigned: Boolean(specialist), specialties: new Set(), scheduledGross: 0, cancelled: 0, performed: 0, inconsistentCases: 0 });
    const row = groups.get(key), cancelled = norm(item.estado) === 'CANCELADO';
    row.scheduledGross++;
    if (text(item.especialidad)) row.specialties.add(text(item.especialidad));
    if (cancelled) row.cancelled++;
    if (item.operado === true) row.performed++;
    if (cancelled && item.operado === true) row.inconsistentCases++;
  }
  const rows = [...groups.values()].map(({ specialties, ...row }) => {
    const scheduledNet = row.scheduledGross - row.cancelled;
    return { ...row, specialties: [...specialties].sort((a,b)=>a.localeCompare(b,'es')), scheduledNet, pending: row.inconsistentCases ? null : scheduledNet - row.performed, realizationRate: row.inconsistentCases ? null : percentage(row.performed, scheduledNet), cancellationRate: percentage(row.cancelled, row.scheduledGross), surgeriesPerWorkedHour: null };
  }).sort((a,b)=>b.performed-a.performed || a.specialist.localeCompare(b.specialist,'es'));
  return { dateBasis: 'SURGERY_DATE', rows, totals: { specialists: rows.filter(r=>r.assigned).length, performed: rows.reduce((n,r)=>n+r.performed,0), cancelled: rows.reduce((n,r)=>n+r.cancelled,0), unassignedCases: rows.filter(r=>!r.assigned).reduce((n,r)=>n+r.scheduledGross,0), inconsistentCases: rows.reduce((n,r)=>n+r.inconsistentCases,0) }, notes: ['Se agrupan casos distintos por el ESPECIALISTA registrado en cada caso y por fecha de cirugía del período seleccionado.', 'Productividad: cirugías con OPERADO verdadero. Un caso cuenta una vez aunque se guarde o se mueva varias veces.', 'Programadas netas = programadas brutas − canceladas. Tasa de realización = realizadas / programadas netas × 100. Sin programadas netas: No evaluable.', 'Tasa de cancelación = casos CANCELADO / programadas brutas × 100. Vincula la cancelación con la programación del especialista; no afirma que el especialista haya causado la cancelación.', 'Un caso registrado como operado y cancelado requiere revisión: se conserva en ambos conteos documentados, pero su grupo no tiene tasa de realización ni pendientes evaluables.', 'Los casos sin especialista se muestran separados. Los nombres deben ser consistentes; este campo no registra por sí solo a todo el equipo quirúrgico.', 'Sin horas trabajadas verificables, productividad por hora es No evaluable.'] };
}

export function specialistReportSection(data, type = 'KPI_ESPECIALISTAS') {
  const common = row => [row.specialist, row.specialties.join(' / ') || 'Sin especialidad'];
  const configs = {
    KPI_PRODUCTIVIDAD_ESPECIALISTA: { title: 'Productividad por especialista', headers: ['Especialista','Especialidades','Cirugías realizadas','Programadas brutas','Programadas netas'], values: r=>[r.performed,r.scheduledGross,r.scheduledNet] },
    KPI_CANCELACIONES_ESPECIALISTA: { title: 'Cancelaciones por especialista', headers: ['Especialista','Especialidades','Canceladas','Programadas brutas'], values: r=>[r.cancelled,r.scheduledGross] },
    KPI_TASA_REALIZACION_ESPECIALISTA: { title: 'Tasa de realización por especialista', headers: ['Especialista','Especialidades','Realizadas','Programadas netas','Realización (%)','Inconsistencias operado/cancelado'], values: r=>[r.performed,r.scheduledNet,r.realizationRate ?? 'No evaluable',r.inconsistentCases] },
    KPI_TASA_CANCELACION_ESPECIALISTA: { title: 'Tasa de cancelación por especialista', headers: ['Especialista','Especialidades','Canceladas','Programadas brutas','Cancelación (%)'], values: r=>[r.cancelled,r.scheduledGross,r.cancellationRate ?? 'No evaluable'] },
    KPI_ESPECIALISTAS: { title: 'Productividad y tasas por especialista', headers: ['Especialista','Especialidades','Programadas brutas','Canceladas','Programadas netas','Realizadas','Pendientes','Realización (%)','Cancelación (%)','Inconsistencias operado/cancelado'], values: r=>[r.scheduledGross,r.cancelled,r.scheduledNet,r.performed,r.pending ?? 'No evaluable',r.realizationRate ?? 'No evaluable',r.cancellationRate ?? 'No evaluable',r.inconsistentCases] }
  };
  const config = configs[type];
  if (!config) throw Error('Reporte de especialista inválido.');
  return { title: config.title, headers: config.headers, rows: data.rows.map(row=>[...common(row),...config.values(row)]) };
}
