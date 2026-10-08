import {test,expect} from 'bun:test';
import {resolveReportRange} from '../report-range.ts';
import {createReports} from '../reports.ts';
const ref='2026-10-07';
function report(range:any,cases:any[]=[],reporting:any[]=[],permissions=['*']){return createReports({cases,reporting,permissions,session:{user:'SIMULADO'},config:{qnos:[]},boardMetrics:()=>({}),reportRange:range,indicatorMetadata:{KPI_REALIZADAS:{label:'Realizadas QA',goal:'Meta ficticia'}}});}
const item=(fecha:string,operado=true,documento='SIM-'+fecha)=>({fecha,operado,documento,paciente:'PACIENTE FICTICIO',estado:operado?'ALTA':'PROGRAMADO',especialidad:'SIMULADA',codigo:'SIM-TOKEN'});
const daily=(fecha:string,meta:number,ejecutadas:number,programadas=meta)=>({dataset:'BASE ANUAL '+fecha.slice(0,4),payload:{Fecha:fecha,'Meta diaria':meta,'Cirugías programadas netas':programadas,'Cirugías ejecutadas':ejecutadas}});
test('mes y año incluyen sus extremos y febrero respeta años bisiestos',()=>{
 expect(resolveReportRange({period:'MES',month:'2024-02'},ref)).toEqual({period:'MES',from:'2024-02-01',to:'2024-02-29'});
 expect(resolveReportRange({period:'ANIO',year:'2025'},ref)).toEqual({period:'ANIO',from:'2025-01-01',to:'2025-12-31'});
 expect(resolveReportRange({period:'RANGO',from:'2025-12-31',to:'2026-01-01'},ref)).toMatchObject({from:'2025-12-31',to:'2026-01-01'});
});
test('fechas inexistentes y rangos invertidos se rechazan sin sustituirlos por hoy',()=>{
 for(const params of [{period:'MES',month:'2026-13'},{period:'RANGO',from:'2026-02-30',to:ref},{period:'RANGO',from:ref,to:'2026-10-01'},{period:'ANIO',year:'26'},{period:'OTRO'}])expect(()=>resolveReportRange(params as any,ref)).toThrow();
});
test('descarga anual incluye enero y diciembre y excluye ambos años contiguos',()=>{
 const range=resolveReportRange({period:'ANIO',year:'2026'},ref),r=report(range,[item('2025-12-31'),item('2026-01-01'),item('2026-12-31'),item('2027-01-01')]);
 const data=r.download('',ref,'ANIO','KPI_REALIZADAS');expect(data.title).toBe('Realizadas QA');expect(data.sections[1].rows[0][1]).toBe(2);expect(data.sections[0].rows[0]).toContain('Meta ficticia');expect(data.filename).toContain('2026-01-01_2026-12-31');
 const program=r.download('',ref,'ANIO','PROGRAMACION');expect(program.sections[1].rows.length).toBe(2);expect(program.csv).toContain('2026-12-31');expect(program.csv).not.toContain('2027-01-01');
});
test('el rango exacto se aplica a cada familia y a sus reportes agregados',()=>{
 const range=resolveReportRange({period:'RANGO',from:'2026-10-01',to:'2026-10-02'},ref),r=report(range,[{...item('2026-10-01'),prof:'SÍ',profMin:0},item('2026-10-02'),{...item('2026-10-03'),prof:'SÍ'}],[daily('2026-10-01',10,8),daily('2026-10-02',10,9)]);
 for(const option of r.catalog()){const data=r.download('',ref,'RANGO',option.type);expect(data.from).toBe(range.from);expect(data.to).toBe(range.to);expect(data.period).toBe('RANGO');expect(data.csv).toContain('2026-10-01');}
 expect(r.download('',ref,'RANGO','POP_CASOS').sections[1].rows[0][1]).toBe(2);expect(r.download('',ref,'RANGO','PROF_TIEMPO').sections[1].rows[0][1]).toBe(1);
});
test('MCI anual calcula porcentaje ponderado y conserva 12 meses sin inventar datos faltantes',()=>{
 const range=resolveReportRange({period:'ANIO',year:'2026'},ref),r=report(range,[],[daily('2026-01-01',10,10),daily('2026-12-31',90,0),daily('2027-01-01',100,100)]);
 const data=r.download('',ref,'ANIO','MCI_CUMPLIMIENTO');expect(data.sections[1].rows[0][1]).toBe(10);expect(data.sections[2].rows.length).toBe(12);expect(data.sections[2].rows[1][4]).toBe('No evaluable');
 const raw=r.download('',ref,'ANIO','MCI_DIARIO');expect(raw.sections[1].rows.map(r=>r[0])).toEqual(['2026-01-01','2026-12-31']);expect(raw.chart).toBeNull();
});
test('MCI parcial usa solamente fechas del rango y nunca el resumen del mes completo',()=>{
 const range=resolveReportRange({period:'RANGO',from:'2025-12-31',to:'2026-01-01'},ref),r=report(range,[],[daily('2025-12-30',100,100),daily('2025-12-31',10,9),daily('2026-01-01',20,18),daily('2026-01-02',100,100)]);
 expect(r.download('',ref,'RANGO','MCI_META_MENSUAL').sections[1].rows[0][1]).toBe(30);expect(r.download('',ref,'RANGO','MCI_CUMPLIMIENTO').sections[1].rows[0][1]).toBe(90);
});
test('Seguridad incluye un antecedente previo al rango y cuenta solo la nueva cirugía dentro del periodo',()=>{
 const range=resolveReportRange({period:'RANGO',from:'2026-10-01',to:'2026-10-31'},ref),r=report(range,[item('2026-09-25',true,'SIM-DOC'),item('2026-10-05',true,'SIM-DOC'),item('2026-11-01',true,'SIM-DOC')]);
 expect(r.download('',ref,'RANGO','SEG_CANDIDATOS').sections[1].rows[0][1]).toBe(1);expect(r.download('',ref,'RANGO','SEG_DETALLE').sections[1].rows[0][2]).toBe('2026-09-25');
});
test('el rango no amplía permisos de descarga o indicadores',()=>{
 const range=resolveReportRange({period:'ANIO',year:'2026'},ref);expect(()=>report(range,[],[],['DESCARGAS']).download('',ref,'ANIO','MCI_CUMPLIMIENTO')).toThrow('No tiene permiso');expect(()=>report(range,[],[],['INDICADORES_VER']).download('',ref,'ANIO','KPI_REALIZADAS')).toThrow('No tiene permiso');
});
