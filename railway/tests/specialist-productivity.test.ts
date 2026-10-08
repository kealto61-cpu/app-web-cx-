import {test,expect} from 'bun:test';
import {calculateSpecialistProductivity,specialistReportSection} from '../specialist-productivity.ts';
import {createReports} from '../reports.ts';
const item=(id,specialist='ESPECIALISTA SIMULADO A',performed=false,cancelled=false)=>({id,fecha:'2026-10-07',especialista:specialist,especialidad:'ESPECIALIDAD SIMULADA',operado:performed,estado:cancelled?'CANCELADO':performed?'ALTA':'PROGRAMADO'});

test('tasas por especialista usan conteos completos, netas para realización y brutas para cancelación',()=>{
 const cases=Array.from({length:20},(_,i)=>item('SIM-'+i,'ESPECIALISTA SIMULADO A',(i < 15),(i >= 18)));
 const row=calculateSpecialistProductivity(cases).rows[0];
 expect(row).toMatchObject({scheduledGross:20,cancelled:2,scheduledNet:18,performed:15,pending:3,realizationRate:83.33,cancellationRate:10,surgeriesPerWorkedHour:null});
});

test('nombres equivalentes se agrupan, especialistas distintos y registros sin nombre permanecen separados',()=>{
 const first=item('SIM-A','Especialista SIMULADO Á',true);
 const data=calculateSpecialistProductivity([first,first,item('SIM-B','ESPECIALISTA   SIMULADO A',false,true),item('SIM-C','ESPECIALISTA SIMULADO B',true),item('SIM-D','',true)]);
 expect(data.rows).toHaveLength(3);expect(data.totals).toMatchObject({specialists:2,performed:3,cancelled:1,unassignedCases:1});
 expect(data.rows.find(r=>r.specialist===first.especialista)).toMatchObject({scheduledGross:2,scheduledNet:1,performed:1,cancelled:1,realizationRate:100,cancellationRate:50});
 expect(data.rows.find(r=>!r.assigned)?.specialist).toBe('SIN ESPECIALISTA REGISTRADO');
});

test('todos cancelados tienen 100% de cancelación y realización No evaluable; los datos contradictorios se señalan',()=>{
 const data=calculateSpecialistProductivity([item('SIM-A','SIM-A',false,true),item('SIM-B','SIM-A',false,true),item('SIM-C','SIM-B',true,true)]);
 expect(data.rows.find(r=>r.specialist==='SIM-A')).toMatchObject({realizationRate:null,cancellationRate:100,pending:0});
 expect(data.rows.find(r=>r.specialist==='SIM-B')).toMatchObject({performed:1,cancelled:1,inconsistentCases:1,realizationRate:null,pending:null});
 expect(calculateSpecialistProductivity([]).rows).toEqual([]);
 expect(specialistReportSection(data,'KPI_TASA_REALIZACION_ESPECIALISTA').rows.every(row=>row[4]==='No evaluable')).toBe(true);
});

test('descargas separadas respetan rango, denominadores, nombres y permisos de indicadores',()=>{
 const cases=[item('SIM-A','ESPECIALISTA SIMULADO A',true),item('SIM-B','ESPECIALISTA SIMULADO A',false,true),{...item('SIM-OUT','SIM-FUERA',true),fecha:'2026-11-01'}];
 const r=createReports({cases,reporting:[],permissions:['DESCARGAS','INDICADORES_VER'],session:{user:'SIM-COORD'},config:{qnos:[]},boardMetrics:()=>({}),reportRange:{period:'MES',from:'2026-10-01',to:'2026-10-31'}});
 for(const type of ['KPI_ESPECIALISTAS','KPI_PRODUCTIVIDAD_ESPECIALISTA','KPI_CANCELACIONES_ESPECIALISTA','KPI_TASA_REALIZACION_ESPECIALISTA','KPI_TASA_CANCELACION_ESPECIALISTA']){
  const report=r.download('','2026-10-01','MES',type);expect(report.filename).toContain(type+'_2026-10-01_2026-10-31');expect(report.csv).toContain('ESPECIALISTA SIMULADO A');expect(report.csv).not.toContain('SIM-FUERA');expect(report.sections.find(s=>s.headers[0]==='Especialista').rows).toHaveLength(1);
 }
 const rate=r.download('','2026-10-01','MES','KPI_TASA_REALIZACION_ESPECIALISTA').sections.find(s=>s.headers[0]==='Especialista').rows[0];expect(rate.slice(2)).toEqual([1,1,100,0]);
});
