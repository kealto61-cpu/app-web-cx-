// Calendar periods use inclusive dates in the service's local calendar.
export function validReportDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
 const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function resolveReportRange(params:URLSearchParams|Record<string,string>,reference:string){
 const get=(key:string)=>params instanceof URLSearchParams?params.get(key):params[key];
 const fail=(message:string)=>{throw Object.assign(new Error(message),{status:400})};
 const period=String(get('period')||'MES').toUpperCase();let from='',to='';
 if(period==='RANGO'){from=get('from')||'';to=get('to')||'';}
 else if(period==='MES'){
  const month=get('month')||reference.slice(0,7);if(!/^\d{4}-\d{2}$/.test(month))fail('Seleccione un mes válido.');
  from=month+'-01';if(!validReportDate(from))fail('Seleccione un mes válido.');
  to=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10);
 }else if(period==='ANIO'){
  const year=get('year')||reference.slice(0,4);if(!/^\d{4}$/.test(year))fail('Seleccione un año de cuatro dígitos.');from=year+'-01-01';to=year+'-12-31';
 }else if(period==='DIA'){from=to=get('date')||reference;}
 else if(period==='VENTANA_30_DIAS'){to=get('date')||reference;if(!validReportDate(to))fail('Fecha inválida.');from=new Date(Date.parse(to+'T12:00:00Z')-30*86400000).toISOString().slice(0,10);}
 else fail('Periodo inválido.');
 if(!validReportDate(from)||!validReportDate(to))fail('Seleccione fechas válidas para la descarga.');
 if(from>to)fail('La fecha inicial no puede ser posterior a la fecha final.');
 if(Number(from.slice(0,4))<1900||Number(to.slice(0,4))>2200)fail('Seleccione un periodo entre los años 1900 y 2200.');
 return {period,from,to};
}
