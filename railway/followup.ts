// Worklist only: never creates a clinical contact or infers recovery.
export function followupState(episode: any, today: string) {
  const count = Number(episode.callCount ?? episode.calls?.length ?? 0);
  const closed = String(episode.caseStatus || '').startsWith('Cerrado') || episode.patientStatus === 'Fallecido';
  const slots = [1, 2, 3].map(number => {
    const call = episode['call' + number] || {};
    const recorded = count >= number || !!(call.id || call.realDate);
    const planned = number < 3 || !!call.scheduledDate;
    const enabled = !closed && !recorded && planned && (number === 1 || count >= number - 1);
    return { number, recorded, enabled, scheduledDate: call.scheduledDate || '', scheduledTime: call.scheduledTime || '', realDate: call.realDate || '', contactResult: call.contactResult || '', id: call.id || '' };
  });
  const next = slots.find(slot => slot.enabled);
  const date = next?.scheduledDate || '';
  const queueStatus = closed ? 'CERRADO' : !next ? 'COMPLETADO' : !date ? 'SIN_FECHA' : date < today ? 'VENCIDA' : date === today ? 'HOY' : 'PROXIMA';
  return { slots, nextNumber: next?.number || null, nextScheduledDate: date, nextScheduledTime: next?.scheduledTime || '', queueStatus, pending: !!next, neverCalled: count === 0 };
}

export function buildCallQueue(episodes: any[], operatedCases: any[], today: string, firstScheduled: (date: string) => string) {
  const linked = new Set(episodes.map(e => e.sourceCaseId).filter(Boolean));
  const unregistered = operatedCases.filter(c => c.operado && !linked.has(c.id)).map(c => ({
    id: '', rowKey: 'case:' + c.id, sourceCaseId: c.id, sourceKind: 'SIMULADO', surgeryConfirmed: true,
    patientName: c.paciente, documentNumber: c.documento, phone: c.telefono,
    specialist: c.especialista, specialty: c.especialidad, procedure: c.procedimiento, surgeryDate: c.fecha,
    patientStatus: c.tipoAtencion === 'HOSPITALIZADO' ? 'Hospitalizado' : 'Ambulatorio', caseStatus: 'Abierto',
    appointment: { date: c.fechaCitaPop || '', time: c.horaCitaPop || '', status: c.fechaCitaPop ? 'Programada' : 'Pendiente' },
    call1: { scheduledDate: firstScheduled(c.fecha) }, callCount: 0
  }));
  const rank = { VENCIDA: 0, HOY: 1, SIN_FECHA: 2, PROXIMA: 3, COMPLETADO: 4, CERRADO: 5 };
  return [...episodes.filter(e => e.sourceKind === 'SIMULADO'), ...unregistered].map(e => ({ ...e, rowKey: e.rowKey || 'episode:' + e.id, followup: followupState(e, today) }))
    .sort((a, b) => rank[a.followup.queueStatus] - rank[b.followup.queueStatus] || a.followup.nextScheduledDate.localeCompare(b.followup.nextScheduledDate) || String(a.patientName).localeCompare(String(b.patientName), 'es'));
}
