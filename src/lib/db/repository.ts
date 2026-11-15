import {
  db,
  type ChargingSession,
  type Trip,
  type TripPoint,
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

export async function writeTripPoint(point: TripPoint): Promise<void> {
  await db.trip_points.put(point);
  await enqueueSync('trip_points', 'upsert', { ...point });
}

export async function writeChargingSession(session: ChargingSession): Promise<void> {
  const local: ChargingSession = { ...session, sync_status: 'pending' };
  await db.charging_sessions.put(local);
  await enqueueSync('charging_sessions', 'upsert', { ...local });
}

export async function clearLocalData(): Promise<void> {
  await Promise.all([
    db.trips.clear(),
    db.trip_points.clear(),
    db.charging_sessions.clear(),
    db.sync_queue.clear(),
  ]);
}
