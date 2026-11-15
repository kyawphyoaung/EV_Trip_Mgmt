import {
  db,
  type BatteryLog,
  type ChargingSession,
  type Trip,
  type Vehicle,
} from './database';
import { enqueueSync } from './offlineSync';

/** Write locally first, then enqueue for cloud sync. Never blocks on network. */
export async function writeVehicle(vehicle: Vehicle): Promise<void> {
  await db.vehicles.put(vehicle);
  await enqueueSync('vehicles', 'upsert', { ...vehicle });
}

export async function writeTrip(trip: Trip): Promise<void> {
  const local: Trip = { ...trip, sync_status: 'pending' };
  await db.trips.put(local);
  await enqueueSync('trips', 'upsert', { ...local });
}

export async function deleteTrip(id: string): Promise<void> {
  await db.trips.delete(id);
  await enqueueSync('trips', 'delete', { id });
}

export async function writeChargingSession(session: ChargingSession): Promise<void> {
  const local: ChargingSession = { ...session, sync_status: 'pending' };
  await db.charging_sessions.put(local);
  await enqueueSync('charging_sessions', 'upsert', { ...local });
}

export async function deleteChargingSession(id: string): Promise<void> {
  await db.charging_sessions.delete(id);
  await enqueueSync('charging_sessions', 'delete', { id });
}

export async function writeBatteryLog(log: BatteryLog): Promise<void> {
  const local: BatteryLog = { ...log, sync_status: 'pending' };
  await db.battery_logs.put(local);
  await enqueueSync('battery_logs', 'upsert', { ...local });
}

export async function deleteBatteryLog(id: string): Promise<void> {
  await db.battery_logs.delete(id);
  await enqueueSync('battery_logs', 'delete', { id });
}

export async function clearLocalData(): Promise<void> {
  await Promise.all([
    db.trips.clear(),
    db.trip_points.clear(),
    db.charging_sessions.clear(),
    db.battery_logs.clear(),
    db.sync_queue.clear(),
  ]);
}
