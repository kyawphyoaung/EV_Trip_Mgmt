-- Leapmotor B10 EV Assistant — initial schema

create extension if not exists "pgcrypto";

create table if not exists vehicles (
  id text primary key default 'leapmotor-b10',
  battery_capacity_kwh numeric,
  current_soc_percent numeric,
  updated_at timestamptz default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  trip_name text,
  start_time timestamptz,
  end_time timestamptz,
  start_soc_percent numeric,
  end_soc_percent numeric,
  distance_meters numeric,
  duration_seconds int,
  avg_consumption_kwh_per_100km numeric,
  energy_driving_kwh numeric,
  energy_hvac_kwh numeric,
  energy_other_kwh numeric,
  sync_status text default 'synced',
  updated_at timestamptz default now()
);

create table if not exists trip_points (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  soc_percent numeric,
  timestamp timestamptz,
  synced_at timestamptz
);

create table if not exists charging_sessions (
  id uuid primary key default gen_random_uuid(),
  station_name text,
  charger_type text check (charger_type in ('DC', 'AC')),
  start_time timestamptz,
  end_time timestamptz,
  start_soc numeric,
  end_soc numeric,
  energy_added_kwh numeric,
  avg_power_kw numeric,
  cost_mmk numeric,
  rate_per_kwh_mmk numeric default 750,
  max_power_kw numeric,
  sync_status text default 'synced',
  updated_at timestamptz default now()
);

create table if not exists charging_stations (
  id uuid primary key default gen_random_uuid(),
  name text,
  latitude double precision,
  longitude double precision,
  charger_type text,
  max_power_kw numeric
);

-- Allow anon access (no auth app)
alter table vehicles enable row level security;
alter table trips enable row level security;
alter table trip_points enable row level security;
alter table charging_sessions enable row level security;
alter table charging_stations enable row level security;

create policy "anon_all_vehicles" on vehicles for all using (true) with check (true);
create policy "anon_all_trips" on trips for all using (true) with check (true);
create policy "anon_all_trip_points" on trip_points for all using (true) with check (true);
create policy "anon_all_charging_sessions" on charging_sessions for all using (true) with check (true);
create policy "anon_all_charging_stations" on charging_stations for all using (true) with check (true);

-- Seed vehicle + sample Yangon-area charging stations
insert into vehicles (id, battery_capacity_kwh, current_soc_percent, updated_at)
values ('leapmotor-b10', 67.1, 72, now())
on conflict (id) do nothing;

insert into charging_stations (id, name, latitude, longitude, charger_type, max_power_kw) values
  ('11111111-1111-1111-1111-111111111111', 'Junction City DC', 16.7794, 96.1561, 'DC', 60),
  ('22222222-2222-2222-2222-222222222222', 'Sule Square AC', 16.7742, 96.1598, 'AC', 11),
  ('33333333-3333-3333-3333-333333333333', 'Inya Lake DC Hub', 16.8300, 96.1450, 'DC', 120),
  ('44444444-4444-4444-4444-444444444444', 'Airport Terminal AC', 16.9073, 96.1332, 'AC', 7),
  ('55555555-5555-5555-5555-555555555555', 'Bahan Fast Charge', 16.8120, 96.1580, 'DC', 60)
on conflict (id) do nothing;
