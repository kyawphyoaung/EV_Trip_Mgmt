import { useLiveQuery } from 'dexie-react-hooks';
import { Cloud, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '../../components/Card';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import { clearLocalData } from '../../lib/db/repository';
import { ensureSeedData } from '../../lib/db/database';
import {
  getPendingSyncCount,
  processSyncQueue,
} from '../../lib/db/offlineSync';
import { supabaseConfigured } from '../../lib/supabaseClient';

export function SettingsPage() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const queueCount = useLiveQuery(() => getPendingSyncCount(), []) ?? 0;

  useEffect(() => {
    setPending(queueCount);
  }, [queueCount]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  async function syncNow() {
    setSyncing(true);
    setMessage('');
    const result = await processSyncQueue();
    setPending(await getPendingSyncCount());
    setMessage(
      result.failed
        ? `Synced ${result.processed}, ${result.failed} failed`
        : `Synced ${result.processed} item(s)`,
    );
    setSyncing(false);
  }

  async function handleClear() {
    if (!window.confirm('Clear all local trips, charging sessions, battery logs, and sync queue?')) {
      return;
    }
    await clearLocalData();
    await ensureSeedData();
    setMessage('Local data cleared. Vehicle & stations reseeded.');
  }

  return (
    <div className="px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <header>
        <p className="text-xs uppercase tracking-widest text-slate-500">Preferences</p>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <Card>
        <h2 className="text-sm font-medium mb-3">Data sync</h2>
        <div className="flex items-center gap-2 mb-3 text-sm">
          {online ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Wifi size={16} /> Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-warning">
              <WifiOff size={16} /> Offline
            </span>
          )}
          <span className="text-slate-500">·</span>
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <Cloud size={16} />
            {pending} pending
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Supabase: {supabaseConfigured ? 'configured' : 'not configured'}
        </p>
        <p className="text-xs text-slate-500 mb-3">
          Electricity rate is chosen when you start a charging session.
        </p>
        <button
          type="button"
          disabled={syncing || !online}
          onClick={() => void syncNow()}
          className="w-full rounded-xl bg-primary/20 text-primary py-3 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          Sync Now
        </button>
        {message && <p className="text-xs text-slate-400 mt-2">{message}</p>}
      </Card>

      <Card>
        <h2 className="text-sm font-medium mb-3">Vehicle (read-only)</h2>
        <dl className="space-y-2 text-sm">
          <Spec label="Model" value={LEAPMOTOR_B10.name} />
          <Spec label="Battery" value={`${LEAPMOTOR_B10.batteryCapacityKwh} kWh`} />
          <Spec label="Usable" value={`${LEAPMOTOR_B10.usableCapacityKwh} kWh`} />
          <Spec label="WLTP range" value={`${LEAPMOTOR_B10.wltpRangeKm} km`} />
          <Spec
            label="WLTP consumption"
            value={`${LEAPMOTOR_B10.wltpConsumptionKwhPer100km} kWh/100km`}
          />
        </dl>
      </Card>

      <Card className="border-danger/30">
        <h2 className="text-sm font-medium mb-2 text-danger">Danger zone</h2>
        <button
          type="button"
          onClick={() => void handleClear()}
          className="w-full rounded-xl bg-danger/15 text-danger py-3 text-sm font-medium inline-flex items-center justify-center gap-2"
        >
          <Trash2 size={16} />
          Clear local data
        </button>
      </Card>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-elevated/60 pb-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
