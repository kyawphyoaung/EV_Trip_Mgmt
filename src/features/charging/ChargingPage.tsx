import { useLiveQuery } from 'dexie-react-hooks';
import { PlugZap, Square, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { SyncStatusIcon } from '../../components/SyncStatusIcon';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import {
  formatDuration,
  predictChargingTime,
  predictedSocAtElapsed,
  type ChargerType,
} from '../../lib/algorithms/charging';
import { db, type ChargingSession } from '../../lib/db/database';
import { writeChargingSession, writeVehicle } from '../../lib/db/repository';
import { RATE_PRESETS, useSettingsStore } from '../../stores/settingsStore';

export function ChargingPage() {
  const sessions = useLiveQuery(() =>
    db.charging_sessions.orderBy('start_time').reverse().toArray(),
  ) ?? [];
  const vehicle = useLiveQuery(() => db.vehicles.get(LEAPMOTOR_B10.id));
  const rate = useSettingsStore((s) => s.electricityRateMmk);

  const active = sessions.find((s) => s.end_time == null) ?? null;
  const history = sessions.filter((s) => s.end_time != null);

  const [showStart, setShowStart] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsedHours = active
    ? Math.max(0, (now - new Date(active.start_time).getTime()) / 3_600_000)
    : 0;

  const prediction = useMemo(() => {
    if (!active) return null;
    return predictChargingTime(
      active.start_soc,
      100,
      active.max_power_kw,
      active.charger_type,
      LEAPMOTOR_B10.usableCapacityKwh,
    );
  }, [active]);

  const predictedSoc = active
    ? predictedSocAtElapsed(
        active.start_soc,
        active.max_power_kw,
        active.charger_type,
        LEAPMOTOR_B10.usableCapacityKwh,
        elapsedHours,
      )
    : 0;

  const remainingTo80 = prediction
    ? Math.max(0, prediction.timeTo80Hours - elapsedHours)
    : 0;
  const remainingTo100 = prediction
    ? Math.max(0, prediction.timeTo100Hours - elapsedHours)
    : 0;

  return (
    <div className="px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <header>
        <p className="text-xs uppercase tracking-widest text-warning/80">Energy</p>
        <h1 className="text-2xl font-semibold">Charging</h1>
      </header>

      {!active && (
        <button
          type="button"
          onClick={() => setShowStart(true)}
          className="w-full rounded-2xl bg-gradient-to-r from-primary to-secondary py-4 font-semibold text-base text-base shadow-lg shadow-primary/20 hover:opacity-95 transition"
        >
          <span className="inline-flex items-center gap-2 justify-center">
            <PlugZap size={20} />
            Start Charging
          </span>
        </button>
      )}

      {active && (
        <Card gradient>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Timer className="text-primary animate-pulse" size={18} />
              <h2 className="font-medium">Live session</h2>
            </div>
            <SyncStatusIcon status={active.sync_status} />
          </div>
          <p className="text-sm text-slate-400 mb-1">
            {active.charger_type} · {active.max_power_kw} kW · from {active.start_soc}%
          </p>
          <p className="text-xs text-slate-500 mb-4">
            Started {new Date(active.start_time).toLocaleString()} · elapsed{' '}
            {formatDuration(elapsedHours)}
          </p>

          <div className="mb-2 flex items-end justify-between">
            <span className="text-4xl font-bold tabular-nums text-primary">
              {predictedSoc.toFixed(0)}%
            </span>
            <span className="text-sm text-slate-400">predicted SOC</span>
          </div>
          <div className="h-3 rounded-full bg-base overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all duration-1000"
              style={{ width: `${Math.min(100, predictedSoc)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-xl bg-base/50 px-3 py-2">
              <p className="text-[10px] uppercase text-slate-500">To 80%</p>
              <p className="font-semibold tabular-nums">{formatDuration(remainingTo80)}</p>
            </div>
            <div className="rounded-xl bg-base/50 px-3 py-2">
              <p className="text-[10px] uppercase text-slate-500">To 100%</p>
              <p className="font-semibold tabular-nums">{formatDuration(remainingTo100)}</p>
            </div>
          </div>

          {prediction && (
            <div className="space-y-1 mb-4">
              <p className="text-xs text-slate-500 uppercase">Power segments</p>
              {prediction.segments.map((seg) => (
                <div
                  key={`${seg.fromSoc}-${seg.toSoc}`}
                  className="flex justify-between text-xs text-slate-300"
                >
                  <span>
                    {seg.fromSoc.toFixed(0)}–{seg.toSoc.toFixed(0)}% @ {seg.powerKw.toFixed(1)} kW
                  </span>
                  <span className="tabular-nums text-slate-400">
                    {formatDuration(seg.durationHours)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowFinish(true)}
            className="w-full rounded-xl bg-danger/20 text-danger py-3 font-medium inline-flex items-center justify-center gap-2 hover:bg-danger/30 transition"
          >
            <Square size={16} />
            Finish
          </button>
        </Card>
      )}

      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-2">History</h2>
        <div className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-slate-500">No completed sessions.</p>
          )}
          {history.map((s) => (
            <Card key={s.id} className="!p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">
                    {s.station_name || 'Session'} · {s.charger_type}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(s.start_time).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-300 mt-1 tabular-nums">
                    {(s.energy_added_kwh ?? 0).toFixed(1)} kWh ·{' '}
                    {(s.avg_power_kw ?? 0).toFixed(1)} kW avg ·{' '}
                    {(s.cost_mmk ?? 0).toLocaleString()} MMK
                  </p>
                </div>
                <SyncStatusIcon status={s.sync_status} />
              </div>
            </Card>
          ))}
        </div>
      </section>

      {showStart && (
        <StartModal
          defaultSoc={vehicle?.current_soc_percent ?? 20}
          onClose={() => setShowStart(false)}
          onStart={async (data) => {
            const session: ChargingSession = {
              id: crypto.randomUUID(),
              station_name: data.stationName,
              charger_type: data.chargerType,
              start_time: new Date().toISOString(),
              end_time: null,
              start_soc: data.startSoc,
              end_soc: null,
              energy_added_kwh: null,
              avg_power_kw: null,
              cost_mmk: null,
              rate_per_kwh_mmk: rate,
              max_power_kw: data.maxPowerKw,
              sync_status: 'pending',
              updated_at: new Date().toISOString(),
            };
            await writeChargingSession(session);
            setShowStart(false);
          }}
        />
      )}

      {showFinish && active && (
        <FinishModal
          session={active}
          defaultRate={active.rate_per_kwh_mmk || rate}
          onClose={() => setShowFinish(false)}
          onFinish={async (data) => {
            const durationHours =
              (new Date(data.endTime).getTime() - new Date(active.start_time).getTime()) /
              3_600_000;
            const avgPower =
              durationHours > 0 ? data.energyAddedKwh / durationHours : 0;
            const cost = data.energyAddedKwh * data.rate;

            await writeChargingSession({
              ...active,
              end_time: data.endTime,
              end_soc: data.endSoc,
              energy_added_kwh: data.energyAddedKwh,
              avg_power_kw: avgPower,
              cost_mmk: cost,
              rate_per_kwh_mmk: data.rate,
              updated_at: new Date().toISOString(),
            });

            await writeVehicle({
              id: LEAPMOTOR_B10.id,
              battery_capacity_kwh: LEAPMOTOR_B10.batteryCapacityKwh,
              current_soc_percent: data.endSoc,
              updated_at: new Date().toISOString(),
            });

            setShowFinish(false);
          }}
        />
      )}
    </div>
  );
}

function StartModal({
  defaultSoc,
  onClose,
  onStart,
}: {
  defaultSoc: number;
  onClose: () => void;
  onStart: (data: {
    chargerType: ChargerType;
    maxPowerKw: number;
    startSoc: number;
    stationName: string;
  }) => Promise<void>;
}) {
  const [chargerType, setChargerType] = useState<ChargerType>('DC');
  const [maxPowerKw, setMaxPowerKw] = useState(60);
  const [startSoc, setStartSoc] = useState(Math.round(defaultSoc));
  const [stationName, setStationName] = useState('');
  const [saving, setSaving] = useState(false);

  const presets = chargerType === 'DC' ? [60, 30] : [7, 11];

  return (
    <Modal title="Start Charging" onClose={onClose}>
      <label className="block text-xs text-slate-400 mb-1">Station name</label>
      <input
        className="input mb-3"
        value={stationName}
        onChange={(e) => setStationName(e.target.value)}
        placeholder="Optional"
      />

      <label className="block text-xs text-slate-400 mb-1">Charger type</label>
      <div className="flex gap-2 mb-3">
        {(['DC', 'AC'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setChargerType(t);
              setMaxPowerKw(t === 'DC' ? 60 : 7);
            }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition ${
              chargerType === t
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-elevated text-slate-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <label className="block text-xs text-slate-400 mb-1">Max power (kW)</label>
      <div className="flex gap-2 mb-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setMaxPowerKw(p)}
            className={`flex-1 rounded-xl py-2 text-sm border ${
              maxPowerKw === p
                ? 'border-secondary bg-secondary/15 text-secondary'
                : 'border-elevated text-slate-400'
            }`}
          >
            {p} kW
          </button>
        ))}
      </div>
      <input
        type="number"
        className="input mb-3"
        value={maxPowerKw}
        onChange={(e) => setMaxPowerKw(Number(e.target.value))}
        min={1}
        max={350}
      />

      <label className="block text-xs text-slate-400 mb-1">Start SOC %</label>
      <input
        type="number"
        className="input mb-4"
        value={startSoc}
        onChange={(e) => setStartSoc(Number(e.target.value))}
        min={0}
        max={100}
      />

      <button
        type="button"
        disabled={saving}
        className="w-full rounded-xl bg-primary text-base font-semibold py-3 disabled:opacity-50"
        onClick={async () => {
          setSaving(true);
          await onStart({ chargerType, maxPowerKw, startSoc, stationName });
          setSaving(false);
        }}
      >
        Save & start
      </button>
    </Modal>
  );
}

function FinishModal({
  session,
  defaultRate,
  onClose,
  onFinish,
}: {
  session: ChargingSession;
  defaultRate: number;
  onClose: () => void;
  onFinish: (data: {
    endSoc: number;
    endTime: string;
    energyAddedKwh: number;
    rate: number;
  }) => Promise<void>;
}) {
  const [endSoc, setEndSoc] = useState(80);
  const [energy, setEnergy] = useState(20);
  const [rate, setRate] = useState(defaultRate);
  const [custom, setCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const endTime = new Date().toISOString();
  const durationHours =
    (Date.now() - new Date(session.start_time).getTime()) / 3_600_000;
  const avgPreview = durationHours > 0 ? energy / durationHours : 0;
  const costPreview = energy * rate;

  return (
    <Modal title="Finish Charging" onClose={onClose}>
      <label className="block text-xs text-slate-400 mb-1">End SOC %</label>
      <input
        type="number"
        className="input mb-3"
        value={endSoc}
        onChange={(e) => setEndSoc(Number(e.target.value))}
        min={session.start_soc}
        max={100}
      />

      <label className="block text-xs text-slate-400 mb-1">Energy added (kWh)</label>
      <input
        type="number"
        className="input mb-3"
        value={energy}
        step={0.1}
        onChange={(e) => setEnergy(Number(e.target.value))}
        min={0}
      />

      <label className="block text-xs text-slate-400 mb-1">Rate (MMK/kWh)</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {RATE_PRESETS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setRate(r);
              setCustom(false);
            }}
            className={`rounded-xl px-3 py-1.5 text-xs border ${
              !custom && rate === r
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-elevated text-slate-400'
            }`}
          >
            {r}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={`rounded-xl px-3 py-1.5 text-xs border ${
            custom
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-elevated text-slate-400'
          }`}
        >
          Custom
        </button>
      </div>
      {custom && (
        <input
          type="number"
          className="input mb-3"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      )}

      <div className="rounded-xl bg-elevated/60 p-3 text-sm mb-4 space-y-1">
        <p>
          Avg power:{' '}
          <span className="font-semibold tabular-nums">{avgPreview.toFixed(2)} kW</span>
        </p>
        <p>
          Cost:{' '}
          <span className="font-semibold tabular-nums">{costPreview.toLocaleString()} MMK</span>
        </p>
        <p className="text-xs text-slate-500">End time: now ({formatDuration(durationHours)})</p>
      </div>

      <button
        type="button"
        disabled={saving}
        className="w-full rounded-xl bg-success/90 text-base font-semibold py-3 disabled:opacity-50"
        onClick={async () => {
          setSaving(true);
          await onFinish({ endSoc, endTime, energyAddedKwh: energy, rate });
          setSaving(false);
        }}
      >
        Save session
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
