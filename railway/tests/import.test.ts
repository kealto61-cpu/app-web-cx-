import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateProgrammingAppointment} from '../programming.ts';

// Exercise the actual shipped reader functions with fictitious orders and PDF text.
function reader(file:string){
  const source=readFileSync(file,'utf8');
  const between=(a:string,b:string)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
  const helpers=between('function orderClean(', 'let ocrWorkerPromise=');
  const headers=between('function scheduleHeaderField(', 'async function schedulePdfGeometry(');
  const row=between('function scheduleDurationMinutes(', 'function schedulePdfPageRows(');
  const pdf=between('function splitPdfPatientBlocks(', 'async function parsePdfBulk(');
  const mappings=between('const fields={', 'function bulkFieldInput(');
  const context=vm.createContext({Date,URL,location:{origin:'https://example.invalid'},pdfScheduleMarker:'[[QX_TABLA_FILA]]'});
  vm.runInContext(helpers+headers+row+pdf+mappings,context);
  return context;
}
for(const file of ['public/index.html','../Index.html']){
  const label=file.includes('public')?'Railway':'Apps Script';
  test(label+': fechas de cirugía y cita POP se mantienen independientes',()=>{
    const r=reader(file);const result=r.parseOrderTextBulk('Paciente: PACIENTE FICTICIO\nDocumento: 900000001\nProcedimiento: ARTROSCOPIA FICTICIA\nFecha cirugía: 07/10/2026\nHora cirugía: 07:00\nFecha cita POP: 15/10/2026\nHora cita POP: 2:30 PM','FICTICIO.pdf');
    expect(result).toMatchObject({fecha:'2026-10-07',hora:'07:00',fechaCitaPop:'2026-10-15',horaCitaPop:'14:30'});
    const empty=r.parseOrderTextBulk('Paciente: PACIENTE FICTICIO\nDocumento: 900000001\nFecha cirugía: 07/10/2026\nHora cirugía: 07:00','FICTICIO.pdf');
    expect(empty.fechaCitaPop).toBe('');expect(empty.horaCitaPop).toBe('');
  });
  test(label+': columnas POP primero y encabezados vacíos no capturan la cirugía',()=>{
    const r=reader(file),map=r.autoMap(['','Fecha cita POP','Hora cita POP','Paciente','Fecha cirugía','Hora cirugía','Documento']);
    expect(map.fecha).toBe(4);expect(map.hora).toBe(5);expect(map.fechaCitaPop).toBe(1);expect(map.horaCitaPop).toBe(2);expect(map.especialidad).toBe(-1);
    expect(r.scheduleHeaderField('Fecha cita POP')).toBe('fechaCitaPop');expect(r.scheduleHeaderField('Hora cita POP')).toBe('horaCitaPop');
    const only=r.autoMap(['Fecha cita POP','Hora cita POP']);expect(only.fecha).toBe(-1);expect(only.hora).toBe(-1);
  });
  test(label+': PDF tabular y orden combinada extraen fecha y hora sin cantidad fija',()=>{
    const r=reader(file),record=r.schedulePatientRecord({paciente:'PACIENTE FICTICIO',documento:'900000001',fechaCitaPop:'15/10/2026 08:45'},'QNO 1','FICTICIO.pdf');
    expect(record.fechaCitaPop).toBe('2026-10-15');expect(record.horaCitaPop).toBe('08:45');
    for(const count of [1,3,17]){
      const text=Array.from({length:count},(_,i)=>'Paciente: PACIENTE FICTICIO '+i+'\nDocumento: '+(900000001+i)+'\nProcedimiento: CIRUGIA FICTICIA\nCita POP: 15/10/2026 08:45').join('\n');
      const rows=r.parsePdfPatientText(text,'FICTICIO.pdf');expect(rows.length).toBe(count);expect(rows.every((p:any)=>p.fechaCitaPop==='2026-10-15'&&p.horaCitaPop==='08:45')).toBe(true);
    }
  });
  test(label+': la cita inválida no se sustituye por la fecha actual',()=>{
    const r=reader(file);expect(r.importAppointmentValue('30/02/2026','date')).toBe('');expect(r.importAppointmentValue('','date')).toBe('');
    expect(r.importAppointmentValue(new Date('2026-10-15T08:45:00Z'),'date')).toBe('2026-10-15');expect(r.importAppointmentValue(new Date('2026-10-15T08:45:00Z'),'time')).toBe('08:45');
  });
}
test('API de programación preserva cita opcional y rechaza datos inválidos',()=>{
  expect(validateProgrammingAppointment({})).toEqual({fechaCitaPop:'',horaCitaPop:''});
  expect(validateProgrammingAppointment({fechaCitaPop:'2026-10-15',horaCitaPop:'08:45'})).toEqual({fechaCitaPop:'2026-10-15',horaCitaPop:'08:45'});
  expect(validateProgrammingAppointment({fechaCitaPop:'2026-02-30'}).error).toContain('Fecha');
  expect(validateProgrammingAppointment({horaCitaPop:'25:00'}).error).toContain('Hora');
});
