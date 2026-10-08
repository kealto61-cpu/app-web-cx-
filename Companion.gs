var DEFAULT_COMPANION_MESSAGES_APP = [
  {
    id: 'PREPARACION',
    name: 'Ingreso a preparación',
    trigger: 'PREPARACIÓN',
    text: 'Su familiar ingresó a preparación prequirúrgica.',
    automatic: false,
    enabled: true,
    terminal: false
  },
  {
    id: 'QUIROFANO',
    name: 'Ingreso a quirófano',
    trigger: 'QUIRÓFANO',
    text: 'Su familiar ingresó a quirófano.',
    automatic: false,
    enabled: true,
    terminal: false
  },
  {
    id: 'RECUPERACION',
    name: 'Ingreso a recuperación',
    trigger: 'RECUPERACIÓN',
    text: 'Su familiar ingresó a recuperación postanestésica.',
    automatic: true,
    enabled: true,
    terminal: false
  },
  {
    id: 'ALTA',
    name: 'Paciente de alta',
    trigger: 'ALTA',
    text: 'Su familiar se encuentra de alta. Por favor acérquese a Admisiones.',
    automatic: true,
    enabled: true,
    terminal: true
  },
  {
    id: 'HOSPITALIZACION',
    name: 'Paso a hospitalización',
    trigger: 'HOSPITALIZACIÓN',
    text: 'Su familiar pasó a hospitalización. {{CAMA_FRASE}}',
    automatic: true,
    enabled: true,
    terminal: true
  }
];

function companionMessagesConfig_() {
  var rows = getJsonSystemParameter_(
    'MENSAJES ACOMPAÑANTE',
    DEFAULT_COMPANION_MESSAGES_APP
  );

  if (!Array.isArray(rows) || !rows.length) {
    rows = JSON.parse(JSON.stringify(DEFAULT_COMPANION_MESSAGES_APP));
  }

  var seen = {};
  var clean = [];

  rows.forEach(function(message, index) {
    message = message || {};
    var id = normalizeText_(message.id || ('MSG_' + (index + 1)))
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 40);

    if (!id || seen[id]) return;
    seen[id] = true;

    var trigger = normalizeText_(message.trigger || 'MANUAL').toUpperCase();
    if (['MANUAL'].concat(FLOW_STATES_APP).indexOf(trigger) === -1) {
      trigger = 'MANUAL';
    }

    var terminal = ['ALTA', 'HOSPITALIZACIÓN'].indexOf(trigger) !== -1;

    clean.push({
      id: id,
      name: normalizeText_(message.name || id).slice(0, 80),
      trigger: trigger,
      text: normalizeText_(message.text).slice(0, 300),
      automatic: terminal ? true : Boolean(message.automatic),
      enabled: terminal ? true : message.enabled !== false,
      terminal: terminal
    });
  });

  ['ALTA', 'HOSPITALIZACIÓN'].forEach(function(trigger) {
    if (!clean.some(function(item) { return item.trigger === trigger; })) {
      var original = DEFAULT_COMPANION_MESSAGES_APP.find(function(item) {
        return item.trigger === trigger;
      });
      clean.push(JSON.parse(JSON.stringify(original)));
    }
  });

  return clean;
}

function saveCompanionMessages_(token, body) {
  var session = requireSuperAdmin_(token);
  var rows = body && Array.isArray(body.rows) ? body.rows : [];

  if (!rows.length || rows.length > 30) {
    throw new Error('Configure entre 1 y 30 mensajes.');
  }

  var ids = {};
  var clean = [];

  rows.forEach(function(raw, index) {
    raw = raw || {};
    var id = normalizeText_(raw.id || ('MSG_' + (index + 1)))
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 40);

    if (!id || ids[id]) throw new Error('Hay códigos de mensaje duplicados o inválidos.');
    ids[id] = true;

    var trigger = normalizeText_(raw.trigger || 'MANUAL').toUpperCase();
    if (['MANUAL'].concat(FLOW_STATES_APP).indexOf(trigger) === -1) {
      throw new Error('Momento de envío inválido: ' + trigger);
    }

    var text = normalizeText_(raw.text).slice(0, 300);
    if (!text) throw new Error('Todos los mensajes deben tener texto.');

    var terminal = ['ALTA', 'HOSPITALIZACIÓN'].indexOf(trigger) !== -1;
    clean.push({
      id: id,
      name: normalizeText_(raw.name || id).slice(0, 80),
      trigger: trigger,
      text: text,
      automatic: terminal ? true : Boolean(raw.automatic),
      enabled: terminal ? true : raw.enabled !== false,
      terminal: terminal
    });
  });

  ['ALTA', 'HOSPITALIZACIÓN'].forEach(function(trigger) {
    if (!clean.some(function(item) { return item.trigger === trigger; })) {
      throw new Error('Debe existir un mensaje final para ' + trigger + '.');
    }
  });

  upsertSystemParameter_('MENSAJES ACOMPAÑANTE', clean);

  auditEvent_(
    session,
    'ACTUALIZAR MENSAJES ACOMPAÑANTE',
    'CONFIGURACIÓN',
    '',
    '',
    'Mensajes y disparadores actualizados.',
    'OK'
  );

  return { ok: true, rows: companionMessagesConfig_() };
}

