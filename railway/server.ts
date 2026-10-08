import {normalizeIntraoperativeCard,intraoperativePatch,requiredIntraoperativeError} from './intraoperative.ts';
import {resolveReportRange} from './report-range.ts';
import {DATABASE_JSON_TYPES,repairSimulationJson} from './database-json.ts';
import postgres from "postgres";
import {initPasp,handlePasp,PASP_PERMISSION_CATALOG} from "./pasp.ts";
import {searchCare} from "./care-search.ts";
import {initApplicationSettings,readApplicationSettings,handleApplicationSettings,handleProphylaxisConfiguration} from "./settings.ts";
import {validateProgrammingAppointment} from "./programming.ts";
import {createReports} from "./reports.ts";
import {resolveSurgeryNurses,surgicalNurseSnapshot} from "./nursing-productivity.ts";
import webpush from "web-push";
import { createHash, createHmac, timingSafeEqual, randomUUID, randomBytes } from "node:crypto";
const dbUrl=Bun.env.DATABASE_URL;if(!dbUrl)throw new Error("DATABASE_URL missing");
const DATA_MODE=String(Bun.env.DATA_MODE||'SIMULATED').toUpperCase();
if(DATA_MODE!=='SIMULATED')throw new Error('Este despliegue requiere DATA_MODE=SIMULATED.');
const setupSql=postgres(dbUrl,{ssl:'require',max:1});await setupSql.unsafe('create schema if not exists qx_simulation');await setupSql.end();
const sql=postgres(dbUrl,{ssl:'require',max:8,types:DATABASE_JSON_TYPES,connection:{search_path:'qx_simulation'}});const PORT=Number(Bun.env.PORT||3000),SESSION_TTL=21600000;
const sessionKey=createHash("sha256").update(dbUrl+"|APP_WEB_CX_SESSION").digest();
const PAGE=await Bun.file("./public/index.html").text();
const SW=await Bun.file("./public/sw.js").text();
const MANIFEST=await Bun.file("./public/manifest.webmanifest").text();
const VAPID_PUBLIC_KEY=String(Bun.env.VAPID_PUBLIC_KEY||"").trim();
const VAPID_PRIVATE_KEY=String(Bun.env.VAPID_PRIVATE_KEY||"").trim();
const VAPID_SUBJECT=String(Bun.env.VAPID_SUBJECT||(Bun.env.RAILWAY_PUBLIC_DOMAIN?("https://"+Bun.env.RAILWAY_PUBLIC_DOMAIN):"https://railway.app")).trim();
const PUSH_READY=false; // Alerts are limited to the open portal, as requested.
if(PUSH_READY)webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
await sql.unsafe(`
  create table if not exists qx_cases(
    case_id text primary key,
    surgery_date text not null default '',
    surgery_time text not null default '',
    document text not null default '',
    procedure_name text not null default '',
    tracking_token text unique,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists qx_cases_date_idx on qx_cases(surgery_date,surgery_time);
  create index if not exists qx_cases_document_idx on qx_cases(document,surgery_date);
  create index if not exists qx_cases_tracking_idx on qx_cases(tracking_token);

  create table if not exists qx_users(
    user_id text primary key,
    username text not null unique,
    payload jsonb not null,
    updated_at timestamptz not null default now()
  );
  create table if not exists qx_roles(
    role_id text primary key,
    payload jsonb not null,
    updated_at timestamptz not null default now()
  );
  create table if not exists qx_system_config(
    param text primary key,
    payload jsonb not null,
    updated_at timestamptz not null default now()
  );
  create table if not exists qx_audit_log(
    id bigserial primary key,
    legacy_row_number integer unique,
    payload jsonb not null,
    created_at timestamptz not null default now()
  );
  create table if not exists qx_movements(
    id bigserial primary key,
    legacy_row_number integer unique,
    case_id text not null default '',
    payload jsonb not null,
    created_at timestamptz not null default now()
  );
  create index if not exists qx_movements_case_idx on qx_movements(case_id,created_at);
  create table if not exists qx_cancellations(
    id bigserial primary key,
    legacy_row_number integer unique,
    case_id text not null default '',
    payload jsonb not null,
    created_at timestamptz not null default now()
  );
  create index if not exists qx_cancellations_case_idx on qx_cancellations(case_id);
  create table if not exists qx_prophylaxis_rules(
    row_order integer primary key,
    payload jsonb not null,
    updated_at timestamptz not null default now()
  );
  create table if not exists qx_reporting_rows(
    dataset text not null,
    row_order integer not null,
    payload jsonb not null,
    updated_at timestamptz not null default now(),
    primary key(dataset,row_order)
  );
  create index if not exists qx_reporting_dataset_idx on qx_reporting_rows(dataset);
  create table if not exists qx_event_outbox(
    id bigserial primary key,
    entity_type text not null,
    entity_id text not null default '',
    action text not null,
    payload jsonb not null,
    created_at timestamptz not null default now()
  );
  create table if not exists companion_push_subscriptions(
    id bigserial primary key,
    case_id text not null,
    endpoint text not null unique,
    subscription jsonb not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
  );
  create index if not exists companion_push_case_idx on companion_push_subscriptions(case_id) where active=true;
`);
await initPasp(sql);await initApplicationSettings(sql);
await repairSimulationJson(sql);
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:Object.assign({"content-type":"application/json; charset=utf-8","cache-control":"no-store"},headers)})}
function html(body,status=200){return new Response(body,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}})}
function textResponse(body,type,status=200){return new Response(body,{status,headers:{"content-type":type,"cache-control":"no-cache"}})}
function b64(v){return Buffer.from(v).toString("base64url")}function sign(p){const b=b64(JSON.stringify(p));return b+"."+createHmac("sha256",sessionKey).update(b).digest("base64url")}
function verify(t){try{const [b,s]=String(t||"").split(".");if(!b||!s)return null;const e=createHmac("sha256",sessionKey).update(b).digest(),g=Buffer.from(s,"base64url");if(e.length!==g.length||!timingSafeEqual(e,g))return null;const p=JSON.parse(Buffer.from(b,"base64url").toString("utf8"));return p.exp&&Date.now()<p.exp?p:null}catch{return null}}
function cookies(req){const o={};(req.headers.get("cookie")||"").split(";").forEach(x=>{const i=x.indexOf("=");if(i>0)o[x.slice(0,i).trim()]=decodeURIComponent(x.slice(i+1).trim())});return o}
function sess(req){return verify(cookies(req).qx_session||"")}function sha(v){return createHash("sha256").update(String(v||"")).digest("hex")}
function secureHash(pin,salt,pepper){let acc=String(pin||"")+"|"+String(salt||"");for(let i=0;i<600;i++)acc=createHmac("sha256",pepper+"|"+salt+"|"+i).update(acc).digest("hex");return acc}
function eqHex(a,b){try{const x=Buffer.from(String(a||""),"hex"),y=Buffer.from(String(b||""),"hex");return x.length===y.length&&timingSafeEqual(x,y)}catch{return false}}
function safeDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||"")?s:new Date().toLocaleDateString("en-CA",{timeZone:"America/Bogota"})}
function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase()}
function nowBog(){return new Date().toLocaleString("sv-SE",{timeZone:"America/Bogota"}).replace("T"," ")}
function monthName(n){return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][n-1]||""}
async function body(req){try{return await req.json()}catch{return {}}}
function mapCase(p){return {id:p["ID CASO"]||"",fecha:p["FECHA CIRUGÍA"]||"",hora:p["HORA PROGRAMADA"]||"",documento:p["DOCUMENTO"]||"",paciente:p["PACIENTE"]||"",edad:p["EDAD"]||"",telefono:p["TELÉFONO"]||"",sexo:p["SEXO"]||"",procedimiento:p["PROCEDIMIENTO"]||"",especialidad:p["ESPECIALIDAD"]||"",especialista:p["ESPECIALISTA"]||"",qno:p["SALA / QNO"]||"",estado:String(p["ESTADO ACTUAL"]||"PROGRAMADO").toUpperCase(),observaciones:p["OBSERVACIONES"]||"",tipoAtencion:p["TIPO DE ATENCIÓN"]||"",operado:["TRUE","SI","SÍ","1"].includes(norm(p["OPERADO"])),destino:p["DESTINO POSTOP"]||"",salida:p["HORA SALIDA RECUPERACIÓN"]||"",observacionEgreso:p["OBSERVACIÓN EGRESO / HOSPITALIZACIÓN"]||"",observacionIntraop:p["OBSERVACIÓN INTRAOPERATORIA"]||"",codigo:p["CÓDIGO SEGUIMIENTO"]||"",token:p["TOKEN SEGUIMIENTO"]||"",actualizado:p["ÚLTIMA ACTUALIZACIÓN WEB"]||p["FECHA/HORA ÚLTIMO MOVIMIENTO"]||"",tPrepa:Number(p["TIEMPO PREPA → QNO (MIN)"]||0)||0,tQnoRec:Number(p["TIEMPO QNO → RECUPERACIÓN (MIN)"]||0)||0,tMuerto:Number(p["INTERVALO ENTRE PACIENTES QNO (MIN)"]||0)||0,prof:p["PROFILAXIS ADMINISTRADA"]||"",profHora:p["HORA ADMINISTRACIÓN PROFILAXIS"]||"",profMin:p["PROFILAXIS → INCISIÓN (MIN)"]??"",clasif:p["CLASIFICACIÓN CIRUGÍA"]||"",antibiotico:p["PROFILAXIS ANTIBIÓTICA / MEDICAMENTO"]||"",cups:p["CUPS"]||"",uvr:p["UVR"]||"",tiempoQx:p["TIEMPO QX ESTIMADO (MIN)"]||"",recursos:p["RECURSOS / ALERTAS PREQUIRÚRGICAS"]||"",cama:p["CAMA / UBICACIÓN PROGRAMADA"]||"",fechaCitaPop:p["FECHA CITA POP"]||"",horaCitaPop:p["HORA CITA POP"]||"",enfermeroJefe:p["ENFERMERO JEFE"]||"",horaAnestesia:p["HORA INICIO ANESTESIA"]||"",horaFinAnestesia:p["HORA FIN ANESTESIA"]||"",horaInicioCirugia:p["HORA INICIO CIRUGÍA / INCISIÓN"]||"",horaFinCirugia:p["HORA FIN CIRUGÍA"]||"",aviso:p["AVISO ACOMPAÑANTE"]||"",avisoFecha:p["FECHA/HORA AVISO ACOMPAÑANTE"]||"",avisoOrigen:p["ORIGEN AVISO ACOMPAÑANTE"]||"",avisoId:p["ID MENSAJE ACOMPAÑANTE"]||""}}
async function saveCasePayload(p){
  const c=mapCase(p);if(!c.id)throw new Error("ID de caso requerido.");
  await sql.unsafe(`insert into qx_cases(case_id,surgery_date,surgery_time,document,procedure_name,tracking_token,payload,updated_at)
    values($1,$2,$3,$4,$5,nullif($6,''),$7::jsonb,now())
    on conflict(case_id) do update set surgery_date=excluded.surgery_date,surgery_time=excluded.surgery_time,document=excluded.document,procedure_name=excluded.procedure_name,tracking_token=excluded.tracking_token,payload=excluded.payload,updated_at=now()`,
    [c.id,c.fecha,c.hora,c.documento,c.procedimiento,c.token,JSON.stringify(p)]);
  return p;
}
async function casesFor(date){const d=safeDate(date);const r=await sql.unsafe("select payload from qx_cases where surgery_date=$1 order by surgery_time",[d]);return r.map(x=>mapCase(x.payload))}
function metrics(rows){const m={total:rows.length,programado:0,preparacion:0,quirofano:0,recuperacion:0,finalizados:0,cancelados:0,operados:0};rows.forEach(r=>{if(r.estado==="PROGRAMADO")m.programado++;if(r.estado==="PREPARACIÓN")m.preparacion++;if(r.estado==="QUIRÓFANO")m.quirofano++;if(r.estado==="RECUPERACIÓN")m.recuperacion++;if(["ALTA","HOSPITALIZACIÓN"].includes(r.estado)||["ALTA","HOSPITALIZACIÓN"].includes(norm(r.destino)))m.finalizados++;if(r.estado==="CANCELADO")m.cancelados++;if(r.operado)m.operados++});return m}
async function findCase(id){const r=await sql.unsafe("select case_id,payload from qx_cases where case_id=$1 limit 1",[String(id||"")]);return r[0]||null}
async function audit(s,action,module,id,detail,result="OK"){try{const p={"MARCA TEMPORAL":nowBog(),"USUARIO":s?.user||"SISTEMA","ROL":s?.role||"SISTEMA","ACCIÓN":action,"ID CASO":id||"","MÓDULO":module,"DETALLE":detail||"","RESULTADO":result,"VERSIÓN":"RAILWAY-5.9-PASP"};await sql.unsafe("insert into qx_audit_log(payload) values($1::jsonb)",[JSON.stringify(p)])}catch{}}
async function outbox(entity,id,action,payload){try{await sql.unsafe("insert into qx_event_outbox(entity_type,entity_id,action,payload) values($1,$2,$3,$4::jsonb)",[entity,id||"",action,JSON.stringify(payload)])}catch{}}
async function updateCase(s,id,patch,action){const hit=await findCase(id);if(!hit)throw new Error("Paciente no encontrado.");const old=hit.payload,p=Object.assign({},old,patch,{"FECHA/HORA ÚLTIMO MOVIMIENTO":nowBog(),"USUARIO ÚLTIMO MOVIMIENTO":s.user||"Railway","ÚLTIMA ACTUALIZACIÓN WEB":nowBog(),"ESTADO ANTERIOR":old["ESTADO ACTUAL"]||""});await saveCasePayload(p);await outbox("PACIENTE",id,action,p);await audit(s,action,"OPERACIÓN",id,JSON.stringify(patch));return mapCase(p)}
async function addMovement(s,p,from,to){const row={"MARCA TEMPORAL":nowBog(),"ID CASO":p["ID CASO"]||"","DOCUMENTO":p["DOCUMENTO"]||"","PACIENTE":p["PACIENTE"]||"","ORIGEN":from||"","DESTINO":to||"","USUARIO":s.user||"","ROL":s.role||"","QNO":p["SALA / QNO"]||"","OBSERVACIÓN":"Railway"};await sql.unsafe("insert into qx_movements(case_id,payload) values($1,$2::jsonb)",[String(p["ID CASO"]||""),JSON.stringify(row)])}
async function uniqueTrackingToken(){
  for(let i=0;i<60;i++){
    const token=String(Math.floor(10000+Math.random()*90000));
    const exists=await sql.unsafe("select 1 from qx_cases where tracking_token=$1 limit 1",[token]);
    if(!exists.length)return token;
  }
  throw new Error("No fue posible generar un token de seguimiento único.");
}
function trackingActiveState(estado){
  return ["PROGRAMADO","PREPARACIÓN","QUIRÓFANO","RECUPERACIÓN"].includes(String(estado||"").toUpperCase());
}
async function ensureTrackingForDate(session,date){
  const d=safeDate(date);
  const records=await sql.unsafe("select case_id,payload from qx_cases where surgery_date=$1 order by surgery_time",[d]);
  const out=[];
  for(const rec of records){
    const p=Object.assign({},rec.payload);
    if(!trackingActiveState(p["ESTADO ACTUAL"]))continue;
    let changed=false;
    if(!String(p["CÓDIGO SEGUIMIENTO"]||"").trim()){
      p["CÓDIGO SEGUIMIENTO"]="SEG-"+d.replace(/-/g,"")+"-"+randomBytes(3).toString("hex").toUpperCase();
      changed=true;
    }
    if(!/^\d{5}$/.test(String(p["TOKEN SEGUIMIENTO"]||"").trim())){
      p["TOKEN SEGUIMIENTO"]=await uniqueTrackingToken();
      changed=true;
    }
    if(!p["CREADO SEGUIMIENTO"]){p["CREADO SEGUIMIENTO"]=nowBog();changed=true;}
    if(changed){
      p["ÚLTIMA ACTUALIZACIÓN WEB"]=nowBog();
      await saveCasePayload(p);
      await outbox("PACIENTE",String(p["ID CASO"]||""),"SEGUIMIENTO_GENERADO",p);
      await audit(session,"GENERAR SEGUIMIENTO","ACOMPAÑANTES",String(p["ID CASO"]||""),"Identificador/token temporal creado");
    }
    out.push(mapCase(p));
  }
  return out;
}
function hhmmMinutes(v){const m=String(v||"").match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?Number(m[1])*60+Number(m[2]):null}
function elapsedMinutes(a,b){const x=hhmmMinutes(a),y=hhmmMinutes(b);if(x===null||y===null)return null;let d=y-x;if(d<0)d+=1440;return d}
async function insertCancellation(session,old,b){
  const now=nowBog(),date=String(old["FECHA CIRUGÍA"]||"");
  const row={
    "ID CASO":old["ID CASO"]||"","CÓDIGO":"CAN-"+String(old["ID CASO"]||"").slice(-8),"MARCA TEMPORAL":now,
    "FECHA CIRUGÍA CANCELADA":date,"HORA PROGRAMADA":old["HORA PROGRAMADA"]||"","PACIENTE":old["PACIENTE"]||"",
    "DOCUMENTO":old["DOCUMENTO"]||"","CUPS":old["CUPS"]||"","UVR":old["UVR"]||"","PROCEDIMIENTO PROGRAMADO":old["PROCEDIMIENTO"]||"",
    "ESPECIALIDAD":old["ESPECIALIDAD"]||"","ESPECIALISTA TRATANTE":old["ESPECIALISTA"]||"","SALA / QNO":old["SALA / QNO"]||"",
    "ESTADO AL CANCELAR":old["ESTADO ACTUAL"]||"","JEFE DE QUIRÓFANOS QUE REALIZA LA CANCELACIÓN EN EL SISTEMA":String(b.jefeTurno||""),
    "MOMENTO DE LA CANCELACIÓN":String(b.momento||""),"CAUSA PRINCIPAL":String(b.causa||""),"MOTIVO ESPECÍFICO":String(b.motivo||""),
    "EVALUACIÓN DEL CASO":"","OPORTUNIDAD DE MEJORA / HALLAZGO DE ENFERMERÍA":String(b.hallazgo||""),"GESTIÓN REALIZADA":String(b.gestion||""),
    "RECURSO / INSUMO / MEDICAMENTO ASOCIADO":"","CLASIFICACIÓN DEL RECURSO":String(b.clasificacionRecurso||""),
    "TIEMPO QX REFERENCIA (MIN)":old["TIEMPO QX ESTIMADO (MIN)"]||"","RETRASO / IMPACTO (MIN)":"","RESULTADO FINAL":"CANCELADA",
    "OPORTUNIDAD DEL REGISTRO":"","PREVENIBLE":String(b.prevenible||""),"OBSERVACIONES":String(b.observaciones||""),
    "CUMPLIMIENTO DEL REGISTRO":"COMPLETO","MES":date?date.slice(5,7):"","AÑO":date?date.slice(0,4):"","ATRIBUIBLE A":String(b.atribuible||"")
  };
  await sql.unsafe("insert into qx_cancellations(case_id,payload) values($1,$2::jsonb)",[String(old["ID CASO"]||""),JSON.stringify(row)]);
  await outbox("CANCELACION",String(old["ID CASO"]||""),"CREAR",row);
}
function pct(a,b){return b?Math.round(a*1000/b)/10:0}function avg(a){const x=a.filter(n=>Number.isFinite(n)&&n>0);return x.length?Math.round(x.reduce((s,n)=>s+n,0)*10/x.length)/10:0}
function publicState(s,d){s=norm(s);d=norm(d);if(s==="PREPARACION")return"En preparación prequirúrgica";if(s==="QUIROFANO")return"En procedimiento quirúrgico";if(s==="RECUPERACION")return"En recuperación postanestésica";if(s==="CANCELADO")return"Procedimiento cancelado";if(s==="ALTA"||d==="ALTA")return"Proceso quirúrgico finalizado · Alta";if(s==="HOSPITALIZACION"||d==="HOSPITALIZACION")return"Proceso quirúrgico finalizado · Hospitalización";return"Programado / pendiente de ingreso"}
function maskName(n){const p=String(n||"").trim().split(/\s+/).filter(Boolean);return p.length?p[0]+" "+p.slice(1).map(x=>x[0]+".").join(" "):"Paciente"}
function railwayAuthPepper(){return createHash("sha256").update(dbUrl+"|QX_RAILWAY_AUTH_V1").digest("hex")}
function validPin(pin) {
  var p = String(pin || '');
  if (!/^[A-Za-z0-9]{4,16}$/.test(p)) return false;
  if (/^([A-Za-z0-9])\1+$/i.test(p)) return false;
  if (/^\d+$/.test(p) && (
    '0123456789012345'.indexOf(p) !== -1 ||
    '9876543210987654'.indexOf(p) !== -1
  )) return false;
  return true;
}

