-- Battery SOC logs + trip location fields for manual-entry flow

create table if not exists battery_logs (
  id uuid primary key default gen_random_uuid(),
  soc_percent numeric not null,
  latitude double precision,
  longitude double precision,
  timestamp timestamptz not null,
  sync_status text default 'synced',
  updated_at timestamptz default now()
);

alter table trips
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists created_at timestamptz default now();

alter table vehicles
  add column if not exists last_latitude double precision,
  add column if not exists last_longitude double precision;

alter table battery_logs enable row level security;

create policy "anon_all_battery_logs" on battery_logs for all using (true) with check (true);
