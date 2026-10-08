// An absent POP appointment stays absent; surgery dates are never used as a fallback.
export function validateProgrammingAppointment(row: any) {
  const fechaCitaPop=String(row.fechaCitaPop??'').trim(),horaCitaPop=String(row.horaCitaPop??'').trim();
  if(fechaCitaPop){
    const parsed=new Date(fechaCitaPop+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fechaCitaPop)||isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==fechaCitaPop)return {error:'Fecha de cita POP inválida. Use YYYY-MM-DD.'};
  }
  if(horaCitaPop&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(horaCitaPop))return {error:'Hora de cita POP inválida. Use HH:mm.'};
  return {fechaCitaPop,horaCitaPop};
}
