// Cancellation categories come from the selected list value, never free-text notes.
export function cancellationSummary(cases, cancellations = []) {
  const text = value => String(value ?? '').trim();
  const key = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  // The caller orders cancellation records chronologically; the last one is current.
  const latest = new Map();
  for (const row of cancellations) {
    const id = text(row['ID CASO']);
    if (id) latest.set(id, row);
  }
  const groups = new Map(), details = new Map();
  for (const item of cases) {
    if (item.estado !== 'CANCELADO') continue;
    const record = latest.get(text(item.id));
    const selected = text(record ? record['CAUSA PRINCIPAL'] : item.motivoSeleccionadoCancelacion) || 'SIN MOTIVO SELECCIONADO';
    const specific = text(record ? record['MOTIVO ESPECÍFICO'] : item.motivoEspecificoCancelacion) || 'SIN MOTIVO ESPECÍFICO';
    const groupKey = key(selected), detailKey = JSON.stringify([groupKey, key(specific)]);
    const group = groups.get(groupKey) || {label: selected, value: 0};
    group.value++; groups.set(groupKey, group);
    const detail = details.get(detailKey) || {motivoSeleccionado: selected, motivoEspecifico: specific, value: 0};
    detail.value++; details.set(detailKey, detail);
  }
  const sort = (a, b) => b.value - a.value || String(a.label || a.motivoSeleccionado).localeCompare(String(b.label || b.motivoSeleccionado), 'es');
  return {causas: [...groups.values()].sort(sort), motivos: [...details.values()].sort(sort)};
}
