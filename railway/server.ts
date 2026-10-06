import postgres from "postgres";
import { createHash, createHmac, timingSafeEqual, randomUUID, randomBytes } from "node:crypto";
const dbUrl=Bun.env.DATABASE_URL;if(!dbUrl)throw new Error("DATABASE_URL missing");
const sql=postgres(dbUrl,{ssl:"require",max:8});const PORT=Number(Bun.env.PORT||3000),SESSION_TTL=21600000;
const sessionKey=createHash("sha256").update(dbUrl+"|APP_WEB_CX_SESSION").digest();const PAGE=await Bun.file("./public/index.html").text();
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:Object.assign({"content-type":"application/json; charset=utf-8","cache-control":"no-store"},headers)})}
function html(body,status=200){return new Response(body,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}})}
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
function mapCase(p){return {id:p["ID CASO"]||"",fecha:p["FECHA CIRUGÍA"]||"",hora:p["HORA PROGRAMADA"]||"",documento:p["DOCUMENTO"]||"",paciente:p["PACIENTE"]||"",edad:p["EDAD"]||"",sexo:p["SEXO"]||"",procedimiento:p["PROCEDIMIENTO"]||"",especialidad:p["ESPECIALIDAD"]||"",especialista:p["ESPECIALISTA"]||"",qno:p["SALA / QNO"]||"",estado:String(p["ESTADO ACTUAL"]||"PROGRAMADO").toUpperCase(),observaciones:p["OBSERVACIONES"]||"",tipoAtencion:p["TIPO DE ATENCIÓN"]||"",operado:["TRUE","SI","SÍ","1"].includes(norm(p["OPERADO"])),destino:p["DESTINO POSTOP"]||"",salida:p["HORA SALIDA RECUPERACIÓN"]||"",observacionEgreso:p["OBSERVACIÓN EGRESO / HOSPITALIZACIÓN"]||"",codigo:p["CÓDIGO SEGUIMIENTO"]||"",token:p["TOKEN SEGUIMIENTO"]||"",actualizado:p["ÚLTIMA ACTUALIZACIÓN WEB"]||p["FECHA/HORA ÚLTIMO MOVIMIENTO"]||"",tPrepa:Number(p["TIEMPO PREPA → QNO (MIN)"]||0)||0,tQnoRec:Number(p["TIEMPO QNO → RECUPERACIÓN (MIN)"]||0)||0,tMuerto:Number(p["INTERVALO ENTRE PACIENTES QNO (MIN)"]||0)||0,prof:p["PROFILAXIS ADMINISTRADA"]||"",profHora:p["HORA ADMINISTRACIÓN PROFILAXIS"]||"",profMin:p["PROFILAXIS → INCISIÓN (MIN)"]||"",clasif:p["CLASIFICACIÓN CIRUGÍA"]||"",antibiotico:p["PROFILAXIS ANTIBIÓTICA / MEDICAMENTO"]||"",cups:p["CUPS"]||"",uvr:p["UVR"]||"",tiempoQx:p["TIEMPO QX ESTIMADO (MIN)"]||"",recursos:p["RECURSOS / ALERTAS PREQUIRÚRGICAS"]||"",cama:p["CAMA / UBICACIÓN PROGRAMADA"]||"",enfermeroJefe:p["ENFERMERO JEFE"]||"",horaAnestesia:p["HORA INICIO ANESTESIA"]||"",horaFinAnestesia:p["HORA FIN ANESTESIA"]||"",horaInicioCirugia:p["HORA INICIO CIRUGÍA / INCISIÓN"]||"",horaFinCirugia:p["HORA FIN CIRUGÍA"]||""}}
async function casesFor(date){const d=safeDate(date);const r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and payload->>'FECHA CIRUGÍA'=$1 order by payload->>'HORA PROGRAMADA'",[d]);return r.map(x=>mapCase(x.payload))}
function metrics(rows){const m={total:rows.length,programado:0,preparacion:0,quirofano:0,recuperacion:0,finalizados:0,cancelados:0,operados:0};rows.forEach(r=>{if(r.estado==="PROGRAMADO")m.programado++;if(r.estado==="PREPARACIÓN")m.preparacion++;if(r.estado==="QUIRÓFANO")m.quirofano++;if(r.estado==="RECUPERACIÓN")m.recuperacion++;if(["ALTA","HOSPITALIZACIÓN"].includes(r.estado)||["ALTA","HOSPITALIZACIÓN"].includes(norm(r.destino)))m.finalizados++;if(r.estado==="CANCELADO")m.cancelados++;if(r.operado)m.operados++});return m}
async function nextRow(sheet){const r=await sql.unsafe("select coalesce(max(row_number),1)+1 as n from source_sheets where source_key='MAIN' and sheet_name=$1",[sheet]);return Number(r[0].n||2)}
async function findCase(id){const r=await sql.unsafe("select row_number,payload from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and payload->>'ID CASO'=$1 limit 1",[id]);return r[0]||null}
async function audit(s,action,module,id,detail,result="OK"){try{const rn=await nextRow("LOG AUDITORÍA");const p={"MARCA TEMPORAL":nowBog(),"USUARIO":s?.user||"SISTEMA","ROL":s?.role||"SISTEMA","ACCIÓN":action,"ID CASO":id||"","MÓDULO":module,"DETALLE":detail||"","RESULTADO":result,"VERSIÓN":"RAILWAY-5"};await sql.unsafe("insert into source_sheets(source_key,spreadsheet_id,spreadsheet_title,sheet_name,row_number,payload) values('MAIN','RAILWAY','Railway operational','LOG AUDITORÍA',$1,$2::jsonb)",[rn,JSON.stringify(p)])}catch{}}
async function outbox(entity,id,action,payload){try{await sql.unsafe("insert into sync_outbox(entity_type,entity_id,action,payload) values($1,$2,$3,$4::jsonb)",[entity,id||"",action,JSON.stringify(payload)])}catch{}}
async function updateCase(s,id,patch,action){const hit=await findCase(id);if(!hit)throw new Error("Paciente no encontrado.");const old=hit.payload,p=Object.assign({},old,patch,{"FECHA/HORA ÚLTIMO MOVIMIENTO":nowBog(),"USUARIO ÚLTIMO MOVIMIENTO":s.user||"Railway","ÚLTIMA ACTUALIZACIÓN WEB":nowBog(),"ESTADO ANTERIOR":old["ESTADO ACTUAL"]||""});await sql.unsafe("update source_sheets set payload=$1::jsonb,imported_at=now() where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and row_number=$2",[JSON.stringify(p),hit.row_number]);await outbox("PACIENTE",id,action,p);await audit(s,action,"OPERACIÓN",id,JSON.stringify(patch));return mapCase(p)}
async function addMovement(s,p,from,to){const rn=await nextRow("HISTORIAL MOVIMIENTOS");const row={"MARCA TEMPORAL":nowBog(),"ID CASO":p["ID CASO"]||"","DOCUMENTO":p["DOCUMENTO"]||"","PACIENTE":p["PACIENTE"]||"","ORIGEN":from||"","DESTINO":to||"","USUARIO":s.user||"","ROL":s.role||"","QNO":p["SALA / QNO"]||"","OBSERVACIÓN":"Railway"};await sql.unsafe("insert into source_sheets(source_key,spreadsheet_id,spreadsheet_title,sheet_name,row_number,payload) values('MAIN','RAILWAY','Railway operational','HISTORIAL MOVIMIENTOS',$1,$2::jsonb)",[rn,JSON.stringify(row)])}
async function uniqueTrackingToken(){
  for(let i=0;i<60;i++){
    const token=String(Math.floor(10000+Math.random()*90000));
    const exists=await sql.unsafe("select 1 from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and payload->>'TOKEN SEGUIMIENTO'=$1 limit 1",[token]);
    if(!exists.length)return token;
  }
  throw new Error("No fue posible generar un token de seguimiento único.");
}
function trackingActiveState(estado){
  return ["PROGRAMADO","PREPARACIÓN","QUIRÓFANO","RECUPERACIÓN"].includes(String(estado||"").toUpperCase());
}
async function ensureTrackingForDate(session,date){
  const d=safeDate(date);
  const records=await sql.unsafe("select row_number,payload from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and payload->>'FECHA CIRUGÍA'=$1 order by payload->>'HORA PROGRAMADA'",[d]);
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
      await sql.unsafe("update source_sheets set payload=$1::jsonb,imported_at=now() where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and row_number=$2",[JSON.stringify(p),rec.row_number]);
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
  const rn=await nextRow("CANCELACIONES QX"),now=nowBog(),date=String(old["FECHA CIRUGÍA"]||"");
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
  await sql.unsafe("insert into source_sheets(source_key,spreadsheet_id,spreadsheet_title,sheet_name,row_number,payload) values('MAIN','RAILWAY','Railway operational','CANCELACIONES QX',$1,$2::jsonb)",[rn,JSON.stringify(row)]);
  await outbox("CANCELACION",String(old["ID CASO"]||""),"CREAR",row);
}
function pct(a,b){return b?Math.round(a*1000/b)/10:0}function avg(a){const x=a.filter(n=>Number.isFinite(n)&&n>0);return x.length?Math.round(x.reduce((s,n)=>s+n,0)*10/x.length)/10:0}
function publicState(s,d){s=norm(s);d=norm(d);if(s==="PREPARACION")return"En preparación prequirúrgica";if(s==="QUIROFANO")return"En procedimiento quirúrgico";if(s==="RECUPERACION")return"En recuperación postanestésica";if(s==="CANCELADO")return"Procedimiento cancelado";if(s==="ALTA"||d==="ALTA")return"Proceso quirúrgico finalizado · Alta";if(s==="HOSPITALIZACION"||d==="HOSPITALIZACION")return"Proceso quirúrgico finalizado · Hospitalización";return"Programado / pendiente de ingreso"}
function maskName(n){const p=String(n||"").trim().split(/\s+/).filter(Boolean);return p.length?p[0]+" "+p.slice(1).map(x=>x[0]+".").join(" "):"Paciente"}
function railwayAuthPepper(){return createHash("sha256").update(dbUrl+"|QX_RAILWAY_AUTH_V1").digest("hex")}
function validPin(pin){
  const p=String(pin||"");
  if(!/^\d{6,8}$/.test(p))return false;
  if(/^(\d)\1+$/.test(p))return false;
  if(["123456","654321","1234567","7654321","12345678","87654321","000000","111111"].includes(p))return false;
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
  const r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='ROLES'");
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
async function readSystemConfig(param,fallback){
  const r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='CONFIGURACIÓN SISTEMA' and upper(payload->>'PARÁMETRO')=$1 order by row_number desc limit 1",[String(param||"").toUpperCase()]);
  if(!r.length)return fallback;
  const raw=r[0].payload["VALOR"];
  if(typeof fallback==="string")return String(raw??fallback);
  try{return JSON.parse(String(raw||""))}catch{return fallback}
}
async function writeSystemConfig(session,param,value){
  const p=String(param||"").toUpperCase(),serialized=typeof value==="string"?value:JSON.stringify(value),now=nowBog();
  const hit=await sql.unsafe("select row_number,payload from source_sheets where source_key='MAIN' and sheet_name='CONFIGURACIÓN SISTEMA' and upper(payload->>'PARÁMETRO')=$1 order by row_number desc limit 1",[p]);
  const payload={"PARÁMETRO":p,"VALOR":serialized,"ACTUALIZADO EN":now,"ACTUALIZADO POR":session.user||""};
  if(hit.length){
    const merged=Object.assign({},hit[0].payload,payload);
    await sql.unsafe("update source_sheets set payload=$1::jsonb,imported_at=now() where source_key='MAIN' and sheet_name='CONFIGURACIÓN SISTEMA' and row_number=$2",[JSON.stringify(merged),hit[0].row_number]);
  }else{
    const rn=await nextRow("CONFIGURACIÓN SISTEMA");
    await sql.unsafe("insert into source_sheets(source_key,spreadsheet_id,spreadsheet_title,sheet_name,row_number,payload) values('MAIN','RAILWAY','Railway operational','CONFIGURACIÓN SISTEMA',$1,$2::jsonb)",[rn,JSON.stringify(payload)]);
  }
  await outbox("CONFIGURACION",p,"ACTUALIZAR",payload);
  await audit(session,"ACTUALIZAR CONFIGURACIÓN","CONFIGURACIÓN",p,serialized);
}
async function operationalConfig(){
  let qnos=await readSystemConfig("QNO HABILITADOS",DEFAULT_QNOS);
  let flow=await readSystemConfig("FLUJO QUIRÚRGICO",DEFAULT_FLOW);
  if(!Array.isArray(qnos)||!qnos.length)qnos=DEFAULT_QNOS.slice();
  qnos=[...new Set(qnos.map(x=>String(x||"").trim().toUpperCase()).filter(Boolean))];
  if(!flow||typeof flow!=="object"||Array.isArray(flow))flow=JSON.parse(JSON.stringify(DEFAULT_FLOW));
  return {qnos,flow,states:FLOW_STATES};
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
  const r=await sql.unsafe("select row_number,payload from source_sheets where source_key='MAIN' and sheet_name='USUARIOS' and payload->>'ID USUARIO'=$1 limit 1",[String(id||"")]);
  return r[0]||null;
}
async function patchUserRow(rowNumber,payload){
  await sql.unsafe("update source_sheets set payload=$1::jsonb,imported_at=now() where source_key='MAIN' and sheet_name='USUARIOS' and row_number=$2",[JSON.stringify(payload),rowNumber]);
}
function csvCell(v){const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
Bun.serve({port:PORT,async fetch(req){
 const url=new URL(req.url);if(url.pathname==="/health")return json({ok:true});if(url.pathname==="/")return html(PAGE);
 if(url.pathname==="/api/tracking"){const code=String(url.searchParams.get("code")||"").replace(/\D/g,"").slice(0,5);if(!/^\d{5}$/.test(code))return json({error:"Ingrese el código temporal de 5 dígitos."},400);const r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and payload->>'TOKEN SEGUIMIENTO'=$1 limit 1",[code]);if(!r.length)return json({error:"No se encontró un seguimiento activo asociado a ese código."},404);const c=mapCase(r[0].payload);return json({ok:true,estadoPublico:publicState(c.estado,c.destino),actualizado:c.actualizado,active:trackingActiveState(c.estado)})}
 if(url.pathname==="/api/login"&&req.method==="POST"){const b=await body(req),u=String(b.user||"").trim().toLowerCase(),pin=String(b.pin||"");const r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='USUARIOS' and lower(payload->>'USUARIO')=$1 limit 1",[u]);if(!r.length)return json({error:"Usuario o PIN incorrectos."},401);const x=r[0].payload;if(norm(x["ESTADO"])!=="ACTIVO")return json({error:"Cuenta inactiva."},403);const salt=String(x["SALT PIN"]||""),algo=String(x["ALGORITMO PIN"]||"");if(salt&&algo!=="RAILWAY_V1"&&!Bun.env.QX_AUTH_PEPPER_V1)return json({error:"Esta cuenta antigua requiere migración de autenticación. Un SUPERADMIN puede asignar un nuevo PIN desde Usuarios."},409);const ok=verifyUserPinPayload(x,pin);if(!ok)return json({error:"Usuario o PIN incorrectos."},401);const p={uid:x["ID USUARIO"],user:x["USUARIO"],name:x["NOMBRE"],role:x["ROL"],exp:Date.now()+SESSION_TTL},t=sign(p),permissions=await getRolePermissions(p.role);return json({ok:true,user:p.user,name:p.name,role:p.role,permissions},200,{"set-cookie":"qx_session="+encodeURIComponent(t)+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600"})}
 if(url.pathname==="/api/logout"&&req.method==="POST")return json({ok:true},200,{"set-cookie":"qx_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"});
 if(url.pathname==="/api/attachment"&&req.method==="POST"){
   const s=sess(req);if(!s)return json({error:"Sesión no autorizada o vencida."},401);
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
 const s=sess(req);if(!s)return json({error:"Sesión no autorizada o vencida."},401);const permissions=await getRolePermissions(s.role);if(url.pathname==="/api/me")return json({valid:true,user:s.user,name:s.name,role:s.role,permissions});
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
   return json({ok:true,qnos,flow:clean,states:FLOW_STATES});
 }
 if(url.pathname==="/api/change-pin"&&req.method==="POST"){
   const b=await body(req),current=String(b.currentPin||""),next=String(b.newPin||"");
   if(!validPin(next))return json({error:"El nuevo PIN debe tener 6–8 dígitos y no puede ser una secuencia simple o repetida."},400);
   const hit=await findUserById(s.uid);if(!hit)return json({error:"Usuario no encontrado."},404);
   const u=Object.assign({},hit.payload);if(!verifyUserPinPayload(u,current))return json({error:"PIN actual incorrecto."},401);
   const salt=randomUUID().replace(/-/g,""),version=Number(u["VERSIÓN SESIÓN"]||1)+1;
   u["HASH PIN"]=hashRailwayPin(next,salt);u["SALT PIN"]=salt;u["ALGORITMO PIN"]="RAILWAY_V1";u["PIN ACTUALIZADO EN"]=nowBog();u["CAMBIO PIN REQUERIDO"]="NO";u["VERSIÓN SESIÓN"]=String(version);u["ACTUALIZADO EN"]=nowBog();
   await patchUserRow(hit.row_number,u);await outbox("USUARIO",String(u["ID USUARIO"]||""),"CAMBIO_PIN",{"ID USUARIO":u["ID USUARIO"],"USUARIO":u["USUARIO"],"ACTUALIZADO EN":u["ACTUALIZADO EN"]});await audit(s,"CAMBIO PIN","USUARIOS",String(u["ID USUARIO"]||""),"Cambio de PIN propio");
   return json({ok:true});
 }
 if(url.pathname==="/api/users"&&req.method==="GET"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const r=await sql.unsafe("select row_number,payload from source_sheets where source_key='MAIN' and sheet_name='USUARIOS' order by lower(coalesce(payload->>'NOMBRE',payload->>'USUARIO',''))");
   return json({rows:r.map(x=>({id:x.payload["ID USUARIO"]||"",usuario:x.payload["USUARIO"]||"",nombre:x.payload["NOMBRE"]||"",rol:x.payload["ROL"]||"",estado:x.payload["ESTADO"]||"",ultimoIngreso:x.payload["ÚLTIMO INGRESO"]||"",cambioPin:String(x.payload["CAMBIO PIN REQUERIDO"]||"").toUpperCase()==="SI"||String(x.payload["CAMBIO PIN REQUERIDO"]||"").toUpperCase()==="SÍ"}))});
 }
 if(url.pathname==="/api/roles"&&req.method==="GET"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='ROLES' order by row_number");
   return json({rows:r.map(x=>objectPayload(x.payload)).filter(p=>String(p["ESTADO"]||"ACTIVO").toUpperCase()==="ACTIVO").sort((a,b)=>String(a["NOMBRE"]||"").localeCompare(String(b["NOMBRE"]||""))).map(p=>{let perms=[];try{perms=JSON.parse(String(p["PERMISOS JSON"]||"[]"))}catch{}return{id:p["ID ROL"]||"",nombre:p["NOMBRE"]||"",descripcion:p["DESCRIPCIÓN"]||"",permisos:perms,estado:p["ESTADO"]||"ACTIVO",sistema:String(p["SISTEMA"]||"").toUpperCase()==="SI"}})});
 }
 if(url.pathname==="/api/roles-admin"&&req.method==="GET"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede editar roles."},403);
   const r=await sql.unsafe("select row_number,payload from source_sheets where source_key='MAIN' and sheet_name='ROLES' order by row_number");
   const catalog=["OPERACION_VER","OPERACION_GESTIONAR","PROGRAMACION_VER","PROGRAMACION_EDITAR","CARGUE_MASIVO","COORDINACION_VER","INDICADORES_VER","DESCARGAS","REPORTES_PDF","USUARIOS_GESTIONAR","REINTERVENCIONES_REVISAR","REINTERVENCIONES_CERRAR","PROFILAXIS_PREQX","CUIDADOS_POSTOP","SINCRONIZAR"];
   const rows=r.map(x=>{const p=objectPayload(x.payload);let permisos=[];try{permisos=JSON.parse(String(p["PERMISOS JSON"]||"[]"))}catch{}return{rowNumber:x.row_number,id:p["ID ROL"]||"",nombre:p["NOMBRE"]||"",descripcion:p["DESCRIPCIÓN"]||"",permisos,estado:p["ESTADO"]||"ACTIVO",sistema:String(p["SISTEMA"]||"").toUpperCase()==="SI"}}).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
   return json({rows,catalog});
 }
 if(url.pathname==="/api/roles"&&req.method==="POST"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede crear roles."},403);
   const b=await body(req),id=String(b.id||"").trim().toUpperCase(),nombre=String(b.nombre||"").trim(),descripcion=String(b.descripcion||"").trim(),permisos=Array.isArray(b.permisos)?b.permisos.map(x=>String(x).trim()).filter(Boolean):[];
   if(!/^[A-Z0-9_]{2,40}$/.test(id))return json({error:"El código del rol debe usar letras mayúsculas, números o guion bajo."},400);
   if(!nombre)return json({error:"El nombre del rol es obligatorio."},400);
   const allRoles=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='ROLES'");if(allRoles.some(x=>String(objectPayload(x.payload)["ID ROL"]||"").toUpperCase()===id))return json({error:"Ese código de rol ya existe."},409);
   const rn=await nextRow("ROLES"),now=nowBog(),row={"ID ROL":id,"NOMBRE":nombre,"DESCRIPCIÓN":descripcion,"PERMISOS JSON":JSON.stringify(permisos),"ESTADO":"ACTIVO","SISTEMA":"NO","CREADO EN":now,"CREADO POR":s.user,"ACTUALIZADO EN":now,"ACTUALIZADO POR":s.user};
   await sql.unsafe("insert into source_sheets(source_key,spreadsheet_id,spreadsheet_title,sheet_name,row_number,payload) values('MAIN','RAILWAY','Railway operational','ROLES',$1,case when jsonb_typeof($2::jsonb)='string' then (($2::jsonb)#>>'{}')::jsonb else $2::jsonb end)",[rn,JSON.stringify(row)]);
   await outbox("ROL",id,"CREAR",row);await audit(s,"CREAR ROL","USUARIOS",id,nombre);
   return json({ok:true,id});
 }
 if(url.pathname==="/api/roles/update"&&req.method==="POST"){
   if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede editar roles."},403);
   const b=await body(req),id=String(b.id||"").trim().toUpperCase();
   const roleRows=await sql.unsafe("select row_number,payload from source_sheets where source_key='MAIN' and sheet_name='ROLES' order by row_number");const hit=roleRows.map(x=>({row_number:x.row_number,payload:objectPayload(x.payload)})).find(x=>String(x.payload["ID ROL"]||"").toUpperCase()===id);if(!hit)return json({error:"Rol no encontrado."},404);
   const row=Object.assign({},hit.payload),nombre=String(b.nombre??row["NOMBRE"]??"").trim(),descripcion=String(b.descripcion??row["DESCRIPCIÓN"]??"").trim(),estado=String(b.estado??row["ESTADO"]??"ACTIVO").trim().toUpperCase(),permisos=Array.isArray(b.permisos)?b.permisos.map(x=>String(x).trim()).filter(Boolean):[];
   if(id==="SUPERADMIN"){
     row["NOMBRE"]=nombre||"Superadministrador";row["DESCRIPCIÓN"]=descripcion;row["PERMISOS JSON"]=JSON.stringify(["*"]);row["ESTADO"]="ACTIVO";
   }else{
     if(!["ACTIVO","INACTIVO"].includes(estado))return json({error:"Estado inválido."},400);
     row["NOMBRE"]=nombre;row["DESCRIPCIÓN"]=descripcion;row["PERMISOS JSON"]=JSON.stringify(permisos);row["ESTADO"]=estado;
   }
   row["ACTUALIZADO EN"]=nowBog();row["ACTUALIZADO POR"]=s.user;
   await sql.unsafe("update source_sheets set payload=case when jsonb_typeof($1::jsonb)='string' then (($1::jsonb)#>>'{}')::jsonb else $1::jsonb end,imported_at=now() where source_key='MAIN' and sheet_name='ROLES' and row_number=$2",[JSON.stringify(row),hit.row_number]);
   await outbox("ROL",id,"EDITAR",row);await audit(s,"EDITAR ROL","USUARIOS",id,row["NOMBRE"]+" · "+row["ESTADO"]);
   return json({ok:true});
 }
 if(url.pathname==="/api/users"&&req.method==="POST"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const b=await body(req),usuario=String(b.usuario||"").trim().toLowerCase(),nombre=String(b.nombre||"").trim(),rol=String(b.rol||"").trim().toUpperCase(),pin=String(b.pin||"");
   if(!/^[a-z0-9._-]{3,40}$/.test(usuario))return json({error:"Usuario inválido. Use 3–40 caracteres: letras, números, punto, guion o guion bajo."},400);
   if(!nombre)return json({error:"El nombre es obligatorio."},400);
   if(!validPin(pin))return json({error:"El PIN debe tener 6–8 dígitos y no puede ser una secuencia simple o repetida."},400);
   const dup=await sql.unsafe("select 1 from source_sheets where source_key='MAIN' and sheet_name='USUARIOS' and lower(payload->>'USUARIO')=$1 limit 1",[usuario]);if(dup.length)return json({error:"Ese usuario ya existe."},409);
   const validRoles=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='ROLES'");if(!validRoles.some(x=>{const p=objectPayload(x.payload);return String(p["ID ROL"]||"").toUpperCase()===rol&&String(p["ESTADO"]||"ACTIVO").toUpperCase()==="ACTIVO"}))return json({error:"Rol no válido."},400);
   const salt=randomUUID().replace(/-/g,""),id="USR-"+randomUUID().slice(0,8).toUpperCase(),rn=await nextRow("USUARIOS"),created=nowBog();
   const u={"ID USUARIO":id,"USUARIO":usuario,"NOMBRE":nombre,"ROL":rol,"HASH PIN":hashRailwayPin(pin,salt),"ESTADO":"ACTIVO","CREADO EN":created,"CREADO POR":s.user,"ÚLTIMO INGRESO":"","ACTUALIZADO EN":created,"CAMBIO PIN REQUERIDO":b.forceChange?"SI":"NO","SALT PIN":salt,"PIN ACTUALIZADO EN":created,"INTENTOS FALLIDOS":"0","BLOQUEADO HASTA":"","VERSIÓN SESIÓN":"1","ALGORITMO PIN":"RAILWAY_V1"};
   await sql.unsafe("insert into source_sheets(source_key,spreadsheet_id,spreadsheet_title,sheet_name,row_number,payload) values('MAIN','RAILWAY','Railway operational','USUARIOS',$1,$2::jsonb)",[rn,JSON.stringify(u)]);await outbox("USUARIO",id,"CREAR",{"ID USUARIO":id,"USUARIO":usuario,"NOMBRE":nombre,"ROL":rol,"ESTADO":"ACTIVO"});await audit(s,"CREAR USUARIO","USUARIOS",id,usuario+" · "+rol);
   return json({ok:true,id});
 }
 if(url.pathname==="/api/users/update"&&req.method==="POST"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const b=await body(req),hit=await findUserById(b.id);if(!hit)return json({error:"Usuario no encontrado."},404);
   const u=Object.assign({},hit.payload),nombre=String(b.nombre??u["NOMBRE"]??"").trim(),rol=String(b.rol??u["ROL"]??"").trim().toUpperCase(),estado=String(b.estado??u["ESTADO"]??"ACTIVO").trim().toUpperCase();
   if(!["ACTIVO","INACTIVO"].includes(estado))return json({error:"Estado inválido."},400);
   const roleList=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='ROLES'");if(!roleList.some(x=>{const p=objectPayload(x.payload);return String(p["ID ROL"]||"").toUpperCase()===rol&&String(p["ESTADO"]||"ACTIVO").toUpperCase()==="ACTIVO"}))return json({error:"Rol no válido o inactivo."},400);
   u["NOMBRE"]=nombre;u["ROL"]=rol;u["ESTADO"]=estado;u["ACTUALIZADO EN"]=nowBog();
   await patchUserRow(hit.row_number,u);await outbox("USUARIO",String(u["ID USUARIO"]||""),"EDITAR",{"ID USUARIO":u["ID USUARIO"],"NOMBRE":nombre,"ROL":rol,"ESTADO":estado});await audit(s,"EDITAR USUARIO","USUARIOS",String(u["ID USUARIO"]||""),nombre+" · "+rol+" · "+estado);
   return json({ok:true});
 }
 if(url.pathname==="/api/users/reset-pin"&&req.method==="POST"){if(String(s.role||"").toUpperCase()!=="SUPERADMIN")return json({error:"Solo SUPERADMIN puede administrar la configuración y los accesos."},403);
   const b=await body(req),pin=String(b.pin||"");if(!validPin(pin))return json({error:"El PIN debe tener 6–8 dígitos y no puede ser una secuencia simple o repetida."},400);
   const hit=await findUserById(b.id);if(!hit)return json({error:"Usuario no encontrado."},404);
   const u=Object.assign({},hit.payload),salt=randomUUID().replace(/-/g,""),version=Number(u["VERSIÓN SESIÓN"]||1)+1;
   u["HASH PIN"]=hashRailwayPin(pin,salt);u["SALT PIN"]=salt;u["ALGORITMO PIN"]="RAILWAY_V1";u["PIN ACTUALIZADO EN"]=nowBog();u["CAMBIO PIN REQUERIDO"]=b.forceChange?"SI":"NO";u["VERSIÓN SESIÓN"]=String(version);u["ACTUALIZADO EN"]=nowBog();u["INTENTOS FALLIDOS"]="0";u["BLOQUEADO HASTA"]="";
   await patchUserRow(hit.row_number,u);await outbox("USUARIO",String(u["ID USUARIO"]||""),"REINICIAR_PIN",{"ID USUARIO":u["ID USUARIO"],"USUARIO":u["USUARIO"]});await audit(s,"REINICIAR PIN","USUARIOS",String(u["ID USUARIO"]||""),String(u["USUARIO"]||""));
   return json({ok:true});
 }

 if(url.pathname==="/api/tracking-admin"){if(!(hasPermission(permissions,"OPERACION_VER")||hasPermission(permissions,"PROGRAMACION_VER")))return permissionDenied("OPERACION_VER");const rows=await ensureTrackingForDate(s,url.searchParams.get("date")||"");return json({rows:rows.map(x=>({id:x.id,hora:x.hora,paciente:x.paciente,documento:x.documento,edad:x.edad,codigo:x.codigo,token:x.token,estado:x.estado}))})}
 if(url.pathname==="/api/board"){if(!(hasPermission(permissions,"OPERACION_VER")||hasPermission(permissions,"PROGRAMACION_VER")))return permissionDenied("OPERACION_VER");const rows=await casesFor(url.searchParams.get("date")||""),config=await operationalConfig();return json({rows,metrics:metrics(rows),config})}
 if(url.pathname==="/api/case/move"&&req.method==="POST"){if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");
  const b=await body(req),hit=await findCase(b.id);if(!hit)return json({error:"Paciente no encontrado."},404);
  const jefe=String(b.jefeTurno||"").trim();if(!jefe)return json({error:"Debe registrar el Jefe de turno antes de mover al paciente."},400);
  const from=String(hit.payload["ESTADO ACTUAL"]||"PROGRAMADO").toUpperCase(),to=String(b.destino||"").toUpperCase();
  const allowed=(await operationalConfig()).flow;
  if(!(allowed[from]||[]).includes(to))return json({error:"Transición no permitida: "+from+" → "+to},409);
  const patch={"ESTADO ACTUAL":to,"ENFERMERO JEFE":jefe};
  if(to==="QUIRÓFANO")patch["EN QNO"]="TRUE";
  if(from==="QUIRÓFANO"&&["RECUPERACIÓN","ALTA","HOSPITALIZACIÓN"].includes(to)){
    const required=["horaAnestesia","horaFinAnestesia","horaInicioCirugia","horaFinCirugia","profilaxisAdministrada","clasificacionCirugia"];
    if(required.some(k=>!String(b[k]||"").trim()))return json({error:"Antes de salir de QNO debe completar tiempos intraoperatorios, profilaxis y clasificación de cirugía."},400);
    const tqx=elapsedMinutes(b.horaInicioCirugia,b.horaFinCirugia),tan=elapsedMinutes(b.horaAnestesia,b.horaFinAnestesia);
    if(tqx===null||tqx<=0||tan===null||tan<=0)return json({error:"Revise los horarios de anestesia y cirugía."},400);
    const prof=norm(b.profilaxisAdministrada)==="SI"?"SÍ":norm(b.profilaxisAdministrada)==="NO"?"NO":"";
    if(!prof)return json({error:"Seleccione si se administró profilaxis."},400);
    let profMin="";
    if(prof==="SÍ"){
      if(!String(b.antibioticoProfilaxis||"").trim()||hhmmMinutes(b.horaProfilaxis)===null)return json({error:"Registre antibiótico y hora de profilaxis."},400);
      profMin=elapsedMinutes(b.horaProfilaxis,b.horaInicioCirugia);
    }
    const clas=String(b.clasificacionCirugia||"").toUpperCase();
    if(!["LIMPIA","CONTAMINADA","SUCIA"].includes(clas))return json({error:"Clasificación de cirugía no válida."},400);
    Object.assign(patch,{
      "HORA INICIO ANESTESIA":b.horaAnestesia,"HORA FIN ANESTESIA":b.horaFinAnestesia,
      "HORA INICIO CIRUGÍA / INCISIÓN":b.horaInicioCirugia,"HORA FIN CIRUGÍA":b.horaFinCirugia,
      "PROFILAXIS ADMINISTRADA":prof,"PROFILAXIS ANTIBIÓTICA / MEDICAMENTO":prof==="SÍ"?String(b.antibioticoProfilaxis||""):"",
      "HORA ADMINISTRACIÓN PROFILAXIS":prof==="SÍ"?b.horaProfilaxis:"","PROFILAXIS → INCISIÓN (MIN)":profMin,
      "CLASIFICACIÓN CIRUGÍA":clas,"OPERADO":"TRUE"
    });
    if(to==="RECUPERACIÓN")patch["RECUPERACIÓN"]="TRUE";
    if(["ALTA","HOSPITALIZACIÓN"].includes(to)){patch["DESTINO POSTOP"]=to;patch["OBSERVACIÓN EGRESO / HOSPITALIZACIÓN"]=String(b.observacion||"");}
  }
  const c=await updateCase(s,b.id,patch,"MOVER PACIENTE");await addMovement(s,Object.assign({},hit.payload,patch),from,to);return json(c)
}
 if(url.pathname==="/api/case/qno"&&req.method==="POST"){if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");const b=await body(req),q=String(b.qno||"").toUpperCase(),jefe=String(b.jefeTurno||"").trim();if(!jefe)return json({error:"Debe registrar el Jefe de turno."},400);const cfg=await operationalConfig();if(!cfg.qnos.includes(q))return json({error:"QNO inválido o no habilitado."},400);return json(await updateCase(s,b.id,{"SALA / QNO":q,"ENFERMERO JEFE":jefe},"CAMBIO QNO"))}
 if(url.pathname==="/api/case/cancel"&&req.method==="POST"){if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");const b=await body(req);if(!String(b.jefeTurno||"").trim())return json({error:"Debe registrar el Jefe de turno."},400);if(!String(b.momento||"").trim()||!String(b.causa||"").trim()||!String(b.motivo||"").trim()||!String(b.atribuible||"").trim())return json({error:"Momento, causa, motivo y atribuibilidad son obligatorios."},400);const hit=await findCase(b.id);if(!hit)return json({error:"Paciente no encontrado."},404);await insertCancellation(s,hit.payload,b);const obs=[b.causa,b.motivo,b.observaciones].filter(Boolean).join(" | ");const c=await updateCase(s,b.id,{"ESTADO ACTUAL":"CANCELADO","CANCELAR":"TRUE","ENFERMERO JEFE":String(b.jefeTurno),"OBSERVACIONES":obs},"CANCELAR PACIENTE");await addMovement(s,Object.assign({},hit.payload,{"ESTADO ACTUAL":"CANCELADO"}),hit.payload["ESTADO ACTUAL"]||"","CANCELADO");return json(c)}
 if(url.pathname==="/api/case/finish"&&req.method==="POST"){if(!hasPermission(permissions,"OPERACION_GESTIONAR"))return permissionDenied("OPERACION_GESTIONAR");const b=await body(req),d=String(b.destino||"").toUpperCase(),jefe=String(b.jefeTurno||"").trim();if(!jefe)return json({error:"Debe registrar el Jefe de turno."},400);if(!["ALTA","HOSPITALIZACIÓN"].includes(d))return json({error:"Destino inválido."},400);const c=await updateCase(s,b.id,{"ESTADO ACTUAL":d,"DESTINO POSTOP":d,"HORA SALIDA RECUPERACIÓN":nowBog(),"OBSERVACIÓN EGRESO / HOSPITALIZACIÓN":String(b.observacion||""),"ENFERMERO JEFE":jefe},"CIERRE RECUPERACIÓN");return json(c)}
 if(url.pathname==="/api/patient/update"&&req.method==="POST"){if(!hasPermission(permissions,"PROGRAMACION_EDITAR"))return permissionDenied("PROGRAMACION_EDITAR");
   const b=await body(req),ucfg=await operationalConfig();if(b.qno&&!ucfg.qnos.includes(String(b.qno).trim().toUpperCase()))return json({error:"QNO no habilitado."},400);const hit=await findCase(b.id);if(!hit)return json({error:"Paciente no encontrado."},404);
   const p=Object.assign({},hit.payload);
   const mapping={
    fecha:"FECHA CIRUGÍA",hora:"HORA PROGRAMADA",documento:"DOCUMENTO",paciente:"PACIENTE",edad:"EDAD",sexo:"SEXO",cups:"CUPS",
    procedimiento:"PROCEDIMIENTO",especialidad:"ESPECIALIDAD",especialista:"ESPECIALISTA",qno:"SALA / QNO",tipoAtencion:"TIPO DE ATENCIÓN",
    cama:"CAMA / UBICACIÓN PROGRAMADA",uvr:"UVR",tiempoQx:"TIEMPO QX ESTIMADO (MIN)",recursos:"RECURSOS / ALERTAS PREQUIRÚRGICAS",observaciones:"OBSERVACIONES"
   };
   Object.entries(mapping).forEach(([k,h])=>{if(Object.prototype.hasOwnProperty.call(b,k))p[h]=String(b[k]??"").trim()});
   if(!p["FECHA CIRUGÍA"]||!p["HORA PROGRAMADA"]||!p["DOCUMENTO"]||!p["PACIENTE"]||!p["PROCEDIMIENTO"])return json({error:"Fecha, hora, documento, paciente y procedimiento son obligatorios."},400);
   p["FECHA CIRUGÍA"]=safeDate(p["FECHA CIRUGÍA"]);p["PACIENTE"]=String(p["PACIENTE"]).toUpperCase();p["PROCEDIMIENTO"]=String(p["PROCEDIMIENTO"]).toUpperCase();p["ESPECIALIDAD"]=String(p["ESPECIALIDAD"]||"").toUpperCase();p["ESPECIALISTA"]=String(p["ESPECIALISTA"]||"").toUpperCase();p["SALA / QNO"]=String(p["SALA / QNO"]||"").toUpperCase();p["ÚLTIMA ACTUALIZACIÓN WEB"]=nowBog();p["USUARIO ÚLTIMO MOVIMIENTO"]=s.user;
   await sql.unsafe("update source_sheets set payload=$1::jsonb,imported_at=now() where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and row_number=$2",[JSON.stringify(p),hit.row_number]);
   await outbox("PACIENTE",String(p["ID CASO"]||""),"EDITAR",p);await audit(s,"EDITAR PACIENTE","PROGRAMACIÓN",String(p["ID CASO"]||""),"Actualización desde Programación");
   return json({ok:true,case:mapCase(p)});
 }
 if(url.pathname==="/api/patient"&&req.method==="POST"){if(!hasPermission(permissions,"PROGRAMACION_EDITAR"))return permissionDenied("PROGRAMACION_EDITAR");const b=await body(req);const pcfg=await operationalConfig();if(b.qno&&!pcfg.qnos.includes(String(b.qno).trim().toUpperCase()))return json({error:"QNO no habilitado."},400);if(!b.fecha||!b.hora||!b.documento||!b.paciente||!b.procedimiento)return json({error:"Fecha, hora, documento, paciente y procedimiento son obligatorios."},400);const id="QX-"+String(b.fecha).replace(/-/g,"")+"-"+randomBytes(4).toString("hex").toUpperCase(),track="SEG-"+String(b.fecha).replace(/-/g,"")+"-"+randomBytes(3).toString("hex").toUpperCase(),token=await uniqueTrackingToken();const p={"ID CASO":id,"FECHA CIRUGÍA":safeDate(b.fecha),"HORA PROGRAMADA":String(b.hora).slice(0,5),"DOCUMENTO":String(b.documento).trim(),"PACIENTE":String(b.paciente).trim().toUpperCase(),"EDAD":b.edad||"","SEXO":b.sexo||"","PROCEDIMIENTO":String(b.procedimiento).trim().toUpperCase(),"ESPECIALIDAD":String(b.especialidad||"").trim().toUpperCase(),"ESPECIALISTA":String(b.especialista||"").trim().toUpperCase(),"SALA / QNO":String(b.qno||"").toUpperCase(),"ESTADO ACTUAL":"PROGRAMADO","OBSERVACIONES":b.observaciones||"","TIPO DE ATENCIÓN":b.tipoAtencion||"","CAMA / UBICACIÓN PROGRAMADA":b.cama||"","CUPS":b.cups||"","UVR":b.uvr||"","TIEMPO QX ESTIMADO (MIN)":b.tiempoQx||"","RECURSOS / ALERTAS PREQUIRÚRGICAS":b.recursos||"","CÓDIGO SEGUIMIENTO":track,"TOKEN SEGUIMIENTO":token,"CREADO SEGUIMIENTO":nowBog(),"FUENTE DE PROGRAMACIÓN":"RAILWAY","ÚLTIMA ACTUALIZACIÓN WEB":nowBog()};const rn=await nextRow("BD PROGRAMACIÓN");await sql.unsafe("insert into source_sheets(source_key,spreadsheet_id,spreadsheet_title,sheet_name,row_number,payload) values('MAIN','RAILWAY','Railway operational','BD PROGRAMACIÓN',$1,$2::jsonb)",[rn,JSON.stringify(p)]);await outbox("PACIENTE",id,"CREAR",p);await audit(s,"CREAR PACIENTE","PROGRAMACIÓN",id,"Nuevo paciente");return json({ok:true,id,trackingCode:track,case:mapCase(p)})}
 if(url.pathname==="/api/bulk"&&req.method==="POST"){if(!hasPermission(permissions,"CARGUE_MASIVO"))return permissionDenied("CARGUE_MASIVO");const b=await body(req),rows=Array.isArray(b.rows)?b.rows:[];if(rows.length>1000)return json({error:"Máximo 1000 filas por cargue."},400);let inserted=0,skipped=0;for(const r of rows){if(!r.fecha||!r.paciente||!r.procedimiento){skipped++;continue}const date=safeDate(r.fecha),dup=await sql.unsafe("select 1 from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and payload->>'FECHA CIRUGÍA'=$1 and payload->>'DOCUMENTO'=$2 and upper(payload->>'PROCEDIMIENTO')=$3 limit 1",[date,String(r.documento||""),String(r.procedimiento||"").toUpperCase()]);if(dup.length){skipped++;continue}const id="QX-"+date.replace(/-/g,"")+"-"+randomBytes(4).toString("hex").toUpperCase(),p={"ID CASO":id,"FECHA CIRUGÍA":date,"HORA PROGRAMADA":String(r.hora||"").slice(0,5),"DOCUMENTO":String(r.documento||""),"PACIENTE":String(r.paciente||"").toUpperCase(),"EDAD":r.edad||"","SEXO":r.sexo||"","CUPS":r.cups||"","PROCEDIMIENTO":String(r.procedimiento||"").toUpperCase(),"ESPECIALIDAD":String(r.especialidad||"").toUpperCase(),"ESPECIALISTA":String(r.especialista||"").toUpperCase(),"SALA / QNO":String(r.qno||"").toUpperCase(),"TIPO DE ATENCIÓN":String(r.tipoAtencion||"").toUpperCase(),"CAMA / UBICACIÓN PROGRAMADA":r.cama||"","OBSERVACIONES":r.observaciones||"","ESTADO ACTUAL":"PROGRAMADO","FUENTE DE PROGRAMACIÓN":"CARGUE RAILWAY","CÓDIGO SEGUIMIENTO":"SEG-"+date.replace(/-/g,"")+"-"+randomBytes(3).toString("hex").toUpperCase(),"TOKEN SEGUIMIENTO":await uniqueTrackingToken(),"CREADO SEGUIMIENTO":nowBog(),"ÚLTIMA ACTUALIZACIÓN WEB":nowBog()};const rn=await nextRow("BD PROGRAMACIÓN");await sql.unsafe("insert into source_sheets(source_key,spreadsheet_id,spreadsheet_title,sheet_name,row_number,payload) values('MAIN','RAILWAY','Railway operational','BD PROGRAMACIÓN',$1,$2::jsonb)",[rn,JSON.stringify(p)]);await outbox("PACIENTE",id,"CARGUE_MASIVO",p);inserted++}await audit(s,"CARGUE MASIVO","PROGRAMACIÓN","",inserted+" insertados; "+skipped+" omitidos");return json({ok:true,inserted,skipped})}
 if(url.pathname==="/api/profilaxis-catalog"){
    if(!hasPermission(permissions,"PROFILAXIS_PREQX"))return permissionDenied("PROFILAXIS_PREQX");
    const q=norm(url.searchParams.get("q")||""),esp=norm(url.searchParams.get("especialidad")||"");
    const rr=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='BD PROFILAXIS QX' and upper(coalesce(payload->>'ESTADO',''))='ACTIVO' order by row_number");
    let rows=rr.map(x=>x.payload);
    if(esp)rows=rows.filter(r=>norm(r["ESPECIALIDAD"])===esp);
    rows=rows.map(r=>({r,score:profSearchScore(q,r)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.r);
    return json({rows:rows.slice(0,100).map(r=>({id:r["ID REGLA"]||"",especialidad:r["ESPECIALIDAD"]||"",procedimiento:r["PROCEDIMIENTO"]||"",similares:r["TÉRMINOS SIMILARES / SINÓNIMOS"]||"",antibiotico:r["ANTIBIÓTICO PRIMERA ELECCIÓN"]||"",dosis:r["DOSIS ADULTO"]||"",momento:r["MOMENTO ADMINISTRACIÓN"]||"",consideraciones:r["AJUSTES / CONSIDERACIONES"]||"",fuente:r["FUENTE DOCUMENTAL"]||"",version:r["VERSIÓN"]||"",dilucion:r["DILUCIÓN (FARMACIA)"]||"",administracion:r["ADMINISTRACIÓN (FARMACIA)"]||"",interacciones:r["INTERACCIONES (FARMACIA)"]||"",efectosAdversos:r["EFECTOS ADVERSOS (FARMACIA)"]||""}))})
  }
 if(url.pathname==="/api/profilaxis"){if(!hasPermission(permissions,"PROFILAXIS_PREQX"))return permissionDenied("PROFILAXIS_PREQX");const rows=(await casesFor(url.searchParams.get("date")||"")).filter(x=>x.prof||x.profHora||x.clasif||x.antibiotico),m={total:rows.length,registrada:0,noRegistrada:0,pendiente:0,conMedicamento:0,conTiempo:0};const out=rows.map(x=>({paciente:x.paciente,procedimiento:x.procedimiento,administrada:x.prof,medicamento:x.antibiotico,hora:x.profHora,minutos:x.profMin,clasificacion:x.clasif}));out.forEach(r=>{const a=norm(r.administrada);if(["SI","SÍ"].includes(a))m.registrada++;else if(a==="NO")m.noRegistrada++;else m.pendiente++;if(r.medicamento)m.conMedicamento++;if(String(r.minutos)!=="")m.conTiempo++});return json({rows:out,metrics:m})}
 if(url.pathname==="/api/postop"){if(!hasPermission(permissions,"CUIDADOS_POSTOP"))return permissionDenied("CUIDADOS_POSTOP");const base=(await casesFor(url.searchParams.get("date")||"")).filter(r=>r.operado||["RECUPERACIÓN","ALTA","HOSPITALIZACIÓN"].includes(r.estado)||r.destino),rows=base.map(r=>({paciente:r.paciente,procedimiento:r.procedimiento,estado:r.estado,destino:r.destino,salida:r.salida,observacion:r.observacionEgreso,codigo:r.codigo})),m={total:rows.length,alta:0,hospitalizacion:0,recuperacion:0,conSeguimiento:0,pendientes:0};rows.forEach(r=>{const d=norm(r.destino||r.estado);if(d==="ALTA")m.alta++;if(d==="HOSPITALIZACION")m.hospitalizacion++;if(r.estado==="RECUPERACIÓN")m.recuperacion++;if(r.codigo)m.conSeguimiento++;else m.pendientes++});return json({rows,metrics:m})}
 if(url.pathname==="/api/coord"){if(!hasPermission(permissions,"COORDINACION_VER"))return permissionDenied("COORDINACION_VER");const rows=await casesFor(url.searchParams.get("date")||""),m=metrics(rows),by={};rows.forEach(r=>{const k=r.especialidad||"SIN ESPECIALIDAD";if(!by[k])by[k]={especialidad:k,total:0,operados:0,cancelados:0};by[k].total++;if(r.operado)by[k].operados++;if(r.estado==="CANCELADO")by[k].cancelados++});return json({metrics:m,specialties:Object.values(by).sort((a,b)=>b.total-a.total)})}
 if(url.pathname==="/api/kpi"){if(!hasPermission(permissions,"INDICADORES_VER"))return permissionDenied("INDICADORES_VER");const date=safeDate(url.searchParams.get("date")||""),period=String(url.searchParams.get("period")||"MES").toUpperCase();let data;if(period==="DIA")data=await casesFor(date);else{const ym=date.slice(0,7);const r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and left(payload->>'FECHA CIRUGÍA',7)=$1",[ym]);data=r.map(x=>mapCase(x.payload))}const brutas=data.length,canceladas=data.filter(x=>x.estado==="CANCELADO").length,netas=brutas-canceladas,ejecutadas=data.filter(x=>x.operado).length,esp={};data.forEach(r=>{const k=r.especialidad||"SIN ESPECIALIDAD";if(!esp[k])esp[k]={especialidad:k,programadasBrutas:0,canceladas:0,programadasNetas:0,ejecutadas:0,prepa:[],qnoRec:[],muertos:[]};const g=esp[k];g.programadasBrutas++;if(r.estado==="CANCELADO")g.canceladas++;else g.programadasNetas++;if(r.operado)g.ejecutadas++;if(r.tPrepa)g.prepa.push(r.tPrepa);if(r.tQnoRec)g.qnoRec.push(r.tQnoRec);if(r.tMuerto)g.muertos.push(r.tMuerto)});const especialidades=Object.values(esp).map(g=>({especialidad:g.especialidad,programadasBrutas:g.programadasBrutas,canceladas:g.canceladas,programadasNetas:g.programadasNetas,ejecutadas:g.ejecutadas,tasaRealizacion:pct(g.ejecutadas,g.programadasNetas),tasaCancelacion:pct(g.canceladas,g.programadasBrutas),tiempoPrepaQno:avg(g.prepa),tiempoQnoRec:avg(g.qnoRec),tiempoMuerto:avg(g.muertos)})).sort((a,b)=>b.programadasBrutas-a.programadasBrutas);const qs={};data.forEach(r=>{const q=r.qno||"SIN QNO";if(!qs[q])qs[q]={qno:q,t:[],m:[]};if(r.tQnoRec)qs[q].t.push(r.tQnoRec);if(r.tMuerto)qs[q].m.push(r.tMuerto)});const qnos=Object.values(qs).map(q=>({qno:q.qno,tiempoQnoRec:avg(q.t),tiempoMuerto:avg(q.m)}));const causas={};data.filter(x=>x.estado==="CANCELADO").forEach(x=>{const k=x.observaciones||"SIN MOTIVO";causas[k]=(causas[k]||0)+1});return json({summary:{programadasBrutas:brutas,canceladas,programadasNetas:netas,ejecutadas,tasaCancelacion:pct(canceladas,brutas),tasaRealizacion:pct(ejecutadas,netas),tiempoPrepaQno:avg(data.map(x=>x.tPrepa)),tiempoQnoRec:avg(data.map(x=>x.tQnoRec)),tiempoMuerto:avg(data.map(x=>x.tMuerto))},especialidades,qnos,flujo:[{label:"PROGRAMADO",value:data.filter(x=>x.estado==="PROGRAMADO").length},{label:"PREPARACIÓN",value:data.filter(x=>x.estado==="PREPARACIÓN").length},{label:"QUIRÓFANO",value:data.filter(x=>x.estado==="QUIRÓFANO").length},{label:"RECUPERACIÓN",value:data.filter(x=>x.estado==="RECUPERACIÓN").length},{label:"FINALIZADOS",value:data.filter(x=>["ALTA","HOSPITALIZACIÓN"].includes(x.estado)).length},{label:"CANCELADOS",value:canceladas}],cancelaciones:{causas:Object.entries(causas).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)}})}
 if(url.pathname==="/api/mci"){if(!hasPermission(permissions,"INDICADORES_VER"))return permissionDenied("INDICADORES_VER");const date=safeDate(url.searchParams.get("date")||""),y=Number(date.slice(0,4)),m=Number(date.slice(5,7)),mes=monthName(m);const sum=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='RESUMEN ANUAL' and payload->>'Mes'=$1 limit 1",[mes]);const base=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name=$1 and payload->>'Mes'=$2 order by row_number",["BASE ANUAL "+y,mes]);const x=sum[0]?.payload||{};return json({metrics:{mes,meta:x["Meta"]||"0",programadas:x["Programadas netas"]||"0",ejecutadas:x["Ejecutadas"]||"0",cumplimiento:x["Cumplimiento"]||"—",tasaRealizacion:x["Tasa realización"]||"—",brecha:x["Brecha"]||"0",proyeccion:x["Proyección"]||"—",estado:x["Estado"]||"SIN DATOS"},daily:base.map(z=>{const p=z.payload;return{fecha:p["Fecha"]||"",dia:p["Día"]||"",qxDisponibles:p["Qx disponibles"]||"",metaDiaria:p["Meta diaria"]||"",programadas:p["Cirugías programadas netas"]||"",ejecutadas:p["Cirugías ejecutadas"]||"",cumple:p["Cumple meta diaria"]||"",diferencia:p["Diferencia vs meta diaria"]||"",acumulado:p["Acumulado mensual"]||""}})})}
 if(url.pathname==="/api/reinterventions"){if(!hasPermission(permissions,"REINTERVENCIONES_REVISAR"))return permissionDenied("REINTERVENCIONES_REVISAR");const date=safeDate(url.searchParams.get("date")||""),end=new Date(date+"T12:00:00Z"),start=new Date(end.getTime()-30*86400000),a=start.toISOString().slice(0,10);const r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and payload->>'FECHA CIRUGÍA'>=$1 and payload->>'FECHA CIRUGÍA'<=$2 order by payload->>'DOCUMENTO',payload->>'FECHA CIRUGÍA'",[a,date]);const list=r.map(x=>mapCase(x.payload)),by={};list.forEach(x=>{if(x.documento)(by[x.documento]||(by[x.documento]=[])).push(x)});const rows=[];Object.values(by).forEach(arr=>{for(let i=1;i<arr.length;i++){const p=arr[i-1],n=arr[i],d=Math.round((new Date(n.fecha)-new Date(p.fecha))/86400000);if(d>=0&&d<30)rows.push({paciente:n.paciente,documento:n.documento,fechaPrevia:p.fecha,fechaNueva:n.fecha,dias:d,especialidad:n.especialidad})}});return json({total:rows.length,reviewed:0,pending:rows.length,rows})}
 if(url.pathname==="/api/download"){if(!hasPermission(permissions,"DESCARGAS"))return permissionDenied("DESCARGAS");const date=safeDate(url.searchParams.get("date")||""),period=String(url.searchParams.get("period")||"DIA").toUpperCase(),type=String(url.searchParams.get("type")||"PROGRAMACION").toUpperCase();let rows;if(period==="MES"){const ym=date.slice(0,7),r=await sql.unsafe("select payload from source_sheets where source_key='MAIN' and sheet_name='BD PROGRAMACIÓN' and left(payload->>'FECHA CIRUGÍA',7)=$1 order by payload->>'FECHA CIRUGÍA',payload->>'HORA PROGRAMADA'",[ym]);rows=r.map(x=>mapCase(x.payload))}else rows=await casesFor(date);if(type==="ACTIVOS")rows=rows.filter(x=>!["ALTA","HOSPITALIZACIÓN","CANCELADO"].includes(x.estado));if(type==="EJECUTADAS")rows=rows.filter(x=>x.operado);if(type==="FINALIZADOS")rows=rows.filter(x=>["ALTA","HOSPITALIZACIÓN"].includes(x.estado));if(type==="CANCELADOS")rows=rows.filter(x=>x.estado==="CANCELADO");const dlCfg=await operationalConfig();if(dlCfg.qnos.includes(type))rows=rows.filter(x=>norm(x.qno)===norm(type));let headers=["Fecha","Hora","Paciente","Documento","Procedimiento","Especialidad","Especialista","QNO","Estado","Tipo atención","Observaciones"],data=rows.map(x=>[x.fecha,x.hora,x.paciente,x.documento,x.procedimiento,x.especialidad,x.especialista,x.qno,x.estado,x.tipoAtencion,x.observaciones]);if(type==="TIEMPOS_QNO"){headers=["Fecha","Hora","Paciente","QNO","Prepa→QNO (min)","QNO→Recuperación (min)","Tiempo muerto QNO (min)"];data=rows.map(x=>[x.fecha,x.hora,x.paciente,x.qno,x.tPrepa,x.tQnoRec,x.tMuerto])}if(type==="PROFILAXIS"){headers=["Fecha","Hora","Paciente","Documento","QNO","Administrada","Medicamento","Hora profilaxis","Minutos a incisión","Clasificación"];data=rows.map(x=>[x.fecha,x.hora,x.paciente,x.documento,x.qno,x.prof,x.antibiotico,x.profHora,x.profMin,x.clasif])}const csv=[headers,...data].map(r=>r.map(csvCell).join(",")).join("\n"),name="Cirugia_"+type.replace(/\s+/g,"_")+"_"+date+".csv";await audit(s,"DESCARGA","REPORTES","",type+" "+period);return new Response("\ufeff"+csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=\""+name+"\"","x-filename":name,"cache-control":"no-store"}})}
 return json({error:"Not found"},404);
}});
console.log("APP WEB CX Railway 5 operational",PORT);