import {test,expect} from 'bun:test';
import {intraoperativePatch,normalizeIntraoperativeCard,requiredIntraoperativeError} from '../intraoperative.ts';
test('an empty optional record preserves data without inventing negative answers or durations',()=>{
  expect(intraoperativePatch({},{'PROFILAXIS ADMINISTRADA':'SÍ'})).toEqual({patch:{},error:null});
  expect(intraoperativePatch({},{'HORA INICIO CIRUGÍA / INCISIÓN':'10:00','HORA FIN CIRUGÍA':'10:00'})).toEqual({patch:{},error:null});
  expect(intraoperativePatch({horaInicioCirugia:'10:15'}).patch).toEqual({'HORA INICIO CIRUGÍA / INCISIÓN':'10:15','PROFILAXIS → INCISIÓN (MIN)':''});
  expect(intraoperativePatch({profilaxisAdministrada:'SÍ'}).error).toBeNull();
});
test('partial entries combine with previous observations and support midnight',()=>{
  const previous={'PROFILAXIS ADMINISTRADA':'SÍ','HORA ADMINISTRACIÓN PROFILAXIS':'23:45','HORA INICIO CIRUGÍA / INCISIÓN':'00:15'};
  expect(intraoperativePatch({horaFinCirugia:'01:00'},previous).patch['PROFILAXIS → INCISIÓN (MIN)']).toBe(30);
  expect(intraoperativePatch({horaFinCirugia:'01:00'},previous).error).toBeNull();
});
test('an explicit negative answer clears medication but omission preserves it',()=>{
  const previous={'PROFILAXIS ADMINISTRADA':'SÍ','PROFILAXIS ANTIBIÓTICA / MEDICAMENTO':'SIMULADO','HORA ADMINISTRACIÓN PROFILAXIS':'09:00'};
  expect(intraoperativePatch({},previous).patch).toEqual({});
  expect(intraoperativePatch({profilaxisAdministrada:'NO'},previous).patch).toMatchObject({'PROFILAXIS ADMINISTRADA':'NO','PROFILAXIS ANTIBIÓTICA / MEDICAMENTO':'','HORA ADMINISTRACIÓN PROFILAXIS':'','PROFILAXIS → INCISIÓN (MIN)':''});
});
test('provided invalid values are rejected while unprovided fields stay optional',()=>{
  for(const body of [{horaAnestesia:'24:00'},{horaFinCirugia:'12:60'},{profilaxisAdministrada:'MAYBE'},{clasificacionCirugia:'OTHER'},{horaInicioCirugia:'12:00',horaFinCirugia:'12:00'}])expect(intraoperativePatch(body).error).toBeTruthy();
});
test('card moments default to exit and can all be disabled for manual registration',()=>{
  expect(normalizeIntraoperativeCard()).toEqual({onEntry:false,onQnoExit:true,onRecoveryExit:false,required:false});
  expect(normalizeIntraoperativeCard({onEntry:true,onQnoExit:false,onRecoveryExit:true,required:true})).toEqual({onEntry:true,onQnoExit:false,onRecoveryExit:true,required:true});
  expect(normalizeIntraoperativeCard({onEntry:false,onQnoExit:false,onRecoveryExit:false})).toEqual({onEntry:false,onQnoExit:false,onRecoveryExit:false,required:false});
});
test('mandatory configuration requires complete evidence and affirmative prophylaxis details',()=>{
  expect(requiredIntraoperativeError({})).toContain('obligatorio');
  const record={'HORA INICIO ANESTESIA':'10:00','HORA FIN ANESTESIA':'11:10','HORA INICIO CIRUGÍA / INCISIÓN':'10:15','HORA FIN CIRUGÍA':'11:00','PROFILAXIS ADMINISTRADA':'NO','CLASIFICACIÓN CIRUGÍA':'LIMPIA'};
  expect(requiredIntraoperativeError(record)).toBeNull();
  expect(requiredIntraoperativeError({...record,'PROFILAXIS ADMINISTRADA':'SÍ'})).toContain('antibiótico');
  expect(requiredIntraoperativeError({...record,'PROFILAXIS ADMINISTRADA':'SÍ','PROFILAXIS ANTIBIÓTICA / MEDICAMENTO':'SIMULADO','HORA ADMINISTRACIÓN PROFILAXIS':'09:45'})).toBeNull();
});
