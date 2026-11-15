export type ChargerType = 'DC' | 'AC';

export interface ChargingSegment {
  fromSoc: number;
  toSoc: number;
  powerKw: number;
  energyKwh: number;
  durationHours: number;
}

export interface ChargingPrediction {
  timeTo80Hours: number;
  timeTo100Hours: number;
  segments: ChargingSegment[];
  predictedAvgPowerKw: number;
}

function powerAtSoc(soc: number, maxPowerKw: number, chargerType: ChargerType): number {
  if (soc < 50) return maxPowerKw * 1.0;
  if (soc < 80) {
    return chargerType === 'DC' ? maxPowerKw * 0.7 : maxPowerKw * 1.0;
  }
  return chargerType === 'DC' ? maxPowerKw * 0.3 : maxPowerKw * 0.8;
}

function buildSegments(
  startSoc: number,
  targetSoc: number,
  maxPowerKw: number,
  chargerType: ChargerType,
  usableCapacityKwh: number,
): ChargingSegment[] {
  const breakpoints = [0, 50, 80, 100];
  const segments: ChargingSegment[] = [];
  let cursor = Math.max(0, Math.min(100, startSoc));
  const end = Math.max(cursor, Math.min(100, targetSoc));

  while (cursor < end - 0.001) {
    const nextBreak = breakpoints.find((b) => b > cursor) ?? 100;
    const toSoc = Math.min(end, nextBreak);
    const powerKw = powerAtSoc(cursor, maxPowerKw, chargerType);
    const energyKwh = ((toSoc - cursor) / 100) * usableCapacityKwh;
    const durationHours = powerKw > 0 ? energyKwh / powerKw : 0;
    segments.push({ fromSoc: cursor, toSoc, powerKw, energyKwh, durationHours });
    cursor = toSoc;
  }

  return segments;
}

function sumHours(segments: ChargingSegment[]): number {
  return segments.reduce((s, seg) => s + seg.durationHours, 0);
}

/**
 * Piecewise taper model for charging time prediction.
 * 0–50%: 1.0 × maxPower · 50–80%: 0.7 DC / 1.0 AC · 80–100%: 0.3 DC / 0.8 AC
 */
export function predictChargingTime(
  startSoc: number,
  targetSoc: number,
  maxPowerKw: number,
  chargerType: ChargerType,
  usableCapacityKwh: number,
): ChargingPrediction {
  const segments = buildSegments(
    startSoc,
    targetSoc,
    maxPowerKw,
    chargerType,
    usableCapacityKwh,
  );
  const timeToTarget = sumHours(segments);
  const timeTo80Hours = sumHours(
    buildSegments(startSoc, Math.max(startSoc, 80), maxPowerKw, chargerType, usableCapacityKwh),
  );
  const timeTo100Hours = sumHours(
    buildSegments(startSoc, 100, maxPowerKw, chargerType, usableCapacityKwh),
  );

  const totalEnergy = segments.reduce((s, seg) => s + seg.energyKwh, 0);
  const predictedAvgPowerKw = timeToTarget > 0 ? totalEnergy / timeToTarget : 0;

  return {
    timeTo80Hours: startSoc >= 80 ? 0 : timeTo80Hours,
    timeTo100Hours: startSoc >= 100 ? 0 : timeTo100Hours,
    segments,
    predictedAvgPowerKw,
  };
}

/** Predicted SOC at a given elapsed time from session start. */
export function predictedSocAtElapsed(
  startSoc: number,
  maxPowerKw: number,
  chargerType: ChargerType,
  usableCapacityKwh: number,
  elapsedHours: number,
): number {
  const segments = buildSegments(startSoc, 100, maxPowerKw, chargerType, usableCapacityKwh);
  let remaining = elapsedHours;
  let soc = startSoc;

  for (const seg of segments) {
    if (remaining <= 0) break;
    if (remaining >= seg.durationHours) {
      soc = seg.toSoc;
      remaining -= seg.durationHours;
    } else {
      const fraction = seg.durationHours > 0 ? remaining / seg.durationHours : 0;
      soc = seg.fromSoc + (seg.toSoc - seg.fromSoc) * fraction;
      remaining = 0;
    }
  }

  return Math.min(100, Math.max(startSoc, soc));
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}
