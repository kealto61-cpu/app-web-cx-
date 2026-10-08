import {test,expect} from 'bun:test';
import {calculateCallProductivity,calculateSurgicalProductivity,callProductivityReport,surgicalNurseSnapshot,resolveSurgeryNurses} from '../nursing-productivity.ts';
const episodes=[{id:'SIM-E1',documentNumber:'SIM-DOC-1',surgeryDate:'2026-09-01'},{id:'SIM-E2',documentNumber:'SIM-DOC-1',surgeryDate:'2026-10-02'},{id:'SIM-E3',documentNumber:'SIM-DOC-3',surgeryDate:'2026-10-02'}];
const call=(id,episodeId,recordedBy,number,contactResult='Sí',realDate='2026-10-07')=>({id,episodeId,recordedBy,professional:'Jefe SIMULADO '+recordedBy,number,contactResult,realDate});

test('productividad usa fecha de llamada, autor y pacientes distintos sin sumar dos cirugías como dos personas',()=>{
 const data=calculateCallProductivity(episodes,[call('SIM-C1','SIM-E1','SIM-A',1),call('SIM-C2','SIM-E2','SIM-A',1),call('SIM-C3','SIM-E2','SIM-A',2,'No contesta'),call('SIM-C4','SIM-E2','SIM-B',3),call('SIM-C5','SIM-E3','SIM-B',1,'Sí','2026-11-01')],{from:'2026-10-01',to:'2026-10-31'});
 expect(data.dateBasis).toBe('CALL_DATE');expect(data.totals.attempts).toBe(4);
 expect(data.rows.find(r=>r.user==='SIM-A')).toMatchObject({attempts:3,effectiveContacts:2,withoutEffectiveContact:1,patientsContacted:1,episodesWorked:2,firstCalls:2,secondCalls:1,additionalCalls:0,contactRate:66.67,callsPerWorkedHour:null});
 expect(data.rows.find(r=>r.user==='SIM-B')).toMatchObject({attempts:1,patientsContacted:1,additionalCalls:1});
 expect(JSON.stringify(data)).not.toContain('SIM-DOC-1');expect(JSON.stringify(data)).not.toContain('SIM-E1');
});

test('autor no verificable queda separado, nombres iguales no mezclan usuarios y el mismo ID no suma dos fichas',()=>{
 const first={...call('SIM-C1','SIM-E1','SIM-A',1),professional:'Nombre SIMULADO compartido'};
 const data=calculateCallProductivity(episodes,[first,first,{...call('SIM-C2','SIM-E1','SIM-B',2),professional:first.professional},call('SIM-C3','SIM-E1','',3),call('SIM-C4','NO-EPISODE','SIM-A',4)]);
 expect(data.rows).toHaveLength(3);expect(data.totals).toMatchObject({attempts:3,unassignedAttempts:1,professionals:2});
 expect(data.rows.find(r=>!r.attributed)?.professional).toBe('SIN RESPONSABLE VERIFICABLE');
});

test('identificador de cuenta conserva autor al cambiar su nombre de usuario y admite historia verificable anterior',()=>{
 const data=calculateCallProductivity(episodes,[call('SIM-C0','SIM-E1','SIM-ANTERIOR',1),{...call('SIM-C1','SIM-E1','SIM-ANTERIOR',2),professionalUserId:'SIM-UID'},{...call('SIM-C2','SIM-E1','SIM-NUEVO',3),professionalUserId:'SIM-UID',recordedAt:'2026-10-07T15:00:00Z'}]);
 expect(data.rows).toHaveLength(1);expect(data.rows[0]).toMatchObject({user:'SIM-NUEVO',attempts:3});
});

test('rango incluye ambos extremos y rechaza fechas inexistentes y períodos invertidos',()=>{
 const records=[call('SIM-START','SIM-E1','SIM-A',1,'Sí','2026-02-01'),call('SIM-END','SIM-E1','SIM-A',2,'Sí','2026-02-28'),call('SIM-OUT','SIM-E1','SIM-A',3,'Sí','2026-03-01')];
 expect(calculateCallProductivity(episodes,records,{from:'2026-02-01',to:'2026-02-28'}).totals.attempts).toBe(2);
 expect(()=>calculateCallProductivity(episodes,records,{from:'2026-02-30'})).toThrow('fechas válidas');
 expect(()=>calculateCallProductivity(episodes,records,{from:'2026-10-02',to:'2026-10-01'})).toThrow('posterior');
 expect(calculateCallProductivity(episodes,[],{}).rows).toEqual([]);
});

