-- PASP demo storage is explicitly isolated from public clinical tables.
create schema if not exists qx_simulation;
create table if not exists qx_simulation.qx_pasp_episodes (
  id text primary key, source_kind text not null default 'SIMULADO' check (source_kind='SIMULADO'),
  version integer not null default 1, payload jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists qx_pasp_episode_source_case_idx
  on qx_simulation.qx_pasp_episodes((payload->>'sourceCaseId'))
  where payload->>'sourceCaseId' is not null and payload->>'sourceCaseId' <> '';
create table if not exists qx_simulation.qx_pasp_calls (
  id text primary key, episode_id text not null references qx_simulation.qx_pasp_episodes(id),
  call_number integer not null check (call_number>0), client_key text,
  payload jsonb not null, created_at timestamptz not null default now()
);
create unique index if not exists qx_pasp_call_client_key_idx
  on qx_simulation.qx_pasp_calls(episode_id,client_key) where client_key is not null;
create index if not exists qx_pasp_calls_episode_idx
  on qx_simulation.qx_pasp_calls(episode_id,created_at,id);
create unique index if not exists qx_pasp_calls_episode_number_idx
  on qx_simulation.qx_pasp_calls(episode_id,call_number);
create table if not exists qx_simulation.qx_pasp_addenda (
  id text primary key, episode_id text not null references qx_simulation.qx_pasp_episodes(id),
  call_id text not null references qx_simulation.qx_pasp_calls(id),
  payload jsonb not null, created_at timestamptz not null default now()
);
create index if not exists qx_pasp_addenda_call_idx on qx_simulation.qx_pasp_addenda(call_id,created_at,id);
create table if not exists qx_simulation.qx_pasp_escalations (
  id text primary key, episode_id text not null references qx_simulation.qx_pasp_episodes(id),
  call_id text references qx_simulation.qx_pasp_calls(id), version integer not null default 1,
  payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists qx_pasp_escalations_episode_idx on qx_simulation.qx_pasp_escalations(episode_id);
create table if not exists qx_simulation.qx_pasp_history (
  id text primary key, episode_id text, escalation_id text, payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists qx_pasp_history_episode_idx on qx_simulation.qx_pasp_history(episode_id,created_at,id);
create table if not exists qx_simulation.qx_pasp_care_catalog (
  id text primary key, version integer not null default 1, payload jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists qx_simulation.qx_pasp_dictionary (
  id text primary key, version integer not null default 1, payload jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists qx_simulation.qx_pasp_config (
  id text primary key, version integer not null default 1, payload jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists qx_simulation.qx_event_outbox (
  id bigserial primary key, entity_type text not null, entity_id text not null default '',
  action text not null, payload jsonb not null, created_at timestamptz not null default now()
);
