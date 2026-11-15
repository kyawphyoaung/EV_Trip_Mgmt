export const LEAPMOTOR_B10 = {
  id: 'leapmotor-b10',
  name: 'Leapmotor B10 EV',
  batteryCapacityKwh: 67.1,
  usableCapacityKwh: 65,
  wltpRangeKm: 434,
  wltpConsumptionKwhPer100km: 17.3,
  defaultElectricityRateMMK: 750,
} as const;

export type VehicleConfig = typeof LEAPMOTOR_B10;
