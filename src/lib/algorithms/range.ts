import { LEAPMOTOR_B10 } from '../../config/vehicle';

export function estimatedRangeKm(socPercent: number, actualConsumptionKwhPer100km?: number | null): number {
  const consumption = actualConsumptionKwhPer100km && actualConsumptionKwhPer100km > 0
    ? actualConsumptionKwhPer100km
    : LEAPMOTOR_B10.wltpConsumptionKwhPer100km;
  const usableKwh = (socPercent / 100) * LEAPMOTOR_B10.usableCapacityKwh;
  return (usableKwh / consumption) * 100;
}

export function energyNeededKwh(distanceKm: number, consumptionKwhPer100km?: number | null): number {
  const consumption = consumptionKwhPer100km && consumptionKwhPer100km > 0
    ? consumptionKwhPer100km
    : LEAPMOTOR_B10.wltpConsumptionKwhPer100km;
  return (distanceKm / 100) * consumption;
}

export function socOnArrival(
  currentSoc: number,
  distanceKm: number,
  consumptionKwhPer100km?: number | null,
): number {
  const needed = energyNeededKwh(distanceKm, consumptionKwhPer100km);
  const remainingKwh = (currentSoc / 100) * LEAPMOTOR_B10.usableCapacityKwh - needed;
  return Math.max(0, (remainingKwh / LEAPMOTOR_B10.usableCapacityKwh) * 100);
}

export type ReachBadge = 'Safe' | 'Caution' | 'Cannot Reach';

export function reachBadge(arrivalSoc: number): ReachBadge {
  if (arrivalSoc <= 0) return 'Cannot Reach';
  if (arrivalSoc < 15) return 'Caution';
  return 'Safe';
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDurationSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}
