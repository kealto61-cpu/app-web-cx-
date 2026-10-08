import { beforeAll, beforeEach, afterAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { buildCallQueue, followupState } from '../followup.ts';
import { initPasp, handlePasp } from '../pasp.ts';
import { readFileSync } from 'node:fs';
import { pgliteAdapter } from './pglite-adapter.ts';

// PostgreSQL runs entirely in memory. Every record below is explicitly fictitious.
// No network, Google Drive, deployed database, or production credential is used.
let db: PGlite;
let sql: any;
const savedMode = Bun.env.DATA_MODE;
const schemaSeed = JSON.parse(readFileSync('./data/pasp-schema.json', 'utf8'));
const staff = { user: 'qa_simulated_nurse', name: 'Enfermería SIMULADA QA', role: 'USER' };
const coord = { user: 'qa_simulated_coord', name: 'Coordinación SIMULADA QA', role: 'USER' };
const safety = { user: 'qa_simulated_safety', name: 'Seguridad SIMULADA QA', role: 'USER' };
const superadmin = { user: 'qa_simulated_admin', name: 'Administrador SIMULADO QA', role: 'SUPERADMIN' };
const permissions = ['CUIDADOS_POSTOP'];
const coordPermissions = ['COORDINACION_VER', 'PASP_COORDINACION_GESTIONAR'];
const safetyPermissions = ['COORDINACION_VER', 'PASP_SEGURIDAD_GESTIONAR'];

async function request(path: string, payload?: any, opts: any = {}) {
  const url = new URL('https://example.invalid/api/pasp' + path);
  const req = new Request(url, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: payload === undefined ? {} : { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const response = await handlePasp(req, url, {
    sql,
    session: opts.session === undefined ? staff : opts.session,
    permissions: opts.permissions === undefined ? permissions : opts.permissions,
    findCase: opts.findCase,
    listOperatedCases: opts.listOperatedCases,
    json: (body: any, status = 200) => Response.json(body, { status }),
  });
  if (!response) throw new Error('PASP endpoint returned no response');
  return { status: response.status, body: await response.json() as any };
}

function episodePayload(overrides: any = {}) {
  return {
    sourceKind: 'SIMULADO', simulationConfirmed: true, surgeryConfirmed: true,
    patientName: 'Paciente SIMULADO QA', documentNumber: 'SIM-QA-0001',
    phone: 'SIM-NO-CONTACTAR', specialist: 'Especialista SIMULADO QA',
    specialty: 'Ortopedia', procedure: 'Artroscopia de hombro SIMULADA',
    surgeryDate: '2026-10-01', patientStatus: 'Ambulatorio',
    appointment: { date: '2026-10-20', time: '10:00', status: 'Programada' },
    ...overrides,
  };
}

async function episode(overrides: any = {}) {
  const result = await request('/episodes', episodePayload(overrides));
  expect(result.status).toBe(201);
  return result.body.episode;
}

function callPayload(e: any, overrides: any = {}) {
  return {
    episodeId: e.id, expectedVersion: e.version, number: 1,
    realDate: '2026-10-05', time: '08:30', contactResult: 'Sí',
    clinical: { feelsWell: 'Sí', painControlled: 'Sí', painScore: '2', fever: 'No' },
    observations: 'Evaluación de prueba SIMULADA.', classification: 'Evolución esperada',
    conduct: 'Educación y seguimiento',
    extra: { identityVerified: true, authorizationConfirmed: true, respondent: 'Usuario SIMULADO', contactMedium: 'Llamada telefónica' },
    ...overrides,
  };
}

async function call(e: any, overrides: any = {}) {
  const result = await request('/calls', callPayload(e, overrides));
  expect(result.status).toBe(200);
  return result.body;
}

async function count(table: string) {
  return Number((await sql.unsafe(`select count(*)::int as n from qx_simulation.${table}`))[0].n);
}

beforeAll(async () => {
  Bun.env.DATA_MODE = 'SIMULATED';
  db = new PGlite();
  sql = pgliteAdapter(db);
  await db.exec(`create table public.qx_cases(case_id text primary key, payload jsonb not null);
    insert into public.qx_cases values('PUBLIC-QA-SENTINEL','{"marker":"DO_NOT_MIGRATE_OR_READ"}');`);
  await initPasp(sql);
}, 30000);

beforeEach(async () => {
  Bun.env.DATA_MODE = 'SIMULATED';
  await db.exec('truncate qx_simulation.qx_pasp_calls,qx_simulation.qx_pasp_episodes,qx_simulation.qx_pasp_escalations,qx_simulation.qx_pasp_history,qx_simulation.qx_event_outbox cascade;');
  await sql.unsafe("update qx_simulation.qx_pasp_config set version=1,payload=$1::jsonb where id='SETTINGS'", [JSON.stringify({ sourceKind: 'SIMULADO', maxContactAttempts: null, scheduling: schemaSeed.scheduling })]);
  await sql.unsafe("update qx_simulation.qx_pasp_config set version=1,payload=$1::jsonb where id='SCHEMA'", [JSON.stringify(schemaSeed)]);
  await db.exec("delete from qx_simulation.qx_pasp_care_catalog where id like 'QA-%'; delete from qx_simulation.qx_pasp_dictionary where id like 'QA-%';");
});

afterAll(async () => {
  if (savedMode === undefined) delete Bun.env.DATA_MODE; else Bun.env.DATA_MODE = savedMode;
  await db?.close();
});

describe('PASP migration and isolation', () => {
  test('creates simulation tables and keeps the existing public schema untouched', async () => {
    const tables = await sql.unsafe("select table_name from information_schema.tables where table_schema='qx_simulation'");
    expect(tables.map((x: any) => x.table_name)).toContain('qx_pasp_calls');
    expect(tables.map((x: any) => x.table_name)).toContain('qx_pasp_escalations');
    expect(await sql.unsafe('select * from public.qx_cases')).toEqual([{ case_id: 'PUBLIC-QA-SENTINEL', payload: { marker: 'DO_NOT_MIGRATE_OR_READ' } }]);
    expect(await count('qx_pasp_episodes')).toBe(0);
    expect(await count('qx_pasp_calls')).toBe(0);
  });

  test('initialization is additive and idempotent, preserving administrator edits', async () => {
    const rows = await sql.unsafe('select id from qx_simulation.qx_pasp_care_catalog order by id');
    expect(rows.length).toBeGreaterThan(30);
    const key = rows[0].id;
    const original = await sql.unsafe('select payload from qx_simulation.qx_pasp_care_catalog where id=$1', [key]);
    await sql.unsafe("update qx_simulation.qx_pasp_care_catalog set payload=payload||'{\"qaMarker\":\"SIMULATED_CUSTOM_EDIT\"}'::jsonb where id=$1", [key]);
    await initPasp(sql);
    expect((await sql.unsafe('select payload from qx_simulation.qx_pasp_care_catalog where id=$1', [key]))[0].payload.qaMarker).toBe('SIMULATED_CUSTOM_EDIT');
    expect((await sql.unsafe('select id from qx_simulation.qx_pasp_care_catalog')).length).toBe(rows.length);
    await sql.unsafe('update qx_simulation.qx_pasp_care_catalog set payload=$1::jsonb where id=$2', [JSON.stringify(original[0].payload), key]);
  });

  test('exposes exactly the 70 institutional matrix headers without patient rows', async () => {
    const result = await request('/schema', undefined, { session: null, permissions: [] });
    expect(result.status).toBe(200);
    expect(result.body.headers).toHaveLength(70);
    expect(result.body.headers.map((h: any) => h.label)).toEqual(schemaSeed.headers.map((h: any) => h.label));
    expect(result.body.sourceKind).toBe('SIMULADO');
    expect(result.body.episodes).toBeUndefined();
    expect(result.body.calls).toBeUndefined();
  });

  test.each(['REAL', 'PRODUCTION', ''])('fails closed when DATA_MODE is %s', async (value) => {
    Bun.env.DATA_MODE = value;
    const result = await request('/episodes');
    expect(result.status).toBe(503);
    expect(await count('qx_pasp_episodes')).toBe(0);
  });

  test('requires explicit simulation confirmation and validates calendar dates', async () => {
    expect((await request('/episodes', episodePayload({ sourceKind: 'REAL' }))).status).toBe(400);
    expect((await request('/episodes', episodePayload({ simulationConfirmed: false }))).status).toBe(400);
    expect((await request('/episodes', episodePayload({ surgeryConfirmed: false }))).status).toBe(400);
    expect((await request('/episodes', episodePayload({ surgeryDate: '2026-02-30' }))).status).toBe(400);
    expect(await count('qx_pasp_episodes')).toBe(0);
  });

  test('one simulated patient can have independent surgical episodes', async () => {
    const first = await episode();
    const second = await episode({ surgeryDate: '2026-10-02', procedure: 'Procedimiento SIMULADO diferente' });
    expect(first.id).not.toBe(second.id);
    expect(first.paspCode).not.toBe(second.paspCode);
    expect(first.documentNumber).toBe(second.documentNumber);
    expect(await count('qx_pasp_episodes')).toBe(2);
    expect(Object.keys(first.matrix)).toHaveLength(70);
  });

  test('programmed patients need a performed surgery and one episode per source case', async () => {
    const payload=episodePayload({sourceCaseId:'SIM-QX-REALIZADA'});
    const original={'DOCUMENTO':payload.documentNumber,'FECHA CIRUGÍA':payload.surgeryDate,OPERADO:'FALSE'};
    const opts={findCase:async()=>({payload:original})};
    expect((await request('/episodes',payload,opts)).status).toBe(400);
    original.OPERADO='TRUE';
    expect((await request('/episodes',{...payload,documentNumber:'OTRO-SIMULADO'},opts)).status).toBe(400);
    const created=await request('/episodes',payload,opts);expect(created.status).toBe(201);
    expect(created.body.episode.appointment).toMatchObject({date:'2026-10-20',time:'10:00'});
    expect((await request('/episodes',payload,opts)).status).toBe(409);
    expect(await count('qx_pasp_episodes')).toBe(1);
  });
});

describe('one immutable form per telephone call', () => {
  test('stores each actual call under its own immutable ID and sequential number', async () => {
    const e = await episode();
    const first = await call(e);
    const original = await sql.unsafe('select payload from qx_simulation.qx_pasp_calls where id=$1', [first.call.id]);
    const rejected = await request('/calls', callPayload(first.episode, { number: 1 }));
    expect(rejected.status).toBe(409);
    const second = await call(first.episode, { number: 2, thirdCall:{enabled:true,date:'2026-10-05',reason:'Seguimiento adicional SIMULADO'}, time: '09:30', clinical: { feelsWell: 'No', painScore: '4' }, observations: 'Segundo intento SIMULADO, ficha distinta.' });
    const third = await call(second.episode, { number: 3, time: '10:30' });
    expect(new Set([first.call.id, second.call.id, third.call.id]).size).toBe(3);
    expect(third.episode.calls).toHaveLength(3);
    expect(third.episode.calls.map((x: any) => x.number)).toEqual([1, 2, 3]);
    expect(await sql.unsafe('select payload from qx_simulation.qx_pasp_calls where id=$1', [first.call.id])).toEqual(original);
    expect(third.episode.calls.find((x: any) => x.id === first.call.id).clinical.feelsWell).toBe('Sí');
    expect(third.episode.version).toBe(4);
  });

  test('preserves the original call when a signed correction is appended as an addendum', async () => {
    const e = await episode();
    const saved = await call(e);
    const original = await sql.unsafe('select payload from qx_simulation.qx_pasp_calls where id=$1', [saved.call.id]);
    const path = '/calls/' + saved.call.id + '/addenda';
    const missingReason = await request(path, { episodeId: e.id, expectedVersion: saved.episode.version, content: 'Corrección SIMULADA' });
    expect(missingReason.status).toBe(400);
    const corrected = await request(path, { episodeId: e.id, expectedVersion: saved.episode.version, reason: 'Corrección de digitación SIMULADA', content: 'EVA registrada erróneamente, valor confirmado SIMULADO 3.', clinical: { painScore: '3' } });
    expect(corrected.status).toBe(200);
    expect(corrected.body.addendum.authorUser).toBe(staff.user);
    expect(corrected.body.addendum.recordedAt).toBeTruthy();
    expect(corrected.body.addendum.callId).toBe(saved.call.id);
    expect(corrected.body.episode.calls).toHaveLength(1);
    expect(corrected.body.episode.calls[0].addenda).toHaveLength(1);
    expect(corrected.body.episode.calls[0].clinical.painScore).toBe('2');
    expect(corrected.body.episode.calls[0].addenda[0].clinical.painScore).toBe('3');
    expect(await sql.unsafe('select payload from qx_simulation.qx_pasp_calls where id=$1', [saved.call.id])).toEqual(original);
    expect((await request(path, { episodeId: e.id, expectedVersion: saved.episode.version, reason: 'Corrección obsoleta SIMULADA', content: 'No debe grabarse.' })).status).toBe(409);
  });

  test('detects stale episode revisions without creating an extra call or history', async () => {
    const e = await episode();
    await call(e);
    const historyBefore = await count('qx_pasp_history');
    const stale = await request('/calls', callPayload(e, { number: 2 }));
    expect(stale.status).toBe(409);
    expect(await count('qx_pasp_calls')).toBe(1);
    expect(await count('qx_pasp_history')).toBe(historyBefore);
  });

  test('a retried client submission returns the original form instead of duplicating it', async () => {
    const e = await episode();
    const first = await call(e, { idempotencyKey: 'simulated-submit-001' });
    const repeated = await request('/calls', callPayload(e, { idempotencyKey: 'simulated-submit-001' }));
    expect(repeated.status).toBe(200);
    expect(repeated.body.replayed).toBe(true);
    expect(repeated.body.call.id).toBe(first.call.id);
    expect(await count('qx_pasp_calls')).toBe(1);
    expect(repeated.body.episode.version).toBe(2);
  });

  test.each(['No', 'No contesta', 'Número errado', 'Buzón', 'No aplica', 'Hospitalizado', 'Fallecido'])('records %s as an attempt with no fabricated clinical findings', async (contactResult) => {
    const e = await episode();
    const result = await request('/calls', callPayload(e, { contactResult, clinical: {}, classification: '', conduct: '', extra: {} }));
    expect(result.status).toBe(200);
    expect(result.body.call.clinical).toEqual({});
    expect(result.body.call.contactResult).toBe(contactResult);
    expect(result.body.call.classification).not.toBe('Evolución esperada');
    expect(result.body.escalation.area).toBe('Coordinación de Cirugía');
    expect(result.body.episode.safetyAlert).toBe('No');
  });

  test('rejects clinical answers and observed procedures without effective contact', async () => {
    const e = await episode();
    expect((await request('/calls', callPayload(e, { contactResult: 'Buzón', classification: 'Buzón', clinical: { feelsWell: 'Sí' }, extra: {} }))).status).toBe(400);
    expect((await request('/calls', callPayload(e, { contactResult: 'Buzón', classification: 'Buzón', clinical: {}, woundReviewed: 'Sí', extra: {} }))).status).toBe(400);
    expect(await count('qx_pasp_calls')).toBe(0);
  });

  test('requires identity verification and authorization for a clinical conversation', async () => {
    const e = await episode();
    for (const extra of [{}, { identityVerified: true }, { authorizationConfirmed: true }]) {
      expect((await request('/calls', callPayload(e, { extra }))).status).toBe(400);
    }
    expect(await count('qx_pasp_calls')).toBe(0);
  });

  test('an assessed effective call requires professional classification and actual conduct', async () => {
    const e = await episode();
    expect((await request('/calls', callPayload(e, { classification: '' }))).status).toBe(400);
    expect((await request('/calls', callPayload(e, { conduct: '' }))).status).toBe(400);
    expect(await count('qx_pasp_calls')).toBe(0);
  });

  test('validates EVA without interpreting a pain score as a diagnosis', async () => {
    const e = await episode();
    expect((await request('/calls', callPayload(e, { clinical: { painScore: '11' } }))).status).toBe(400);
    const result = await call(e, { clinical: { painScore: '10' } });
    expect(result.call.clinical.painScore).toBe('10');
    expect(result.call.urgentSafety).toBe(false);
    expect(result.call.eventAssessment).toBe('NO_DETERMINADO');
  });

  test.each(['dyspnea', 'chestPain', 'alteredConsciousness', 'urinaryRetention', 'catheterDrainageFailure', 'woundDeepOpening', 'progressiveLimbDeficit'])('preserves the %s signal and routes it with immediate priority', async (key) => {
    const e = await episode();
    const result = await call(e, { clinical: { [key]: 'Sí' }, conduct: 'Remisión a urgencias' });
    expect(result.call.clinical[key]).toBe('Sí');
    expect(result.call.urgentSafety).toBe(true);
    expect(result.escalation.priority).toBe('INMEDIATA');
    expect(result.escalation.eventClassification).toBe('POR_ANALIZAR');
  });

  test.each([
    { fever: 'Sí', clinicalDeterioration: 'Sí' },
    { persistentVomiting: 'Sí', liquidTolerance: 'No' },
  ])('recognizes combined urgent warning signs without automatic triage', async (clinical) => {
    const e = await episode();
    const result = await call(e, { clinical, conduct: 'Remisión a urgencias' });
    expect(result.call.urgentSafety).toBe(true);
    expect(result.escalation.priority).toBe('INMEDIATA');
    expect(result.call.triageCategory).toBeUndefined();
    expect(result.call.diagnosis).toBeUndefined();
  });

  test('failure during escalation rolls back the call, episode version, history and outbox together', async () => {
    const e = await episode();
    const historyBefore = await count('qx_pasp_history');
    const outboxBefore = await count('qx_event_outbox');
    const invalid = await request('/calls', callPayload(e, { escalation: { area: 'AREA_INVALIDA_SIMULADA' } }));
    expect(invalid.status).toBe(400);
    expect(await count('qx_pasp_calls')).toBe(0);
    expect(await count('qx_pasp_escalations')).toBe(0);
    expect(await count('qx_pasp_history')).toBe(historyBefore);
    expect(await count('qx_event_outbox')).toBe(outboxBefore);
    expect((await request('/episodes/' + e.id)).body.episode.version).toBe(1);
  });

  test('escalation deadlines use explicit time zones instead of silently shifting local Colombian time', async () => {
    const e = await episode();
    const invalid = await request('/calls', callPayload(e, { classification: 'Hallazgo administrativo', escalation: { deadline: '2026-10-08T09:00' } }));
    expect(invalid.status).toBe(400);
    expect(await count('qx_pasp_calls')).toBe(0);
    const saved = await call(e, { classification: 'Hallazgo administrativo', escalation: { deadline: '2026-10-08T09:00:00-05:00' } });
    expect(saved.escalation.deadline).toBe('2026-10-08T14:00:00.000Z');
  });

  test('call notifications contain identifiers only, not clinical values or patient identity', async () => {
    const e = await episode();
    const result = await call(e, { classification: 'Hallazgo administrativo', observations: 'Detalle clínico SIMULADO no permitido en notificación' });
    const outbox = await sql.unsafe('select payload from qx_simulation.qx_event_outbox');
    const serialized = JSON.stringify(outbox);
    expect(serialized).not.toContain(e.patientName);
    expect(serialized).not.toContain(e.documentNumber);
    expect(serialized).not.toContain(result.call.observations);
    expect(serialized).not.toContain('clinical');
    expect(serialized).toContain(e.id);
    expect(serialized).toContain('SIMULADO');
  });
});

describe('coordination and patient safety governance', () => {
  test('patient lists and call records are never exposed to the public companion', async () => {
    const e = await episode();
    for (const path of ['/episodes', '/episodes/' + e.id, '/escalations', '/config']) {
      expect((await request(path, undefined, { session: null, permissions: [] })).status).toBe(401);
    }
    expect((await request('/calls', callPayload(e), { session: null, permissions: [] })).status).toBe(401);
    expect((await request('/care-guides', undefined, { session: null, permissions: [] })).status).toBe(200);
  });

  test('view-only coordination cannot record calls, close cases, act on escalations or edit configuration', async () => {
    const e = await episode();
    const saved = await call(e, { classification: 'Hallazgo administrativo' });
    const readOnly = { session: coord, permissions: ['COORDINACION_VER'] };
    expect((await request('/episodes', undefined, readOnly)).status).toBe(200);
    expect((await request('/escalations', undefined, readOnly)).status).toBe(200);
    expect((await request('/calls', callPayload(saved.episode), readOnly)).status).toBe(403);
    expect((await request('/episodes/' + e.id + '/coordination', { expectedVersion: saved.episode.version, caseStatus: 'Cerrado por seguimiento completado' }, readOnly)).status).toBe(403);
    expect((await request('/escalations/' + saved.escalation.id + '/action', { expectedVersion: 1, action: 'RECIBIR' }, readOnly)).status).toBe(403);
    expect((await request('/config', { expectedVersion: 1, config: {}, reason: 'Prueba SIMULADA' }, readOnly)).status).toBe(403);
  });

  test('a nonresponse alone cannot be declared a patient-safety incident', async () => {
    const e = await episode();
    const result = await request('/calls', callPayload(e, { contactResult: 'Buzón', classification: 'Buzón', clinical: {}, extra: {}, escalation: { area: 'Seguridad del Paciente' } }));
    expect(result.status).toBe(400);
    expect(await count('qx_pasp_calls')).toBe(0);
    expect(await count('qx_pasp_escalations')).toBe(0);
  });

  test('only the competent safety area classifies an incident, with documented analysis', async () => {
    const e = await episode();
    const saved = await call(e, { classification: 'Evento o incidente', conduct: 'Reporte seguridad del paciente', escalation: { reason: 'Sospecha SIMULADA de incidente para análisis, no confirmación' } });
    expect(saved.escalation.area).toBe('Seguridad del Paciente');
    expect(saved.escalation.eventAssessment).toBe('SOSPECHA');
    expect(saved.escalation.eventClassification).toBe('POR_ANALIZAR');
    const path = '/escalations/' + saved.escalation.id + '/action';
    expect((await request(path, { expectedVersion: 1, action: 'ANALIZAR', analysis: 'Análisis SIMULADO', eventClassification: 'INCIDENTE_SIN_DANO' }, { session: coord, permissions: coordPermissions })).status).toBe(403);
    expect((await request(path, { expectedVersion: 1, action: 'ANALIZAR', eventClassification: 'INCIDENTE_SIN_DANO' }, { session: safety, permissions: safetyPermissions })).status).toBe(400);
    const analysis = await request(path, { expectedVersion: 1, action: 'ANALIZAR', analysis: 'Análisis SIMULADO documentado', eventClassification: 'INCIDENTE_SIN_DANO' }, { session: safety, permissions: safetyPermissions });
    expect(analysis.status).toBe(200);
    expect(analysis.body.escalation.eventAssessment).toBe('CONFIRMADO');
    expect(analysis.body.escalation.classifiedBy).toBe(safety.user);
    expect(analysis.body.escalation.version).toBe(2);
  });

  test('escalations require resolution and verification before closing, with immutable history', async () => {
    const e = await episode();
    const saved = await call(e, { classification: 'Hallazgo administrativo' });
    const path = '/escalations/' + saved.escalation.id + '/action';
    const options = { session: coord, permissions: coordPermissions };
    expect((await request(path, { expectedVersion: 1, action: 'CERRAR' }, options)).status).toBe(409);
    const acknowledged = await request(path, { expectedVersion: 1, action: 'RECIBIR', recipient: 'Coordinación SIMULADA QA' }, options);
    expect(acknowledged.status).toBe(200);
    const analysis = await request(path, { expectedVersion: 2, action: 'ANALIZAR', analysis: 'Revisión administrativa SIMULADA' }, options);
    expect(analysis.status).toBe(200);
    expect((await request(path, { expectedVersion: 3, action: 'RESOLVER' }, options)).status).toBe(400);
    const resolved = await request(path, { expectedVersion: 3, action: 'RESOLVER', response: 'Respuesta SIMULADA', resolution: 'Resolución SIMULADA', verification: 'Verificación SIMULADA' }, options);
    expect(resolved.status).toBe(200);
    const closed = await request(path, { expectedVersion: 4, action: 'CERRAR' }, options);
    expect(closed.status).toBe(200);
    expect(closed.body.escalation.closedAt).toBeTruthy();
    expect((await request(path, { expectedVersion: 5, action: 'REABRIR' }, options)).status).toBe(400);
    const reopened = await request(path, { expectedVersion: 5, action: 'REABRIR', reason: 'Nuevo hallazgo SIMULADO' }, options);
    expect(reopened.status).toBe(200);
    expect(reopened.body.escalation.reopenedAt).toBeTruthy();
    const full = await request('/episodes/' + e.id);
    const actions = full.body.episode.history.filter((x: any) => x.escalationId === saved.escalation.id).map((x: any) => x.action);
    expect(actions).toContain('ESCALAMIENTO_RECIBIR');
    expect(actions).toContain('ESCALAMIENTO_RESOLVER');
    expect(actions).toContain('ESCALAMIENTO_CERRAR');
    expect(actions).toContain('ESCALAMIENTO_REABRIR');
  });

  test('an alert does not automatically mean that patient safety has been notified', async () => {
    const e = await episode();
    const saved = await call(e, { clinical: { dyspnea: 'Sí' }, conduct: 'Remisión a urgencias' });
    expect(saved.episode.coordination.spNotified).toBe('No');
    expect((await request('/episodes/' + e.id + '/coordination', { expectedVersion: saved.episode.version, spNotified: 'Sí' }, { session: coord, permissions: coordPermissions })).status).toBe(400);
  });

  test('closing an episode requires coordination analysis and explicit verification; new calls need reopening', async () => {
    const e = await episode();
    const saved = await call(e);
    const options = { session: coord, permissions: coordPermissions };
    const path = '/episodes/' + e.id + '/coordination';
    expect((await request(path, { expectedVersion: 2, caseStatus: 'Cerrado por seguimiento completado', reason: 'Prueba SIMULADA' }, options)).status).toBe(400);
    const closed = await request(path, { expectedVersion: 2, caseStatus: 'Cerrado por seguimiento completado', reason: 'Seguimiento SIMULADO revisado', analysis1: 'Análisis SIMULADO', activitiesVerified: true }, options);
    expect(closed.status).toBe(200);
    expect((await request('/calls', callPayload(closed.body.episode))).status).toBe(409);
    const reopened = await request(path, { expectedVersion: 3, caseStatus: 'En seguimiento', reason: 'Nuevo contacto SIMULADO' }, options);
    expect(reopened.status).toBe(200);
    const second = await call(reopened.body.episode, { number: 2 });
    expect(second.episode.calls).toHaveLength(2);
  });

  test('configuration changes require permission, reason and the current revision', async () => {
    const options = { session: superadmin, permissions: ['*'] };
    expect((await request('/config', { expectedVersion: 1, config: { maxContactAttempts: 4 } }, options)).status).toBe(400);
    const changed = await request('/config', { expectedVersion: 1, reason: 'Política SIMULADA de contacto', config: { maxContactAttempts: 4 } }, options);
    expect(changed.status).toBe(200);
    expect(changed.body.version).toBe(2);
    expect(changed.body.config.maxContactAttempts).toBe(4);
    expect((await request('/config', { expectedVersion: 1, reason: 'Cambio obsoleto SIMULADO', config: { maxContactAttempts: 5 } }, options)).status).toBe(409);
    expect((await request('/config')).body.config.maxContactAttempts).toBe(4);
  });

  test('edited call labels and options are returned by the effective schema while matrix mappings remain protected', async () => {
    const options = { session: superadmin, permissions: ['*'] };
    const original = await request('/config?scope=SCHEMA', undefined, options);
    expect(original.status).toBe(200);
    const edited = structuredClone(original.body.config);
    const fever = edited.fields.find((x: any) => x.id === 'call1.clinical.fever');
    expect(fever).toBeDefined();
    fever.label = 'Fiebre referida: etiqueta SIMULADA personalizada';
    fever.inputMessage = 'Ayuda SIMULADA personalizada';
    const changed = await request('/config', { scope: 'SCHEMA', expectedVersion: 1, config: edited, reason: 'Personalización SIMULADA de captura' }, options);
    expect(changed.status).toBe(200);
    expect(changed.body.version).toBe(2);
    const effective = await request('/schema');
    expect(effective.body.fields.find((x: any) => x.id === fever.id).label).toBe(fever.label);
    expect(effective.body.headers).toEqual(schemaSeed.headers);
    edited.headers[0].id = 'INVALID_QA_ID';
    expect((await request('/config', { scope: 'SCHEMA', expectedVersion: 2, config: edited, reason: 'Cambio de mapeo SIMULADO inválido' }, options)).status).toBe(400);
  });

  test('configured first and second call intervals are actually used for future simulated episodes', async () => {
    const options = { session: superadmin, permissions: ['*'] };
    const cfg = { scheduling: { ...schemaSeed.scheduling, defaultMode: 'CALENDAR_DAYS', first: { ...schemaSeed.scheduling.first, offsetCalendarDays: 5 }, second: { ...schemaSeed.scheduling.second, offsetCalendarDays: 8, base: 'firstCall.realDate' } } };
    const changed = await request('/config', { expectedVersion: 1, config: cfg, reason: 'Calendario SIMULADO para QA' }, options);
    expect(changed.status).toBe(200);
    const e = await episode();
    expect(e.call1.scheduledDate).toBe('2026-10-06');
    const saved = await call(e);
    expect(saved.episode.call2.scheduledDate).toBe('2026-10-13');
  });

  test('configurable holiday roll-forward and second-call base preserve the institutional scheduling logic', async () => {
    const options = { session: superadmin, permissions: ['*'] };
    const scheduling = { ...schemaSeed.scheduling, defaultMode: 'SHEET_COMPATIBILITY', holidays: [{ date: '2026-10-05', label: 'Festivo ficticio QA' }], first: { ...schemaSeed.scheduling.first, offsetCalendarDays: 2, rollForwardToBusinessDay: true }, second: { ...schemaSeed.scheduling.second, offsetCalendarDays: 3, base: 'firstCall.scheduledDate', rollForwardToBusinessDay: true } };
    expect((await request('/config', { expectedVersion: 1, config: { scheduling }, reason: 'Programación SIMULADA con festivo' }, options)).status).toBe(200);
    const e = await episode();
    expect(e.call1.scheduledDate).toBe('2026-10-06');
    const saved = await call(e, { realDate: '2026-10-07' });
    expect(saved.episode.call2.scheduledDate).toBe('2026-10-09');
  });

  test('editable contact lists accept a new administrative result without fabricating clinical answers', async () => {
    const opts={session:superadmin,permissions:['*']};
    const s=structuredClone((await request('/schema')).body);
    s.lists['Resultado contacto'].push('Barrera de idioma SIMULADA');
    expect((await request('/config',{scope:'SCHEMA',expectedVersion:1,config:s,reason:'Lista SIMULADA QA'},opts)).status).toBe(200);
    const e=await episode();const saved=await call(e,{contactResult:'Barrera de idioma SIMULADA',clinical:{},classification:'Hallazgo administrativo',conduct:'',extra:{}});
    expect(saved.call.contactResult).toBe('Barrera de idioma SIMULADA');expect(Object.keys(saved.call.clinical)).toHaveLength(0);
  });

  test('configured escalation deadlines and directory are saved with validation and used by new escalations',async()=>{
    const opts={session:superadmin,permissions:['*']};
    expect((await request('/config',{expectedVersion:1,config:{responseTimesMinutes:{ADMINISTRATIVA:45},escalationDirectory:[{area:'Coordinación de Cirugía',recipient:'Responsable SIMULADO',role:'Coordinación'}]},reason:'Ruta SIMULADA QA'},opts)).status).toBe(200);
    const e=await episode(),saved=await call(e,{contactResult:'No contesta',clinical:{},classification:'No contesta',conduct:'',extra:{}});
    expect((Date.parse(saved.escalation.deadline)-Date.parse(saved.escalation.sentAt))/60000).toBe(45);
    expect((await request('/config',{expectedVersion:2,config:{responseTimesMinutes:{ADMINISTRATIVA:-1}},reason:'QA inválida'},opts)).status).toBe(400);
    expect((await request('/config',{expectedVersion:2,config:{escalationDirectory:[{area:'Área inexistente',recipient:'SIM'}]},reason:'QA inválida'},opts)).status).toBe(400);
  });

  test('closing for noncontact uses the institution-configured number of attempts, with separate coordination review', async () => {
    const adminOptions = { session: superadmin, permissions: ['*'] };
    const coordOptions = { session: coord, permissions: coordPermissions };
    expect((await request('/config', { expectedVersion: 1, config: { maxContactAttempts: 2 }, reason: 'Dos intentos: política exclusivamente SIMULADA' }, adminOptions)).status).toBe(200);
    const e = await episode();
    const first = await call(e, { contactResult: 'Buzón', clinical: {}, classification: 'Buzón', conduct: '', extra: {} });
    async function resolveEscalation(entry: any) {
      const path = '/escalations/' + entry.id + '/action';
      expect((await request(path, { expectedVersion: 1, action: 'ANALIZAR', recipient: 'Coordinación SIMULADA QA', analysis: 'Ruta de contacto SIMULADA verificada' }, coordOptions)).status).toBe(200);
      expect((await request(path, { expectedVersion: 2, action: 'RESOLVER', response: 'Respuesta administrativa SIMULADA', resolution: 'Gestión SIMULADA documentada', verification: 'Verificación SIMULADA' }, coordOptions)).status).toBe(200);
    }
    await resolveEscalation(first.escalation);
    const path = '/episodes/' + e.id + '/coordination';
    const closure = { expectedVersion: first.episode.version, caseStatus: 'Cerrado por imposibilidad de contacto', reason: 'Agotamiento SIMULADO de ruta', analysis1: 'Intento SIMULADO revisado', exhaustionVerified: true };
    expect((await request(path, closure, coordOptions)).status).toBe(400);
    const second = await call(first.episode, { number: 2, contactResult: 'No contesta', clinical: {}, classification: 'No contesta', conduct: '', extra: {} });
    await resolveEscalation(second.escalation);
    const completed = await request(path, { ...closure, expectedVersion: second.episode.version, analysis2: 'Segundo intento SIMULADO revisado' }, coordOptions);
    expect(completed.status).toBe(200);
    expect(completed.body.episode.caseStatus).toBe('Cerrado por imposibilidad de contacto');
    expect(completed.body.episode.calls).toHaveLength(2);
  });

  test('the catalog editor sees inactive and pending drafts without exposing them to companions', async () => {
    const options = { session: superadmin, permissions: ['*'] };
    const card = { id: 'QA-CARE-DRAFT', title: 'Ficha educativa ficticia QA', state: 'INACTIVO', approval: 'PENDIENTE', audience: 'AMBOS', type: 'PROCEDIMIENTO', coverage: 'PARCIAL', procedures: ['Procedimiento ficticio QA'], anesthesias: [], topics: [], keywords: ['prueba ficticia QA'], recommendations: ['Recomendación de prueba SIMULADA, sin uso clínico.'], alarms: [], restrictions: [], source: 'Fuente de prueba SIMULADA https://example.invalid/qa', reason: 'Creación de borrador SIMULADO QA' };
    const saved = await request('/care-guides', card, options);
    expect(saved.status).toBe(200);
    expect(saved.body.row.state).toBe('INACTIVO');
    expect((await request('/care-guides?all=1', undefined, options)).body.rows.find((x: any) => x.id === card.id)).toBeDefined();
    expect((await request('/care-guides', undefined, { session: null, permissions: [] })).body.rows.find((x: any) => x.id === card.id)).toBeUndefined();
    expect((await request('/care-guides?all=1', undefined, { session: null, permissions: [] })).status).toBe(403);
    const updated = await request('/care-guides', { ...card, state: 'ACTIVO', approval: 'REVISADO', expectedVersion: 1, reason: 'Revisión SIMULADA QA' }, options);
    expect(updated.status).toBe(200);
    expect(updated.body.row.version).toBe(2);
    expect((await request('/care-guides', { ...card, expectedVersion: 1 }, options)).status).toBe(409);
    const published = await request('/care-guides?procedure=Procedimiento%20ficticio%20QA', undefined, { session: null, permissions: [] });
    expect(published.body.rows.find((x: any) => x.id === card.id)).toBeDefined();
  });

  test('edited dictionary aliases and procedure mappings are used by educational search', async () => {
    const options = { session: superadmin, permissions: ['*'] };
    const guide = { id: 'QA-CARE-ALIAS', title: 'Ficha ficticia de búsqueda QA', state: 'ACTIVO', approval: 'REVISADO', audience: 'AMBOS', type: 'PROCEDIMIENTO', coverage: 'PARCIAL', procedures: ['Procedimiento ficticio QA'], anesthesias: [], topics: [], keywords: [], recommendations: ['Contenido exclusivamente SIMULADO para validar búsqueda.'], alarms: [], restrictions: [], source: 'Fuente de prueba SIMULADA https://example.invalid/qa', reason: 'Alta de catálogo de prueba SIMULADA' };
    expect((await request('/care-guides', guide, options)).status).toBe(200);
    const dictionary = { id: 'QA-DICT-ALIAS', concept: 'Procedimiento ficticio QA', type: 'PROCEDIMIENTO', family: 'Familia ficticia QA', synonyms: ['operacion ficticia lukas'], state: 'ACTIVO', reason: 'Alias SIMULADO de lenguaje cotidiano' };
    expect((await request('/dictionary', dictionary, options)).status).toBe(200);
    const result = await request('/care-guides?q=operacion%20ficticia%20lukas', undefined, { session: null, permissions: [] });
    expect(result.status).toBe(200);
    expect(result.body.rows.find((x: any) => x.id === guide.id)).toBeDefined();
    expect((await request('/dictionary')).body.rows.find((x: any) => x.id === dictionary.id).synonyms).toEqual(dictionary.synonyms);
  });
});

describe('PASP matrix indicators', () => {
  test('retira el indicador de alerta urgente sin perder señales clínicas ni escalamientos', async () => {
    const e=await episode();
    const saved=await call(e,{clinical:{feelsWell:'No',urinaryRetention:'Sí'},classification:'Hallazgo clínico urgente prioritario',conduct:'Remisión a urgencias',observations:'Registro SIMULADO de prueba de señal urgente.'});
    expect(saved.call.urgentSafety).toBe(true);
    expect(saved.escalation.priority).toBe('INMEDIATA');
    const result=await request('/indicators?from=2026-10-01&to=2026-10-31');
    expect(result.status).toBe(200);expect(result.body.metrics).toHaveLength(36);
    expect(result.body.metrics.some(m=>m.id==='urgent_alarms')).toBe(false);
    expect(result.body.totals.urgentCalls).toBeUndefined();
    expect(result.body.series.every(row=>row.urgentCalls===undefined)).toBe(true);
    expect(metric(result.body,'escalations').value).toBe(1);
    expect((await request('/episodes/'+e.id)).body.episode.calls[0].urgentSafety).toBe(true);
  });

  test('productividad atribuye fichas al autor autenticado y usa la fecha real aunque la cirugía sea anterior', async () => {
    const e=await episode({surgeryDate:'2026-09-01'});
    const first=await request('/calls',callPayload(e,{professional:'Autor inventado en formulario',recordedBy:'OTRA-CUENTA',professionalUserId:'ID-INVENTADO',contactResult:'No contesta',clinical:{},classification:'No contesta',conduct:'',extra:{}}),{session:{...staff,uid:'SIM-UID-A'}});
    expect(first.status).toBe(200);expect(first.body.call.professionalUserId).toBe('SIM-UID-A');expect(first.body.call.recordedBy).toBe(staff.user);
    const second=await request('/calls',callPayload(first.body.episode,{number:2,realDate:'2026-10-06'}),{session:{user:'SIM-NURSE-B',name:'Jefe SIMULADO B',role:'USER',uid:'SIM-UID-B'}});
    expect(second.status).toBe(200);
    const data=await request('/productivity?from=2026-10-01&to=2026-10-31');expect(data.status).toBe(200);
    expect(data.body.dateBasis).toBe('CALL_DATE');expect(data.body.totals.attempts).toBe(2);expect(data.body.rows).toHaveLength(2);
    expect(data.body.rows.find(r=>r.user===staff.user)).toMatchObject({attempts:1,effectiveContacts:0,contactRate:0});
    expect(data.body.rows.find(r=>r.user==='SIM-NURSE-B')).toMatchObject({attempts:1,effectiveContacts:1,contactRate:100});
    expect((await request('/indicators?from=2026-10-01&to=2026-10-31')).body.totals.attempts).toBe(0);
    expect((await request('/productivity?from=2026-10-01&to=2026-10-04')).body.totals.attempts).toBe(0);
    expect((await request('/productivity?from=2026-02-30')).status).toBe(400);
    expect((await request('/productivity?from=2026-10-02&to=2026-10-01')).status).toBe(400);
    expect((await request('/productivity',undefined,{session:null,permissions:[]})).status).toBe(401);
    expect((await request('/productivity',undefined,{session:staff,permissions:['OPERACION_VER']})).status).toBe(403);
    expect((await request('/productivity?download=1')).status).toBe(403);
    const download=await request('/productivity?download=1&from=2026-10-01&to=2026-10-31&period=MES',undefined,{permissions:['CUIDADOS_POSTOP','DESCARGAS']});
    expect(download.status).toBe(200);expect(download.body.sections[1].rows).toHaveLength(2);expect(download.body.from).toBe('2026-10-01');
  });
  function metric(result: any, id: string) {
    const item = result.metrics.find((x: any) => x.id === id);
    expect(item).toBeDefined();
    return item;
  }

  test('zero eligible episodes yield undefined percentages, not an invented 0% or 100%', async () => {
    const result = await request('/indicators?from=2026-10-01&to=2026-10-31');
    expect(result.status).toBe(200);
    expect(metric(result.body, 'total_users').value).toBe(0);
    for (const id of ['first_call_coverage', 'first_call_timeliness', 'second_call_coverage', 'second_call_timeliness', 'contact_rate', 'contact_episode_coverage']) {
      const item = metric(result.body, id);
      expect(item.denominator).toBe(0);
      expect(item.value).toBeNull();
    }
  });

  test('cohort metrics distinguish episodes, individual attempts, effective contacts and institutional timeliness', async () => {
    const firstEpisode = await episode();
    const secondEpisode = await episode({ surgeryDate: '2026-10-02', documentNumber: 'SIM-QA-0002', patientName: 'Paciente SIMULADO QA 2' });
    const outside = await episode({ surgeryDate: '2026-10-20', documentNumber: 'SIM-QA-OUTSIDE', patientName: 'Paciente SIMULADO fuera de cohorte' });
    const first = await call(firstEpisode, { realDate: '2026-10-05', clinical: { feelsWell: 'Sí' } });
    const second = await call(first.episode, { number: 2, thirdCall:{enabled:true,date:'2026-10-10',reason:'Reintento SIMULADO'}, realDate: '2026-10-09', contactResult: 'Buzón', clinical: {}, classification: 'Buzón', conduct: '', extra: {} });
    const third = await call(second.episode, { number: 3, realDate: '2026-10-10' });
    await call(outside, { realDate: '2026-10-21' });
    expect((await request('/calls/' + first.call.id + '/addenda', { episodeId: firstEpisode.id, expectedVersion: third.episode.version, reason: 'Adenda SIMULADA no suma otra llamada', content: 'Anotación de revisión SIMULADA' })).status).toBe(200);
    const result = await request('/indicators?from=2026-10-01&to=2026-10-02');
    expect(result.status).toBe(200);
    expect(metric(result.body, 'total_users').value).toBe(2);
    const firstCoverage = metric(result.body, 'first_call_coverage');
    expect(firstCoverage.numerator).toBe(1); expect(firstCoverage.denominator).toBe(2); expect(firstCoverage.value).toBe(50);
    const firstTimeliness = metric(result.body, 'first_call_timeliness');
    expect(firstTimeliness.numerator).toBe(1); expect(firstTimeliness.denominator).toBe(1); expect(firstTimeliness.value).toBe(100);
    const secondCoverage = metric(result.body, 'second_call_coverage');
    expect(secondCoverage.numerator).toBe(1); expect(secondCoverage.denominator).toBe(1); expect(secondCoverage.value).toBe(100);
    const secondTimeliness = metric(result.body, 'second_call_timeliness');
    expect(secondTimeliness.numerator).toBe(0); expect(secondTimeliness.denominator).toBe(1); expect(secondTimeliness.value).toBe(0);
    expect(metric(result.body, 'call_attempts').value).toBe(3);
    expect(metric(result.body, 'effective_contacts').value).toBe(2);
    const contact = metric(result.body, 'contact_rate');
    expect(contact.numerator).toBe(2); expect(contact.denominator).toBe(3); expect(contact.value).toBeCloseTo(66.67, 1);
    expect(metric(result.body, 'episodes_contacted').value).toBe(1);
    const episodeCoverage = metric(result.body, 'contact_episode_coverage');
    expect(episodeCoverage.numerator).toBe(1); expect(episodeCoverage.denominator).toBe(2); expect(episodeCoverage.value).toBe(50);
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain(firstEpisode.patientName);
    expect(serialized).not.toContain(secondEpisode.documentNumber);
    expect(serialized).not.toContain(outside.patientName);
    expect(serialized).not.toContain(first.call.observations);
    expect(firstCoverage.definition).toBeTruthy();
    expect(firstCoverage.source).toBeTruthy();
    expect(firstTimeliness.institutionalFormula).toBeTruthy();
    expect(firstTimeliness.sheetFormula).toBeTruthy();
  });

  test('range aliases are inclusive and the dashboard enforces authenticated permissions', async () => {
    await episode({ surgeryDate: '2026-10-01' });
    await episode({ surgeryDate: '2026-10-02', documentNumber: 'SIM-QA-DATE-2' });
    const one = await request('/indicators?desde=2026-10-02&hasta=2026-10-02');
    expect(one.status).toBe(200);
    expect(metric(one.body, 'total_users').value).toBe(1);
    expect((await request('/indicators?from=2026-10-02&to=2026-10-01')).status).toBe(400);
    expect((await request('/indicators?from=2026-02-30&to=2026-10-01')).status).toBe(400);
    expect((await request('/indicators', undefined, { session: null, permissions: [] })).status).toBe(401);
    expect((await request('/indicators', undefined, { session: staff, permissions: ['OPERACION_VER'] })).status).toBe(403);
    expect((await request('/indicators', undefined, { session: coord, permissions: coordPermissions })).status).toBe(200);
  });
});

describe('lista de seguimiento y programación de tercera llamada',()=>{
  test('la lista incluye cirugías realizadas sin episodio, excluye no operados y evita duplicar episodios enlazados',async()=>{
    const created=await request('/episodes',episodePayload({sourceCaseId:'SIM-LINKED'}),{findCase:async()=>({payload:{OPERADO:'TRUE',DOCUMENTO:'SIM-QA-0001','FECHA CIRUGÍA':'2026-10-01'}})});expect(created.status).toBe(201);const e=created.body.episode;
    const list=await request('/call-queue',undefined,{listOperatedCases:async()=>[
      {id:'SIM-LINKED',operado:true,paciente:e.patientName,fecha:'2026-10-01'},
      {id:'SIM-NEW',operado:true,paciente:'Paciente SIMULADO sin llamar',documento:'SIM-NEW-DOC',procedimiento:'Procedimiento SIMULADO',fecha:'2026-10-01',fechaCitaPop:'2026-10-20',horaCitaPop:'13:30'},
      {id:'SIM-NOT-OPERATED',operado:false,paciente:'No operado'}
    ]});
    expect(list.status).toBe(200);expect(list.body.rows).toHaveLength(2);
    const pending=list.body.rows.find(r=>r.sourceCaseId==='SIM-NEW');expect(pending.id).toBe('');expect(pending.followup.neverCalled).toBe(true);expect(pending.followup.nextNumber).toBe(1);expect(pending.followup.slots[1].enabled).toBe(false);expect(pending.appointment.time).toBe('13:30');
    expect(await count('qx_pasp_episodes')).toBe(1);expect(await count('qx_pasp_calls')).toBe(0);
    expect((await request('/call-queue',undefined,{session:null})).status).toBe(401);
    expect((await request('/call-queue',undefined,{permissions:['OPERACION_VER']})).status).toBe(403);
  });
  test('primera habilita segunda, pero tercera solo aparece pendiente si se programa',async()=>{
    const e=await episode();let list=(await request('/call-queue')).body.rows;
    expect(list[0].followup.nextNumber).toBe(1);
    const first=await call(e,{contactResult:'No contesta',clinical:{},classification:'No contesta',conduct:'',extra:{}});
    list=(await request('/call-queue')).body.rows;expect(list[0].followup.nextNumber).toBe(2);expect(list[0].followup.neverCalled).toBe(false);
    const second=await call(first.episode,{number:2});
    list=(await request('/call-queue')).body.rows;expect(list[0].followup.pending).toBe(false);expect(list[0].followup.slots[2].enabled).toBe(false);
    expect((await request('/calls',callPayload(second.episode,{number:3}))).status).toBe(409);
  });
  test('la segunda programa tercera en la misma transacción y la tercera conserva fecha, hora y registro individual',async()=>{
    const first=await call(await episode());
    const second=await call(first.episode,{number:2,thirdCall:{enabled:true,date:'2026-10-09',time:'14:30',reason:'Verificar evolución SIMULADA'}});
    expect(second.episode.call3.scheduledDate).toBe('2026-10-09');expect(second.episode.call3.sourceCallId).toBe(second.call.id);
    let list=(await request('/call-queue')).body.rows;expect(list[0].followup.nextNumber).toBe(3);expect(list[0].followup.nextScheduledTime).toBe('14:30');
    const third=await call(second.episode,{number:3,realDate:'2026-10-09'});
    expect(third.call.scheduledDate).toBe('2026-10-09');expect(third.call.scheduledTime).toBe('14:30');expect(third.episode.calls).toHaveLength(3);
    list=(await request('/call-queue')).body.rows;expect(list[0].followup.pending).toBe(false);expect(list[0].followup.slots[2].recorded).toBe(true);
    expect((await request('/episodes/'+third.episode.id+'/third-call',{expectedVersion:third.episode.version,enabled:true,date:'2026-10-12',reason:'No reemplazar ficha'})).status).toBe(409);
  });
  test('programación inválida no guarda segunda llamada, y una agenda posterior exige segunda registrada y versión vigente',async()=>{
    const e=await episode();const before=await request('/episodes/'+e.id+'/third-call',{expectedVersion:e.version,enabled:true,date:'2026-10-09',reason:'Prueba SIMULADA'});expect(before.status).toBe(409);
    const first=await call(e);
    const bad=await request('/calls',callPayload(first.episode,{number:2,thirdCall:{enabled:true,date:'2026-10-04',reason:'Fecha anterior'}}));expect(bad.status).toBe(400);expect(await count('qx_pasp_calls')).toBe(1);
    expect((await request('/calls',callPayload(first.episode,{number:2,thirdCall:{enabled:true,date:'2026-02-30',reason:'Fecha imposible'}}))).status).toBe(400);
    expect((await request('/calls',callPayload(first.episode,{number:2,thirdCall:{enabled:true,date:'2026-10-09',reason:''}}))).status).toBe(400);
    const second=await call(first.episode,{number:2});
    const route='/episodes/'+e.id+'/third-call';
    expect((await request(route,{expectedVersion:second.episode.version,enabled:true,date:'2026-10-10',reason:'Agenda SIMULADA'},{permissions:['OPERACION_VER']})).status).toBe(403);
    const plan=await request(route,{expectedVersion:second.episode.version,enabled:true,date:'2026-10-10',time:'09:00',reason:'Revisión SIMULADA'});expect(plan.status).toBe(200);
    expect((await request(route,{expectedVersion:second.episode.version,enabled:true,date:'2026-10-11',reason:'Versión vieja'})).status).toBe(409);
    expect((await request(route,{expectedVersion:plan.body.episode.version,enabled:false})).status).toBe(400);
    const cancelled=await request(route,{expectedVersion:plan.body.episode.version,enabled:false,reason:'No precisa reintento SIMULADO'});expect(cancelled.status).toBe(200);expect(cancelled.body.episode.call3.scheduledDate).toBe('');expect(await count('qx_pasp_calls')).toBe(2);
  });
  test('fechas de agenda: vencida, hoy, próxima; casos cerrados no generan pendientes',()=>{
    const base={sourceKind:'SIMULADO',callCount:0,caseStatus:'Abierto'};
    expect(followupState({...base,call1:{scheduledDate:'2026-10-06'}},'2026-10-07').queueStatus).toBe('VENCIDA');
    expect(followupState({...base,call1:{scheduledDate:'2026-10-07'}},'2026-10-07').queueStatus).toBe('HOY');
    expect(followupState({...base,call1:{scheduledDate:'2026-10-08'}},'2026-10-07').queueStatus).toBe('PROXIMA');
    expect(followupState({...base,caseStatus:'Cerrado por seguimiento completado'},'2026-10-07').pending).toBe(false);
    const list=buildCallQueue([{...base,id:'SIM-FUTURE',call1:{scheduledDate:'2026-10-08'}},{...base,id:'SIM-OVERDUE',call1:{scheduledDate:'2026-10-06'}}],[],'2026-10-07',d=>d);
    expect(list.map(e=>e.id)).toEqual(['SIM-OVERDUE','SIM-FUTURE']);
  });
});