test('cirugía cuenta casos operados una vez, separa no realizados y muestra ausencia del jefe sin atribuir al turno actual',()=>{
 const first={id:'SIM-QX1',operado:true,enfermeroJefeCirugia:'Jefe SIMULADO A',enfermeroJefe:'Jefe del siguiente turno',estado:'ALTA'};
 const data=calculateSurgicalProductivity([first,first,{id:'SIM-QX2',operado:true,enfermeroJefeCirugia:'JEFE SIMULADO A',estado:'HOSPITALIZACIÓN'},{id:'SIM-QX3',operado:false,enfermeroJefeCirugia:'Jefe SIMULADO A',estado:'PROGRAMADO'},{id:'SIM-QX4',operado:true,enfermeroJefe:'Jefe SIMULADO B',estado:'RECUPERACIÓN',jefeTurno:'Jefe SIMULADO B'}]);
 expect(data.rows).toHaveLength(2);expect(data.totals).toMatchObject({surgeries:3,unassignedSurgeries:1,professionals:1});
 expect(data.rows.find(r=>r.attributed)).toMatchObject({casesWithResponsible:3,surgeries:2,discharge:1,hospitalization:1,recovery:0});
 expect(data.rows.some(r=>r.professional==='Jefe SIMULADO B')).toBe(false);
});

test('el responsable de cirugía se captura una vez y la evidencia histórica no se sustituye por el último jefe del caso',()=>{
 expect(surgicalNurseSnapshot({OPERADO:'FALSE'},'SIM-NURSE-A')).toEqual({'ENFERMERO JEFE CIRUGÍA':'SIM-NURSE-A'});
 expect(surgicalNurseSnapshot({OPERADO:'TRUE'},'SIM-NURSE-B')).toEqual({});
 expect(surgicalNurseSnapshot({OPERADO:'FALSE','ENFERMERO JEFE CIRUGÍA':'SIM-NURSE-A'},'SIM-NURSE-B')).toEqual({});
 const entry=(id,stamp,chief,performed='TRUE')=>({'ID CASO':id,'MARCA TEMPORAL':stamp,'ACCIÓN':'MOVER PACIENTE',DETALLE:JSON.stringify({'ENFERMERO JEFE':chief,OPERADO:performed,'ESTADO ACTUAL':'RECUPERACIÓN'})});
 const cases=[{id:'SIM-A',enfermeroJefe:'SIM-LAST'},{id:'SIM-B',enfermeroJefeCirugia:'SIM-SNAPSHOT'},{id:'SIM-C',enfermeroJefe:'SIM-NO-EVIDENCE'}];
 const resolved=resolveSurgeryNurses(cases,[entry('SIM-A','2026-10-07 12:00:00','SIM-ACTOR'),entry('SIM-A','2026-10-07 13:00:00','SIM-OTHER'),entry('SIM-B','2026-10-07 12:00:00','SIM-OTHER'),entry('SIM-C','2026-10-07 11:00:00','SIM-OTHER','FALSE')]);
 expect(resolved.map(c=>c.enfermeroJefeCirugia)).toEqual(['SIM-ACTOR','SIM-SNAPSHOT','']);expect(cases[0].enfermeroJefe).toBe('SIM-LAST');
});

test('descarga refleja fechas de actividad, límites, totales por autor y protege texto de fórmulas de hoja',()=>{
 const data=calculateCallProductivity(episodes,[{...call('SIM-C1','SIM-E1','SIM-A',1),professional:'=SIM-EXAMPLE'}],{from:'2026-01-01',to:'2026-12-31'});
 const report=callProductivityReport(data,'ANIO');expect(report.filename).toContain('2026-01-01_2026-12-31');
 expect(report.sections[0].rows[0]).toContain('Fecha real de llamada');expect(report.sections[1].rows[0][11]).toBe('No evaluable');expect(report.csv).toContain("'=SIM-EXAMPLE");
});
