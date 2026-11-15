import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { SyncStatusIcon } from '../../components/SyncStatusIcon';
import { TripCompareCard } from '../../components/TripCompareCard';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import {
  formatDistance,
  formatDurationSeconds,
} from '../../lib/algorithms/range';
import { db, type Trip } from '../../lib/db/database';
import { deleteTrip, writeTrip, writeVehicle } from '../../lib/db/repository';
import { getCurrentPositionOnce, formatLatLng } from '../../lib/geo';

function defaultTripName(): string {
  const d = new Date();
  return `Trip ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function calcAvgConsumption(
  startSoc: number,
  endSoc: number,
  distanceKm: number,
): number | null {
  if (distanceKm <= 0) return null;
  return ((startSoc - endSoc) / 100) * LEAPMOTOR_B10.batteryCapacityKwh / distanceKm * 100;
}

export function TripHistory() {
  const trips =
    useLiveQuery(() => db.trips.orderBy('start_time').reverse().toArray()) ?? [];
  const vehicle = useLiveQuery(() => db.vehicles.get(LEAPMOTOR_B10.id));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const completed = trips.filter((t) => t.end_time != null);

  const comparePair = useMemo(() => {
    if (!justSavedId) return null;
    const idx = completed.findIndex((t) => t.id === justSavedId);
    if (idx < 0) return null;
    return {
      current: completed[idx],
      previous: completed[idx + 1] ?? null,
    };
  }, [completed, justSavedId]);

  async function handleDelete(trip: Trip) {
    if (!window.confirm(`Delete "${trip.trip_name}"?`)) return;
    await deleteTrip(trip.id);
    if (justSavedId === trip.id) setJustSavedId(null);
  }

  return (
    <div className="px-4 pt-6 space-y-4 max-w-lg mx-auto pb-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-secondary/80">Drive</p>
          <h1 className="text-2xl font-semibold">Trips</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-base px-3 py-2 text-sm font-semibold"
        >
          <Plus size={16} />
          Log a Trip
        </button>
      </header>

      {comparePair && (
        <TripCompareCard current={comparePair.current} previous={comparePair.previous} />
      )}

      <div className="space-y-2">
        {completed.length === 0 && (
          <p className="text-sm text-slate-500">No trips yet. Log one manually.</p>
        )}
        {completed.map((t) => (
          <Card key={t.id} className="!p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{t.trip_name}</p>
                <p className="text-xs text-slate-400">
                  {new Date(t.start_time).toLocaleString()}
                </p>
                <p className="text-xs text-slate-300 mt-1 tabular-nums">
                  {formatDistance(t.distance_meters)} ·{' '}
                  {formatDurationSeconds(t.duration_seconds)} ·{' '}
                  {(t.avg_consumption_kwh_per_100km ?? 0).toFixed(1)} kWh/100km
                </p>
                {(t.latitude != null || t.longitude != null) && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {formatLatLng(t.latitude, t.longitude)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <SyncStatusIcon status={t.sync_status} />
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-elevated hover:text-primary"
                  aria-label="Edit trip"
                  onClick={() => {
                    setEditing(t);
                    setFormOpen(true);
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-elevated hover:text-danger"
                  aria-label="Delete trip"
                  onClick={() => void handleDelete(t)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {formOpen && (
        <TripFormModal
          trip={editing}
          defaultStartSoc={vehicle?.current_soc_percent ?? 72}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={(id) => {
            setJustSavedId(id);
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface TripFormState {
  tripName: string;
  dateTime: string;
  startSoc: number;
  endSoc: number;
  distanceKm: number;
  hours: number;
  minutes: number;
  avgConsumption: string;
  consumptionOverridden: boolean;
  energyDriving: string;
  energyHvac: string;
  energyOther: string;
}

function TripFormModal({
  trip,
  defaultStartSoc,
  onClose,
  onSaved,
}: {
  trip: Trip | null;
  defaultStartSoc: number;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripFormState>(() => {
    if (trip) {
      const hours = Math.floor(trip.duration_seconds / 3600);
      const minutes = Math.floor((trip.duration_seconds % 3600) / 60);
      return {
        tripName: trip.trip_name,
        dateTime: toLocalInputValue(trip.start_time),
        startSoc: trip.start_soc_percent,
        endSoc: trip.end_soc_percent ?? trip.start_soc_percent,
        distanceKm: Number((trip.distance_meters / 1000).toFixed(2)),
        hours,
        minutes,
        avgConsumption:
          trip.avg_consumption_kwh_per_100km != null
            ? String(Number(trip.avg_consumption_kwh_per_100km.toFixed(2)))
            : '',
        consumptionOverridden: true,
        energyDriving: String(trip.energy_driving_kwh || ''),
        energyHvac: String(trip.energy_hvac_kwh || ''),
        energyOther: String(trip.energy_other_kwh || ''),
      };
    }
    return {
      tripName: defaultTripName(),
      dateTime: toLocalInputValue(new Date().toISOString()),
      startSoc: Math.round(defaultStartSoc),
      endSoc: Math.max(0, Math.round(defaultStartSoc) - 10),
      distanceKm: 0,
      hours: 0,
      minutes: 30,
      avgConsumption: '',
      consumptionOverridden: false,
      energyDriving: '',
      energyHvac: '',
      energyOther: '',
    };
  });

  const autoConsumption = calcAvgConsumption(form.startSoc, form.endSoc, form.distanceKm);
  const displayConsumption = form.consumptionOverridden
    ? form.avgConsumption
    : autoConsumption != null
      ? autoConsumption.toFixed(2)
      : '';

  function update<K extends keyof TripFormState>(key: K, value: TripFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const distanceKm = Math.max(0, form.distanceKm);
      const durationSeconds = Math.max(0, form.hours * 3600 + form.minutes * 60);
      const start = new Date(form.dateTime);
      const end = new Date(start.getTime() + durationSeconds * 1000);
      const avg =
        form.consumptionOverridden && form.avgConsumption !== ''
          ? Number(form.avgConsumption)
          : autoConsumption;

      const pos = await getCurrentPositionOnce();
      const nowIso = new Date().toISOString();
      const id = trip?.id ?? crypto.randomUUID();

      const record: Trip = {
        id,
        trip_name: form.tripName.trim() || defaultTripName(),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        start_soc_percent: form.startSoc,
        end_soc_percent: form.endSoc,
        distance_meters: distanceKm * 1000,
        duration_seconds: durationSeconds,
        avg_consumption_kwh_per_100km: avg,
        energy_driving_kwh: Number(form.energyDriving) || 0,
        energy_hvac_kwh: Number(form.energyHvac) || 0,
        energy_other_kwh: Number(form.energyOther) || 0,
        latitude: pos?.latitude ?? trip?.latitude ?? null,
        longitude: pos?.longitude ?? trip?.longitude ?? null,
        created_at: trip?.created_at ?? nowIso,
        sync_status: 'pending',
        updated_at: nowIso,
      };

      await writeTrip(record);
      await writeVehicle({
        id: LEAPMOTOR_B10.id,
        battery_capacity_kwh: LEAPMOTOR_B10.batteryCapacityKwh,
        current_soc_percent: form.endSoc,
        updated_at: nowIso,
        last_latitude: pos?.latitude ?? null,
        last_longitude: pos?.longitude ?? null,
      });

      onSaved(id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={trip ? 'Edit Trip' : 'Log a Trip'} onClose={onClose}>
      <label className="block text-xs text-slate-400 mb-1">Trip name</label>
      <input
        className="input mb-3"
        value={form.tripName}
        onChange={(e) => update('tripName', e.target.value)}
      />

      <label className="block text-xs text-slate-400 mb-1">Date & time</label>
      <input
        type="datetime-local"
        className="input mb-3"
        value={form.dateTime}
        onChange={(e) => update('dateTime', e.target.value)}
      />

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Start SOC %</label>
          <input
            type="number"
            className="input"
            min={0}
            max={100}
            value={form.startSoc}
            onChange={(e) => {
              update('startSoc', Number(e.target.value));
              if (!form.consumptionOverridden) update('avgConsumption', '');
            }}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">End SOC %</label>
          <input
            type="number"
            className="input"
            min={0}
            max={100}
            value={form.endSoc}
            onChange={(e) => {
              update('endSoc', Number(e.target.value));
              if (!form.consumptionOverridden) update('avgConsumption', '');
            }}
          />
        </div>
      </div>

      <label className="block text-xs text-slate-400 mb-1">Distance (km)</label>
      <input
        type="number"
        className="input mb-3"
        min={0}
        step={0.1}
        value={form.distanceKm}
        onChange={(e) => {
          update('distanceKm', Number(e.target.value));
          if (!form.consumptionOverridden) update('avgConsumption', '');
        }}
      />

      <label className="block text-xs text-slate-400 mb-1">Duration</label>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <input
            type="number"
            className="input"
            min={0}
            value={form.hours}
            onChange={(e) => update('hours', Number(e.target.value))}
            placeholder="Hours"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">Hours</p>
        </div>
        <div>
          <input
            type="number"
            className="input"
            min={0}
            max={59}
            value={form.minutes}
            onChange={(e) => update('minutes', Number(e.target.value))}
            placeholder="Minutes"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">Minutes</p>
        </div>
      </div>

      <label className="block text-xs text-slate-400 mb-1">
        Avg consumption (kWh/100km)
        {!form.consumptionOverridden && (
          <span className="text-slate-500"> · auto</span>
        )}
      </label>
      <input
        type="number"
        className="input mb-3"
        step={0.1}
        value={displayConsumption}
        onChange={(e) => {
          update('avgConsumption', e.target.value);
          update('consumptionOverridden', true);
        }}
      />

      <p className="text-xs text-slate-500 mb-2">Energy breakdown (optional)</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div>
          <input
            type="number"
            className="input"
            step={0.1}
            value={form.energyDriving}
            onChange={(e) => update('energyDriving', e.target.value)}
            placeholder="0"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">Driving kWh</p>
        </div>
        <div>
          <input
            type="number"
            className="input"
            step={0.1}
            value={form.energyHvac}
            onChange={(e) => update('energyHvac', e.target.value)}
            placeholder="0"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">HVAC kWh</p>
        </div>
        <div>
          <input
            type="number"
            className="input"
            step={0.1}
            value={form.energyOther}
            onChange={(e) => update('energyOther', e.target.value)}
            placeholder="0"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">Others kWh</p>
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        className="w-full rounded-xl bg-primary text-base font-semibold py-3 disabled:opacity-50"
        onClick={() => void handleSave()}
      >
        {saving ? 'Saving…' : 'Save trip'}
      </button>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-3">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-elevated p-4 shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 text-sm">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
