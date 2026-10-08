// The application passes JSON text to explicit ::jsonb parameters. Postgres.js
// otherwise serializes that text again after resolving the parameter's type.
export function parseDatabaseJson(value:string){
 let parsed=JSON.parse(value);
 for(let i=0;i<3&&typeof parsed==='string'&&/^[\s]*[\[{]/.test(parsed);i++){
  try{parsed=JSON.parse(parsed)}catch{break}
 }
 return parsed;
}
export const DATABASE_JSON_TYPES={
 applicationJson:{to:3802,from:[114,3802],serialize:(value:any)=>typeof value==='string'?value:JSON.stringify(value),parse:parseDatabaseJson},
 applicationJsonText:{to:114,serialize:(value:any)=>typeof value==='string'?value:JSON.stringify(value)}
};
export async function repairSimulationJson(sql:any){
 const columns=await sql.unsafe("select table_name,column_name from information_schema.columns where table_schema='qx_simulation' and data_type='jsonb' and column_name in ('payload','metadata','subscription') order by table_name,column_name");
 let repaired=0;
 for(const item of columns){
  if(!/^(qx_[a-z0-9_]+|case_attachments|companion_push_subscriptions)$/.test(item.table_name)||!['payload','metadata','subscription'].includes(item.column_name))continue;
  const table='qx_simulation."'+item.table_name+'"',column='"'+item.column_name+'"';
  for(let depth=0;depth<3;depth++){
   const result=await sql.unsafe(`update ${table} set ${column}=(${column} #>> '{}')::jsonb where jsonb_typeof(${column})='string' and left(ltrim(${column} #>> '{}'),1) in ('{','[') returning 1 as repaired`);
   repaired+=result.length;if(!result.length)break;
  }
 }
 return repaired;
}
