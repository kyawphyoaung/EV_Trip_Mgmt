import { useLiveQuery } from 'dexie-react-hooks';
import { Battery, Car, Clock, Fuel, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card } from '../../components/Card';
import { SyncStatusIcon } from '../../components/SyncStatusIcon';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import { db } from '../../lib/db/database';
import { writeVehicle } from '../../lib/db/repository';
import { estimatedRangeKm, formatDistance, formatDurationSeconds } from '../../lib/algorithms/range';

export function Dashboard() {
  const vehicle = useLiveQuery(() => db.vehicles.get(LEAPMOTOR_B10.id));
  const latestTrip = useLiveQuery(() =>
    db.trips.orderBy('start_time').reverse().first(),
  );
  const lastCharge = useLiveQuery(async () => {
    const rows = await db.charging_sessions
      .orderBy('start_time')
      .reverse()
      .filter((s) => s.end_time != null)
      .toArray();
    return rows[0] ?? null;
  });

  const soc = vehicle?.current_soc_percent ?? 72;
  const [draftSoc, setDraftSoc] = useState<number | null>(null);
  const displaySoc = draftSoc ?? soc;

  const consumption =
    latestTrip?.avg_consumption_kwh_per_100km ?? LEAPMOTOR_B10.wltpConsumptionKwhPer100km;
  const rangeKm = estimatedRangeKm(displaySoc, consumption);

  async function commitSoc(value: number) {
    setDraftSoc(null);
    await writeVehicle({
      id: LEAPMOTOR_B10.id,
      battery_capacity_kwh: LEAPMOTOR_B10.batteryCapacityKwh,
      current_soc_percent: value,
      updated_at: new Date().toISOString(),
    });
  }

  return (
    <div className="px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <header className="mb-2">
        <p className="text-xs uppercase tracking-widest text-primary/80">Leapmotor</p>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      </header>

      {/* SOC Card */}
      <Card gradient className="relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-primary/10 blur-2xl" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Battery className="text-primary" size={20} />
            <span className="text-sm font-medium">State of Charge</span>
          </div>
          <SyncStatusIcon status="synced" />
        </div>
        <div className="flex items-end gap-2 mb-4">
          <span className="text-5xl font-bold tabular-nums bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            {Math.round(displaySoc)}
          </span>
          <span className="text-xl text-slate-400 mb-1">%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={displaySoc}
          onChange={(e) => setDraftSoc(Number(e.target.value))}
          onMouseUp={(e) => commitSoc(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => commitSoc(Number((e.target as HTMLInputElement).value))}
          className="w-full accent-primary h-2 rounded-full cursor-pointer"
        />
        <div className="mt-4 flex items-center justify-between rounded-xl bg-base/50 px-3 py-2.5">
          <div>
            <p className="text-xs text-slate-400">Estimated range</p>
            <p className="text-lg font-semibold text-success tabular-nums">
              {rangeKm.toFixed(0)} km
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Consumption</p>
            <p className="text-sm font-medium text-slate-200 tabular-nums">
              {consumption.toFixed(1)} kWh/100km
            </p>
          </div>
        </div>
      </Card>

      {/* Trip A / latest trip */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Fuel className="text-secondary" size={18} />
            <h2 className="font-medium">Latest Trip</h2>
          </div>
          {latestTrip && <SyncStatusIcon status={latestTrip.sync_status} />}
        </div>
        {latestTrip ? (
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Distance"
              value={formatDistance(latestTrip.distance_meters)}
            />
            <Stat
              label="Duration"
              value={formatDurationSeconds(latestTrip.duration_seconds)}
              icon={<Clock size={12} />}
            />
            <Stat
              label="Avg"
              value={`${(latestTrip.avg_consumption_kwh_per_100km ?? 0).toFixed(1)}`}
              suffix="kWh/100"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-400">No trips yet — start one from Trips.</p>
        )}
      </Card>

      {/* Last charging */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="text-warning" size={18} />
            <h2 className="font-medium">Last Charging</h2>
          </div>
          {lastCharge && <SyncStatusIcon status={lastCharge.sync_status} />}
        </div>
        {lastCharge ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">
              {lastCharge.station_name || 'Unnamed'} ·{' '}
              <span className="text-primary">{lastCharge.charger_type}</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="SOC"
                value={`${lastCharge.start_soc}→${lastCharge.end_soc ?? '—'}`}
                suffix="%"
              />
              <Stat
                label="Energy"
                value={(lastCharge.energy_added_kwh ?? 0).toFixed(1)}
                suffix="kWh"
              />
              <Stat
                label="Cost"
                value={(lastCharge.cost_mmk ?? 0).toLocaleString()}
                suffix="MMK"
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No charging sessions yet.</p>
        )}
      </Card>

      {/* Vehicle info */}
      <Card className="bg-gradient-to-r from-surface to-elevated">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Car className="text-primary" size={22} />
          </div>
          <div>
            <p className="font-medium">{LEAPMOTOR_B10.name}</p>
            <p className="text-sm text-slate-400">
              {LEAPMOTOR_B10.batteryCapacityKwh} kWh · WLTP {LEAPMOTOR_B10.wltpRangeKm} km
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  icon,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-elevated/60 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums mt-0.5">
        {value}
        {suffix && <span className="text-[10px] text-slate-400 ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}
