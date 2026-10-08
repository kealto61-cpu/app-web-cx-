import {test,expect} from 'bun:test';
import {createReports} from '../reports.ts';
import {searchCare} from '../care-search.ts';
import catalog from '../data/care-catalog.json';
import dictionary from '../data/care-dictionary.json';
import {cancellationSummary} from '../cancellation-summary.ts';
const cases=[{id:'DEMO-1',paciente:'PACIENTE FICTICIO',documento:'DEMO-DOC-1',fecha:'2026-10-07',hora:'08:00',especialidad:'ORTOPEDIA',procedimiento:'Artroscopia de hombro',estado:'ALTA',destino:'ALTA',operado:true,codigo:'DEMO-SEG',qno:'QNO 1',tPrepa:20,tQnoRec:50,tMuerto:10,prof:'SÍ',profHora:'07:30',antibiotico:'REGISTRO FICTICIO',profMin:30,clasif:'LIMPIA',observaciones:'SIMULADO'}];
function reporter(permissions=['*']){return createReports({cases,reporting:[{dataset:'RESUMEN ANUAL',payload:{Mes:'Octubre',Meta:10,'Programadas netas':12,Ejecutadas:9,Cumplimiento:'90%',Brecha:-1}},{dataset:'BASE ANUAL 2026',payload:{Mes:'Octubre',Fecha:'07/10/2026','Meta diaria':10,'Cirugías programadas netas':12,'Cirugías ejecutadas':9}}],permissions,session:{user:'demo'},config:{qnos:['QNO 1']},boardMetrics:()=>({total:1})})}
test('MCI conserva fechas y tres series de meta/programadas/realizadas',()=>{const r=reporter().mci('','2026-10-07');expect(r.metrics.cumplimiento).toBe('90%');expect(r.daily[0]).toMatchObject({fecha:'2026-10-07',metaDiaria:10,programadas:12,ejecutadas:9})});
test('todos los indicadores tienen descarga separada y validan permiso propio',()=>{const r=reporter();expect(r.catalog().length).toBe(52);for(const item of r.catalog()){const result=r.download('','2026-10-07','MES',item.type);expect(result.sections.length).toBeGreaterThan(0);expect(result.csv.length).toBeGreaterThan(20);expect(result.filename).toContain(item.type);}expect(()=>reporter(['DESCARGAS']).download('','2026-10-07','MES','MCI_DIARIO')).toThrow('No tiene permiso')});
test('búsqueda educativa reconoce procedimiento y bloqueo sin inferir una cirugía del hombro',()=>{const obj=(table)=>table.rows.map(row=>Object.fromEntries(table.headers.map((h,i)=>[h,row[i]])));const a=obj(catalog),b=obj(dictionary),r=searchCare(a,b,{q:'operación del hombro con anestesia en todo el brazo'},true);expect(r.candidates.length).toBe(2);expect(r.rows.some(x=>x.id==='PEND-BLOQUEO-BRAZO')).toBe(true);expect(r.rows.some(x=>x.id==='PEND-HOMBRO-MANGUITO')).toBe(false);expect(r.rows.some(x=>x.id==='PASP-02')).toBe(false)});
test('fichas pendientes e inactivas quedan fuera del portal público',()=>{const obj=(table)=>table.rows.map(row=>Object.fromEntries(table.headers.map((h,i)=>[h,row[i]])));const rows=obj(catalog),dict=obj(dictionary);for(const row of rows)row.APROBACION='PENDIENTE';expect(searchCare(rows,dict,{q:'hombro'},true).rows.length).toBe(0)});
test('las ediciones del catálogo desde configuración aparecen en la búsqueda',()=>{const row={id:'SIMULADO-EDICION',title:'Ficha ficticia',state:'ACTIVO',approval:'REVISADO',audience:'AMBOS',type:'PROCEDIMIENTO',coverage:'PARCIAL',procedures:['Procedimiento ficticio'],anesthesias:[],topics:[],recommendations:['Recomendación editada'],alarms:[],restrictions:[],source:'https://example.org/source',contentVersion:'SIMULADO'};const r=searchCare([row],[{concept:'Procedimiento ficticio',type:'PROCEDIMIENTO',state:'ACTIVO',synonyms:[]}],{procedure:'Procedimiento ficticio'},true);expect(r.rows[0].recommendations[0]).toBe('Recomendación editada')});
test('descarga de enfermería mantiene atribución histórica, rango y protección de fórmulas sin publicar pacientes',()=>{
 const source=[{...cases[0],enfermeroJefeCirugia:'=SIM-NURSE',enfermeroJefe:'SIM-LAST'},{...cases[0],id:'SIM-OUT',fecha:'2026-11-01',enfermeroJefeCirugia:'SIM-OUT'}];
 const r=createReports({cases:source,reporting:[],permissions:['DESCARGAS','INDICADORES_VER'],session:{user:'SIM-COORD'},config:{qnos:[]},boardMetrics:()=>({}),reportRange:{period:'MES',from:'2026-10-01',to:'2026-10-31'}});
 const data=r.download('','2026-10-01','MES','KPI_ENFERMERIA'),detail=data.sections.find(s=>s.title.startsWith('Productividad por enfermero'));
 expect(detail.rows).toHaveLength(1);expect(detail.rows[0][0]).toBe('=SIM-NURSE');expect(detail.rows[0][2]).toBe(1);expect(data.csv).toContain("'=SIM-NURSE");expect(data.csv).not.toContain('SIM-LAST');expect(data.csv).not.toContain('DEMO-DOC-1');
 expect(()=>createReports({cases:source,reporting:[],permissions:['DESCARGAS'],session:{user:'SIM'},config:{qnos:[]},boardMetrics:()=>({})}).download('','2026-10-07','MES','KPI_ENFERMERIA')).toThrow('No tiene permiso');
});

