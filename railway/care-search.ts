// Shared, source-grounded educational search. No patient query occurs here.
export function searchCare(catalog,dictionary,query,isPublic=true){
const aliases={id:'ID FICHA',title:'TITULO',state:'ESTADO',approval:'APROBACION',audience:'AUDIENCIA',type:'TIPO',coverage:'COBERTURA',procedures:'PROCEDIMIENTOS',anesthesias:'ANESTESIAS',topics:'TEMAS',keywords:'PALABRAS CLAVE',recommendations:'RECOMENDACIONES',alarms:'SIGNOS DE ALARMA',restrictions:'RESTRICCIONES',source:'FUENTE',pages:'PAGINAS',contentVersion:'VERSION',concept:'CONCEPTO',family:'FAMILIA',synonyms:'SINONIMOS'};
const canonical=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[aliases[key]||key,Array.isArray(value)?value.join('\n'):value]));
catalog=catalog.map(canonical);dictionary=dictionary.map(canonical);
var CARE_GUIDE_SHEETS = Object.freeze({ catalog: 'BD CUIDADOS POP', dictionary: 'DICCIONARIO CUIDADOS POP' });

function careNormalize_(value) {
  return String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function careList_(value) { return String(value || '').split(/[;\n]/).map(function(x) { return x.trim(); }).filter(Boolean); }
function careReadTable_(name,required){return (name===CARE_GUIDE_SHEETS.catalog?catalog:dictionary).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[careNormalize_(key),value])));}
function carePhraseMatches_(query, phrase) {
  var q = ' ' + careNormalize_(query) + ' ', p = careNormalize_(phrase);
  if (!p) return false;
  var at = q.indexOf(' ' + p + ' ');
  while (at !== -1) {
    var before = q.slice(0, at).trim();
    if (!/(?:^| )(?:SIN|NO|NO SE|NO HUBO|NO ME PUSIERON)(?: [A-Z0-9]+){0,3}$/.test(before)) return true;
    at = q.indexOf(' ' + p + ' ', at + 1);
  }
  return false;
}
function careGuidesApp_(token, query, isPublic) {

  query = query || {};
  var text = String(query.q || '').trim().slice(0, 500);
  var dictionary = careReadTable_(CARE_GUIDE_SHEETS.dictionary, ['CONCEPTO','TIPO','FAMILIA','SINONIMOS','ESTADO']).filter(function(row) { return careNormalize_(row.ESTADO) === 'ACTIVO'; });
  var catalog = careReadTable_(CARE_GUIDE_SHEETS.catalog, ['ID FICHA','ESTADO','APROBACION','AUDIENCIA','TIPO','COBERTURA','TITULO','PROCEDIMIENTOS','ANESTESIAS','TEMAS','RECOMENDACIONES','SIGNOS DE ALARMA','RESTRICCIONES','FUENTE','PAGINAS','VERSION']);
  // Active educational records approved or bibliographically reviewed for authorized publication. No patient table is read.
  var audience = isPublic ? 'ACOMPANANTES' : 'ENFERMERIA';
  var visible = catalog.filter(function(row) { return careNormalize_(row.ESTADO) === 'ACTIVO' && ['APROBADO','REVISADO'].indexOf(careNormalize_(row.APROBACION)) !== -1 && ['AMBOS',audience].indexOf(careNormalize_(row.AUDIENCIA)) !== -1 && String(row.RECOMENDACIONES + row['SIGNOS DE ALARMA'] + row.RESTRICCIONES).trim(); });
  var entries = {};
  function addConcept(label, type, family, aliases) {
    var key = careNormalize_(type) + ':' + careNormalize_(label); if (!label || !key) return;
    if (!entries[key]) entries[key] = { value: label, type: careNormalize_(type), family: family || '', aliases: [] };
    entries[key].aliases = entries[key].aliases.concat([label], aliases || []);
  }
  dictionary.forEach(function(row) { addConcept(row.CONCEPTO, row.TIPO, row.FAMILIA, careList_(row.SINONIMOS)); });
  visible.forEach(function(row) {
    [['PROCEDIMIENTOS','PROCEDIMIENTO'],['ANESTESIAS','ANESTESIA'],['TEMAS','TEMA']].forEach(function(pair) { var labels = careList_(row[pair[0]]); labels.forEach(function(label) { addConcept(label, pair[1], '', careNormalize_(row.TIPO) === pair[1] && labels.length === 1 ? careList_(row['PALABRAS CLAVE']) : []); }); });
  });
  var all = Object.keys(entries).map(function(key) { return entries[key]; });
  var procedureOptions = all.filter(function(item) { return item.type === 'PROCEDIMIENTO'; });
  var anesthesiaOptions = all.filter(function(item) { return item.type === 'ANESTESIA'; });
  function selected(value, options) {
    if (!value) return [];
    var hit = options.filter(function(item) { return careNormalize_(item.value) === careNormalize_(value); })[0];
    if (!hit) throw new Error('La selección ya no está disponible. Actualice el catálogo y vuelva a elegir.');
    return [hit];
  }
  var detected = all.filter(function(item) { return item.aliases.some(function(alias) { return carePhraseMatches_(text, alias); }); });
  var procedures = query.procedure ? selected(query.procedure, procedureOptions) : detected.filter(function(item) { return item.type === 'PROCEDIMIENTO'; });
  var anesthesias = query.anesthesia ? (query.anesthesia === 'NINGUNA' ? [] : selected(query.anesthesia, anesthesiaOptions)) : detected.filter(function(item) { return item.type === 'ANESTESIA'; });
  var topics = detected.filter(function(item) { return item.type === 'TEMA'; });
  var regions = detected.filter(function(item) { return item.type === 'REGION'; });
  var candidates = procedures.length ? [] : procedureOptions.filter(function(item) { return regions.some(function(region) { return careNormalize_(region.value) === careNormalize_(item.family); }); });
  function intersects(labels, selected) { return careList_(labels).some(function(label) { return selected.some(function(item) { return careNormalize_(label) === careNormalize_(item.value); }); }); }
  var rows = visible.filter(function(row) {
    var type = careNormalize_(row.TIPO);
    if (type === 'GENERAL') return true;
    if (type === 'PROCEDIMIENTO') return intersects(row.PROCEDIMIENTOS, procedures) && (!String(row.ANESTESIAS).trim() || intersects(row.ANESTESIAS, anesthesias));
    if (type === 'ANESTESIA') return intersects(row.ANESTESIAS, anesthesias) && (!String(row.PROCEDIMIENTOS).trim() || intersects(row.PROCEDIMIENTOS, procedures));
    if (type === 'TEMA') return intersects(row.TEMAS, topics) || careList_(row['PALABRAS CLAVE']).some(function(word) { return carePhraseMatches_(text, word); });
    return false;
  }).map(function(row) { return {
    id: row['ID FICHA'], title: row.TITULO, approval: careNormalize_(row.APROBACION), type: careNormalize_(row.TIPO), coverage: careNormalize_(row.COBERTURA), procedures: careList_(row.PROCEDIMIENTOS), anesthesias: careList_(row.ANESTESIAS),
    recommendations: String(row.RECOMENDACIONES || '').split('\n').filter(Boolean), alarms: String(row['SIGNOS DE ALARMA'] || '').split('\n').filter(Boolean), restrictions: String(row.RESTRICCIONES || '').split('\n').filter(Boolean), source: row.FUENTE, pages: row.PAGINAS, version: row.VERSION
  }; });
  var missing = [];
  procedures.concat(anesthesias).forEach(function(item) {
    var type = item.type;
    if (!rows.some(function(row) { return row.type === type && row.coverage === 'ESPECIFICA' && (type === 'PROCEDIMIENTO' ? row.procedures : row.anesthesias).some(function(label) { return careNormalize_(label) === careNormalize_(item.value); }); })) missing.push(item.value);
  });
  return { query: text, procedures: procedures.map(function(item) { return item.value; }), anesthesias: anesthesias.map(function(item) { return item.value; }), candidates: candidates.map(function(item) { return item.value; }), procedureOptions: procedureOptions.map(function(item) { return { value: item.value, family: item.family }; }), anesthesiaOptions: anesthesiaOptions.map(function(item) { return item.value; }), rows: rows, missing: missing, recognized: detected.length > 0 || procedures.length > 0 || anesthesias.length > 0, checkedAt: new Date().toISOString(), source: { catalog: CARE_GUIDE_SHEETS.catalog, dictionary: CARE_GUIDE_SHEETS.dictionary } };
}

return careGuidesApp_('',query,isPublic);
}
