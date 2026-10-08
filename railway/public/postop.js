(function () {
  'use strict';
  const P = { schema: null, schemaVersion: null, config: null, configVersion: null, episodes: [], detail: null, guides: [], dictionary: [], escalations: [], initialized: false, configField: null };
  const q = id => document.getElementById(id);
  const safe = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const user = () => typeof state !== 'undefined' ? state.session || {} : {};
  const can = permission => typeof hasUiPermission === 'function' && hasUiPermission(permission);
  const admin = () => ['ADMIN', 'SUPERADMIN'].includes(String(user().role || user().user?.role || '').toUpperCase()) || can('*');
  const canConfigure = () => (typeof isSuperAdmin === 'function' && isSuperAdmin()) || String(user().role || '').toUpperCase() === 'SUPERADMIN' || can('PASP_CONFIGURAR') || can('*');
  const canCoordinate = () => admin() || can('PASP_COORDINACION_GESTIONAR') || can('COORDINACION_GESTIONAR');
  const canSafety = () => admin() || can('PASP_SEGURIDAD_GESTIONAR') || can('SEGURIDAD_PACIENTE_GESTIONAR');
  const canCall = () => admin() || can('CUIDADOS_POSTOP');
  const canReadCoordination = () => canCoordinate() || canSafety() || can('COORDINACION_VER');
  const actorName = () => user().user?.name || user().user?.nombre || user().name || user().nombre || user().username || 'Profesional autenticado';
  const send = (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) });
  const zonedInstant = value => value ? value + (/[TZ]|[+-]\d\d:\d\d/.test(value) ? '' : ':00-05:00') : '';
  function request(url, options) {
    if (typeof api === 'function') return api(url, options);
    return fetch(url, Object.assign({ credentials: 'same-origin' }, options, { headers: { 'content-type': 'application/json' } })).then(async r => { const body = await r.json(); if (!r.ok) throw Error(body.error || 'No fue posible completar la operación.'); return body; });
  }
  function nowParts() {
    const values = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).forEach(p => { values[p.type] = p.value; });
    return { date: values.year + '-' + values.month + '-' + values.day, time: values.hour + ':' + values.minute };
  }
  function getPath(obj, path) { return path.split('.').reduce((value, key) => value == null ? undefined : value[key], obj); }
  function setPath(obj, path, value) { const keys = path.split('.'); let cursor = obj; keys.slice(0, -1).forEach(key => { if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}; cursor = cursor[key]; }); cursor[keys[keys.length - 1]] = value; }
  function formObject(form) {
    const result = {};
    for (const element of form.elements) {
      if (!element.name || element.matches(':disabled') || ['button', 'submit'].includes(element.type)) continue;
      if (element.type === 'radio' && !element.checked) continue;
      setPath(result, element.name, element.type === 'checkbox' ? element.checked : element.value.trim());
    }
    return result;
  }
  const choiceLabels = { SHEET_COMPATIBILITY: 'Calendario de la matriz: ajustar al siguiente día hábil', CALENDAR_DAYS: 'Días calendario sin ajuste a hábiles', REGISTRAR_CONDICION_SIN_INFERIR: 'Registrar hospitalización sin inventar valoración', SEGUIMIENTO_INTRAINSTITUCIONAL_DOCUMENTADO: 'Seguimiento intrainstitucional documentado', 'firstCall.realDate': 'Fecha real de la primera llamada', 'firstCall.scheduledDate': 'Fecha programada de la primera llamada', POR_ANALIZAR: 'Por analizar', INCIDENTE_SIN_DANO: 'Incidente sin daño confirmado', EVENTO_ADVERSO: 'Evento adverso confirmado', COMPLICACION: 'Complicación', RIESGO: 'Riesgo', DESCARTADO: 'Descartado después de análisis', INDETERMINADO: 'Indeterminado', NO_DETERMINADA: 'Causalidad no determinada', ASOCIADA_ATENCION: 'Asociada con la atención', ENFERMEDAD_BASE: 'Asociada con enfermedad de base', OTRA: 'Otra causalidad documentada', RECIBIR: 'Registrar recepción', ANALIZAR: 'Registrar análisis', GESTIONAR: 'Gestionar', REESCALAR: 'Reescalar', RESOLVER: 'Registrar resolución', CERRAR: 'Cerrar evento', REABRIR: 'Reabrir con motivo' };
  function optionList(options, value, allowBlank = true) {
    return (allowBlank ? '<option value="">Seleccione</option>' : '') + options.map(option => '<option value="' + safe(option) + '"' + (String(option) === String(value) ? ' selected' : '') + '>' + safe(choiceLabels[option] || option) + '</option>').join('');
  }
  function input(name, label, value, type = 'text', options = [], required = false, disabled = false) {
    const attrs = ' name="' + safe(name) + '"' + (required ? ' required' : '') + (disabled ? ' disabled' : '') + (['recipient','notification.recipient','escalationResponsible'].includes(name) ? ' list="paspEscalationDirectory"' : '');
    const widget = type === 'select' ? '<select' + attrs + '>' + optionList(options, value) + '</select>' : type === 'textarea' ? '<textarea' + attrs + ' rows="3">' + safe(value) + '</textarea>' : type === 'boolean' ? '<input type="checkbox"' + attrs + (value ? ' checked' : '') + '>' : '<input type="' + safe(type) + '"' + attrs + ' value="' + safe(value) + '"' + (type === 'number' ? ' min="0" max="'+(/painScore$/.test(name)?10:/Minutes$/.test(name)?525600:365)+'" step="1"' : '') + '>';
    return '<label class="pasp-field' + (type === 'textarea' ? ' pasp-wide' : '') + '"><span>' + safe(label) + (required ? ' *' : '') + '</span>' + widget + '</label>';
  }
  function notice(message, kind = '') { return '<div class="pasp-notice ' + safe(kind) + '">' + safe(message) + '</div>'; }
  function statusBadge(status) { return '<span class="pasp-badge">' + safe(status || 'Abierto') + '</span>'; }
  function modal(title, html, actions = '', id = 'paspModal') {
    let element = q(id);
    if (!element) { element = document.createElement('div'); element.id = id; element.className = 'modal pasp-modal'; element.setAttribute('role', 'dialog'); element.setAttribute('aria-modal', 'true'); document.body.appendChild(element); }
    element.innerHTML = '<div class="modal-card"><div class="modal-head"><h3>' + safe(title) + '</h3><button class="btn soft" type="button" data-pasp="close" data-modal="' + safe(id) + '">Cerrar</button></div>' + html + (actions ? '<div class="modal-actions">' + actions + '</div>' : '') + '</div>';
    element.classList.add('show');
    element.setAttribute('aria-label', title);
    setTimeout(() => element.querySelector('input:not([disabled]),select:not([disabled]),button')?.focus(), 0);
    return element;
  }
  function close(id = 'paspModal') { q(id)?.classList.remove('show'); }
  function message(text, error = false) { modal(error ? 'No se pudo completar' : 'Seguimiento postoperatorio', notice(text, error ? 'pasp-danger' : 'pasp-success'), '', 'paspMessageModal'); }
  async function ensureSchema() {
    if (!P.schema) { const response = await request('/api/pasp/schema'); P.schema = response.schema || response; const settings=await request('/api/pasp/config');P.config=settings.config||{};P.configVersion=settings.version;P.schema.urgentSafety={...P.schema.urgentSafety,...P.config.urgentSafety}; }
    let directory=q('paspEscalationDirectory');if(!directory){directory=document.createElement('datalist');directory.id='paspEscalationDirectory';document.body.appendChild(directory);}directory.innerHTML=(P.config?.escalationDirectory||[]).map(item=>'<option value="'+safe(item.recipient)+'">'+safe(item.area+' · '+item.role)+'</option>').join('');
    return P.schema;
  }
  function schemaFields(stage) { return (P.schema?.fields || []).filter(field => field.stage === stage && field.enabled !== false); }
  function mount() {
    const view = q('view-postop');
    if (!view || q('paspWorkspace')) return;
    const hero = view.querySelector('.hero');
    if (hero) { const heading = hero.querySelector('h2'); if (heading) heading.textContent = 'Seguimiento postoperatorio'; const kicker = hero.querySelector('.kicker'); if (kicker) kicker.textContent = 'PASP'; const copy = hero.querySelector('p'); if (copy) copy.textContent = 'Registro, llamadas, cuidados y gestión de hallazgos por episodio quirúrgico.'; }
    const node = document.createElement('div'); node.id = 'paspWorkspace'; node.className = 'pasp-workspace';
    node.innerHTML = notice('MODO DE PRUEBA: los episodios y las llamadas de este módulo usan exclusivamente datos ficticios. No ingrese datos reales.', 'pasp-simulation') + '<div class="pasp-toolbar"><label class="pasp-search">Buscar episodio ficticio<input id="paspSearch" type="search" placeholder="Nombre, documento simulado, código o procedimiento"></label><label>Estado<select id="paspStatus"><option value="">Todos</option><option>Abierto</option><option>En seguimiento</option><option>Cerrado</option></select></label><button class="btn" data-pasp="new-episode">Nuevo episodio simulado</button><button class="btn soft" data-pasp="refresh">Actualizar</button><button class="btn soft" data-pasp="export">Descargar matriz PASP</button></div><div id="paspLoading" role="status"></div><div id="paspEpisodeList" class="pasp-episode-list"></div>';
    const carePanel = view.querySelector('.panel'); if (carePanel) carePanel.before(node); else view.appendChild(node); const oldHeading = [...view.children].find(el => el.tagName === 'H3'); if (oldHeading) oldHeading.remove();
    const coordination = q('coord-seguridad');
    if (coordination && !q('paspEscalationPanel')) { const panel = document.createElement('section'); panel.className = 'panel pasp-workspace'; panel.id = 'paspEscalationPanel'; panel.innerHTML = '<h3>Hallazgos PASP y Seguridad del Paciente</h3>' + notice('Una alerta ayuda a valorar la ruta; no confirma una notificación ni un evento adverso.') + '<div class="pasp-toolbar"><select id="paspEscalationFilter"><option value="">Todos los estados</option>' + ['NUEVO', 'RECIBIDO', 'EN_ANALISIS', 'EN_GESTION', 'REESCALADO', 'RESUELTO', 'CERRADO'].map(v => '<option>' + v + '</option>').join('') + '</select><button class="btn soft" data-pasp="load-escalations">Actualizar bandeja</button></div><div id="paspEscalationList"></div>'; coordination.appendChild(panel); }
    const configView = q('view-configuracion');
    if (configView && !q('paspConfigMount')) { const section = document.createElement('section'); section.id = 'paspConfigMount'; section.className = 'panel pasp-workspace'; section.innerHTML = '<h3>Configuración de seguimiento postoperatorio</h3><p>Campos, opciones, guías, sinónimos, tiempos y reglas institucionales.</p><button class="btn" data-pasp="configuration">Abrir gestor PASP</button><div id="paspConfigSummary"></div>'; configView.appendChild(section); }
    q('paspSearch')?.addEventListener('input', renderEpisodes);
    q('paspStatus')?.addEventListener('change', renderEpisodes);
    q('paspEscalationFilter')?.addEventListener('change', renderEscalations);
    const indicators = document.createElement('section'); indicators.id = 'paspIndicators'; indicators.className = 'panel pasp-workspace';
    const today = nowParts().date;
    indicators.innerHTML = '<h3>Indicadores de la matriz de seguimiento</h3><p>Cohorte por fecha de cirugía. Las llamadas 1 y 2 conservan las fórmulas institucionales; los intentos adicionales se miden por separado.</p><div class="pasp-toolbar"><label>Desde<input id="paspIndicatorsFrom" type="date" value="' + today.slice(0, 7) + '-01"></label><label>Hasta<input id="paspIndicatorsTo" type="date" value="' + today + '"></label><button class="btn" data-pasp="indicators">Actualizar indicadores</button><button class="btn soft" data-pasp="indicators-export" data-id="ALL">Descargar todos CSV</button></div><div id="paspIndicatorStatus" role="status"></div><div id="paspIndicatorChart"></div><div id="paspIndicatorList" class="pasp-indicator-list"></div>';
    node.after(indicators);
  }
  async function loadPostop() {
    mount();
    q('paspLoading').textContent = 'Cargando episodios de prueba…';
    try {
      await ensureSchema();
      P.episodes = await allEpisodes();
      const real = P.episodes.some(episode => episode.sourceKind !== 'SIMULADO');
      if (real) throw Error('El servidor devolvió episodios sin marca de simulación. No se mostrarán en el entorno de prueba.');
      renderEpisodes();
      const metrics = q('popMetrics');
      if (metrics) metrics.innerHTML = [['Episodios simulados', P.episodes.length], ['Llamadas registradas', P.episodes.reduce((n, e) => n + (e.calls?.length || e.callCount || 0), 0)], ['En seguimiento', P.episodes.filter(e => e.caseStatus === 'En seguimiento').length], ['Hallazgos pendientes', P.episodes.filter(e => ['Activo', 'Abierto', 'En seguimiento'].includes(e.coordinationStatus || e.coordination?.status)).length]].map(([name, value]) => typeof metric === 'function' ? metric(name, value) : '<div class="metric"><span>' + safe(name) + '</span><b>' + value + '</b></div>').join('');
      q('paspLoading').textContent = '';
      await loadIndicators();
    } catch (error) { q('paspLoading').textContent = 'No fue posible cargar el seguimiento.'; message(error.message, true); }
  }
  async function allEpisodes() {
    const result = []; const seen = new Set(); const limit = 250;
    for (let offset = 0; ; offset += limit) {
      const response = await request('/api/pasp/episodes?limit=' + limit + '&offset=' + offset); const rows = response.episodes || response.rows || [];
      let added = 0; for (const row of rows) { if (!seen.has(row.id)) { seen.add(row.id); result.push(row); added++; } }
      if (rows.length < limit) break;
      if (!added) throw Error('No fue posible recorrer todos los episodios; actualice antes de descargar la matriz.');
    }
    return result;
  }
  function renderEpisodes() {
    if (!q('paspEpisodeList')) return;
    const term = (q('paspSearch')?.value || '').toLocaleLowerCase('es'); const status = q('paspStatus')?.value || '';
    const items = P.episodes.filter(episode => (!status || (status === 'Cerrado' ? String(episode.caseStatus).startsWith('Cerrado') : episode.caseStatus === status)) && [episode.patientName, episode.documentNumber, episode.paspCode, episode.procedure].join(' ').toLocaleLowerCase('es').includes(term));
    q('paspEpisodeList').innerHTML = items.map(episode => '<article class="pasp-episode"><div><span class="pasp-badge pasp-simulation">SIMULADO</span>' + statusBadge(episode.caseStatus) + '<h3>' + safe(episode.patientName) + '</h3><p>' + safe(episode.procedure) + '</p><dl><dt>Código</dt><dd>' + safe(episode.paspCode) + '</dd><dt>Cirugía</dt><dd>' + safe(episode.surgeryDate) + '</dd><dt>Ruta</dt><dd>' + safe(episode.patientStatus) + '</dd><dt>Especialidad</dt><dd>' + safe(episode.specialty) + '</dd><dt>Coordinación</dt><dd>' + safe(episode.coordinationStatus || episode.coordination?.status || 'No aplica') + '</dd></dl></div><button class="btn" data-pasp="detail" data-id="' + safe(episode.id) + '">Abrir ficha y llamadas</button></article>').join('') || '<div class="empty">Sin episodios simulados para los filtros seleccionados.</div>';
  }
  async function openInitial() {
    await ensureSchema(); if (!canCall()) throw Error('Su perfil no tiene permiso para registrar seguimiento.');
    const values = { patientStatus: 'Ambulatorio' };
    const fields = schemaFields('initial').filter(field => field.ownership !== 'computed' && field.id !== 'appointment.status');
    const source=await request('/api/pasp/operated-cases?date='+encodeURIComponent(q('date')?.value||nowParts().date));
    modal('Seguimiento de paciente operado ficticio', '<form id="paspInitialForm"><label class="pasp-field"><span>Tomar de programación · solo cirugías realizadas</span><select id="paspSourceCase"><option value="">Registrar cirugía realizada manualmente</option>'+source.rows.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.paciente)+' · '+safe(p.procedimiento)+'</option>').join('')+'</select></label><input type="hidden" name="sourceCaseId"><div class="pasp-grid">' + fields.map(field => input(field.id, field.label, getPath(values, field.id), field.type, field.options, field.required)).join('') + '</div>' + input('surgeryConfirmed', 'Confirmo que el procedimiento quirúrgico ya fue realizado', false, 'boolean', [], true) + input('simulationConfirmed', 'Confirmo que todos los datos son ficticios y que no estoy registrando un paciente real', false, 'boolean', [], true) + '<button type="submit" class="btn">Guardar episodio simulado</button></form>');
    q('paspSourceCase').addEventListener('change',event=>{
      const form=q('paspInitialForm');form.elements.namedItem('sourceCaseId').value='';const p=source.rows.find(p=>p.id===event.target.value);if(!p)return;
      const values={sourceCaseId:p.id,patientName:p.paciente,documentNumber:p.documento,phone:p.telefono,specialist:p.especialista,specialty:p.especialidad,procedure:p.procedimiento,surgeryDate:p.fecha,patientStatus:p.tipoAtencion==='HOSPITALIZADO'?'Hospitalizado':'Ambulatorio','appointment.date':p.fechaCitaPop,'appointment.time':p.horaCitaPop,surgeryConfirmed:true};
      for(const [key,value] of Object.entries(values)){const element=form.elements.namedItem(key);if(element){if(element.type==='checkbox')element.checked=value===true;else element.value=value||''}}
    });
  }
  function displayCall(call) {
    return '<details class="pasp-history-entry"><summary>Llamada ' + safe(call.number) + ' · ' + safe(call.realDate || call.occurredAt || '') + ' ' + safe(call.time || '') + ' · ' + safe(call.contactResult) + '</summary><p><b>ID de ficha:</b> ' + safe(call.id) + '</p><p><b>Profesional:</b> ' + safe(call.professional || call.actorName) + '</p><p><b>Hallazgo:</b> ' + safe(call.classification || 'Sin valoración registrada') + '</p><p><b>Conducta:</b> ' + safe(call.conduct || '') + '</p><p class="pasp-pre">' + safe(call.observations) + '</p><dl>' + Object.entries(call.clinical || {}).map(([key, value]) => '<dt>' + safe(clinicalLabel(key)) + '</dt><dd>' + safe(value) + '</dd>').join('') + '</dl>' + (call.extra?.educationProvided ? '<p><b>Educación:</b> ' + safe(call.extra.educationProvided) + '</p>' : '') + (call.extra?.safetyInstruction ? notice(call.extra.safetyInstruction, 'pasp-danger') : '') + '<button class="btn soft" data-pasp="call-record" data-id="' + safe(call.id) + '">Abrir ficha individual</button></details>';
  }
  function clinicalLabel(key) { const f = (P.schema?.fields || []).find(item => item.id.endsWith('.clinical.' + key)) || P.schema?.forms?.call?.additionalClinicalFields?.find(item => item.id === 'clinical.' + key); return f?.label?.replace(/ [12]$/, '') || key; }
  async function openDetail(id) {
    const data = await request('/api/pasp/episodes/' + encodeURIComponent(id));
    P.detail = data.episode || data;
    if (P.detail.sourceKind !== 'SIMULADO') throw Error('Esta ficha no está marcada como simulada y no se abrirá.');
    const e = P.detail; const calls = e.calls || []; const next = calls.length ? Math.max(...calls.map(c => Number(c.number) || 0)) + 1 : 1;
    const buttons = (canCall() ? '<button class="btn" data-pasp="new-call" data-number="' + next + '">Registrar ' + (next <= 2 ? 'llamada ' + next : 'llamada adicional') + '</button>' : '') + (canCoordinate() ? '<button class="btn soft" data-pasp="coordination">Gestionar Coordinación</button>' : '');
    modal('Ficha: ' + e.patientName, notice('Episodio y llamadas ficticios · ' + e.paspCode, 'pasp-simulation') + '<div class="pasp-detail-summary"><p><b>Procedimiento:</b> ' + safe(e.procedure) + '</p><p><b>Cirugía:</b> ' + safe(e.surgeryDate) + ' · <b>Especialista:</b> ' + safe(e.specialist) + '</p><p><b>Cita POP:</b> ' + safe(e.appointment?.date || 'Sin fecha') + ' ' + safe(e.appointment?.time || '') + ' · ' + safe(e.appointment?.status || 'Pendiente') + '</p><p><b>Primera llamada:</b> ' + safe(e.call1?.scheduledDate || e.firstCallScheduledDate || e.scheduledFirstCall || e.scheduledCalls?.first || 'Sin fecha') + ' · <b>Segunda:</b> ' + safe(e.call2?.scheduledDate || e.secondCallScheduledDate || e.scheduledSecondCall || e.scheduledCalls?.second || 'Sin fecha') + '</p></div><div class="pasp-toolbar">' + buttons + '</div><h4>Historial de llamadas e intentos</h4>' + (calls.map(displayCall).join('') || '<div class="empty">Todavía no hay llamadas registradas.</div>') + '<h4>Eventos y trazabilidad</h4><div class="pasp-history">' + ((e.history || []).map(item => '<p><b>' + safe(item.eventType || item.action || item.type) + '</b> · ' + safe(item.timestamp || item.recordedAt || item.occurredAt || item.createdAt) + ' · ' + safe(item.author || item.actorName || item.actorId) + (item.reason ? ' · ' + safe(item.reason) : '') + '</p>').join('') || '<p>Sin eventos adicionales.</p>') + '</div>');
  }
  function callFormFields(number) {
    const stage = number > 1 ? 'call2' : 'call1';
    return schemaFields(stage).filter(field => field.ownership !== 'computed').map(field => ({ ...field, id: field.id.replace(/^call[12]\./, ''), label: field.label.replace(/ [12]$/, '').replace(/primera llamada|segunda llamada/g, 'llamada') }));
  }
  function openCall(number) {
    if (!canCall()) throw Error('Su perfil no tiene permiso para registrar llamadas.');
    if (!P.detail) return;
    const stamp = nowParts(); const fields = callFormFields(number); const values = { realDate: stamp.date, time: stamp.time, professional: actorName() };
    const basic = fields.filter(f => !f.id.startsWith('clinical.') && !['observations', 'classification', 'conduct', 'escalationResponsible', 'escalationDate', 'citationDate', 'appointmentAttendance', 'stitchesRemoved', 'woundReviewed'].includes(f.id));
    const clinical = fields.filter(f => f.id.startsWith('clinical.'));
    if (number > 1) (P.schema.forms?.call?.secondCallSupplemental || []).forEach(key => { if (!clinical.some(f => f.id === 'clinical.' + key)) clinical.push({ id: 'clinical.' + key, label: clinicalLabel(key), type: 'select', options: ['Sí', 'No', 'No aplica'] }); });
    const extras = (P.schema.forms?.call?.additionalClinicalFields || []).filter(field=>field.enabled!==false);
    const controls = input('extra.identityVerified', 'Identidad confirmada con dos identificadores', false, 'boolean') + input('extra.authorizationConfirmed', 'Usuario o cuidador autorizado acepta continuar', false, 'boolean') + input('extra.respondent', 'Quién aporta la información', '', 'select', ['Usuario', 'Cuidador autorizado', 'Equipo intrainstitucional autorizado']) + input('extra.contactMedium', 'Medio institucional usado', 'Llamada telefónica', 'select', P.schema.lists?.['Medio de contacto'] || ['Llamada telefónica']);
    modal('Registrar llamada ' + number + ' · datos ficticios', '<form id="paspCallForm"><input name="number" type="hidden" value="' + number + '">' + notice('Solo registre información efectivamente obtenida. Ante gravedad, oriente Urgencias sin esperar terminar el formulario.', 'pasp-simulation') + '<div class="pasp-grid">' + basic.map(f => input(f.id, f.label, getPath(values, f.id), f.type, f.options, ['realDate', 'time', 'contactResult'].includes(f.id), f.id === 'professional')).join('') + controls + '</div><div id="paspContactNote" role="status"></div><fieldset id="paspClinicalFields"><legend>Valoración telefónica</legend><div class="pasp-grid">' + clinical.map(f => input(f.id, f.label, '', f.type, f.options)).join('') + '</div><details class="pasp-extra-clinical"><summary>Alarmas, respiración, eliminación y dispositivos</summary><div class="pasp-grid">' + extras.map(f => input(f.id, f.label, '', f.type, f.options)).join('') + '</div></details><div id="paspClinicalDetails"></div><div id="paspUrgentNotice" role="alert"></div></fieldset><div class="pasp-grid">' + (number === 2 ? fields.filter(f => ['appointmentAttendance', 'stitchesRemoved', 'woundReviewed'].includes(f.id)).map(f => input(f.id, f.label, '', f.type, f.options)).join('') : '') + input('observations', 'Observaciones e información adicional realmente obtenida', '', 'textarea') + input('classification', 'Clasificación del hallazgo por el profesional', '', 'select', P.schema.lists?.['Clasificación hallazgo'] || []) + input('conduct', 'Conducta efectivamente realizada', '', 'select', P.schema.lists?.Conducta || []) + input('extra.communicationBarrier', 'Barrera de comunicación y apoyo utilizado', '', 'textarea') + input('extra.educationProvided', 'Educación reforzada según egreso', '', 'textarea') + input('extra.teachBack', 'Cómo verificó comprensión', '', 'textarea') + input('extra.medicationAccess', 'Acceso a medicamentos y barreras', '', 'textarea') + input('extra.deviceDetails', 'Dispositivos y plan individual', '', 'textarea') + input('extra.safetyInstruction', 'Orientación urgente efectivamente dada', '', 'textarea') + input('extra.recordedInClinicalRecord', 'Registro realizado en historia clínica / SAFIX', false, 'boolean') + '</div><fieldset id="paspEscalationFields"><legend>Escalamiento y citación cuando aplique</legend><div class="pasp-grid">' + input('escalation.area', 'Área competente', '', 'select', P.schema.lists?.['Área escalada'] || []) + input('escalation.recipient', 'Receptor real', '') + input('escalation.deadline', 'Plazo acordado', '', 'datetime-local') + input('escalationResponsible', 'Responsable real del escalamiento', '') + input('escalationDate', 'Fecha del escalamiento', '', 'date') + input('citationDate', 'Fecha de citación', '', 'date') + input('escalation.reason', 'Motivo y acción de escalamiento', '', 'textarea') + '</div></fieldset><div class="modal-actions"><button type="button" class="btn soft" data-pasp="detail" data-id="' + safe(P.detail.id) + '">Volver a ficha</button><button type="submit" class="btn">Guardar intento / llamada simulada</button></div></form>');
    q('paspCallForm').addEventListener('change', updateCallConditional);
    updateCallConditional();
  }
  function updateCallConditional() {
    const form = q('paspCallForm'); if (!form) return;
    const effective = form.elements.contactResult?.value === 'Sí' && form.elements['extra.identityVerified']?.checked && form.elements['extra.authorizationConfirmed']?.checked;
    q('paspClinicalFields').disabled = !effective;
    q('paspContactNote').innerHTML = effective ? notice('Contacto efectivo verificado: capture lo referido, sin sugerir respuestas.') : notice('La valoración clínica está desactivada hasta confirmar contacto, identidad y autorización. El intento y sus observaciones pueden registrarse sin inventar respuestas.');
    const body = formObject(form); const c = body.clinical || {};
    const details = [];
    const needed = [['fever', 'Temperatura medida si disponible, inicio y deterioro'], ['bleeding', 'Sitio, cantidad percibida, coágulos y persistencia del sangrado'], ['painControlled', 'Sitio, inicio, intensidad, progresión y respuesta al manejo formulado'], ['discharge', 'Aspecto, sitio y progresión de la secreción'], ['rednessSwelling', 'Extensión y evolución del enrojecimiento o inflamación'], ['oralTolerance', 'Alimentos/líquidos tolerados, vómitos, orina y debilidad'], ['urinaryElimination', 'Imposibilidad de orinar, volumen, ardor y drenaje de sonda'], ['questions', 'Dudas y barreras detectadas']];
    needed.forEach(([key, label]) => { if ((['painControlled', 'oralTolerance', 'urinaryElimination'].includes(key) && c[key] === 'No') || (!['painControlled', 'oralTolerance', 'urinaryElimination'].includes(key) && c[key] === 'Sí')) details.push(input('extra.details.' + key, label, form.elements['extra.details.' + key]?.value || '', 'textarea')); });
    q('paspClinicalDetails').innerHTML = '<div class="pasp-grid">' + details.join('') + '</div>';
    const signs = (P.schema.urgentSafety?.immediateFlags || []).filter(key => c[key] === 'Sí');
    if (c.fever === 'Sí' && c.clinicalDeterioration === 'Sí') signs.push('Fiebre con deterioro');
    if (c.persistentVomiting === 'Sí' && c.liquidTolerance === 'No') signs.push('Vómitos con intolerancia a líquidos');
    q('paspUrgentNotice').innerHTML = signs.length ? notice((P.schema.urgentSafety?.userFacingAction || 'URGENCIAS INMEDIATAMENTE') + '. Hay señales referidas que requieren valoración presencial urgente. No espere terminar este registro ni una cita. No se asigna diagnóstico ni categoría de triage. Documente la orientación y el escalamiento efectivamente realizados.', 'pasp-danger') : '';
    const conduct = body.conduct || ''; const needsEscalation = /Escalamiento|urgencias|seguridad|Otro/i.test(conduct);
    q('paspEscalationFields').hidden = !needsEscalation;
    q('paspEscalationFields').disabled = !needsEscalation;
  }
  async function saveInitial(form) {
    const body = formObject(form);
    if (!body.simulationConfirmed) throw Error('Confirme que usó solamente datos ficticios.');
    body.sourceKind = 'SIMULADO';
    const result = await send('/api/pasp/episodes', body);
    close(); await loadPostop(); if (result.episode?.id) await openDetail(result.episode.id); else message('Episodio simulado registrado.');
  }
  async function saveCall(form) {
    const body = formObject(form); const contact = body.contactResult;
    const effective = contact === 'Sí' && body.extra?.identityVerified === true && body.extra?.authorizationConfirmed === true;
    if (contact === 'Sí' && !effective) throw Error('Para registrar contacto efectivo confirme identidad y autorización. Puede registrar un intento no efectivo cuando corresponda.');
    if (!effective) { body.clinical = {}; body.clinicalNotAssessed = true; delete body.appointmentAttendance; delete body.stitchesRemoved; delete body.woundReviewed; }
    if (contact === 'Fallecido' && !body.observations) throw Error('Registre quién confirmó la condición y la fuente de información; no se infiere a partir de falta de contacto.');
    if (effective && (!body.classification || !body.conduct)) throw Error('Registre la clasificación profesional y la conducta efectivamente realizada.');
    if (body.escalation?.area && !body.escalation.recipient && !body.escalation.reason) throw Error('Identifique el receptor real o documente en el motivo que la recepción está pendiente. No retrase la orientación de Urgencias.');
    if (body.escalation?.deadline) body.escalation.deadline = zonedInstant(body.escalation.deadline);
    body.idempotencyKey = form.dataset.idempotencyKey || (form.dataset.idempotencyKey = crypto.randomUUID()); body.number = Number(body.number); body.episodeId = P.detail.id; body.expectedVersion = P.detail.version; body.sourceKind = 'SIMULADO';
    const result = await send('/api/pasp/calls', body); const id = result.episode?.id || body.episodeId;
    close(); await loadPostop(); await openDetail(id);
  }
  function openCoordination() {
    if (!canCoordinate()) throw Error('Su perfil no permite gestionar el cierre de Coordinación.');
    const c = P.detail.coordination || {}; const values = { reviewer: actorName(), analysis1: c.analysis1 || P.detail.analysis1, analysis2: c.analysis2 || P.detail.analysis2, status: c.status || P.detail.coordinationStatus, spNotified: c.spNotified || P.detail.spNotified };
    modal('Coordinación del episodio simulado', '<form id="paspCoordinationForm">' + notice('Cerrar llamadas no resuelve hallazgos. Cada novedad exige análisis propio; Seguridad del Paciente gestiona su evento y no cierra el caso PASP.') + '<div class="pasp-grid">' + input('reviewer', 'Profesional revisor', values.reviewer, 'text', [], false, true) + input('analysis1', 'Análisis y resolución de la primera llamada', values.analysis1, 'textarea') + input('analysis2', 'Análisis y resolución de la segunda llamada', values.analysis2, 'textarea') + input('status', 'Estado de Coordinación', values.status, 'select', (P.schema.lists?.['Estado pendiente'] || ['Activo', 'Cerrado', 'No aplica']), true) + input('caseStatus', 'Estado del seguimiento PASP', P.detail.caseStatus, 'select', ['Abierto','En seguimiento','Pendiente de asistir a cita','Cerrado por seguimiento completado','Cerrado por imposibilidad de contacto'], true) + input('activitiesVerified', 'Verifiqué que las actividades de seguimiento están completas', false, 'boolean') + input('exhaustionVerified', 'Verifiqué que se agotó la ruta de contacto configurada', false, 'boolean') + input('spNotified', 'Seguridad del Paciente fue notificada realmente', values.spNotified, 'select', ['Sí', 'No', 'No aplica'], true) + input('notification.recipient', 'Receptor de la notificación', c.notification?.recipient) + input('notification.notifiedAt', 'Fecha y hora de notificación', c.notification?.notifiedAt, 'datetime-local') + input('notification.channel', 'Canal institucional usado', c.notification?.channel) + input('notification.evidenceReference', 'Referencia del registro de derivación', c.notification?.evidenceReference) + input('reason', 'Motivo de esta actualización', '', 'textarea', [], true) + '</div><button class="btn" type="submit">Guardar gestión documentada</button></form>');
  }
  async function saveCoordination(form) {
    const body = formObject(form);
    if (body.spNotified === 'Sí' && (!body.notification?.recipient || !body.notification?.notifiedAt || !body.notification?.evidenceReference)) throw Error('Una notificación real requiere receptor, fecha/hora y evidencia del registro.');
    if (body.spNotified === 'Sí') body.notificationEvidence = [body.notification.recipient, zonedInstant(body.notification.notifiedAt), body.notification.channel || '', body.notification.evidenceReference].join(' · ');
    body.expectedVersion = P.detail.version;
    await send('/api/pasp/episodes/' + encodeURIComponent(P.detail.id) + '/coordination', body);
    const id = P.detail.id; close(); await loadPostop(); await openDetail(id);
  }
  async function loadPaspEscalations() {
    mount(); if (!canReadCoordination()) return;
    const response = await request('/api/pasp/escalations'); P.escalations = response.rows || response.escalations || [];
    if (P.escalations.some(item => item.sourceKind && item.sourceKind !== 'SIMULADO')) throw Error('Se rechazó una bandeja con datos no marcados como simulados.');
    renderEscalations();
  }
  function renderEscalations() {
    if (!q('paspEscalationList')) return;
    const filter = q('paspEscalationFilter')?.value || '';
    const rows = P.escalations.filter(item => !filter || item.status === filter);
    q('paspEscalationList').innerHTML = rows.map(item => '<article class="pasp-escalation">' + statusBadge(item.status) + '<h4>' + safe(item.classification || item.title || 'Hallazgo en revisión') + '</h4><p>' + safe(item.reason || item.observations) + '</p><p>Ruta: ' + safe(item.area || item.recipientArea || 'Coordinación') + ' · Receptor: ' + safe(item.recipient || 'Pendiente') + '</p><button class="btn soft" data-pasp="escalation" data-id="' + safe(item.id) + '">Ver evento y gestionar</button></article>').join('') || '<div class="empty">Sin hallazgos para esta selección.</div>';
  }
  function openEscalation(id) {
    const event = P.escalations.find(item => item.id === id); if (!event) return;
    const safety = /seguridad/i.test(event.area || event.recipientArea || '');
    const canWrite = safety ? canSafety() : canCoordinate();
    const actions = { NUEVO: ['RECIBIR', 'ANALIZAR', 'GESTIONAR', 'REESCALAR'], RECIBIDO: ['ANALIZAR', 'GESTIONAR', 'REESCALAR'], EN_ANALISIS: ['GESTIONAR', 'REESCALAR', 'RESOLVER'], EN_GESTION: ['ANALIZAR', 'REESCALAR', 'RESOLVER'], REESCALADO: ['RECIBIR', 'ANALIZAR', 'GESTIONAR', 'RESOLVER'], RESUELTO: ['CERRAR', 'ANALIZAR', 'GESTIONAR', 'REESCALAR'], CERRADO: ['REABRIR', 'GESTIONAR'] };
    const safetyFields = safety && canWrite ? input('eventClassification', 'Conclusión del análisis de Seguridad del Paciente', event.eventClassification || 'POR_ANALIZAR', 'select', ['POR_ANALIZAR', 'INCIDENTE_SIN_DANO', 'EVENTO_ADVERSO', 'COMPLICACION', 'RIESGO', 'DESCARTADO', 'INDETERMINADO']) + input('causality', 'Conclusión de causalidad documentada', event.causality || 'NO_DETERMINADA', 'select', ['NO_DETERMINADA', 'ASOCIADA_ATENCION', 'ENFERMEDAD_BASE', 'OTRA']) : '';
    const form = canWrite ? '<form id="paspEscalationForm" data-id="' + safe(id) + '"><div class="pasp-grid">' + input('action', 'Actuación efectivamente realizada', '', 'select', actions[event.status] || [], true) + input('recipient', 'Receptor / responsable de la gestión', event.recipient) + input('response', 'Respuesta recibida', event.response, 'textarea') + input('analysis', 'Análisis del hallazgo', event.analysis, 'textarea') + input('resolution', 'Gestión y resolución', event.resolution, 'textarea') + input('conduct', 'Conducta efectivamente realizada', event.conduct, 'textarea') + input('deadline', 'Plazo de seguimiento acordado', '', 'datetime-local') + input('verification', 'Cómo se verificó la resolución', event.verification, 'textarea') + safetyFields + input('reason', 'Motivo de esta actualización', '', 'textarea', [], true) + '</div><button type="submit" class="btn">Guardar actuación</button></form>' : notice('Vista de consulta. La actuación corresponde al responsable autorizado de esta ruta.');
    modal('Evento PASP simulado', notice('La clasificación inicial orienta la revisión y no confirma un evento adverso.') + '<p><b>Hallazgo:</b> ' + safe(event.assessment || event.classification || '') + ' · ' + safe(event.status) + '</p><p class="pasp-pre">' + safe(event.situation || event.reason || '') + '</p>' + form + '<h4>Historial</h4><div class="pasp-history">' + (event.history || event.events || []).map(item => '<p>' + safe(item.action || item.eventType || item.type) + ' · ' + safe(item.actorName || item.actorId) + ' · ' + safe(item.timestamp || item.recordedAt || item.createdAt) + '</p>').join('') + '</div>');
  }
  async function saveEscalation(form) {
    const event = P.escalations.find(item => item.id === form.dataset.id); const body = formObject(form);
    if (!event) throw Error('El evento ya no está disponible; actualice la bandeja.');
    if (['RESOLVER', 'CERRAR'].includes(body.action) && (!body.analysis || !body.resolution || !body.verification)) throw Error('Documente análisis, resolución y verificación antes de resolver o cerrar.');
    body.expectedVersion = event.version;
    if (body.deadline) body.deadline = zonedInstant(body.deadline); else delete body.deadline;
    await send('/api/pasp/escalations/' + encodeURIComponent(event.id) + '/action', body); close(); await loadPaspEscalations(); message('Actuación simulada registrada con trazabilidad.');
  }
  async function exportMatrix() {
    await ensureSchema();
    const episodes = await allEpisodes();
    if (episodes.some(e => e.sourceKind !== 'SIMULADO')) throw Error('La descarga está limitada a episodios ficticios.');
    const headers = (P.schema.headers || []).map(h => typeof h === 'string' ? h : h.label);
    const projected = episodes.map(e => Array.isArray(e.matrix) ? e.matrix : headers.map(header => e.matrix?.[header] ?? ''));
    const csvCell = value => '"' + String(value == null ? '' : value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + [headers, ...projected].map(row => row.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'Matriz-PASP-SIMULADA-' + nowParts().date + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function loadPaspConfiguration() {
    mount(); await ensureSchema();
    if (!canConfigure()) throw Error('La configuración requiere permiso administrativo.');
    const [config, guides, dictionary, schemaConfig] = await Promise.all([request('/api/pasp/config'), request('/api/pasp/care-guides?all=1'), request('/api/pasp/dictionary'), request('/api/pasp/config?scope=SCHEMA')]);
    P.schema = schemaConfig.config || P.schema; P.schemaVersion = schemaConfig.version;
    P.config = config.config || {}; P.configVersion = config.version; P.guides = guides.rows || []; P.dictionary = dictionary.rows || [];
    if (q('paspConfigSummary')) q('paspConfigSummary').textContent = (P.schema.fields?.length || 0) + ' campos · ' + P.guides.length + ' guías · ' + P.dictionary.length + ' términos y alias.';
    renderConfiguration();
  }
  function fieldConfigList() { return [...(P.schema.fields || []),...(P.schema.forms?.call?.additionalClinicalFields || [])]; }
  function renderConfiguration(tab = 'fields') {
    const tabs = [['fields', 'Campos y opciones'], ['lists','Listas PASP'], ['guides', 'Guías'], ['dictionary', 'Procedimientos y alias'], ['rules', 'Tiempos y reglas']];
    const html = notice('Los cambios de configuración requieren motivo y quedan auditados. La matriz original conserva su estructura y sus fórmulas.') + '<div class="pasp-tabs">' + tabs.map(([key, label]) => '<button class="btn' + (key === tab ? '' : ' soft') + '" data-pasp="config-tab" data-tab="' + key + '">' + label + '</button>').join('') + '</div><div id="paspConfigContent"></div>';
    modal('Configuración de seguimiento postoperatorio', html, '', 'paspConfigModal');
    if (tab === 'fields') renderFieldsConfig(); if(tab==='lists')renderListsConfig(); if (tab === 'guides') renderGuidesConfig(); if (tab === 'dictionary') renderDictionaryConfig(); if (tab === 'rules') renderRulesConfig();
  }
  function renderListsConfig(){
    const keys=Object.keys(P.schema.lists||{});q('paspConfigContent').innerHTML='<label class="pasp-field"><span>Lista del seguimiento</span><select id="paspListKey">'+keys.map(key=>'<option>'+safe(key)+'</option>').join('')+'</select></label><div id="paspListEditor"></div>';q('paspListKey').addEventListener('change',renderListEditor);renderListEditor();
  }
  function renderListEditor(){const key=q('paspListKey').value;q('paspListEditor').innerHTML='<form id="paspListConfigForm" data-list="'+safe(key)+'">'+input('optionsText','Opciones permitidas: una por línea',(P.schema.lists[key]||[]).join('\n'),'textarea')+input('reason','Motivo del cambio','','textarea',[],true)+notice('Puede ordenar las opciones y ampliar las listas administrativas. Las respuestas clínicas y estados básicos se conservan para interpretar correctamente los indicadores y el historial.')+'<button class="btn" type="submit">Guardar lista PASP</button></form>';}
  async function saveListConfiguration(form){const value=formObject(form),key=form.dataset.list,before=P.schema.lists[key],options=value.optionsText.split('\n').map(s=>s.trim()).filter(Boolean);const next=structuredClone(P.schema);next.lists[key]=options;const same=a=>JSON.stringify((a||[]).map(String))===JSON.stringify(before.map(String));for(const field of [...next.fields,...(next.forms.call.additionalClinicalFields||[])])if(same(field.options))field.options=options;const result=await send('/api/pasp/config?scope=SCHEMA',{scope:'SCHEMA',expectedVersion:P.schemaVersion,config:next,reason:value.reason});P.schema=result.config;P.schemaVersion=result.version;renderConfiguration('lists');message('Lista PASP actualizada en los formularios y validaciones.');}
  function renderFieldsConfig(selected) {
    const fields = fieldConfigList(); P.configField = selected || fields[0]?.id;
    q('paspConfigContent').innerHTML = '<label class="pasp-field"><span>Campo que desea configurar</span><select id="paspConfigField">' + fields.map(field => '<option value="' + safe(field.id) + '"' + (field.id === P.configField ? ' selected' : '') + '>' + safe((field.column || 'Adicional') + ' · ' + field.label) + '</option>').join('') + '</select></label><div id="paspFieldEditor"></div>';
    q('paspConfigField').addEventListener('change', () => { P.configField = q('paspConfigField').value; renderFieldEditor(); }); renderFieldEditor();
  }
  function renderFieldEditor() {
    const field = fieldConfigList().find(f => f.id === P.configField); if (!field) return;
    q('paspFieldEditor').innerHTML = '<form id="paspFieldConfigForm"><div class="pasp-grid">' + input('label', 'Nombre visible del campo', field.label, 'text', [], true) + input('type', 'Tipo de captura', field.type, 'select', ['text', 'date', 'time', 'datetime-local', 'textarea', 'select', 'number', 'boolean'], true) + input('enabled', 'Campo visible', field.enabled !== false, 'boolean') + input('required', 'Campo obligatorio', field.required, 'boolean') + input('optionsText', 'Opciones permitidas: una por línea', (field.options || []).join('\n'), 'textarea') + input('requiredWhen', 'Cuándo es obligatorio', field.requiredWhen, 'select', ['optional', 'attemptRecorded', 'verifiedEffectiveContact', 'callAssessed', 'applicableAction']) + input('visibility', 'Cuándo se muestra', field.visibility, 'select', ['always', 'effectiveContact', 'applicableAction']) + input('inputMessage', 'Ayuda para diligenciar', field.inputMessage, 'textarea') + input('reason', 'Motivo del cambio', '', 'textarea', [], true) + '</div>' + notice('Identificador y columna se mantienen: ' + field.id + ' · ' + (field.column || 'campo adicional') + '. Los campos calculados no se convierten en datos manuales desde este gestor.') + '<button class="btn" type="submit">Guardar campo</button></form>';
  }
  async function saveFieldConfiguration(form) {
    const value = formObject(form); const fields = fieldConfigList().map(f => f.id === P.configField ? Object.assign({}, f, { label: value.label, type: value.type, enabled: value.enabled, required: value.required, options: value.optionsText.split('\n').map(s => s.trim()).filter(Boolean), requiredWhen: value.requiredWhen, visibility: value.visibility, inputMessage: value.inputMessage }) : f);
    const baseIds=new Set((P.schema.fields||[]).map(f=>f.id));const newSchema={...P.schema,fields:fields.filter(f=>baseIds.has(f.id)),forms:{...P.schema.forms,call:{...P.schema.forms.call,additionalClinicalFields:fields.filter(f=>!baseIds.has(f.id))}}};
    const data = await send('/api/pasp/config?scope=SCHEMA', { expectedVersion: P.schemaVersion, scope: 'SCHEMA', config: newSchema, reason: value.reason });
    P.schema = data.config || newSchema; P.schemaVersion = data.version; renderConfiguration('fields'); message('Campo y opciones actualizados.');
  }
  async function saveConfig(config, reason) {
    const data = await send('/api/pasp/config', { expectedVersion: P.configVersion, config, reason });
    P.config = data.config || config; P.configVersion = data.version; P.schema = null; await ensureSchema();
  }
  function renderGuidesConfig() {
    const options = [{ id: '', title: 'Crear nueva guía' }, ...P.guides];
    q('paspConfigContent').innerHTML = '<label class="pasp-field"><span>Guía educativa</span><select id="paspGuideSelect">' + options.map(g => '<option value="' + safe(g.id || g['ID FICHA'] || '') + '">' + safe(g.title || g.TITULO || g.titulo || '') + '</option>').join('') + '</select></label><div id="paspGuideEditor"></div>';
    q('paspGuideSelect').addEventListener('change', renderGuideEditor); renderGuideEditor();
  }
  function guideValue(guide, key, alternative) { return guide[key] ?? guide[alternative] ?? ''; }
  function asLines(value) { return Array.isArray(value) ? value.join('\n') : String(value || '').replace(/;/g, '\n'); }
  function renderGuideEditor() {
    const id = q('paspGuideSelect').value; const guide = P.guides.find(g => (g.id || g['ID FICHA']) === id) || {};
    q('paspGuideEditor').innerHTML = '<form id="paspGuideForm" data-id="' + safe(id) + '"><div class="pasp-grid">' + input('title', 'Título', guideValue(guide, 'title', 'TITULO'), 'text', [], true) + input('proceduresText', 'Procedimientos exactos: uno por línea', asLines(guide.procedures || guide.PROCEDIMIENTOS), 'textarea') + input('anesthesiasText', 'Anestesias: una por línea', asLines(guide.anesthesias || guide.ANESTESIAS), 'textarea') + input('topicsText', 'Temas: uno por línea', asLines(guide.topics || guide.TEMAS), 'textarea') + input('coverage', 'Cobertura', guide.coverage || guide.COBERTURA || 'PARCIAL', 'select', ['GENERAL', 'PARCIAL', 'ESPECIFICA'], true) + input('type', 'Tipo de ficha', guide.type || guide.TIPO || 'PROCEDIMIENTO', 'select', ['PROCEDIMIENTO', 'ANESTESIA', 'GENERAL', 'TEMA'], true) + input('approval', 'Estado de revisión/aprobación documentado', guide.approval || guide.APROBACION || 'PENDIENTE', 'select', ['PENDIENTE', 'REVISADO', 'APROBADO'], true) + input('audience', 'Quién puede consultar', guide.audience || guide.AUDIENCIA || 'AMBOS', 'select', ['AMBOS', 'ENFERMERIA', 'ACOMPANANTES'], true) + input('state', 'Estado de la guía', guide.state || guide.ESTADO || 'BORRADOR', 'select', ['ACTIVO', 'INACTIVO', 'BORRADOR'], true) + input('keywordsText', 'Sinónimos y palabras de búsqueda: uno por línea', asLines(guide.keywords || guide['PALABRAS CLAVE']), 'textarea') + input('recommendationsText', 'Recomendaciones: una por línea', asLines(guide.recommendations || guide.RECOMENDACIONES), 'textarea') + input('alarmsText', 'Signos de alarma y conducta: uno por línea', asLines(guide.alarms || guide['SIGNOS DE ALARMA']), 'textarea') + input('restrictionsText', 'Restricciones: una por línea', asLines(guide.restrictions || guide.RESTRICCIONES), 'textarea') + input('source', 'Referencias verificables y alcance', guide.source || guide.FUENTE, 'textarea', [], true) + input('pages', 'Páginas de la fuente cuando aplique', guide.pages || guide.PAGINAS) + input('contentVersion', 'Versión del contenido', guide.contentVersion || '') + input('sourceUrlsText', 'Enlaces de fuentes: uno por línea', asLines(guide.sourceUrls), 'textarea') + input('reviewNote', 'Alcance y revisión clínica documentada', guide.reviewNote || '', 'textarea') + input('reason', 'Motivo del cambio y responsable de revisión', '', 'textarea', [], true) + '</div>' + notice('Seleccione APROBADO únicamente con evidencia institucional. Editar la guía no autoriza dosis, plazos universales ni cambios terapéuticos.') + '<button type="submit" class="btn">Guardar guía</button></form>';
  }
  async function saveGuide(form) {
    const value = formObject(form); const old = P.guides.find(g => (g.id || g['ID FICHA']) === form.dataset.id); const split = str => str.split('\n').map(s => s.trim()).filter(Boolean);
    const body = { ...value, id: form.dataset.id || undefined, expectedVersion: old?.version, procedures: split(value.proceduresText), anesthesias: split(value.anesthesiasText), topics: split(value.topicsText), keywords: split(value.keywordsText), recommendations: split(value.recommendationsText), alarms: split(value.alarmsText), restrictions: split(value.restrictionsText), sourceUrls: split(value.sourceUrlsText) };
    for (const key of ['proceduresText', 'anesthesiasText', 'topicsText', 'keywordsText', 'recommendationsText', 'alarmsText', 'restrictionsText', 'sourceUrlsText']) delete body[key];
    await send('/api/pasp/care-guides', body); const response = await request('/api/pasp/care-guides?all=1'); P.guides = response.rows || []; renderConfiguration('guides'); message('Guía guardada con motivo de cambio.');
  }
  function renderDictionaryConfig() {
    q('paspConfigContent').innerHTML = '<label class="pasp-field"><span>Procedimiento, término o alias</span><select id="paspDictionarySelect"><option value="">Nuevo término</option>' + P.dictionary.map(term => '<option value="' + safe(term.id) + '">' + safe(term.concept || term.CONCEPTO || '') + '</option>').join('') + '</select></label><div id="paspDictionaryEditor"></div>';
    q('paspDictionarySelect').addEventListener('change', renderDictionaryEditor); renderDictionaryEditor();
  }
  function renderDictionaryEditor() {
    const id = q('paspDictionarySelect').value; const entry = P.dictionary.find(term => term.id === id) || {};
    q('paspDictionaryEditor').innerHTML = '<form id="paspDictionaryForm" data-id="' + safe(id) + '"><div class="pasp-grid">' + input('concept', 'Nombre del procedimiento o concepto', entry.concept || entry.CONCEPTO, 'text', [], true) + input('type', 'Tipo', entry.type || entry.TIPO || 'PROCEDIMIENTO', 'select', ['REGION', 'PROCEDIMIENTO', 'ANESTESIA', 'TEMA'], true) + input('family', 'Familia / región', entry.family || entry.FAMILIA) + input('synonymsText', 'Expresiones cotidianas y alias: uno por línea', asLines(entry.synonyms || entry.SINONIMOS), 'textarea') + input('state', 'Estado del término', entry.state || entry.ESTADO || 'ACTIVO', 'select', ['ACTIVO', 'INACTIVO'], true) + input('reason', 'Motivo del cambio', '', 'textarea', [], true) + '</div><button class="btn" type="submit">Guardar término</button></form>';
  }
  async function saveDictionary(form) {
    const value = formObject(form); const old = P.dictionary.find(row => row.id === form.dataset.id);
    const body = { ...value, id: form.dataset.id || undefined, expectedVersion: old?.version, synonyms: value.synonymsText.split('\n').map(s => s.trim()).filter(Boolean) }; delete body.synonymsText;
    await send('/api/pasp/dictionary', body); const response = await request('/api/pasp/dictionary'); P.dictionary = response.rows || []; renderConfiguration('dictionary'); message('Término y alias guardados.');
  }
  function renderRulesConfig() {
    const rules = P.config.scheduling || P.schema.scheduling || {}; const routing = P.config.routing || P.schema.routing || {};
    const conditions = P.config.conditionalRules || P.schema.conditionalRules || [];
    q('paspConfigContent').innerHTML = '<form id="paspRulesForm">' + notice('La matriz usa días ajustados a hábiles; el texto institucional dice 48/72 horas. Cambiar la regla requiere una decisión explícita y motivo. No se aplican horas exactas a una fecha sin hora de cirugía.') + '<div class="pasp-grid">' + input('defaultMode', 'Regla de programación', rules.defaultMode || 'SHEET_COMPATIBILITY', 'select', ['SHEET_COMPATIBILITY', 'CALENDAR_DAYS']) + input('firstDays', 'Días base desde cirugía a primera llamada', rules.first?.offsetCalendarDays ?? 2, 'number', [], true) + input('secondDays', 'Días base desde primera a segunda llamada', rules.second?.offsetCalendarDays ?? 3, 'number', [], true) + input('secondBase', 'Base de la segunda llamada', rules.second?.base || 'firstCall.realDate', 'select', ['firstCall.realDate', 'firstCall.scheduledDate']) + input('hospitalizedIncluded', 'Mantener hospitalizados incluidos en seguimiento', routing.hospitalized?.included !== false, 'boolean') + input('hospitalizedPolicy', 'Ruta de primera llamada en hospitalización', routing.hospitalized?.policy || 'REGISTRAR_CONDICION_SIN_INFERIR', 'select', ['REGISTRAR_CONDICION_SIN_INFERIR', 'SEGUIMIENTO_INTRAINSTITUCIONAL_DOCUMENTADO']) + input('minimumAttempts', 'Intentos para cierre sin contacto: dejar vacío si no hay regla aprobada', P.config.minimumAttempts || '') + input('urgentInstruction', 'Orientación visible de urgencias', P.config.urgentSafety?.userFacingAction || P.schema.urgentSafety?.userFacingAction || 'URGENCIAS INMEDIATAMENTE', 'textarea') + input('weekendDays','Días no hábiles de la semana: 0 domingo a 6 sábado',(rules.weekendDays||[0,6]).join(',')) + input('urgentMinutes','Plazo de respuesta institucional inmediato, en minutos',P.config.responseTimesMinutes?.INMEDIATA??'','number') + input('priorityMinutes','Plazo prioritario, en minutos',P.config.responseTimesMinutes?.PRIORITARIA??'','number') + input('routineMinutes','Plazo no urgente, en minutos',P.config.responseTimesMinutes?.NO_URGENTE??'','number') + input('directoryLines','Directorio de escalamiento: área | receptor | cargo, una fila por línea',(P.config.escalationDirectory||[]).map(d=>[d.area,d.recipient,d.role].join(' | ')).join('\n'),'textarea') + input('holidayLines', 'Calendario usado: fecha ISO y nombre, separados por |, una fecha por línea', (rules.holidays || []).map(h => typeof h === 'string' ? h : h.date + ' | ' + h.label).join('\n'), 'textarea') + input('reason', 'Motivo y autoridad de la regla modificada', '', 'textarea', [], true) + '</div><h4>Preguntas y controles condicionales</h4><div id="paspConditionalRules">' + conditions.map((condition, index) => '<div class="pasp-condition">' + input('conditions.' + index + '.if', 'Cuando ocurre', condition.if, 'textarea') + input('conditions.' + index + '.then', 'Qué debe capturarse o gestionarse', condition.then, 'textarea') + '</div>').join('') + '</div>' + notice('La clasificación profesional y los datos reales de derivación no se generan por estas reglas. Seguridad del Paciente no cierra PASP. Los motivos y versiones de cada cambio se conservan.') + '<button type="submit" class="btn">Guardar tiempos y reglas</button></form>';
    for (const field of q('paspRulesForm').querySelectorAll('input[type="number"]')) { field.max = '365'; field.min = '0'; }
  }
  async function saveRules(form) {
    const value = formObject(form); const baseSchedule = P.config.scheduling || P.schema.scheduling;
    const holidays = value.holidayLines.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [date, ...label] = line.split('|'); if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || !Number.isFinite(Date.parse(date.trim()))) throw Error('Revise las fechas del calendario: use AAAA-MM-DD | nombre.'); return { date: date.trim(), label: label.join('|').trim() }; });
    if (value.minimumAttempts && (!/^\d+$/.test(value.minimumAttempts) || Number(value.minimumAttempts) < 1)) throw Error('El número de intentos debe ser entero positivo o quedar vacío.');
    const scheduling = { ...baseSchedule, defaultMode: value.defaultMode, first: { ...baseSchedule.first, offsetCalendarDays: Number(value.firstDays), rollForwardToBusinessDay: value.defaultMode === 'SHEET_COMPATIBILITY' }, second: { ...baseSchedule.second, base: value.secondBase, offsetCalendarDays: Number(value.secondDays), rollForwardToBusinessDay: value.defaultMode === 'SHEET_COMPATIBILITY' }, holidays, weekendDays:value.weekendDays.split(',').map(s=>Number(s.trim())) };
    const routing = { ...(P.config.routing || P.schema.routing), hospitalized: { ...(P.config.routing?.hospitalized || P.schema.routing?.hospitalized), included: value.hospitalizedIncluded, policy: value.hospitalizedPolicy } };
    const directory=value.directoryLines.split('\n').map(s=>s.trim()).filter(Boolean).map(line=>{const [area,recipient,role]=line.split('|').map(s=>s.trim());if(!area||!recipient)throw Error('Registre área y receptor en cada fila del directorio.');return {area,recipient,role:role||''}});const responseTimesMinutes={};for(const [field,key] of [['urgentMinutes','INMEDIATA'],['priorityMinutes','PRIORITARIA'],['routineMinutes','NO_URGENTE']])if(value[field]!==''){const minutes=Number(value[field]);if(!Number.isInteger(minutes)||minutes<0||minutes>525600)throw Error('Plazo de respuesta inválido.');responseTimesMinutes[key]=minutes;}const config = { ...P.config, scheduling, routing, escalationDirectory:directory,responseTimesMinutes, minimumAttempts: value.minimumAttempts ? Number(value.minimumAttempts) : null, urgentSafety: { ...(P.config.urgentSafety || P.schema.urgentSafety), userFacingAction: value.urgentInstruction }, conditionalRules: Object.values(value.conditions || {}).map(item => ({ if: item.if, then: item.then })) };
    await saveConfig(config, value.reason); renderConfiguration('rules'); message('Tiempos, calendario y reglas guardados con trazabilidad.');
  }
  function openCallRecord(id) {
    const call = P.detail?.calls?.find(item => item.id === id); if (!call) throw Error('No se encontró la ficha individual de esta llamada.');
    modal('Ficha individual de llamada ' + call.number, notice('ID de ficha: ' + call.id + '. Registro original inmutable; las revisiones se agregan como adendas.', 'pasp-simulation') + displayCall(call) + '<h4>Información adicional</h4><dl>' + Object.entries(call.extra || {}).filter(([key]) => key !== 'details').map(([key, value]) => '<dt>' + safe(extraLabel(key)) + '</dt><dd class="pasp-pre">' + safe(typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value) + '</dd>').join('') + '</dl><div class="pasp-history">' + (call.addenda || []).map(item => '<article><b>Adenda · ' + safe(item.recordedAt || item.createdAt) + '</b><p>' + safe(item.actorName || item.actorId) + '</p><p class="pasp-pre">' + safe(item.content) + '</p><p>Motivo: ' + safe(item.reason) + '</p></article>').join('') + '</div>' + (canCall() || canCoordinate() ? '<button class="btn" data-pasp="new-addendum" data-id="' + safe(call.id) + '">Agregar adenda de revisión</button>' : ''));
  }
  function extraLabel(key) { const labels = { identityVerified: 'Identidad verificada', authorizationConfirmed: 'Autorización confirmada', respondent: 'Persona que aportó información', contactMedium: 'Medio institucional', communicationBarrier: 'Barrera y apoyo', educationProvided: 'Educación reforzada', teachBack: 'Verificación de comprensión', medicationAccess: 'Acceso a medicamentos', deviceDetails: 'Dispositivos', safetyInstruction: 'Orientación urgente', recordedInClinicalRecord: 'Registro en historia clínica / SAFIX' }; return labels[key] || key; }
  async function indicatorData(from, to) {
    const result = await request('/api/pasp/indicators?from=' + encodeURIComponent(from || '') + '&to=' + encodeURIComponent(to || ''));
    if (result.sourceKind !== 'SIMULADO') throw Error('Los indicadores deben usar únicamente datos ficticios.');
    return result;
  }
  function indicatorChart(series) {
    if (!series.length) return '<p class="empty">Sin episodios en el periodo seleccionado.</p>';
    const lines = [['episodes', 'Episodios', '#44358b'], ['attempts', 'Fichas de llamada', '#167a9c'], ['effectiveContacts', 'Contactos efectivos', '#2e854d']];
    const max = Math.max(1, ...series.flatMap(row => lines.map(([key]) => Number(row[key]) || 0)));
    const x = i => 52 + i * 710 / Math.max(1, series.length - 1), y = n => 190 - n * 150 / max;
    let svg = '<svg viewBox="0 0 810 250" role="img" aria-label="Episodios, fichas de llamada y contactos efectivos por fecha de cirugía"><rect width="810" height="250" fill="white"/>';
    for (let tick = 0; tick <= 4; tick++) { const value = max * tick / 4; svg += '<line x1="52" y1="' + y(value) + '" x2="762" y2="' + y(value) + '" stroke="#e2e5ec"/><text x="44" y="' + (y(value) + 4) + '" text-anchor="end" font-size="11">' + Math.round(value * 10) / 10 + '</text>'; }
    lines.forEach(([key, label, color], index) => { svg += '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + series.map((row, i) => x(i) + ',' + y(row[key] || 0)).join(' ') + '"/>'; series.forEach((row, i) => { svg += '<circle cx="' + x(i) + '" cy="' + y(row[key] || 0) + '" r="3" fill="' + color + '"><title>' + safe(row.date + ' · ' + label + ': ' + row[key]) + '</title></circle>'; }); svg += '<text x="' + (52 + index * 230) + '" y="238" fill="' + color + '" font-size="12">' + label + '</text>'; });
    series.forEach((row, i) => { if (i === 0 || i === series.length - 1 || i % Math.ceil(series.length / 7) === 0) svg += '<text x="' + x(i) + '" y="212" text-anchor="middle" font-size="10">' + safe(row.date.slice(5)) + '</text>'; });
    return svg + '</svg>';
  }
  async function loadIndicators() {
    if (!q('paspIndicatorStatus')) return;
    q('paspIndicatorStatus').textContent = 'Calculando indicadores…';
    const data = await indicatorData(q('paspIndicatorsFrom').value, q('paspIndicatorsTo').value); P.indicators = data;
    q('paspIndicatorStatus').textContent = data.metrics.filter(item => item.scope === 'INSTITUCIONAL').length + ' indicadores de la matriz · ' + data.totals.episodes + ' episodios · ' + data.totals.attempts + ' fichas. Sin denominador, el resultado es «No evaluable».';
    q('paspIndicatorChart').innerHTML = indicatorChart(data.series || []);
    q('paspIndicatorList').innerHTML = ['INSTITUCIONAL', 'AMPLIACION'].map(scope => '<div class="pasp-wide"><h4>' + (scope === 'INSTITUCIONAL' ? 'Indicadores de la matriz PASP' : 'Intentos, contactos y gestión adicional') + '</h4></div>' + data.metrics.filter(item => item.scope === scope).map(item => '<article class="pasp-indicator"><h4>' + safe(item.label) + '</h4><b class="pasp-indicator-value">' + (item.value == null ? 'No evaluable' : safe(item.value + ' ' + item.unit)) + '</b><p>' + safe(item.goal ? 'Meta: ' + item.goal : 'Informativo') + '</p><details><summary>Definición y cálculo</summary><p>' + safe(item.definition) + '</p><p>' + safe(item.formula) + '</p><p>Numerador: ' + safe(item.numerator) + ' · Denominador: ' + safe(item.denominator == null ? 'No aplica' : item.denominator) + '</p><p>' + safe(item.owner) + ' · ' + safe(item.frequency) + '</p><p class="pasp-pre">Fórmula de la matriz: ' + safe(item.sheetFormula || 'Ampliación de gestión') + '</p></details>' + (can('DESCARGAS') || admin() ? '<button class="btn soft" data-pasp="indicators-export" data-id="' + safe(item.id) + '">Descargar indicador CSV</button>' : '') + '</article>').join('')).join('');
    const select = q('dlType');
    if (select) { let group = q('paspDownloadGroup'); if (!group) { group = document.createElement('optgroup'); group.id = 'paspDownloadGroup'; group.label = 'Matriz PASP · Indicadores de seguimiento'; select.appendChild(group); } const previous = select.value; group.innerHTML = '<option value="PASP_ALL">PASP: todos los indicadores de seguimiento</option>' + data.metrics.map(item => '<option value="PASP_' + safe(item.id.toUpperCase()) + '">' + safe(item.label) + '</option>').join(''); if ([...select.options].some(o => o.value === previous)) select.value = previous; }
  }
  async function indicatorDownload(type, date, period, custom) {
    if (!can('DESCARGAS') && !admin()) throw Error('No tiene permiso para descargar indicadores.');
    let from = date, to = date;
    if (period === 'MES') { from = date.slice(0, 7) + '-01'; const end = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0); to = date.slice(0, 7) + '-' + String(end.getDate()).padStart(2, '0'); }
    if (custom) { from = custom.from; to = custom.to; }
    const data = await indicatorData(from, to), key = String(type).replace(/^PASP_/, '').toLowerCase();
    const chosen = key === 'all' ? data.metrics : data.metrics.filter(item => item.id === key);
    if (!chosen.length) throw Error('Seleccione un indicador disponible.');
    const headers = ['Indicador', 'Resultado', 'Unidad', 'Numerador', 'Denominador', 'Meta', 'Fórmula aplicada', 'Definición', 'Responsable', 'Frecuencia', 'Alcance', 'Desde', 'Hasta', 'Base de fecha', 'Modo'];
    const rows = chosen.map(item => [item.label, item.value == null ? 'No evaluable' : item.value, item.unit, item.numerator, item.denominator == null ? 'No aplica' : item.denominator, item.goal, item.formula, item.definition, item.owner, item.frequency, item.scope, from, to, 'Fecha de cirugía', 'SIMULADO']);
    const csvCell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    return { filename: 'PASP_' + key.toUpperCase() + '_' + from + '_' + to + '.csv', csv: '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n'), title:'Indicadores PASP',from,to,period,sections: [{ title: 'Indicadores PASP', headers, rows }], sourceKind: 'SIMULADO' };
  }
  async function exportIndicator(id) {
    const data = await indicatorDownload('PASP_' + id, nowParts().date, 'DIA', { from: q('paspIndicatorsFrom').value, to: q('paspIndicatorsTo').value });
    const url = URL.createObjectURL(new Blob([data.csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a'); link.href = url; link.download = data.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function openAddendum(callId) {
    modal('Adenda a ficha de llamada', '<form id="paspAddendumForm" data-call-id="' + safe(callId) + '">' + notice('Esta adenda conserva el contenido y autor del registro original. No reemplaza otra llamada ni modifica una ficha anterior.') + input('content', 'Contenido de la revisión o aclaración', '', 'textarea', [], true) + input('reason', 'Motivo de la adenda', '', 'textarea', [], true) + '<button type="submit" class="btn">Guardar adenda independiente</button></form>');
  }
  async function saveAddendum(form) {
    const body = { ...formObject(form), episodeId: P.detail.id, expectedVersion: P.detail.version };
    await send('/api/pasp/calls/' + encodeURIComponent(form.dataset.callId) + '/addenda', body); const id = P.detail.id; close(); await openDetail(id);
  }
  async function runAction(action, element) {
    if (action === 'close') { close(element.dataset.modal); return; }
    if (action === 'refresh') await loadPostop();
    if (action === 'new-episode') await openInitial();
    if (action === 'detail') await openDetail(element.dataset.id);
    if (action === 'new-call') openCall(Number(element.dataset.number));
    if (action === 'coordination') openCoordination();
    if (action === 'load-escalations') await loadPaspEscalations();
    if (action === 'escalation') openEscalation(element.dataset.id);
    if (action === 'export') await exportMatrix();
    if (action === 'indicators') await loadIndicators();
    if (action === 'indicators-export') await exportIndicator(element.dataset.id);
    if (action === 'configuration') await loadPaspConfiguration();
    if (action === 'config-tab') renderConfiguration(element.dataset.tab);
    if (action === 'call-record') openCallRecord(element.dataset.id);
    if (action === 'new-addendum') openAddendum(element.dataset.id);
  }
  function initPostopModule() {
    if (P.initialized) return; P.initialized = true;
    if (!q('paspStyles')) { const style = document.createElement('link'); style.id = 'paspStyles'; style.rel = 'stylesheet'; style.href = '/postop.css'; document.head.appendChild(style); }
    mount();
    window.loadPostop = loadPostop; window.loadPaspEscalations = loadPaspEscalations; window.loadPaspConfiguration = loadPaspConfiguration;
    document.addEventListener('click', async event => {
      if (event.target.closest('[data-view="coordinacion"]') && (canCall() || canReadCoordination())) { try { await loadIndicators(); await loadPaspEscalations(); } catch (error) { message(error.message, true); } }
      const button = event.target.closest('[data-pasp]'); if (!button) return;
      event.preventDefault(); if (button.disabled) return; button.disabled = true;
      try { await runAction(button.dataset.pasp, button); } catch (error) { message(error.message, true); } finally { button.disabled = false; }
    });
    const handlers = { paspListConfigForm:saveListConfiguration, paspInitialForm: saveInitial, paspCallForm: saveCall, paspCoordinationForm: saveCoordination, paspEscalationForm: saveEscalation, paspFieldConfigForm: saveFieldConfiguration, paspGuideForm: saveGuide, paspDictionaryForm: saveDictionary, paspRulesForm: saveRules, paspAddendumForm: saveAddendum };
    document.addEventListener('submit', async event => {
      const handler = handlers[event.target.id]; if (!handler) return; event.preventDefault();
      const form = event.target; if (form.dataset.saving === 'true') return; if (!form.reportValidity()) return;
      form.dataset.saving = 'true'; const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = true;
      try { await handler(form); } catch (error) { message(error.message, true); } finally { form.dataset.saving = ''; if (button) button.disabled = false; }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelectorAll('.pasp-modal.show').forEach(element => close(element.id)); });
  }
  window.initPostopModule = initPostopModule;
  window.PaspUI = Object.freeze({ version: '1.1.0', init: initPostopModule, reload: loadPostop, download: indicatorDownload });
}());