function renderCompanionMessage_(template, row) {
  var cama = normalizeText_(row['CAMA / UBICACIÓN PROGRAMADA']);
  var camaPhrase = cama ?
    'Ubicación asignada: cama ' + cama + '.' :
    'Ubicación pendiente de confirmación por el servicio.';

  return String(template || '')
    .replace(/\{\{CAMA_FRASE\}\}/g, camaPhrase)
    .replace(/\{\{CAMA\}\}/g, cama)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

function setCompanionNotice_(session, id, messageId, origin) {
  var hit = findCaseRow_(id);
  if (!hit) throw new Error('Paciente no encontrado.');

  var messages = companionMessagesConfig_();
  var msg = messages.find(function(item) {
    return item.id === normalizeText_(messageId).toUpperCase() && item.enabled;
  });

  if (!msg) throw new Error('Mensaje de acompañante no disponible.');

  var text = renderCompanionMessage_(msg.text, hit.object);
  if (!text) throw new Error('El mensaje configurado está vacío.');

  var updated = updateCase_(
    session,
    id,
    {
      'AVISO ACOMPAÑANTE': text,
      'FECHA/HORA AVISO ACOMPAÑANTE': new Date(),
      'ORIGEN AVISO ACOMPAÑANTE': normalizeText_(origin || 'MANUAL').toUpperCase(),
      'ID MENSAJE ACOMPAÑANTE': msg.id
    },
    'AVISO ACOMPAÑANTE'
  );

  auditEvent_(
    session,
    'NOTIFICAR ACOMPAÑANTE',
    'ACOMPAÑANTES',
    id,
    hit.object['PACIENTE'] || '',
    msg.id + ' · ' + normalizeText_(origin || 'MANUAL').toUpperCase(),
    'OK'
  );

  return updated;
}

function autoNotifyCompanion_(session, id, stateName) {
  var state = normalizeText_(stateName).toUpperCase();
  var msg = companionMessagesConfig_().find(function(item) {
    return item.enabled && item.automatic && item.trigger === state;
  });

  return msg ? setCompanionNotice_(session, id, msg.id, 'AUTOMÁTICO') : null;
}

function ensureTrackingForDate_(session, dateIso) {
  var date = dateIso || todayIso_();
  var sheet = getSheet_(SHEETS.PROGRAMACION, DATA_SOURCES.MAIN);
  var rows = programmingRowsMatching_(function(value) {
    return formatDate_(value) === date;
  });
  var out = [];

  rows.forEach(function(entry) {
    var row = entry.object;
    if (!trackingActiveState_(row['ESTADO ACTUAL'])) return;

    var patch = {};
    if (!normalizeText_(row['CÓDIGO SEGUIMIENTO'])) {
      patch['CÓDIGO SEGUIMIENTO'] =
        'SEG-' + date.replace(/-/g, '') + '-' +
        Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    }

    if (!/^\d{5}$/.test(normalizeText_(row['TOKEN SEGUIMIENTO']))) {
      patch['TOKEN SEGUIMIENTO'] = uniqueTrackingToken_();
    }

    if (!row['CREADO SEGUIMIENTO']) patch['CREADO SEGUIMIENTO'] = new Date();

    if (Object.keys(patch).length) {
      patch['ÚLTIMA ACTUALIZACIÓN WEB'] = new Date();
      var updated = patchRow_(sheet, entry.rowNumber, patch);
      row = updated;

      auditEvent_(
        session,
        'GENERAR SEGUIMIENTO',
        'ACOMPAÑANTES',
        row['ID CASO'] || '',
        row['PACIENTE'] || '',
        'Código/token temporal creado.',
        'OK'
      );
    }

    out.push(surgeryCaseFromRow_(row));
  });

  return out;
}

function trackingRevision_(row) {
  var fields = ['ÚLTIMA ACTUALIZACIÓN WEB', 'FECHA/HORA ÚLTIMO MOVIMIENTO', 'FECHA/HORA AVISO ACOMPAÑANTE'];
  return fields.reduce(function(latest, field) {
    var value = row[field];
    var time = value instanceof Date ? value.getTime() : (typeof value === 'string' ? Date.parse(value) : NaN);
    return isFinite(time) ? Math.max(latest, time) : latest;
  }, 0);
}

function publicTracking_(code) {
  var token = String(code || '').replace(/\D/g, '').slice(0, 5);
  if (!/^\d{5}$/.test(token)) {
    throw new Error('Ingrese el código temporal de 5 dígitos.');
  }

  var hit = findRowByHeader_(
    SHEETS.PROGRAMACION,
    'TOKEN SEGUIMIENTO',
    token,
    DATA_SOURCES.MAIN
  );

  if (!hit) throw new Error('No se encontró un seguimiento asociado a ese código.');

  var c = surgeryCaseFromRow_(hit.object);
  var terminal = ['ALTA', 'HOSPITALIZACIÓN'].indexOf(c.estado) !== -1 ||
    ['ALTA', 'HOSPITALIZACIÓN'].indexOf(c.destino) !== -1;

  return jsonSafe_({
    ok: true,
    paciente: c.paciente,
    estadoPublico: terminal ? '' : publicState_(c.estado, c.destino),
    actualizado: c.actualizado || c.avisoFecha,
    revision: trackingRevision_(hit.object),
    active: !terminal && trackingActiveState_(c.estado),
    terminal: terminal,
    aviso: c.aviso || '',
    avisoFecha: c.avisoFecha || ''
  });
}

function trackingAdmin_(token, dateIso) {
  var session = requireSession_(token);
  if (!hasPermission_(session, 'OPERACION_VER') &&
      !hasPermission_(session, 'PROGRAMACION_VER')) {
    throw new Error('No tiene permiso para consultar seguimiento.');
  }

  var rows = ensureTrackingForDate_(session, dateIso || todayIso_());

  return jsonSafe_({
    rows: rows.map(function(x) {
      return {
        id: x.id,
        hora: x.hora,
        paciente: x.paciente,
        documento: x.documento,
        edad: x.edad,
        codigo: x.codigo,
        token: x.token,
        estado: x.estado,
        aviso: x.aviso || '',
        avisoFecha: x.avisoFecha || ''
      };
    })
  });
}