test('cancelaciones agrupa la selección y asocia específicos sin usar observaciones',()=>{
 const source=[1,2,3,4].map(n=>({...cases[0],id:'SIM-CAN-'+n,estado:'CANCELADO',operado:false,observaciones:'NOTA GENERAL DIFERENTE '+n}));
 const records=[
  {'ID CASO':'SIM-CAN-1','CAUSA PRINCIPAL':'Insumos, medicamentos o dispositivos','MOTIVO ESPECÍFICO':'Falta de implante','OBSERVACIONES':'NOTA A'},
  {'ID CASO':'SIM-CAN-2','CAUSA PRINCIPAL':'Insumos, medicamentos o dispositivos','MOTIVO ESPECÍFICO':'Falta de implante','OBSERVACIONES':'NOTA B'},
  {'ID CASO':'SIM-CAN-3','CAUSA PRINCIPAL':'Insumos, medicamentos o dispositivos','MOTIVO ESPECÍFICO':'Falta de sutura'}
 ];
 const r=createReports({cases:source,reporting:[],permissions:['DESCARGAS','INDICADORES_VER'],session:{user:'SIM'},config:{qnos:[]},boardMetrics:()=>({}),cancellations:records,reportRange:{period:'MES',from:'2026-10-01',to:'2026-10-31'}});
 const summary=r.kpi('','2026-10-07','MES');
 expect(summary.cancelaciones.causas).toEqual([{label:'Insumos, medicamentos o dispositivos',value:3},{label:'SIN MOTIVO SELECCIONADO',value:1}]);
 expect(summary.cancelaciones.motivos).toContainEqual({motivoSeleccionado:'Insumos, medicamentos o dispositivos',motivoEspecifico:'Falta de implante',value:2});
 expect(summary.summary.canceladas).toBe(4);expect(summary.summary.tasaCancelacion).toBe(100);
 const download=r.download('','2026-10-01','MES','KPI_CANCELACIONES');
 expect(download.sections.find(s=>s.title==='Motivos específicos asociados').headers).toEqual(['Motivo seleccionado','Motivo específico','Casos']);
 expect(download.csv).toContain('Falta de implante');expect(download.csv).not.toContain('NOTA');
 const ranged=createReports({cases:[...source,{...source[0],id:'SIM-OUT',fecha:'2026-11-01'}],reporting:[],permissions:['DESCARGAS','INDICADORES_VER'],session:{},config:{qnos:[]},boardMetrics:()=>({}),cancellations:records,reportRange:{period:'MES',from:'2026-10-01',to:'2026-10-31'}});
 expect(ranged.download('','2026-10-01','MES','KPI_CANCELACIONES').csv).toBe(download.csv);
});

test('última cancelación estructurada por caso prevalece; las notas históricas no se infieren',()=>{
 const source=[{id:'SIM-1',estado:'CANCELADO',observaciones:'Anestesia | Valoración pendiente',motivoSeleccionadoCancelacion:'Anestesia',motivoEspecificoCancelacion:'Valoración pendiente'},{id:'SIM-2',estado:'CANCELADO',observaciones:'Anestesia | Nota sin selección verificable'},{id:'SIM-3',estado:'ALTA'}];
 const records=[{'ID CASO':'SIM-1','CAUSA PRINCIPAL':'Otra','MOTIVO ESPECÍFICO':'Registro anterior'},{'ID CASO':'SIM-1','CAUSA PRINCIPAL':'Condición clínica','MOTIVO ESPECÍFICO':'Valoración ficticia'}];
 expect(cancellationSummary(source,records).causas).toEqual([{label:'Condición clínica',value:1},{label:'SIN MOTIVO SELECCIONADO',value:1}]);
 expect(cancellationSummary(source.slice(0,1)).motivos[0].motivoEspecifico).toBe('Valoración pendiente');
 expect(cancellationSummary(source,records).motivos).toHaveLength(2);
});
