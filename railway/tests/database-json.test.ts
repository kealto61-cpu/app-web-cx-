import {test,expect} from 'bun:test';
import postgres from 'postgres';
import {PGlite} from '@electric-sql/pglite';
import {pgliteAdapter} from './pglite-adapter.ts';
import {DATABASE_JSON_TYPES,parseDatabaseJson,repairSimulationJson} from '../database-json.ts';
test('the real PostgreSQL driver serializes explicit JSON parameters exactly once',async()=>{
 const sql=postgres('postgresql://SIMULATED@localhost/NO_NETWORK',{types:DATABASE_JSON_TYPES});
 const original={ESTADO:'ACTIVO',NOMBRE:'USUARIO FICTICIO'},json=JSON.stringify(original);
 expect(sql.options.serializers[3802](json)).toBe(json);expect(sql.options.serializers[114](json)).toBe(json);
 expect(sql.options.serializers[3802](original)).toBe(json);
 expect(sql.options.parsers[3802](json)).toEqual(original);
 await sql.end({timeout:0});
});
test('legacy JSON text wrappers decode without changing clinical values',()=>{
 const data={patientName:'PACIENTE FICTICIO',clinical:{painScore:0,fever:'No'},callId:'SIM-CALL-1'};
 expect(parseDatabaseJson(JSON.stringify(JSON.stringify(data)))).toEqual(data);
 expect(parseDatabaseJson(JSON.stringify('Texto literal'))).toBe('Texto literal');
 expect(parseDatabaseJson(JSON.stringify('{texto no JSON'))).toBe('{texto no JSON');
});
test('repair is idempotent, preserves IDs and rows, and never changes the public schema',async()=>{
 const db=new PGlite(),sql=pgliteAdapter(db),original={ESTADO:'ACTIVO',NOMBRE:'USUARIO FICTICIO',callId:'SIM-CALL-1'};
 await db.exec('create schema qx_simulation;create table qx_simulation.qx_users(id text primary key,payload jsonb);create table public.qx_users(id text primary key,payload jsonb);');
 const wrapper=JSON.stringify(JSON.stringify(original));await sql.unsafe('insert into qx_simulation.qx_users values($1,$2::jsonb)',['SIM',wrapper]);await sql.unsafe('insert into public.qx_users values($1,$2::jsonb)',['PUBLIC-SENTINEL',wrapper]);
 expect(await repairSimulationJson(sql)).toBe(1);expect((await sql.unsafe('select id,payload from qx_simulation.qx_users'))[0]).toEqual({id:'SIM',payload:original});
 expect((await sql.unsafe('select payload from public.qx_users'))[0].payload).toBe(JSON.stringify(original));expect(await repairSimulationJson(sql)).toBe(0);await db.close();
});
