// Intraoperative observations are optional. Missing values never imply that a
// medication was given, that it was not given, or that a duration was zero.
export const DEFAULT_INTRAOPERATIVE_CARD={onEntry:false,onQnoExit:true,onRecoveryExit:false,required:false};
export function normalizeIntraoperativeCard(raw:any={}){
  return Object.fromEntries(Object.entries(DEFAULT_INTRAOPERATIVE_CARD).map(([key,value])=>[key,typeof raw?.[key]==='boolean'?raw[key]:value]));
}
const timeFields={horaAnestesia:'HORA INICIO ANESTESIA',horaFinAnestesia:'HORA FIN ANESTESIA',horaInicioCirugia:'HORA INICIO CIRUGÍA / INCISIÓN',horaFinCirugia:'HORA FIN CIRUGÍA',horaProfilaxis:'HORA ADMINISTRACIÓN PROFILAXIS'};
function minutes(value:any){const m=String(value||'').match(/^(\d{2}):(\d{2})$/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:null;}
function elapsed(a:any,b:any){const x=minutes(a),y=minutes(b);return x===null||y===null?null:(y-x+1440)%1440;}
export function intraoperativePatch(body:any={},previous:any={}){
  const patch:any={};
  for(const [field,column] of Object.entries(timeFields)){
    const value=String(body[field]??'').trim();
    if(!value)continue;
    if(minutes(value)===null)return {error:'Revise el formato de la hora registrada.',patch:{}};
    patch[column]=value;
  }
  const prof=String(body.profilaxisAdministrada||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(prof&&!['SI','NO'].includes(prof))return {error:'Profilaxis no válida.',patch:{}};
  if(prof)patch['PROFILAXIS ADMINISTRADA']=prof==='SI'?'SÍ':'NO';
  const antibiotic=String(body.antibioticoProfilaxis||'').trim();
  if(antibiotic)patch['PROFILAXIS ANTIBIÓTICA / MEDICAMENTO']=antibiotic.slice(0,300);
  const classification=String(body.clasificacionCirugia||'').trim().toUpperCase();
  if(classification&&!['LIMPIA','CONTAMINADA','SUCIA'].includes(classification))return {error:'Clasificación de cirugía no válida.',patch:{}};
  if(classification)patch['CLASIFICACIÓN CIRUGÍA']=classification;
  const merged={...previous,...patch};
  for(const [start,end] of [['HORA INICIO ANESTESIA','HORA FIN ANESTESIA'],['HORA INICIO CIRUGÍA / INCISIÓN','HORA FIN CIRUGÍA']]){
    if((patch[start]||patch[end])&&merged[start]&&merged[end]&&elapsed(merged[start],merged[end])===0)return {error:'La hora de inicio y fin no pueden ser iguales.',patch:{}};
  }
  // An explicit negative selection clears conflicting medication data; a blank
  // selection preserves the existing record instead of silently erasing it.
  if(prof==='NO'){
    patch['PROFILAXIS ANTIBIÓTICA / MEDICAMENTO']='';
    patch['HORA ADMINISTRACIÓN PROFILAXIS']='';
    patch['PROFILAXIS → INCISIÓN (MIN)']='';
  }else if(Object.keys(patch).length){
    const interval=merged['PROFILAXIS ADMINISTRADA']==='SÍ'?elapsed(merged['HORA ADMINISTRACIÓN PROFILAXIS'],merged['HORA INICIO CIRUGÍA / INCISIÓN']):null;
    patch['PROFILAXIS → INCISIÓN (MIN)']=interval??'';
  }
  if(String(body.observacion||'').trim())patch['OBSERVACIÓN INTRAOPERATORIA']=String(body.observacion).trim().slice(0,2000);
  return {patch,error:null};
}
export function requiredIntraoperativeError(record:any={}){
  const fields=['HORA INICIO ANESTESIA','HORA FIN ANESTESIA','HORA INICIO CIRUGÍA / INCISIÓN','HORA FIN CIRUGÍA','PROFILAXIS ADMINISTRADA','CLASIFICACIÓN CIRUGÍA'];
  if(fields.some(field=>!String(record[field]||'').trim()))return 'El registro está configurado como obligatorio. Complete tiempos, profilaxis y clasificación antes de continuar.';
  for(const [start,end] of [['HORA INICIO ANESTESIA','HORA FIN ANESTESIA'],['HORA INICIO CIRUGÍA / INCISIÓN','HORA FIN CIRUGÍA']])if(elapsed(record[start],record[end])===null||elapsed(record[start],record[end])===0)return 'Revise los horarios de anestesia y cirugía.';
  if(!['SÍ','NO'].includes(record['PROFILAXIS ADMINISTRADA']))return 'Seleccione si se administró profilaxis.';
  if(!['LIMPIA','CONTAMINADA','SUCIA'].includes(record['CLASIFICACIÓN CIRUGÍA']))return 'Seleccione la clasificación de cirugía.';
  if(record['PROFILAXIS ADMINISTRADA']==='SÍ'&&(!String(record['PROFILAXIS ANTIBIÓTICA / MEDICAMENTO']||'').trim()||minutes(record['HORA ADMINISTRACIÓN PROFILAXIS'])===null))return 'Registre antibiótico y hora de profilaxis.';
  return null;
}
