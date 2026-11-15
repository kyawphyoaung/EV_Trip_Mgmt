import { useLiveQuery } from 'dexie-react-hooks';
import { Battery, Car, Clock, Fuel, MapPin, Pencil, Trash2, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card } from '../../components/Card';
import { SyncStatusIcon } from '../../components/SyncStatusIcon';
import { TripCompareCard } from '../../components/TripCompareCard';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import { db, type BatteryLog } from '../../lib/db/database';
import {
  deleteBatteryLog,
  writeBatteryLog,
  writeVehicle,
} from '../../lib/db/repository';
import { estimatedRangeKm, formatDistance, formatDurationSeconds } from '../../lib/algorithms/range';
import { formatLatLng, getCurrentPositionOnce } from '../../lib/geo';

export function Dashboard() {
  const vehicle = useLiveQuery(() => db.vehicles.get(LEAPMOTOR_B10.id));
  const trips =
    useLiveQuery(() =>
      db.trips
        .orderBy('start_time')
        .reverse()
        .filter((t) => t.end_time != null)
        .toArray(),
    ) ?? [];
  const latestTrip = trips[0] ?? null;
  const previousTrip = trips[1] ?? null;

  const batteryLogs =
    useLiveQuery(() => db.battery_logs.orderBy('timestamp').reverse().limit(5).toArray()) ??
    [];

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
  const [savingBattery, setSavingBattery] = useState(false);
  const [editingLog, setEditingLog] = useState<BatteryLog | null>(null);
  const displaySoc = draftSoc ?? soc;

  const consumption =
    latestTrip?.avg_consumption_kwh_per_100km ?? LEAPMOTOR_B10.wltpConsumptionKwhPer100km;
  const rangeKm = estimatedRangeKm(displaySoc, consumption);

  const lastLog = batteryLogs[0];
  const lastUpdate = lastLog?.timestamp ?? vehicle?.updated_at;
  const lastLat = lastLog?.latitude ?? vehicle?.last_latitude;
  const lastLng = lastLog?.longitude ?? vehicle?.last_longitude;

  async function saveBatteryStatus() {
    setSavingBattery(true);
    try {
      const value = Math.max(0, Math.min(100, Math.round(displaySoc)));
      const pos = await getCurrentPositionOnce();
      const nowIso = new Date().toISOString();
      const log: BatteryLog = {
        id: crypto.randomUUID(),
        soc_percent: value,
        latitude: pos?.latitude ?? null,
        longitude: pos?.longitude ?? null,
        timestamp: nowIso,
        sync_status: 'pending',
        updated_at: nowIso,
      };
      await writeBatteryLog(log);
      await writeVehicle({
        id: LEAPMOTOR_B10.id,
        battery_capacity_kwh: LEAPMOTOR_B10.batteryCapacityKwh,
        current_soc_percent: value,
        updated_at: nowIso,
        last_latitude: pos?.latitude ?? null,
        last_longitude: pos?.longitude ?? null,
      });
      setDraftSoc(null);
    } finally {
      setSavingBattery(false);
    }
  }

  async function handleDeleteLog(log: BatteryLog) {
    if (!window.confirm(`Delete battery log at ${new Date(log.timestamp).toLocaleString()}?`)) {
      return;
    }
    await deleteBatteryLog(log.id);
  }

  return (
    <div className="px-4 pt-6 space-y-4 max-w-lg mx-auto pb-4">
      <header className="mb-2">
        <p className="text-xs uppercase tracking-widest text-primary/80">Leapmotor</p>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      </header>

      {/* Battery SOC card */}
      <Card gradient className="relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-primary/10 blur-2xl" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Battery className="text-primary" size={20} />
            <span className="text-sm font-medium">Battery Status</span>
          </div>
          {lastLog && <SyncStatusIcon status={lastLog.sync_status} />}
        </div>
        <div className="flex items-end gap-2 mb-2">
          <span className="text-5xl font-bold tabular-nums bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            {Math.round(displaySoc)}
          </span>
          <span className="text-xl text-slate-400 mb-1">%</span>
        </div>
        <p className="text-xs text-slate-400 mb-1">
          Last update:{' '}
          {lastUpdate ? new Date(lastUpdate).toLocaleString() : '—'}
        </p>
        <p className="text-xs text-slate-500 mb-4 inline-flex items-center gap-1">
          <MapPin size={12} />
          {formatLatLng(lastLat, lastLng)}
        </p>

        <label className="block text-xs text-slate-400 mb-1">Set SOC %</label>
        <input
          type="number"
          className="input mb-2"
          min={0}
          max={100}
          value={Math.round(displaySoc)}
          onChange={(e) => setDraftSoc(Number(e.target.value))}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={displaySoc}
          onChange={(e) => setDraftSoc(Number(e.target.value))}
          className="w-full accent-primary h-2 rounded-full cursor-pointer mb-4"
        />

        <button
          type="button"
          disabled={savingBattery}
          onClick={() => void saveBatteryStatus()}
          className="w-full rounded-xl bg-primary text-base font-semibold py-3 disabled:opacity-50 mb-4"
        >
          {savingBattery ? 'Saving…' : 'Save Battery Status'}
        </button>

        <div className="flex items-center justify-between rounded-xl bg-base/50 px-3 py-2.5">
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

      {/* Recent battery logs */}
      <Card>
        <h2 className="text-sm font-medium mb-3">Recent battery logs</h2>
        {batteryLogs.length === 0 ? (
          <p className="text-sm text-slate-500">No battery logs yet.</p>
        ) : (
          <ul className="space-y-2">
            {batteryLogs.map((log) => (
              <li
                key={log.id}
                className="flex items-start justify-between gap-2 rounded-xl bg-elevated/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold tabular-nums">{log.soc_percent}%</p>
                  <p className="text-xs text-slate-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {formatLatLng(log.latitude, log.longitude)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <SyncStatusIcon status={log.sync_status} />
                  <button
                    type="button"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary"
                    aria-label="Edit battery log"
                    onClick={() => setEditingLog(log)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-danger"
                    aria-label="Delete battery log"
                    onClick={() => void handleDeleteLog(log)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {latestTrip && (
        <TripCompareCard
          current={latestTrip}
          previous={previousTrip}
          title="Compared to previous trip"
        />
      )}

      {/* Latest trip */}
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
            <Stat label="Distance" value={formatDistance(latestTrip.distance_meters)} />
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
          <p className="text-sm text-slate-400">No trips yet — log one from Trips.</p>
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

      {editingLog && (
        <BatteryLogEditModal
          log={editingLog}
          onClose={() => setEditingLog(null)}
          onSaved={() => setEditingLog(null)}
        />
      )}
    </div>
  );
}

function BatteryLogEditModal({
  log,
  onClose,
  onSaved,
}: {
  log: BatteryLog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [soc, setSoc] = useState(log.soc_percent);
  const [timestamp, setTimestamp] = useState(() => {
    const d = new Date(log.timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      await writeBatteryLog({
        ...log,
        soc_percent: soc,
        timestamp: new Date(timestamp).toISOString(),
        sync_status: 'pending',
        updated_at: nowIso,
      });
      // Keep vehicle SOC in sync if this is the newest log
      const newest = await db.battery_logs.orderBy('timestamp').reverse().first();
      if (newest?.id === log.id || new Date(timestamp).getTime() >= Date.now() - 1000) {
        const vehicle = await db.vehicles.get(LEAPMOTOR_B10.id);
        if (vehicle) {
          await writeVehicle({
            ...vehicle,
            current_soc_percent: soc,
            updated_at: nowIso,
          });
        }
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-3">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-elevated p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Edit Battery Log</h3>
          <button type="button" onClick={onClose} className="text-slate-400 text-sm">
            Close
          </button>
        </div>
        <label className="block text-xs text-slate-400 mb-1">SOC %</label>
        <input
          type="number"
          className="input mb-3"
          min={0}
          max={100}
          value={soc}
          onChange={(e) => setSoc(Number(e.target.value))}
        />
        <label className="block text-xs text-slate-400 mb-1">Timestamp</label>
        <input
          type="datetime-local"
          className="input mb-4"
          value={timestamp}
          onChange={(e) => setTimestamp(e.target.value)}
        />
        <p className="text-xs text-slate-500 mb-4">
          Location: {formatLatLng(log.latitude, log.longitude)}
        </p>
        <button
          type="button"
          disabled={saving}
          className="w-full rounded-xl bg-primary text-base font-semibold py-3 disabled:opacity-50"
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
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