function hashRailwayPin(pin,salt){return secureHash(pin,salt,railwayAuthPepper())}
function verifyUserPinPayload(u,pin){
  const hash=String(u["HASH PIN"]||""),salt=String(u["SALT PIN"]||""),algo=String(u["ALGORITMO PIN"]||"");
  if(algo==="RAILWAY_V1"&&salt)return eqHex(hashRailwayPin(pin,salt),hash);
  if(!salt)return eqHex(sha(pin),hash);
  const pepper=Bun.env.QX_AUTH_PEPPER_V1||"";
  if(!pepper)return false;
  return eqHex(secureHash(pin,salt,pepper),hash);
}
function isAdminSession(s){return ["SUPERADMIN","ADMIN"].includes(String(s?.role||"").toUpperCase())}
async function getRolePermissions(roleCode){
  const role=String(roleCode||"").toUpperCase();
  if(role==="SUPERADMIN")return ["*"];
  const r=await sql.unsafe("select payload from qx_roles");
  const found=r.map(x=>objectPayload(x.payload)).find(p=>String(p["ID ROL"]||"").toUpperCase()===role&&String(p["ESTADO"]||"ACTIVO").toUpperCase()==="ACTIVO");
  if(!found)return [];
  try{const p=JSON.parse(String(found["PERMISOS JSON"]||"[]"));return Array.isArray(p)?p:[]}catch{return []}
}
function hasPermission(perms,permission){return Array.isArray(perms)&&(perms.includes("*")||perms.includes(permission))}
function permissionDenied(permission){return json({error:"No tiene permiso para esta acción.",permission},403)}
function objectPayload(v){
  if(v&&typeof v==="object"&&!Array.isArray(v))return v;
  if(typeof v==="string"){try{const x=JSON.parse(v);return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}catch{}}
  return {};
}
const DEFAULT_QNOS=["QNO 1","QNO 2","QNO 3"];
const DEFAULT_FLOW={
  "PROGRAMADO":["PREPARACIÓN","QUIRÓFANO"],
  "PREPARACIÓN":["PROGRAMADO","QUIRÓFANO"],
  "QUIRÓFANO":["PREPARACIÓN","RECUPERACIÓN","ALTA","HOSPITALIZACIÓN"],
  "RECUPERACIÓN":["ALTA","HOSPITALIZACIÓN"]
};
const FLOW_STATES=["PROGRAMADO","PREPARACIÓN","QUIRÓFANO","RECUPERACIÓN","ALTA","HOSPITALIZACIÓN"];
const DEFAULT_COMPANION_MESSAGES=[
  {id:"PREPARACION",name:"Ingreso a preparación",trigger:"PREPARACIÓN",text:"Su familiar ingresó a preparación prequirúrgica.",automatic:false,enabled:true,terminal:false},
  {id:"QUIROFANO",name:"Ingreso a quirófano",trigger:"QUIRÓFANO",text:"Su familiar ingresó a quirófano.",automatic:false,enabled:true,terminal:false},
  {id:"RECUPERACION",name:"Ingreso a recuperación",trigger:"RECUPERACIÓN",text:"Su familiar ingresó a recuperación postanestésica.",automatic:true,enabled:true,terminal:false},
  {id:"ALTA",name:"Paciente de alta",trigger:"ALTA",text:"Su familiar se encuentra de alta. Por favor acérquese a Admisiones.",automatic:true,enabled:true,terminal:true},
  {id:"HOSPITALIZACION",name:"Paso a hospitalización",trigger:"HOSPITALIZACIÓN",text:"Su familiar pasó a hospitalización. {{CAMA_FRASE}}",automatic:true,enabled:true,terminal:true}
];
async function readSystemConfig(param,fallback){
  const key=String(param||"").toUpperCase();
  const r=await sql.unsafe("select payload from qx_system_config where param=$1 limit 1",[key]);
  if(!r.length)return fallback;
  const raw=r[0].payload["VALOR"];
  if(typeof fallback==="string")return String(raw??fallback);
  try{return JSON.parse(String(raw||""))}catch{return fallback}
}
async function writeSystemConfig(session,param,value){
  const p=String(param||"").toUpperCase(),serialized=typeof value==="string"?value:JSON.stringify(value),now=nowBog();
  const existing=await sql.unsafe("select payload from qx_system_config where param=$1 limit 1",[p]);
  const payload=Object.assign({},existing[0]?.payload||{},{"PARÁMETRO":p,"VALOR":serialized,"ACTUALIZADO EN":now,"ACTUALIZADO POR":session.user||""});
  await sql.unsafe(`insert into qx_system_config(param,payload,updated_at) values($1,$2::jsonb,now())
    on conflict(param) do update set payload=excluded.payload,updated_at=now()`,[p,JSON.stringify(payload)]);
  await outbox("CONFIGURACION",p,"ACTUALIZAR",payload);
  await audit(session,"ACTUALIZAR CONFIGURACIÓN","CONFIGURACIÓN",p,serialized);
}
async function operationalConfig(){
  let qnos=await readSystemConfig("QNO HABILITADOS",DEFAULT_QNOS);
  let flow=await readSystemConfig("FLUJO QUIRÚRGICO",DEFAULT_FLOW);
  if(!Array.isArray(qnos)||!qnos.length)qnos=DEFAULT_QNOS.slice();
  qnos=[...new Set(qnos.map(x=>String(x||"").trim().toUpperCase()).filter(Boolean))];
  if(!flow||typeof flow!=="object"||Array.isArray(flow))flow=JSON.parse(JSON.stringify(DEFAULT_FLOW));
  return {qnos,flow,states:FLOW_STATES,intraoperativeCard:normalizeIntraoperativeCard(await readSystemConfig("TARJETA INTRAOPERATORIA",{}))};
}
async function companionMessagesConfig(){
  let rows=await readSystemConfig("MENSAJES ACOMPAÑANTE",DEFAULT_COMPANION_MESSAGES);
  if(!Array.isArray(rows))rows=JSON.parse(JSON.stringify(DEFAULT_COMPANION_MESSAGES));
  const seen=new Set();
  rows=rows.map((m,i)=>{
    const id=String(m?.id||("MSG_"+(i+1))).trim().toUpperCase().replace(/[^A-Z0-9_]/g,"_").slice(0,40);
    if(!id||seen.has(id))return null;seen.add(id);
    const trigger=String(m?.trigger||"MANUAL").trim().toUpperCase();
    const terminal=["ALTA","HOSPITALIZACIÓN"].includes(trigger);
    return {
      id,
      name:String(m?.name||id).trim().slice(0,80),
      trigger:["MANUAL",...FLOW_STATES].includes(trigger)?trigger:"MANUAL",
      text:String(m?.text||"").trim().slice(0,300),
      automatic:Boolean(m?.automatic),
      enabled:m?.enabled!==false,
      terminal
    };
  }).filter(Boolean);
  return rows;
}
function renderCompanionMessage(template,payload){
  const cama=String(payload?.["CAMA / UBICACIÓN PROGRAMADA"]||"").trim();
  const camaFrase=cama?("Ubicación asignada: cama "+cama+"."):"Ubicación pendiente de confirmación por el servicio.";
  return String(template||"")
    .replace(/\{\{CAMA_FRASE\}\}/g,camaFrase)
    .replace(/\{\{CAMA\}\}/g,cama)
    .replace(/\s{2,}/g," ")
    .replace(/\s+([.,;:])/g,"$1")
    .trim();
}
const trackingAttempts=new Map();
function trackingRateAllowed(req){
  const forwarded=String(req.headers.get("x-forwarded-for")||"").split(",")[0].trim();
  const key=forwarded||String(req.headers.get("cf-connecting-ip")||"unknown");
  const now=Date.now(),windowMs=10*60*1000,limit=30;
  const x=trackingAttempts.get(key);
  if(!x||now-x.started>windowMs){trackingAttempts.set(key,{started:now,count:1});return true}
  x.count++;return x.count<=limit;
}
async function findTrackingByCode(code){
  const r=await sql.unsafe("select payload from qx_cases where tracking_token=$1 limit 1",[String(code||"")]);
  return r[0]?.payload||null;
}
async function sendCompanionPush(caseId,payload,message,messageId){
  if(!PUSH_READY)return {sent:0,disabled:true};
  const rows=await sql.unsafe("select id,subscription from companion_push_subscriptions where case_id=$1 and active=true",[String(caseId||"")]);
  let sent=0;
  const notice=JSON.stringify({
    title:"Clínica AMA · Seguimiento quirúrgico",
    body:"Paciente: "+String(payload?.["PACIENTE"]||"Paciente")+". "+String(message||""),
    tag:"cx-"+String(caseId||""),
    data:{url:"/?follow=1",caseId:String(caseId||""),messageId:String(messageId||"")}
  });
  for(const row of rows){
    try{
      const sub=objectPayload(row.subscription);
      await webpush.sendNotification(sub,notice,{TTL:3600,urgency:"high"});
      sent++;
      await sql.unsafe("update companion_push_subscriptions set last_seen_at=now() where id=$1",[row.id]);
    }catch(e){
      const status=Number(e?.statusCode||0);
      if(status===404||status===410)await sql.unsafe("update companion_push_subscriptions set active=false where id=$1",[row.id]);
      else console.error("PUSH_SEND_ERROR",String(e?.message||e));
    }
  }
  return {sent};
}
async function setCompanionNotice(session,id,messageId,origin="MANUAL"){
  const hit=await findCase(id);if(!hit)throw new Error("Paciente no encontrado.");
  const cfg=await companionMessagesConfig(),msg=cfg.find(x=>x.id===String(messageId||"").toUpperCase()&&x.enabled&&x.text);
  if(!msg)throw new Error("Mensaje de acompañante no disponible.");
  const text=renderCompanionMessage(msg.text,hit.payload);
  if(!text)throw new Error("El mensaje configurado está vacío.");
  const patch={
    "AVISO ACOMPAÑANTE":text,
    "FECHA/HORA AVISO ACOMPAÑANTE":nowBog(),
    "ORIGEN AVISO ACOMPAÑANTE":String(origin||"MANUAL").toUpperCase(),
    "ID MENSAJE ACOMPAÑANTE":msg.id
  };
  const c=await updateCase(session,id,patch,"AVISO ACOMPAÑANTE");
  await audit(session,"NOTIFICAR ACOMPAÑANTE","ACOMPAÑANTES",id,msg.id+" · "+patch["ORIGEN AVISO ACOMPAÑANTE"]);
  await sendCompanionPush(id,hit.payload,text,msg.id);
  return {...c,aviso:text,avisoFecha:patch["FECHA/HORA AVISO ACOMPAÑANTE"],avisoId:msg.id};
}
async function autoNotifyCompanion(session,id,stateName){
  const state=String(stateName||"").toUpperCase(),cfg=await companionMessagesConfig();
  const msg=cfg.find(x=>x.enabled&&x.text&&x.automatic&&x.trigger===state);
  if(!msg)return null;
  return setCompanionNotice(session,id,msg.id,"AUTOMÁTICO");
}
function profSearchScore(q,row){
  if(!q)return 1;
  const fields=[row["ESPECIALIDAD"],row["PROCEDIMIENTO"],row["TÉRMINOS SIMILARES / SINÓNIMOS"],row["CUPS / GRUPO"]].map(norm);
  const hay=fields.join(" | ");let score=0;
  if(hay.includes(q))score+=100;
  const stop=new Set(["DE","DEL","LA","EL","LOS","LAS","EN","CON","Y","POR","PARA","VIA"]);
  const tokens=q.split(/\s+/).filter(t=>t.length>=3&&!stop.has(t));
  tokens.forEach(t=>{if(hay.includes(t))score+=10});
  if(fields[1]===q)score+=200;
  if(fields[2].includes(q))score+=50;
  return score;
}
async function findUserById(id){
  const r=await sql.unsafe("select user_id,payload from qx_users where user_id=$1 limit 1",[String(id||"")]);
  return r[0]||null;
}
async function patchUserRow(userId,payload){
  const id=String(payload?.["ID USUARIO"]||userId||""),username=String(payload?.["USUARIO"]||"").trim().toLowerCase();
  if(!id||!username)throw new Error("Usuario inválido.");
  await sql.unsafe(`insert into qx_users(user_id,username,payload,updated_at) values($1,$2,$3::jsonb,now())
    on conflict(user_id) do update set username=excluded.username,payload=excluded.payload,updated_at=now()`,[id,username,JSON.stringify(payload)]);
}
async function seedSimulation(){
  await sql.unsafe(`create table if not exists case_attachments(id uuid primary key,case_id text not null default '',upload_context text not null,original_name text not null,mime_type text not null,size_bytes bigint not null,sha256 text not null,content_base64 text not null,metadata jsonb not null,uploaded_by text not null,created_at timestamptz not null default now())`);
  const pin=String(Bun.env.DEMO_ADMIN_PIN||'');if(!validPin(pin))throw new Error('DEMO_ADMIN_PIN missing');
  const salt='SIMULATION-ADMIN-V1',user={'ID USUARIO':'DEMO-ADMIN','USUARIO':'demo','NOMBRE':'Coordinación de prueba','ROL':'SUPERADMIN','ESTADO':'ACTIVO','HASH PIN':hashRailwayPin(pin,salt),'SALT PIN':salt,'ALGORITMO PIN':'RAILWAY_V1','VERSIÓN SESIÓN':'1','CAMBIO PIN REQUERIDO':'NO'};
  await sql.unsafe("insert into qx_users(user_id,username,payload) values('DEMO-ADMIN','demo',$1::jsonb) on conflict(user_id) do nothing",[JSON.stringify(user)]);
  const role={'ID ROL':'SUPERADMIN','NOMBRE':'Superadministrador','ESTADO':'ACTIVO','PERMISOS JSON':'["*"]','SISTEMA':'SI'};
  await sql.unsafe("insert into qx_roles(role_id,payload) values('SUPERADMIN',$1::jsonb) on conflict do nothing",[JSON.stringify(role)]);
  const today=safeDate(''),count=await sql.unsafe('select count(*)::int as n from qx_cases');
  if(count[0].n===0){
    for(let i=1;i<=6;i++){
      const stateName=['PROGRAMADO','PREPARACIÓN','QUIRÓFANO','RECUPERACIÓN','ALTA','HOSPITALIZACIÓN'][i-1],p={'ID CASO':'DEMO-QX-'+i,'FECHA CIRUGÍA':today,'HORA PROGRAMADA':String(6+i).padStart(2,'0')+':00','DOCUMENTO':'DEMO-DOC-'+i,'PACIENTE':'PACIENTE FICTICIO '+i,'TELÉFONO':'','PROCEDIMIENTO':['Artroscopia de hombro','Colecistectomía laparoscópica','Cistoscopia','Histeroscopia','Reparación del manguito rotador','Hernioplastia inguinal'][i-1],'ESPECIALIDAD':['ORTOPEDIA','CIRUGÍA GENERAL','UROLOGÍA','GINECOLOGÍA','ORTOPEDIA','CIRUGÍA GENERAL'][i-1],'ESPECIALISTA':'ESPECIALISTA DE PRUEBA','SALA / QNO':'QNO '+(1+(i%3)),'CAMA / UBICACIÓN PROGRAMADA':i===6?'DEMO-06':'DEMO-'+i,'ESTADO ACTUAL':stateName,'TIPO DE ATENCIÓN':i===6?'HOSPITALIZADO':'AMBULATORIO','OPERADO':i>=4?'TRUE':'FALSE','DESTINO POSTOP':i>=5?stateName:'','CÓDIGO SEGUIMIENTO':'DEMO-SEG-'+i,'TOKEN SEGUIMIENTO':String(99000+i),'SOURCE KIND':'SIMULADO','OBSERVACIONES':'Datos ficticios para verificar el flujo.','ÚLTIMA ACTUALIZACIÓN WEB':nowBog()};
      await saveCasePayload(p);
    }
  }
  // MCI uses the same field names as the current source, with exclusively synthetic values.
  const year=Number(today.slice(0,4)),month=Number(today.slice(5,7)),days=new Date(year,month,0).getDate(),monthLabel=monthName(month),dataset='BASE ANUAL '+year;
  for(let i=1;i<=days;i++){
    const date=today.slice(0,7)+'-'+String(i).padStart(2,'0'),programadas=i%7===0?0:12,ejecutadas=i%7===0?0:8+i%4;
    const payload={Mes:monthLabel,Fecha:date,'Día':i,'Qx disponibles':3,'Meta diaria':10,'Cirugías programadas netas':programadas,'Cirugías ejecutadas':ejecutadas,'Cumple meta diaria':ejecutadas>=10?'Sí':'No','Diferencia vs meta diaria':ejecutadas-10,'Acumulado mensual':i*10};
    await sql.unsafe('insert into qx_reporting_rows(dataset,row_order,payload) values($1,$2,$3::jsonb) on conflict do nothing',[dataset,month*100+i,JSON.stringify(payload)]);
  }
  const monthly={Mes:monthLabel,Meta:days*10,'Programadas netas':days*12,Ejecutadas:days*10,Cumplimiento:'100%','Tasa realización':'83,3%',Brecha:0,Proyección:days*10,Estado:'SIMULADO'};
  await sql.unsafe("insert into qx_reporting_rows(dataset,row_order,payload) values('RESUMEN ANUAL',$1,$2::jsonb) on conflict do nothing",[month,JSON.stringify(monthly)]);
}

