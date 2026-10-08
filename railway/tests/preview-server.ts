// Local visual verification against the full server and a disposable PostgreSQL
// engine. This process never connects to Drive or the Railway database.
import {mock} from 'bun:test';
import {PGlite} from '@electric-sql/pglite';
import {pgliteAdapter} from './pglite-adapter.ts';
const engine=new PGlite();
mock.module('postgres',()=>({default:(_url,options)=>{
  const adapter=pgliteAdapter(engine),ready=options?.connection?.search_path?engine.exec('set search_path=qx_simulation'):Promise.resolve();
  return {...adapter,async unsafe(sql,args=[]){await ready;return adapter.unsafe(sql,args)},async begin(callback){await ready;return adapter.begin(callback)}};
}}));
Bun.env.DATABASE_URL='postgresql://simulation@localhost/not-a-real-database';
Bun.env.DATA_MODE='SIMULATED';
Bun.env.DEMO_ADMIN_PIN='PruebaQx26';
Bun.env.PORT='8766';
await import('../server.ts');
