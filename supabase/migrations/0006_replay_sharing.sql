-- v0.7.0: explicit, read-only Replay sharing. Published migrations 0001-0005 remain immutable.

alter table public.action_attempts drop constraint if exists action_attempts_type_chk;
alter table public.action_attempts add constraint action_attempts_type_chk
  check (action_type in ('JOIN_ROOM', 'CREATE_ROOM', 'PUBLISH_REPLAY'));

create table public.replay_shares (
  id uuid primary key default gen_random_uuid(),
  share_token text not null unique check (share_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  replay_data jsonb not null,
  replay_checksum text not null check (replay_checksum ~ '^sha256:[0-9a-f]{64}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  revoked_at timestamptz,
  source_match_id text not null,
  room_id uuid references public.rooms(id) on delete set null,
  constraint replay_shares_payload_size check (pg_column_size(replay_data) <= 524288)
);

create index replay_shares_creator_idx on public.replay_shares(created_by, created_at desc);
create index replay_shares_active_token_idx on public.replay_shares(share_token) where status = 'ACTIVE';

alter table public.replay_shares enable row level security;
revoke all on public.replay_shares from public, anon, authenticated;
grant select, insert, update, delete on public.replay_shares to service_role;

-- Public fetch abuse accounting stores only a one-way hash of the caller address.
create table public.replay_fetch_attempts (
  id uuid primary key default gen_random_uuid(),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default now()
);
create index replay_fetch_attempts_hash_time_idx on public.replay_fetch_attempts(request_hash, attempted_at);
alter table public.replay_fetch_attempts enable row level security;
revoke all on public.replay_fetch_attempts from public, anon, authenticated;
grant select, insert, delete on public.replay_fetch_attempts to service_role;
