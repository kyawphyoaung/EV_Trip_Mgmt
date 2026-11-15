import Dexie, { type EntityTable } from 'dexie';
import { LEAPMOTOR_B10 } from '../../config/vehicle';

export type SyncStatus = 'synced' | 'pending' | 'local';

export interface Vehicle {
  id: string;
  battery_capacity_kwh: number;
  current_soc_percent: number;
  updated_at: string;
}

export interface Trip {
  id: string;
  trip_name: string;
  start_time: string;
  end_time: string | null;
  start_soc_percent: number;
  end_soc_percent: number | null;
  distance_meters: number;
  duration_seconds: number;
  avg_consumption_kwh_per_100km: number | null;
  energy_driving_kwh: number;
  energy_hvac_kwh: number;
  energy_other_kwh: number;
  sync_status: SyncStatus;
  updated_at: string;
}

export interface TripPoint {
  id: string;
  trip_id: string;
  latitude: number;
  longitude: number;
  soc_percent: number;
  timestamp: string;
  synced_at: string | null;
}

export interface ChargingSession {
  id: string;
  station_name: string;
  charger_type: 'DC' | 'AC';
  start_time: string;
  end_time: string | null;
  start_soc: number;
  end_soc: number | null;
  energy_added_kwh: number | null;
  avg_power_kw: number | null;
  cost_mmk: number | null;
  rate_per_kwh_mmk: number;
  max_power_kw: number;
  sync_status: SyncStatus;
  updated_at: string;
}

export interface ChargingStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  charger_type: 'DC' | 'AC';
  max_power_kw: number;
}

export interface SyncQueueItem {
  id?: number;
  table_name: string;
  action: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  created_at: string;
}

class LeapmotorDB extends Dexie {
  vehicles!: EntityTable<Vehicle, 'id'>;
  trips!: EntityTable<Trip, 'id'>;
  trip_points!: EntityTable<TripPoint, 'id'>;
  charging_sessions!: EntityTable<ChargingSession, 'id'>;
  charging_stations!: EntityTable<ChargingStation, 'id'>;
  sync_queue!: EntityTable<SyncQueueItem, 'id'>;

  constructor() {
    super('leapmotor_b10');
    this.version(1).stores({
      vehicles: 'id',
      trips: 'id, start_time, sync_status',
      trip_points: 'id, trip_id, timestamp',
      charging_sessions: 'id, start_time, sync_status',
      charging_stations: 'id',
      sync_queue: '++id, table_name, created_at',
    });
  }
}

export const db = new LeapmotorDB();

const SAMPLE_STATIONS: ChargingStation[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Junction City DC',
    latitude: 16.7794,
    longitude: 96.1561,
    charger_type: 'DC',
    max_power_kw: 60,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Sule Square AC',
    latitude: 16.7742,
    longitude: 96.1598,
    charger_type: 'AC',
    max_power_kw: 11,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Inya Lake DC Hub',
    latitude: 16.83,
    longitude: 96.145,
    charger_type: 'DC',
    max_power_kw: 120,
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Airport Terminal AC',
    latitude: 16.9073,
    longitude: 96.1332,
    charger_type: 'AC',
    max_power_kw: 7,
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Bahan Fast Charge',
    latitude: 16.812,
    longitude: 96.158,
    charger_type: 'DC',
    max_power_kw: 60,
  },
];

export async function ensureSeedData(): Promise<void> {
  const vehicle = await db.vehicles.get(LEAPMOTOR_B10.id);
  if (!vehicle) {
    await db.vehicles.put({
      id: LEAPMOTOR_B10.id,
      battery_capacity_kwh: LEAPMOTOR_B10.batteryCapacityKwh,
      current_soc_percent: 72,
      updated_at: new Date().toISOString(),
    });
  }

  const stationCount = await db.charging_stations.count();
  if (stationCount === 0) {
    await db.charging_stations.bulkPut(SAMPLE_STATIONS);
  }
}
