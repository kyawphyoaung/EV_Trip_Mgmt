import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card } from './Card';
import type { Trip } from '../lib/db/database';
import { formatDistance, formatDurationSeconds } from '../lib/algorithms/range';
import { pctChange } from '../lib/format';

interface Props {
  current: Trip;
  previous: Trip | null | undefined;
  title?: string;
}

function DeltaRow({
  label,
  currentLabel,
  pct,
  lowerIsBetter,
}: {
  label: string;
  currentLabel: string;
  pct: number | null;
  lowerIsBetter?: boolean;
}) {
  if (pct == null) {
    return (
      <p className="text-sm text-slate-300">
        {label}: <span className="font-medium tabular-nums">{currentLabel}</span>
        <span className="text-slate-500 text-xs ml-1">(no previous trip)</span>
      </p>
    );
  }

  const improved = lowerIsBetter ? pct < 0 : pct > 0;
  const worsened = lowerIsBetter ? pct > 0 : pct < 0;
  const color = improved ? 'text-success' : worsened ? 'text-danger' : 'text-slate-400';
  const Icon = pct > 0.05 ? ArrowUp : pct < -0.05 ? ArrowDown : Minus;
  const abs = Math.abs(pct).toFixed(0);
  const betterWorse = lowerIsBetter
    ? improved
      ? `↓ ${abs}% better than last trip`
      : worsened
        ? `↑ ${abs}% worse than last trip`
        : 'same as last trip'
    : improved
      ? `↑ ${abs}% vs last trip`
      : worsened
        ? `↓ ${abs}% vs last trip`
        : 'same as last trip';

  return (
    <p className="text-sm text-slate-300 flex flex-wrap items-center gap-1.5">
      <span>
        {label}: <span className="font-medium tabular-nums">{currentLabel}</span>
      </span>
      <span className={`inline-flex items-center gap-0.5 text-xs ${color}`}>
        <Icon size={12} />
        {betterWorse}
      </span>
    </p>
  );
}

export function TripCompareCard({ current, previous, title = 'Compared to previous trip' }: Props) {
  const distPct = previous
    ? pctChange(current.distance_meters, previous.distance_meters)
    : null;
  const consPct =
    previous &&
    current.avg_consumption_kwh_per_100km != null &&
    previous.avg_consumption_kwh_per_100km != null
      ? pctChange(
          current.avg_consumption_kwh_per_100km,
          previous.avg_consumption_kwh_per_100km,
        )
      : null;
  const durPct = previous
    ? pctChange(current.duration_seconds, previous.duration_seconds)
    : null;

  return (
    <Card gradient>
      <h2 className="text-sm font-medium mb-3 text-primary">{title}</h2>
      <div className="space-y-2">
        <DeltaRow
          label="Distance"
          currentLabel={formatDistance(current.distance_meters)}
          pct={distPct}
        />
        <DeltaRow
          label="Consumption"
          currentLabel={`${(current.avg_consumption_kwh_per_100km ?? 0).toFixed(1)} kWh/100km`}
          pct={consPct}
          lowerIsBetter
        />
        <DeltaRow
          label="Duration"
          currentLabel={formatDurationSeconds(current.duration_seconds)}
          pct={durPct}
          lowerIsBetter
        />
      </div>
    </Card>
  );
}
