import type { TripPoint } from '../db/database';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import { haversineMeters } from './range';

export type DrivingLabel = 'Aggressive' | 'Efficient' | 'Normal';

export interface DrivingBehaviorScore {
  label: DrivingLabel;
  hardEventRatio: number;
  hardEvents: number;
  totalSamples: number;
}

/**
 * Estimate hard accel/brake from consecutive GPS points via speed deltas.
 */
export function computeDrivingBehavior(
  points: TripPoint[],
  avgConsumption: number | null,
): DrivingBehaviorScore {
  if (points.length < 3) {
    const label: DrivingLabel =
      avgConsumption != null && avgConsumption < LEAPMOTOR_B10.wltpConsumptionKwhPer100km
        ? 'Efficient'
        : 'Normal';
    return { label, hardEventRatio: 0, hardEvents: 0, totalSamples: 0 };
  }

  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  let hardEvents = 0;
  let samples = 0;
  let prevSpeed: number | null = null;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const dt =
      (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (dt <= 0 || dt > 120) continue;

    const dist = haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    const speed = dist / dt; // m/s
    if (prevSpeed != null) {
      const accel = (speed - prevSpeed) / dt; // m/s²
      samples += 1;
      // Hard accel ~ >2.5 m/s², hard brake ~ < -3.5 m/s²
      if (accel > 2.5 || accel < -3.5) hardEvents += 1;
    }
    prevSpeed = speed;
  }

  const hardEventRatio = samples > 0 ? hardEvents / samples : 0;

  let label: DrivingLabel = 'Normal';
  if (hardEventRatio > 0.3) label = 'Aggressive';
  else if (avgConsumption != null && avgConsumption < LEAPMOTOR_B10.wltpConsumptionKwhPer100km) {
    label = 'Efficient';
  }

  return { label, hardEventRatio, hardEvents, totalSamples: samples };
}