function csvCell(v){const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
await seedSimulation();
Bun.serve({port:PORT,async fetch(req){try{
 const url=new URL(req.url);if(url.pathname==="/health"){await sql.unsafe('select 1');const count=await sql.unsafe('select count(*)::int as n from qx_pasp_care_catalog');return json({ok:true,version:'5.9.4-pasp',dataMode:DATA_MODE,push:false,educationalCards:count[0].n});}if(url.pathname==="/")return html(PAGE);
 if(['/postop.js','/postop.css','/settings.js'].includes(url.pathname))return textResponse(await Bun.file('./public'+url.pathname).text(),url.pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8');
 if(url.pathname==='/api/care-guides-public'&&req.method==='GET'){const catalog=await sql.unsafe('select payload from qx_pasp_care_catalog'),dictionary=await sql.unsafe('select payload from qx_pasp_dictionary');return json(searchCare(catalog.map(r=>r.payload),dictionary.map(r=>r.payload),Object.fromEntries(url.searchParams),true));}
 if(url.pathname==='/api/application-settings/public'){const response=await handleApplicationSettings(req,url,{sql,session:null,json});if(response)return response;}
 if(url.pathname==='/api/pasp/schema'&&req.method==='GET'){const response=await handlePasp(req,url,{sql,session:null,permissions:[],json,audit,outbox,findCase,mapCase,readSystemConfig,writeSystemConfig,readApplicationSettings:()=>readApplicationSettings(sql)});if(response)return response;}
 if(url.pathname==="/sw.js")return textResponse(SW,"application/javascript; charset=utf-8");
 if(url.pathname==="/manifest.webmanifest")return textResponse(MANIFEST,"application/manifest+json; charset=utf-8");
 if(url.pathname==="/api/push/config")return json({enabled:PUSH_READY,publicKey:PUSH_READY?VAPID_PUBLIC_KEY:""});
 if(url.pathname==="/api/push/subscribe"&&req.method==="POST"){
   if(!PUSH_READY)return json({error:"Las notificaciones push no están configuradas."},503);
   if(!trackingRateAllowed(req))return json({error:"Demasiados intentos. Intente nuevamente más tarde."},429);
   const b=await body(req),code=String(b.code||"").replace(/\D/g,"").slice(0,5),subscription=b.subscription;
   if(!/^\d{5}$/.test(code))return json({error:"Código temporal inválido."},400);
   if(!subscription||typeof subscription!=="object"||!String(subscription.endpoint||"").startsWith("https://"))return json({error:"Suscripción push inválida."},400);
   const payload=await findTrackingByCode(code);if(!payload)return json({error:"No se encontró un seguimiento asociado a ese código."},404);
   const c=mapCase(payload),terminal=["ALTA","HOSPITALIZACIÓN","CANCELADO"].includes(c.estado)||["ALTA","HOSPITALIZACIÓN"].includes(String(c.destino||"").toUpperCase());
   if(terminal)return json({error:"El seguimiento de este paciente ya finalizó."},409);
   await sql.unsafe(`insert into companion_push_subscriptions(case_id,endpoint,subscription,active,last_seen_at)
     values($1,$2,$3::jsonb,true,now())
     on conflict(endpoint) do update set case_id=excluded.case_id,subscription=excluded.subscription,active=true,last_seen_at=now()`,
     [c.id,String(subscription.endpoint),JSON.stringify(subscription)]);
   return json({ok:true,patient:c.paciente});
 }
 if(url.pathname==="/api/tracking"){
   if(!trackingRateAllowed(req))return json({error:"Demasiados intentos. Intente nuevamente más tarde."},429);
   const code=String(url.searchParams.get("code")||"").replace(/\D/g,"").slice(0,5);if(!/^\d{5}$/.test(code))return json({error:"Ingrese el código temporal de 5 dígitos."},400);
   const payload=await findTrackingByCode(code);if(!payload)return json({error:"No se encontró un seguimiento asociado a ese código."},404);
   const c=mapCase(payload),terminal=["ALTA","HOSPITALIZACIÓN"].includes(c.estado)||["ALTA","HOSPITALIZACIÓN"].includes(String(c.destino||"").toUpperCase());
   return json({ok:true,paciente:c.paciente,documento:c.documento,estadoPublico:terminal?"":publicState(c.estado,c.destino),actualizado:c.avisoFecha||c.actualizado,active:!terminal&&trackingActiveState(c.estado),terminal,aviso:c.aviso||"",avisoFecha:c.avisoFecha||""});
 }
 if(url.pathname==="/api/login"&&req.method==="POST"){const b=await body(req),u=String(b.user||"").trim().toLowerCase(),pin=String(b.pin||"");const r=await sql.unsafe("select payload from qx_users where username=$1 limit 1",[u]);if(!r.length)return json({error:"Usuario o PIN incorrectos."},401);const x=r[0].payload;if(norm(x["ESTADO"])!=="ACTIVO")return json({error:"Cuenta inactiva."},403);const salt=String(x["SALT PIN"]||""),algo=String(x["ALGORITMO PIN"]||"");if(salt&&algo!=="RAILWAY_V1"&&!Bun.env.QX_AUTH_PEPPER_V1)return json({error:"Esta cuenta antigua requiere migración de autenticación. Un SUPERADMIN puede asignar un nuevo PIN desde Usuarios."},409);const ok=verifyUserPinPayload(x,pin);if(!ok)return json({error:"Usuario o PIN incorrectos."},401);const p={uid:x["ID USUARIO"],user:x["USUARIO"],name:x["NOMBRE"],role:x["ROL"],ver:String(x["VERSIÓN SESIÓN"]||"1"),exp:Date.now()+SESSION_TTL},t=sign(p),permissions=await getRolePermissions(p.role);return json({ok:true,user:p.user,name:p.name,role:p.role,permissions,mustChangePin:norm(x["CAMBIO PIN REQUERIDO"])==="SI",token:sha(t)},200,{"set-cookie":"qx_session="+encodeURIComponent(t)+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600"})}
 if(url.pathname==="/api/logout"&&req.method==="POST")return json({ok:true},200,{"set-cookie":"qx_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"});
 if(url.pathname==="/api/attachment"&&req.method==="POST"){
   const s=sess(req);if(!s)return json({error:"Sesión no autorizada o vencida."},401);
   const account=await findUserById(s.uid);if(!account||norm(account.payload["ESTADO"])!=="ACTIVO"||String(account.payload["VERSIÓN SESIÓN"]||"1")!==String(s.ver||"1")||norm(account.payload["CAMBIO PIN REQUERIDO"])==="SI")return json({error:"Inicie sesión con un acceso vigente antes de cargar soportes."},401);
   const fd=await req.formData(),f=fd.get("file");
   if(!(f instanceof File))return json({error:"No se recibió un archivo válido."},400);
   const max=25*1024*1024;if(f.size>max)return json({error:"El archivo supera el límite de 25 MB."},413);
   const caseId=String(fd.get("caseId")||""),context=String(fd.get("context")||"GENERAL").slice(0,80);
   let metadata={};try{metadata=JSON.parse(String(fd.get("metadata")||"{}"))}catch{}
   const buf=Buffer.from(await f.arrayBuffer()),digest=createHash("sha256").update(buf).digest("hex"),id=randomUUID();
   await sql.unsafe("insert into case_attachments(id,case_id,upload_context,original_name,mime_type,size_bytes,sha256,content_base64,metadata,uploaded_by) values($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)",[id,caseId,context,String(f.name||"archivo").slice(0,255),String(f.type||"application/octet-stream").slice(0,150),f.size,digest,buf.toString("base64"),JSON.stringify(metadata||{}),s.user||""]);
   await audit(s,"CARGA ARCHIVO","ARCHIVOS",caseId,String(f.name||"archivo")+" · "+f.size+" bytes");
   return json({ok:true,id,caseId,context,name:f.name,type:f.type||"application/octet-stream",size:f.size,sha256:digest});
 }
 const s=sess(req);if(!s)return json({error:"Sesión no autorizada o vencida."},401);const account=await findUserById(s.uid);if(!account||norm(account.payload['ESTADO'])!=='ACTIVO'||String(account.payload['VERSIÓN SESIÓN']||'1')!==String(s.ver||'1'))return json({error:'La sesión cambió. Inicie sesión nuevamente.'},401);
 const permissions=await getRolePermissions(account.payload['ROL']);s.role=account.payload['ROL'];const mustChangePin=norm(account.payload['CAMBIO PIN REQUERIDO'])==='SI';
 if(url.pathname==='/api/me')return json({valid:true,user:s.user,name:s.name,role:s.role,permissions,mustChangePin,token:sha(cookies(req).qx_session)});
 if(mustChangePin&&url.pathname!=='/api/change-pin')return json({error:'Debe cambiar el PIN temporal antes de continuar.'},403);
 if(url.pathname==='/api/pasp/operated-cases'&&req.method==='GET'){if(!hasPermission(permissions,'CUIDADOS_POSTOP')&&!hasPermission(permissions,'PASP_LLAMADAS_REGISTRAR'))return permissionDenied('CUIDADOS_POSTOP');const rows=(await casesFor(url.searchParams.get('date')||'')).filter(p=>p.operado);return json({ok:true,rows,sourceKind:'SIMULADO'});}
 if(url.pathname==='/api/prophylaxis-rules'){const response=await handleProphylaxisConfiguration(req,url,{sql,session:s,json});if(response)return response;}
 if(['/api/application-settings','/api/indicator-definitions'].includes(url.pathname)){const response=await handleApplicationSettings(req,url,{sql,session:s,json});if(response)return response;}
 if(url.pathname.startsWith('/api/pasp/')){const response=await handlePasp(req,url,{sql,session:s,permissions,json,audit,outbox,findCase,mapCase,listOperatedCases:async()=>{const rows=await sql.unsafe('select payload from qx_cases order by surgery_date,surgery_time,case_id');return rows.map(r=>mapCase(r.payload)).filter(c=>c.operado)},readSystemConfig,writeSystemConfig,readApplicationSettings:()=>readApplicationSettings(sql)});if(response)return response;}
 if(url.pathname==='/api/care-guides'&&req.method==='GET'){if(!hasPermission(permissions,'CUIDADOS_POSTOP'))return permissionDenied('CUIDADOS_POSTOP');const catalog=await sql.unsafe('select payload from qx_pasp_care_catalog'),dictionary=await sql.unsafe('select payload from qx_pasp_dictionary');return json(searchCare(catalog.map(r=>r.payload),dictionary.map(r=>r.payload),Object.fromEntries(url.searchParams),false));}
 if(['/api/mci','/api/kpi','/api/download','/api/reinterventions'].includes(url.pathname)&&req.method==='GET'){
   const date=safeDate(url.searchParams.get('date')),isDownload=url.pathname==='/api/download',reportRange=isDownload?resolveReportRange(url.searchParams,date):null;
   const monthStart=date.slice(0,7)+'-01',baseFrom=reportRange?.from||date,lookback=new Date(Date.parse(baseFrom+'T12:00:00Z')-30*86400000).toISOString().slice(0,10),end=reportRange?.to||new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0,12)).toISOString().slice(0,10);
   const caseRows=await sql.unsafe('select payload from qx_cases where surgery_date>=$1 and surgery_date<=$2 order by surgery_date,surgery_time',[reportRange?lookback:(lookback<monthStart?lookback:monthStart),end]);
   const reporting=await sql.unsafe('select dataset,payload from qx_reporting_rows where dataset=$1 or (dataset like $2 and dataset>=$3 and dataset<=$4) order by dataset,row_order',['RESUMEN ANUAL','BASE ANUAL %','BASE ANUAL '+baseFrom.slice(0,4),'BASE ANUAL '+end.slice(0,4)]);
   const settings=isDownload?await readApplicationSettings(sql):null;
   const mappedCases=caseRows.map(r=>({...mapCase(r.payload),enfermeroJefeCirugia:String(r.payload['ENFERMERO JEFE CIRUGÍA']||'')}));
   const nursingAudit=(url.pathname==='/api/kpi'||(isDownload&&['KPI_ENFERMERIA','KPI_PRODUCTIVIDAD'].includes(url.searchParams.get('type'))))&&mappedCases.length?await sql.unsafe(`select payload from qx_audit_log where payload->>'ACCIÓN'='MOVER PACIENTE' and payload->>'ID CASO'=any($1::text[]) order by created_at`,[mappedCases.map(c=>c.id)]):[];
   const reports=createReports({cases:resolveSurgeryNurses(mappedCases,nursingAudit.map(r=>r.payload)),reporting,permissions,session:s,config:await operationalConfig(),boardMetrics:metrics,reportRange,indicatorMetadata:settings?.config.indicatorMetadata||{}});
   const key={'/api/mci':'mci','/api/kpi':'kpi','/api/download':'download','/api/reinterventions':'reinterventions'}[url.pathname];
   const result=reports[key]('',reportRange?.from||date,reportRange?.period||url.searchParams.get('period')||'MES',url.searchParams.get('type')||'PROGRAMACION');if(key==='download')await audit(s,'DESCARGA','INDICADORES','',String(url.searchParams.get('type')||'PROGRAMACION')+' '+reportRange.from+' a '+reportRange.to);return json(result);
 }

 if(url.pathname==="/api/config-operativa"&&req.method==="GET"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede acceder a Configuración."},403);
   return json(await operationalConfig());
 }
 if(url.pathname==="/api/config-operativa"&&req.method==="POST"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede modificar la configuración operativa."},403);
   const b=await body(req),qnos=Array.isArray(b.qnos)?[...new Set(b.qnos.map(x=>String(x||"").trim().toUpperCase()).filter(Boolean))]:null,flow=b.flow;
   if(!qnos||!qnos.length)return json({error:"Debe existir al menos un QNO habilitado."},400);
   if(qnos.length>20)return json({error:"Máximo 20 QNO habilitados."},400);
   if(qnos.some(q=>q.length<3||q.length>40))return json({error:"Revise los nombres de QNO."},400);
   if(!flow||typeof flow!=="object"||Array.isArray(flow))return json({error:"Configuración de flujo inválida."},400);
   const clean={};
   for(const from of ["PROGRAMADO","PREPARACIÓN","QUIRÓFANO","RECUPERACIÓN"]){
     const arr=Array.isArray(flow[from])?flow[from]:[];
     clean[from]=[...new Set(arr.map(x=>String(x||"").trim().toUpperCase()).filter(x=>FLOW_STATES.includes(x)&&x!==from))];
   }
   await writeSystemConfig(s,"QNO HABILITADOS",qnos);await writeSystemConfig(s,"FLUJO QUIRÚRGICO",clean);
   if(b.intraoperativeCard!==undefined)await writeSystemConfig(s,"TARJETA INTRAOPERATORIA",normalizeIntraoperativeCard(b.intraoperativeCard));
   return json({ok:true,...await operationalConfig()});
 }
 if(url.pathname==="/api/companion-messages"&&req.method==="GET"){
   if(!(hasPermission(permissions,"OPERACION_VER")||hasPermission(permissions,"OPERACION_GESTIONAR")||String(s.role||"").toUpperCase()==="SUPERADMIN"))return permissionDenied("OPERACION_VER");
   return json({rows:await companionMessagesConfig()});
 }
 if(url.pathname==="/api/companion-messages"&&req.method==="POST"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede configurar mensajes para acompañantes."},403);
   const b=await body(req),rows=Array.isArray(b.rows)?b.rows:[];
   if(!Array.isArray(b.rows)||rows.length>30)return json({error:"Configure una lista de hasta 30 mensajes."},400);
   const clean=[],ids=new Set();
   for(let i=0;i<rows.length;i++){
     const raw=rows[i]||{},id=String(raw.id||("MSG_"+(i+1))).trim().toUpperCase().replace(/[^A-Z0-9_]/g,"_").slice(0,40),trigger=String(raw.trigger||"MANUAL").trim().toUpperCase(),text=String(raw.text||"").trim().slice(0,300);
     if(!id||ids.has(id))return json({error:"Hay códigos de mensaje duplicados o inválidos."},400);ids.add(id);
     if(!["MANUAL",...FLOW_STATES].includes(trigger))return json({error:"Momento de envío inválido: "+trigger},400);
     const terminal=["ALTA","HOSPITALIZACIÓN"].includes(trigger);
     clean.push({id,name:String(raw.name||id).trim().slice(0,80),trigger,text,automatic:Boolean(raw.automatic),enabled:raw.enabled!==false,terminal});
   }
   await writeSystemConfig(s,"MENSAJES ACOMPAÑANTE",clean);
   return json({ok:true,rows:await companionMessagesConfig()});
 }
 if(url.pathname==="/api/companion/notify"&&req.method==="POST"){
   if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");
   const b=await body(req),c=await setCompanionNotice(s,String(b.id||""),String(b.messageId||""),"MANUAL");
   return json({ok:true,case:c});
 }
 if(url.pathname==="/api/change-pin"&&req.method==="POST"){
   const b=await body(req),current=String(b.currentPin||""),next=String(b.newPin||"");
   if(!validPin(next))return json({error:"El nuevo PIN debe tener de 4 a 16 letras y números."},400);
   const hit=await findUserById(s.uid);if(!hit)return json({error:"Usuario no encontrado."},404);
   const u=Object.assign({},hit.payload);if(!verifyUserPinPayload(u,current))return json({error:"PIN actual incorrecto."},401);
   const salt=randomUUID().replace(/-/g,""),version=Number(u["VERSIÓN SESIÓN"]||1)+1;
   u["HASH PIN"]=hashRailwayPin(next,salt);u["SALT PIN"]=salt;u["ALGORITMO PIN"]="RAILWAY_V1";u["PIN ACTUALIZADO EN"]=nowBog();u["CAMBIO PIN REQUERIDO"]="NO";u["VERSIÓN SESIÓN"]=String(version);u["ACTUALIZADO EN"]=nowBog();
   await patchUserRow(hit.user_id,u);await outbox("USUARIO",String(u["ID USUARIO"]||""),"CAMBIO_PIN",{"ID USUARIO":u["ID USUARIO"],"USUARIO":u["USUARIO"],"ACTUALIZADO EN":u["ACTUALIZADO EN"]});await audit(s,"CAMBIO PIN","USUARIOS",String(u["ID USUARIO"]||""),"Cambio de PIN propio");
   return json({ok:true});
 }
 if(url.pathname==="/api/users"&&req.method==="GET"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const r=await sql.unsafe("select user_id,payload from qx_users order by lower(coalesce(payload->>'NOMBRE',payload->>'USUARIO',''))");
   return json({rows:r.map(x=>({id:x.payload["ID USUARIO"]||"",usuario:x.payload["USUARIO"]||"",nombre:x.payload["NOMBRE"]||"",rol:x.payload["ROL"]||"",estado:x.payload["ESTADO"]||"",ultimoIngreso:x.payload["ÚLTIMO INGRESO"]||"",cambioPin:String(x.payload["CAMBIO PIN REQUERIDO"]||"").toUpperCase()==="SI"||String(x.payload["CAMBIO PIN REQUERIDO"]||"").toUpperCase()==="SÍ"}))});
 }
 if(url.pathname==="/api/roles"&&req.method==="GET"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const r=await sql.unsafe("select payload from qx_roles order by role_id");
   return json({rows:r.map(x=>objectPayload(x.payload)).filter(p=>String(p["ESTADO"]||"ACTIVO").toUpperCase()==="ACTIVO").sort((a,b)=>String(a["NOMBRE"]||"").localeCompare(String(b["NOMBRE"]||""))).map(p=>{let perms=[];try{perms=JSON.parse(String(p["PERMISOS JSON"]||"[]"))}catch{}return{id:p["ID ROL"]||"",nombre:p["NOMBRE"]||"",descripcion:p["DESCRIPCIÓN"]||"",permisos:perms,estado:p["ESTADO"]||"ACTIVO",sistema:String(p["SISTEMA"]||"").toUpperCase()==="SI"}})});
 }
 if(url.pathname==="/api/roles-admin"&&req.method==="GET"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede editar roles."},403);
   const r=await sql.unsafe("select role_id,payload from qx_roles order by role_id");
   const catalog=["OPERACION_VER","OPERACION_GESTIONAR","PROGRAMACION_VER","PROGRAMACION_EDITAR","CARGUE_MASIVO","COORDINACION_VER","INDICADORES_VER","DESCARGAS","REPORTES_PDF","USUARIOS_GESTIONAR","REINTERVENCIONES_REVISAR","REINTERVENCIONES_CERRAR","PROFILAXIS_PREQX","CUIDADOS_POSTOP",...PASP_PERMISSION_CATALOG ];
   const rows=r.map(x=>{const p=objectPayload(x.payload);let permisos=[];try{permisos=JSON.parse(String(p["PERMISOS JSON"]||"[]"))}catch{}return{id:p["ID ROL"]||x.role_id||"",nombre:p["NOMBRE"]||"",descripcion:p["DESCRIPCIÓN"]||"",permisos,estado:p["ESTADO"]||"ACTIVO",sistema:String(p["SISTEMA"]||"").toUpperCase()==="SI"}}).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
   return json({rows,catalog});
 }
 if(url.pathname==="/api/roles"&&req.method==="POST"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede crear roles."},403);
   const b=await body(req),id=String(b.id||"").trim().toUpperCase(),nombre=String(b.nombre||"").trim(),descripcion=String(b.descripcion||"").trim(),permisos=Array.isArray(b.permisos)?b.permisos.map(x=>String(x).trim()).filter(Boolean):[];
   if(!/^[A-Z0-9_]{2,40}$/.test(id))return json({error:"El código del rol debe usar letras mayúsculas, números o guion bajo."},400);
   if(!nombre)return json({error:"El nombre del rol es obligatorio."},400);
   const allRoles=await sql.unsafe("select payload from qx_roles");if(allRoles.some(x=>String(objectPayload(x.payload)["ID ROL"]||"").toUpperCase()===id))return json({error:"Ese código de rol ya existe."},409);
   const now=nowBog(),row={"ID ROL":id,"NOMBRE":nombre,"DESCRIPCIÓN":descripcion,"PERMISOS JSON":JSON.stringify(permisos),"ESTADO":"ACTIVO","SISTEMA":"NO","CREADO EN":now,"CREADO POR":s.user,"ACTUALIZADO EN":now,"ACTUALIZADO POR":s.user};
   await sql.unsafe("insert into qx_roles(role_id,payload,updated_at) values($1,$2::jsonb,now())",[id,JSON.stringify(row)]);
   await outbox("ROL",id,"CREAR",row);await audit(s,"CREAR ROL","USUARIOS",id,nombre);
   return json({ok:true,id});
 }
 if(url.pathname==="/api/roles/update"&&req.method==="POST"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede editar roles."},403);
   const b=await body(req),id=String(b.id||"").trim().toUpperCase();
   const roleRows=await sql.unsafe("select role_id,payload from qx_roles order by role_id");const hit=roleRows.map(x=>({role_id:x.role_id,payload:objectPayload(x.payload)})).find(x=>String(x.payload["ID ROL"]||x.role_id||"").toUpperCase()===id);if(!hit)return json({error:"Rol no encontrado."},404);
   const row=Object.assign({},hit.payload),nombre=String(b.nombre??row["NOMBRE"]??"").trim(),descripcion=String(b.descripcion??row["DESCRIPCIÓN"]??"").trim(),estado=String(b.estado??row["ESTADO"]??"ACTIVO").trim().toUpperCase(),permisos=Array.isArray(b.permisos)?b.permisos.map(x=>String(x).trim()).filter(Boolean):[];
   if(id==="SUPERADMIN"){
     row["NOMBRE"]=nombre||"Superadministrador";row["DESCRIPCIÓN"]=descripcion;row["PERMISOS JSON"]=JSON.stringify(["*"]);row["ESTADO"]="ACTIVO";
   }else{
     if(!["ACTIVO","INACTIVO"].includes(estado))return json({error:"Estado inválido."},400);
     row["NOMBRE"]=nombre;row["DESCRIPCIÓN"]=descripcion;row["PERMISOS JSON"]=JSON.stringify(permisos);row["ESTADO"]=estado;
   }
   row["ACTUALIZADO EN"]=nowBog();row["ACTUALIZADO POR"]=s.user;
   await sql.unsafe("update qx_roles set payload=$1::jsonb,updated_at=now() where role_id=$2",[JSON.stringify(row),hit.role_id]);
   await outbox("ROL",id,"EDITAR",row);await audit(s,"EDITAR ROL","USUARIOS",id,row["NOMBRE"]+" · "+row["ESTADO"]);
   return json({ok:true});
 }
 if(url.pathname==="/api/users"&&req.method==="POST"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const b=await body(req),usuario=String(b.usuario||"").trim().toLowerCase(),nombre=String(b.nombre||"").trim(),rol=String(b.rol||"").trim().toUpperCase(),pin=String(b.pin||"");
   if(!/^[a-z0-9._-]{3,40}$/.test(usuario))return json({error:"Usuario inválido. Use 3–40 caracteres: letras, números, punto, guion o guion bajo."},400);
   if(!nombre)return json({error:"El nombre es obligatorio."},400);
   if(!validPin(pin))return json({error:"El PIN debe tener de 4 a 16 letras y números."},400);
   const dup=await sql.unsafe("select 1 from qx_users where username=$1 limit 1",[usuario]);if(dup.length)return json({error:"Ese usuario ya existe."},409);
   const validRoles=await sql.unsafe("select payload from qx_roles");if(!validRoles.some(x=>{const p=objectPayload(x.payload);return String(p["ID ROL"]||"").toUpperCase()===rol&&String(p["ESTADO"]||"ACTIVO").toUpperCase()==="ACTIVO"}))return json({error:"Rol no válido."},400);
   const salt=randomUUID().replace(/-/g,""),id="USR-"+randomUUID().slice(0,8).toUpperCase(),created=nowBog();
   const u={"ID USUARIO":id,"USUARIO":usuario,"NOMBRE":nombre,"ROL":rol,"HASH PIN":hashRailwayPin(pin,salt),"ESTADO":"ACTIVO","CREADO EN":created,"CREADO POR":s.user,"ÚLTIMO INGRESO":"","ACTUALIZADO EN":created,"CAMBIO PIN REQUERIDO":b.forceChange?"SI":"NO","SALT PIN":salt,"PIN ACTUALIZADO EN":created,"INTENTOS FALLIDOS":"0","BLOQUEADO HASTA":"","VERSIÓN SESIÓN":"1","ALGORITMO PIN":"RAILWAY_V1"};
   await sql.unsafe("insert into qx_users(user_id,username,payload,updated_at) values($1,$2,$3::jsonb,now())",[id,usuario,JSON.stringify(u)]);await outbox("USUARIO",id,"CREAR",{"ID USUARIO":id,"USUARIO":usuario,"NOMBRE":nombre,"ROL":rol,"ESTADO":"ACTIVO"});await audit(s,"CREAR USUARIO","USUARIOS",id,usuario+" · "+rol);
   return json({ok:true,id});
 }
 if(url.pathname==="/api/users/update"&&req.method==="POST"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const b=await body(req),hit=await findUserById(b.id);if(!hit)return json({error:"Usuario no encontrado."},404);
   const u=Object.assign({},hit.payload),nombre=String(b.nombre??u["NOMBRE"]??"").trim(),rol=String(b.rol??u["ROL"]??"").trim().toUpperCase(),estado=String(b.estado??u["ESTADO"]??"ACTIVO").trim().toUpperCase();
   if(!["ACTIVO","INACTIVO"].includes(estado))return json({error:"Estado inválido."},400);
   const roleList=await sql.unsafe("select payload from qx_roles");if(!roleList.some(x=>{const p=objectPayload(x.payload);return String(p["ID ROL"]||"").toUpperCase()===rol&&String(p["ESTADO"]||"ACTIVO").toUpperCase()==="ACTIVO"}))return json({error:"Rol no válido o inactivo."},400);
   u["NOMBRE"]=nombre;u["ROL"]=rol;u["ESTADO"]=estado;u["ACTUALIZADO EN"]=nowBog();
   await patchUserRow(hit.user_id,u);await outbox("USUARIO",String(u["ID USUARIO"]||""),"EDITAR",{"ID USUARIO":u["ID USUARIO"],"NOMBRE":nombre,"ROL":rol,"ESTADO":estado});await audit(s,"EDITAR USUARIO","USUARIOS",String(u["ID USUARIO"]||""),nombre+" · "+rol+" · "+estado);
   return json({ok:true});
 }
 if(url.pathname==="/api/users/reset-pin"&&req.method==="POST"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const b=await body(req),pin=String(b.pin||"");if(!validPin(pin))return json({error:"El PIN debe tener de 4 a 16 letras y números."},400);
   const hit=await findUserById(b.id);if(!hit)return json({error:"Usuario no encontrado."},404);
   const u=Object.assign({},hit.payload),salt=randomUUID().replace(/-/g,""),version=Number(u["VERSIÓN SESIÓN"]||1)+1;
   u["HASH PIN"]=hashRailwayPin(pin,salt);u["SALT PIN"]=salt;u["ALGORITMO PIN"]="RAILWAY_V1";u["PIN ACTUALIZADO EN"]=nowBog();u["CAMBIO PIN REQUERIDO"]=b.forceChange?"SI":"NO";u["VERSIÓN SESIÓN"]=String(version);u["ACTUALIZADO EN"]=nowBog();u["INTENTOS FALLIDOS"]="0";u["BLOQUEADO HASTA"]="";
   await patchUserRow(hit.user_id,u);await outbox("USUARIO",String(u["ID USUARIO"]||""),"REINICIAR_PIN",{"ID USUARIO":u["ID USUARIO"],"USUARIO":u["USUARIO"]});await audit(s,"REINICIAR PIN","USUARIOS",String(u["ID USUARIO"]||""),String(u["USUARIO"]||""));
   return json({ok:true});
 }

 if(url.pathname==="/api/tracking-admin"){if(!(hasPermission(permissions,"OPERACION_VER")||hasPermission(permissions,"PROGRAMACION_VER")))return permissionDenied("OPERACION_VER");const rows=await ensureTrackingForDate(s,url.searchParams.get("date")||"");return json({rows:rows.map(x=>({id:x.id,hora:x.hora,paciente:x.paciente,documento:x.documento,edad:x.edad,codigo:x.codigo,token:x.token,estado:x.estado,aviso:x.aviso||"",avisoFecha:x.avisoFecha||""}))})}
 if(url.pathname==="/api/board"){if(!(hasPermission(permissions,"OPERACION_VER")||hasPermission(permissions,"PROGRAMACION_VER")))return permissionDenied("OPERACION_VER");const rows=await casesFor(url.searchParams.get("date")||""),config=await operationalConfig();return json({rows,metrics:metrics(rows),config})}
 if(url.pathname==="/api/case/move"&&req.method==="POST"){if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");
  const b=await body(req),hit=await findCase(b.id);if(!hit)return json({error:"Paciente no encontrado."},404);
  const jefe=String(b.jefeTurno||"").trim();if(!jefe)return json({error:"Debe registrar el Jefe de turno antes de mover al paciente."},400);
  const from=String(hit.payload["ESTADO ACTUAL"]||"PROGRAMADO").toUpperCase(),to=String(b.destino||"").toUpperCase();
  const operational=await operationalConfig(),allowed=operational.flow;
  if(!(allowed[from]||[]).includes(to))return json({error:"Transición no permitida: "+from+" → "+to},409);
  const clinical=intraoperativePatch(b,hit.payload);if(clinical.error)return json({error:clinical.error},400);
  const patch={...clinical.patch,"ESTADO ACTUAL":to,"ENFERMERO JEFE":jefe};
  if(to==="QUIRÓFANO")patch["EN QNO"]="TRUE";
  if(from==="QUIRÓFANO"&&["RECUPERACIÓN","ALTA","HOSPITALIZACIÓN"].includes(to)){
    if(operational.intraoperativeCard.required){const error=requiredIntraoperativeError({...hit.payload,...clinical.patch});if(error)return json({error},400);}
    patch["OPERADO"]="TRUE";
    Object.assign(patch,surgicalNurseSnapshot(hit.payload,jefe));
    if(to==="RECUPERACIÓN")patch["RECUPERACIÓN"]="TRUE";
    if(["ALTA","HOSPITALIZACIÓN"].includes(to)){patch["DESTINO POSTOP"]=to;patch["OBSERVACIÓN EGRESO / HOSPITALIZACIÓN"]=String(b.observacion||"");}
  }
  let c=await updateCase(s,b.id,patch,"MOVER PACIENTE");await addMovement(s,Object.assign({},hit.payload,patch),from,to);const notice=await autoNotifyCompanion(s,b.id,to);if(notice)c=notice;return json(c)
}
 if(url.pathname==="/api/case/intraoperative"&&req.method==="POST"){
  if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");
  const b=await body(req),hit=await findCase(b.id);if(!hit)return json({error:"Paciente no encontrado."},404);
  const clinical=intraoperativePatch(b,hit.payload);if(clinical.error)return json({error:clinical.error},400);
  if(!Object.keys(clinical.patch).length)return json(mapCase(hit.payload));
  return json(await updateCase(s,b.id,clinical.patch,"REGISTRO INTRAOPERATORIO"));
 }
 if(url.pathname==="/api/case/qno"&&req.method==="POST"){if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");const b=await body(req),q=String(b.qno||"").toUpperCase(),jefe=String(b.jefeTurno||"").trim();if(!jefe)return json({error:"Debe registrar el Jefe de turno."},400);const cfg=await operationalConfig();if(!cfg.qnos.includes(q))return json({error:"QNO inválido o no habilitado."},400);return json(await updateCase(s,b.id,{"SALA / QNO":q,"ENFERMERO JEFE":jefe},"CAMBIO QNO"))}
 if(url.pathname==="/api/case/cancel"&&req.method==="POST"){if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");const b=await body(req);if(!String(b.jefeTurno||"").trim())return json({error:"Debe registrar el Jefe de turno."},400);if(!String(b.momento||"").trim()||!String(b.causa||"").trim()||!String(b.motivo||"").trim()||!String(b.atribuible||"").trim())return json({error:"Momento, causa, motivo y atribuibilidad son obligatorios."},400);const hit=await findCase(b.id);if(!hit)return json({error:"Paciente no encontrado."},404);await insertCancellation(s,hit.payload,b);const obs=[b.causa,b.motivo,b.observaciones].filter(Boolean).join(" | ");const c=await updateCase(s,b.id,{"ESTADO ACTUAL":"CANCELADO","CANCELAR":"TRUE","ENFERMERO JEFE":String(b.jefeTurno),"OBSERVACIONES":obs},"CANCELAR PACIENTE");await addMovement(s,Object.assign({},hit.payload,{"ESTADO ACTUAL":"CANCELADO"}),hit.payload["ESTADO ACTUAL"]||"","CANCELADO");return json(c)}
 if(url.pathname==="/api/case/finish"&&req.method==="POST"){
  if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");
  const b=await body(req),d=String(b.destino||"").toUpperCase(),jefe=String(b.jefeTurno||"").trim();
  if(!jefe)return json({error:"Debe registrar el Jefe de turno."},400);
  if(!["ALTA","HOSPITALIZACIÓN"].includes(d))return json({error:"Destino inválido."},400);
  const hit=await findCase(b.id);if(!hit)return json({error:"Paciente no encontrado."},404);
  const from=String(hit.payload["ESTADO ACTUAL"]||"PROGRAMADO").toUpperCase(),cfg=await operationalConfig();
  if(from!=="RECUPERACIÓN"||!(cfg.flow[from]||[]).includes(d))return json({error:"Transición no permitida: "+from+" → "+d},409);
  const clinical=intraoperativePatch(b,hit.payload);if(clinical.error)return json({error:clinical.error},400);
  if(cfg.intraoperativeCard.required){const error=requiredIntraoperativeError({...hit.payload,...clinical.patch});if(error)return json({error},400);}
  let c=await updateCase(s,b.id,{...clinical.patch,"ESTADO ACTUAL":d,"DESTINO POSTOP":d,"HORA SALIDA RECUPERACIÓN":nowBog(),"OBSERVACIÓN EGRESO / HOSPITALIZACIÓN":String(b.observacion||""),"ENFERMERO JEFE":jefe},"CIERRE RECUPERACIÓN");
  const notice=await autoNotifyCompanion(s,b.id,d);if(notice)c=notice;return json(c);
 }
 if(url.pathname==="/api/patient/update"&&req.method==="POST"){if(!hasPermission(permissions,"PROGRAMACION_EDITAR"))return permissionDenied("PROGRAMACION_EDITAR");
   const b=await body(req),ucfg=await operationalConfig();if(b.qno&&!ucfg.qnos.includes(String(b.qno).trim().toUpperCase()))return json({error:"QNO no habilitado."},400);const hit=await findCase(b.id);if(!hit)return json({error:"Paciente no encontrado."},404);
   const p=Object.assign({},hit.payload);const appointment=validateProgrammingAppointment({fechaCitaPop:b.fechaCitaPop??p["FECHA CITA POP"],horaCitaPop:b.horaCitaPop??p["HORA CITA POP"]});if(appointment.error)return json({error:appointment.error},400);
   const mapping={
    fecha:"FECHA CIRUGÍA",hora:"HORA PROGRAMADA",documento:"DOCUMENTO",telefono:"TELÉFONO",paciente:"PACIENTE",edad:"EDAD",sexo:"SEXO",cups:"CUPS",
    procedimiento:"PROCEDIMIENTO",especialidad:"ESPECIALIDAD",especialista:"ESPECIALISTA",qno:"SALA / QNO",tipoAtencion:"TIPO DE ATENCIÓN",
    cama:"CAMA / UBICACIÓN PROGRAMADA",fechaCitaPop:"FECHA CITA POP",horaCitaPop:"HORA CITA POP",uvr:"UVR",tiempoQx:"TIEMPO QX ESTIMADO (MIN)",recursos:"RECURSOS / ALERTAS PREQUIRÚRGICAS",observaciones:"OBSERVACIONES"
   };
   Object.entries(mapping).forEach(([k,h])=>{if(Object.prototype.hasOwnProperty.call(b,k))p[h]=String(b[k]??"").trim()});
   if(!p["FECHA CIRUGÍA"]||!p["HORA PROGRAMADA"]||!p["DOCUMENTO"]||!p["PACIENTE"]||!p["PROCEDIMIENTO"])return json({error:"Fecha, hora, documento, paciente y procedimiento son obligatorios."},400);
   p["FECHA CIRUGÍA"]=safeDate(p["FECHA CIRUGÍA"]);p["PACIENTE"]=String(p["PACIENTE"]).toUpperCase();p["PROCEDIMIENTO"]=String(p["PROCEDIMIENTO"]).toUpperCase();p["ESPECIALIDAD"]=String(p["ESPECIALIDAD"]||"").toUpperCase();p["ESPECIALISTA"]=String(p["ESPECIALISTA"]||"").toUpperCase();p["SALA / QNO"]=String(p["SALA / QNO"]||"").toUpperCase();p["ÚLTIMA ACTUALIZACIÓN WEB"]=nowBog();p["USUARIO ÚLTIMO MOVIMIENTO"]=s.user;
   await saveCasePayload(p);
   await outbox("PACIENTE",String(p["ID CASO"]||""),"EDITAR",p);await audit(s,"EDITAR PACIENTE","PROGRAMACIÓN",String(p["ID CASO"]||""),"Actualización desde Programación");
   return json({ok:true,case:mapCase(p)});
 }
 if(url.pathname==="/api/patient"&&req.method==="POST"){if(!hasPermission(permissions,"PROGRAMACION_EDITAR"))return permissionDenied("PROGRAMACION_EDITAR");const b=await body(req);const appointment=validateProgrammingAppointment(b);if(appointment.error)return json({error:appointment.error},400);const pcfg=await operationalConfig();if(b.qno&&!pcfg.qnos.includes(String(b.qno).trim().toUpperCase()))return json({error:"QNO no habilitado."},400);if(!b.fecha||!b.hora||!b.documento||!b.paciente||!b.procedimiento)return json({error:"Fecha, hora, documento, paciente y procedimiento son obligatorios."},400);const id="QX-"+String(b.fecha).replace(/-/g,"")+"-"+randomBytes(4).toString("hex").toUpperCase(),track="SEG-"+String(b.fecha).replace(/-/g,"")+"-"+randomBytes(3).toString("hex").toUpperCase(),token=await uniqueTrackingToken();const p={"ID CASO":id,"FECHA CIRUGÍA":safeDate(b.fecha),"HORA PROGRAMADA":String(b.hora).slice(0,5),"DOCUMENTO":String(b.documento).trim(),"TELÉFONO":String(b.telefono||"").trim(),"PACIENTE":String(b.paciente).trim().toUpperCase(),"EDAD":b.edad||"","SEXO":b.sexo||"","PROCEDIMIENTO":String(b.procedimiento).trim().toUpperCase(),"ESPECIALIDAD":String(b.especialidad||"").trim().toUpperCase(),"ESPECIALISTA":String(b.especialista||"").trim().toUpperCase(),"SALA / QNO":String(b.qno||"").toUpperCase(),"ESTADO ACTUAL":"PROGRAMADO","OBSERVACIONES":b.observaciones||"","TIPO DE ATENCIÓN":b.tipoAtencion||"","CAMA / UBICACIÓN PROGRAMADA":b.cama||"","FECHA CITA POP":appointment.fechaCitaPop,"HORA CITA POP":appointment.horaCitaPop,"CUPS":b.cups||"","UVR":b.uvr||"","TIEMPO QX ESTIMADO (MIN)":b.tiempoQx||"","RECURSOS / ALERTAS PREQUIRÚRGICAS":b.recursos||"","CÓDIGO SEGUIMIENTO":track,"TOKEN SEGUIMIENTO":token,"CREADO SEGUIMIENTO":nowBog(),"FUENTE DE PROGRAMACIÓN":"RAILWAY","ÚLTIMA ACTUALIZACIÓN WEB":nowBog()};await saveCasePayload(p);await outbox("PACIENTE",id,"CREAR",p);await audit(s,"CREAR PACIENTE","PROGRAMACIÓN",id,"Nuevo paciente");const notice=await autoNotifyCompanion(s,id,"PROGRAMADO");return json({ok:true,id,trackingCode:track,case:notice||mapCase(p)})}
 if(url.pathname==="/api/bulk"&&req.method==="POST"){
  if(!hasPermission(permissions,"CARGUE_MASIVO"))return permissionDenied("CARGUE_MASIVO");
  const b=await body(req),rows=Array.isArray(b.rows)?b.rows:[];if(rows.length>1000)return json({error:"Máximo 1000 filas por cargue."},400);
  const cfg=await operationalConfig();let inserted=0,skipped=0,errors=[];
  for(let idx=0;idx<rows.length;idx++){
    const r=rows[idx]||{};
    if(!r.fecha||!r.hora||!r.paciente||!r.documento||!r.procedimiento){skipped++;errors.push({row:idx+1,error:"Campos obligatorios incompletos"});continue}
    const appointment=validateProgrammingAppointment(r);if(appointment.error){skipped++;errors.push({row:idx+1,error:appointment.error});continue}
    const date=safeDate(r.fecha),qno=String(r.qno||"").trim().toUpperCase();
    if(qno&&!cfg.qnos.includes(qno)){skipped++;errors.push({row:idx+1,error:"QNO no habilitado: "+qno});continue}
    const dup=await sql.unsafe("select 1 from qx_cases where surgery_date=$1 and document=$2 and upper(procedure_name)=$3 limit 1",[date,String(r.documento||""),String(r.procedimiento||"").toUpperCase()]);
    if(dup.length){skipped++;errors.push({row:idx+1,error:"Duplicado"});continue}
    const care=String(r.tipoAtencion||"").trim().toUpperCase(),tipo=care.includes("AMB")?"AMBULATORIO":care.includes("HOSP")?"HOSPITALIZADO":care;
    const id="QX-"+date.replace(/-/g,"")+"-"+randomBytes(4).toString("hex").toUpperCase(),p={
      "ID CASO":id,"FECHA CIRUGÍA":date,"HORA PROGRAMADA":String(r.hora||"").slice(0,5),
      "DOCUMENTO":String(r.documento||"").trim(),"TELÉFONO":String(r.telefono||"").trim(),
      "PACIENTE":String(r.paciente||"").trim().toUpperCase(),"EDAD":r.edad||"","SEXO":String(r.sexo||"").trim().toUpperCase(),
      "CUPS":String(r.cups||"").trim(),"PROCEDIMIENTO":String(r.procedimiento||"").trim().toUpperCase(),
      "ESPECIALIDAD":String(r.especialidad||"").trim().toUpperCase(),"ESPECIALISTA":String(r.especialista||"").trim().toUpperCase(),
      "SALA / QNO":qno,"TIPO DE ATENCIÓN":tipo,"CAMA / UBICACIÓN PROGRAMADA":String(r.cama||"").trim(),
      "FECHA CITA POP":appointment.fechaCitaPop,"HORA CITA POP":appointment.horaCitaPop,
      "TIEMPO QX ESTIMADO (MIN)":String(r.tiempoQx||"").trim(),"OBSERVACIONES":String(r.observaciones||"").trim(),
      "ESTADO ACTUAL":"PROGRAMADO","FUENTE DE PROGRAMACIÓN":"CARGUE RAILWAY",
      "CÓDIGO SEGUIMIENTO":"SEG-"+date.replace(/-/g,"")+"-"+randomBytes(3).toString("hex").toUpperCase(),
      "TOKEN SEGUIMIENTO":await uniqueTrackingToken(),"CREADO SEGUIMIENTO":nowBog(),"ÚLTIMA ACTUALIZACIÓN WEB":nowBog()
    };
    await saveCasePayload(p);
    await outbox("PACIENTE",id,"CARGUE_MASIVO",p);await autoNotifyCompanion(s,id,"PROGRAMADO");inserted++;
  }
  await audit(s,"CARGUE MASIVO","PROGRAMACIÓN","",inserted+" insertados; "+skipped+" omitidos");
  return json({ok:true,inserted,skipped,errors:errors.slice(0,50)})
}
 if(url.pathname==="/api/profilaxis-catalog"){
    if(!hasPermission(permissions,"PROFILAXIS_PREQX"))return permissionDenied("PROFILAXIS_PREQX");
    const q=norm(url.searchParams.get("q")||""),esp=norm(url.searchParams.get("especialidad")||"");
    const rr=await sql.unsafe("select payload from qx_prophylaxis_rules where upper(coalesce(payload->>'ESTADO',''))='ACTIVO' and upper(coalesce(payload->>'APROBACION','REVISADO'))='REVISADO' order by row_order");
    let rows=rr.map(x=>x.payload);
    if(esp)rows=rows.filter(r=>norm(r["ESPECIALIDAD"])===esp);
    rows=rows.map(r=>({r,score:profSearchScore(q,r)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.r);
    return json({rows:rows.slice(0,100).map(r=>({id:r["ID REGLA"]||"",especialidad:r["ESPECIALIDAD"]||"",procedimiento:r["PROCEDIMIENTO"]||"",similares:r["TÉRMINOS SIMILARES / SINÓNIMOS"]||"",antibiotico:r["ANTIBIÓTICO PRIMERA ELECCIÓN"]||"",dosis:r["DOSIS ADULTO"]||"",momento:r["MOMENTO ADMINISTRACIÓN"]||"",consideraciones:r["AJUSTES / CONSIDERACIONES"]||"",fuente:r["FUENTE DOCUMENTAL"]||"",version:r["VERSIÓN"]||"",dilucion:r["DILUCIÓN (FARMACIA)"]||"",administracion:r["ADMINISTRACIÓN (FARMACIA)"]||"",interacciones:r["INTERACCIONES (FARMACIA)"]||"",efectosAdversos:r["EFECTOS ADVERSOS (FARMACIA)"]||""}))})
  }
 if(url.pathname==="/api/profilaxis"){if(!hasPermission(permissions,"PROFILAXIS_PREQX"))return permissionDenied("PROFILAXIS_PREQX");const rows=(await casesFor(url.searchParams.get("date")||"")).filter(x=>x.prof||x.profHora||x.clasif||x.antibiotico),m={total:rows.length,registrada:0,noRegistrada:0,pendiente:0,conMedicamento:0,conTiempo:0};const out=rows.map(x=>({paciente:x.paciente,procedimiento:x.procedimiento,administrada:x.prof,medicamento:x.antibiotico,hora:x.profHora,minutos:x.profMin,clasificacion:x.clasif}));out.forEach(r=>{const a=norm(r.administrada);if(["SI","SÍ"].includes(a))m.registrada++;else if(a==="NO")m.noRegistrada++;else m.pendiente++;if(r.medicamento)m.conMedicamento++;if(String(r.minutos)!=="")m.conTiempo++});return json({rows:out,metrics:m})}
 if(url.pathname==="/api/postop"){if(!hasPermission(permissions,"CUIDADOS_POSTOP"))return permissionDenied("CUIDADOS_POSTOP");const base=(await casesFor(url.searchParams.get("date")||"")).filter(r=>r.operado),rows=base.map(r=>({paciente:r.paciente,procedimiento:r.procedimiento,estado:r.estado,destino:r.destino,salida:r.salida,observacion:r.observacionEgreso,codigo:r.codigo})),m={total:rows.length,alta:0,hospitalizacion:0,recuperacion:0,conSeguimiento:0,pendientes:0};rows.forEach(r=>{const d=norm(r.destino||r.estado);if(d==="ALTA")m.alta++;if(d==="HOSPITALIZACION")m.hospitalizacion++;if(r.estado==="RECUPERACIÓN")m.recuperacion++;if(r.codigo)m.conSeguimiento++;else m.pendientes++});return json({rows,metrics:m})}
 if(url.pathname==="/api/coord"){if(!hasPermission(permissions,"COORDINACION_VER"))return permissionDenied("COORDINACION_VER");const rows=await casesFor(url.searchParams.get("date")||""),m=metrics(rows),by={};rows.forEach(r=>{const k=r.especialidad||"SIN ESPECIALIDAD";if(!by[k])by[k]={especialidad:k,total:0,operados:0,cancelados:0};by[k].total++;if(r.operado)by[k].operados++;if(r.estado==="CANCELADO")by[k].cancelados++});return json({metrics:m,specialties:Object.values(by).sort((a,b)=>b.total-a.total)})}
 if(url.pathname==="/api/kpi"){if(!hasPermission(permissions,"INDICADORES_VER"))return permissionDenied("INDICADORES_VER");const date=safeDate(url.searchParams.get("date")||""),period=String(url.searchParams.get("period")||"MES").toUpperCase();let data;if(period==="DIA")data=await casesFor(date);else{const ym=date.slice(0,7);const r=await sql.unsafe("select payload from qx_cases where left(surgery_date,7)=$1",[ym]);data=r.map(x=>mapCase(x.payload))}const brutas=data.length,canceladas=data.filter(x=>x.estado==="CANCELADO").length,netas=brutas-canceladas,ejecutadas=data.filter(x=>x.operado).length,esp={};data.forEach(r=>{const k=r.especialidad||"SIN ESPECIALIDAD";if(!esp[k])esp[k]={especialidad:k,programadasBrutas:0,canceladas:0,programadasNetas:0,ejecutadas:0,prepa:[],qnoRec:[],muertos:[]};const g=esp[k];g.programadasBrutas++;if(r.estado==="CANCELADO")g.canceladas++;else g.programadasNetas++;if(r.operado)g.ejecutadas++;if(r.tPrepa)g.prepa.push(r.tPrepa);if(r.tQnoRec)g.qnoRec.push(r.tQnoRec);if(r.tMuerto)g.muertos.push(r.tMuerto)});const especialidades=Object.values(esp).map(g=>({especialidad:g.especialidad,programadasBrutas:g.programadasBrutas,canceladas:g.canceladas,programadasNetas:g.programadasNetas,ejecutadas:g.ejecutadas,tasaRealizacion:pct(g.ejecutadas,g.programadasNetas),tasaCancelacion:pct(g.canceladas,g.programadasBrutas),tiempoPrepaQno:avg(g.prepa),tiempoQnoRec:avg(g.qnoRec),tiempoMuerto:avg(g.muertos)})).sort((a,b)=>b.programadasBrutas-a.programadasBrutas);const qs={};data.forEach(r=>{const q=r.qno||"SIN QNO";if(!qs[q])qs[q]={qno:q,t:[],m:[]};if(r.tQnoRec)qs[q].t.push(r.tQnoRec);if(r.tMuerto)qs[q].m.push(r.tMuerto)});const qnos=Object.values(qs).map(q=>({qno:q.qno,tiempoQnoRec:avg(q.t),tiempoMuerto:avg(q.m)}));const causas={};data.filter(x=>x.estado==="CANCELADO").forEach(x=>{const k=x.observaciones||"SIN MOTIVO";causas[k]=(causas[k]||0)+1});return json({summary:{programadasBrutas:brutas,canceladas,programadasNetas:netas,ejecutadas,tasaCancelacion:pct(canceladas,brutas),tasaRealizacion:pct(ejecutadas,netas),tiempoPrepaQno:avg(data.map(x=>x.tPrepa)),tiempoQnoRec:avg(data.map(x=>x.tQnoRec)),tiempoMuerto:avg(data.map(x=>x.tMuerto))},especialidades,qnos,flujo:[{label:"PROGRAMADO",value:data.filter(x=>x.estado==="PROGRAMADO").length},{label:"PREPARACIÓN",value:data.filter(x=>x.estado==="PREPARACIÓN").length},{label:"QUIRÓFANO",value:data.filter(x=>x.estado==="QUIRÓFANO").length},{label:"RECUPERACIÓN",value:data.filter(x=>x.estado==="RECUPERACIÓN").length},{label:"FINALIZADOS",value:data.filter(x=>["ALTA","HOSPITALIZACIÓN"].includes(x.estado)).length},{label:"CANCELADOS",value:canceladas}],cancelaciones:{causas:Object.entries(causas).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)}})}
 if(url.pathname==="/api/mci"){if(!hasPermission(permissions,"INDICADORES_VER"))return permissionDenied("INDICADORES_VER");const date=safeDate(url.searchParams.get("date")||""),y=Number(date.slice(0,4)),m=Number(date.slice(5,7)),mes=monthName(m);const sum=await sql.unsafe("select payload from qx_reporting_rows where dataset='RESUMEN ANUAL' and payload->>'Mes'=$1 order by row_order limit 1",[mes]);const base=await sql.unsafe("select payload from qx_reporting_rows where dataset=$1 and payload->>'Mes'=$2 order by row_order",["BASE ANUAL "+y,mes]);const x=sum[0]?.payload||{};return json({metrics:{mes,meta:x["Meta"]||"0",programadas:x["Programadas netas"]||"0",ejecutadas:x["Ejecutadas"]||"0",cumplimiento:x["Cumplimiento"]||"—",tasaRealizacion:x["Tasa realización"]||"—",brecha:x["Brecha"]||"0",proyeccion:x["Proyección"]||"—",estado:x["Estado"]||"SIN DATOS"},daily:base.map(z=>{const p=z.payload;return{fecha:p["Fecha"]||"",dia:p["Día"]||"",qxDisponibles:p["Qx disponibles"]||"",metaDiaria:p["Meta diaria"]||"",programadas:p["Cirugías programadas netas"]||"",ejecutadas:p["Cirugías ejecutadas"]||"",cumple:p["Cumple meta diaria"]||"",diferencia:p["Diferencia vs meta diaria"]||"",acumulado:p["Acumulado mensual"]||""}})})}
 if(url.pathname==="/api/reinterventions"){if(!hasPermission(permissions,"REINTERVENCIONES_REVISAR"))return permissionDenied("REINTERVENCIONES_REVISAR");const date=safeDate(url.searchParams.get("date")||""),end=new Date(date+"T12:00:00Z"),start=new Date(end.getTime()-30*86400000),a=start.toISOString().slice(0,10);const r=await sql.unsafe("select payload from qx_cases where surgery_date>=$1 and surgery_date<=$2 order by document,surgery_date",[a,date]);const list=r.map(x=>mapCase(x.payload)),by={};list.forEach(x=>{if(x.documento)(by[x.documento]||(by[x.documento]=[])).push(x)});const rows=[];Object.values(by).forEach(arr=>{for(let i=1;i<arr.length;i++){const p=arr[i-1],n=arr[i],d=Math.round((new Date(n.fecha)-new Date(p.fecha))/86400000);if(d>=0&&d<30)rows.push({paciente:n.paciente,documento:n.documento,fechaPrevia:p.fecha,fechaNueva:n.fecha,dias:d,especialidad:n.especialidad})}});return json({total:rows.length,reviewed:0,pending:rows.length,rows})}
 if(url.pathname==="/api/download"){if(!hasPermission(permissions,"DESCARGAS"))return permissionDenied("DESCARGAS");const date=safeDate(url.searchParams.get("date")||""),period=String(url.searchParams.get("period")||"DIA").toUpperCase(),type=String(url.searchParams.get("type")||"PROGRAMACION").toUpperCase();let rows;if(period==="MES"){const ym=date.slice(0,7),r=await sql.unsafe("select payload from qx_cases where left(surgery_date,7)=$1 order by surgery_date,surgery_time",[ym]);rows=r.map(x=>mapCase(x.payload))}else rows=await casesFor(date);if(type==="ACTIVOS")rows=rows.filter(x=>!["ALTA","HOSPITALIZACIÓN","CANCELADO"].includes(x.estado));if(type==="EJECUTADAS")rows=rows.filter(x=>x.operado);if(type==="FINALIZADOS")rows=rows.filter(x=>["ALTA","HOSPITALIZACIÓN"].includes(x.estado));if(type==="CANCELADOS")rows=rows.filter(x=>x.estado==="CANCELADO");const dlCfg=await operationalConfig();if(dlCfg.qnos.includes(type))rows=rows.filter(x=>norm(x.qno)===norm(type));let headers=["Fecha","Hora","Paciente","Documento","Procedimiento","Especialidad","Especialista","QNO","Estado","Tipo atención","Observaciones"],data=rows.map(x=>[x.fecha,x.hora,x.paciente,x.documento,x.procedimiento,x.especialidad,x.especialista,x.qno,x.estado,x.tipoAtencion,x.observaciones]);if(type==="TIEMPOS_QNO"){headers=["Fecha","Hora","Paciente","QNO","Prepa→QNO (min)","QNO→Recuperación (min)","Tiempo muerto QNO (min)"];data=rows.map(x=>[x.fecha,x.hora,x.paciente,x.qno,x.tPrepa,x.tQnoRec,x.tMuerto])}if(type==="PROFILAXIS"){headers=["Fecha","Hora","Paciente","Documento","QNO","Administrada","Medicamento","Hora profilaxis","Minutos a incisión","Clasificación"];data=rows.map(x=>[x.fecha,x.hora,x.paciente,x.documento,x.qno,x.prof,x.antibiotico,x.profHora,x.profMin,x.clasif])}const csv=[headers,...data].map(r=>r.map(csvCell).join(",")).join("\n"),name="Cirugia_"+type.replace(/\s+/g,"_")+"_"+date+".csv";await audit(s,"DESCARGA","REPORTES","",type+" "+period);return new Response("\ufeff"+csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=\""+name+"\"","x-filename":name,"cache-control":"no-store"}})}
 return json({error:"Not found"},404);
}catch(error){console.error('request_failed',error?.code||error?.name||'error');return json({error:error?.status?error.message:'No se pudo completar la acción. Intente nuevamente.'},error?.status||500)} }});
console.log("APP WEB CX Railway 5.9 PASP operational",PORT,"push",PUSH_READY?"enabled":"disabled","storage","domain-separated");
