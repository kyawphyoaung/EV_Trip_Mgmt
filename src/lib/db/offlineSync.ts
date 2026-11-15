import { db, type SyncQueueItem } from './database';
import { supabase, supabaseConfigured } from '../supabaseClient';

let syncing = false;

export async function enqueueSync(
  table_name: string,
  action: 'upsert' | 'delete',
  payload: Record<string, unknown>,
): Promise<void> {
  await db.sync_queue.add({
    table_name,
    action,
    payload,
    created_at: new Date().toISOString(),
  });
}

async function pushItem(item: SyncQueueItem): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const { table_name, action, payload } = item;

  if (action === 'delete') {
    const id = payload.id as string;
    const { error } = await supabase.from(table_name).delete().eq('id', id);
    if (error) throw error;
    return;
  }

  // Strip local-only fields that may not exist on remote
  const remotePayload = { ...payload };
  if (table_name === 'charging_sessions' && 'max_power_kw' in remotePayload) {
    // keep max_power_kw if migration includes it; otherwise strip
  }

  const { error } = await supabase.from(table_name).upsert(remotePayload);
  if (error) throw error;

  // Mark local record synced when applicable
  if (payload.id && typeof payload.id === 'string') {
    const table = table_name as 'trips' | 'charging_sessions' | 'trip_points' | 'vehicles';
    if (table === 'trips' || table === 'charging_sessions') {
      await db.table(table).update(payload.id, { sync_status: 'synced' });
    }
    if (table === 'trip_points') {
      await db.trip_points.update(payload.id, {
        synced_at: new Date().toISOString(),
      });
    }
  }
}

export async function processSyncQueue(): Promise<{ processed: number; failed: number }> {
  if (!navigator.onLine || !supabaseConfigured || !supabase || syncing) {
    return { processed: 0, failed: 0 };
  }

  syncing = true;
  let processed = 0;
  let failed = 0;

  try {
    const items = await db.sync_queue.orderBy('id').toArray();
    for (const item of items) {
      try {
        await pushItem(item);
        if (item.id != null) await db.sync_queue.delete(item.id);
        processed += 1;
      } catch (err) {
        console.warn('Sync failed for item', item.id, err);
        failed += 1;
        // Stop on first failure to preserve order
        break;
      }
    }
  } finally {
    syncing = false;
  }

  return { processed, failed };
}

export function startOfflineSyncListeners(): () => void {
  const onOnline = () => {
    void processSyncQueue();
  };
  window.addEventListener('online', onOnline);
  // Run once on start
  void processSyncQueue();
  return () => window.removeEventListener('online', onOnline);
}

export async function getPendingSyncCount(): Promise<number> {
  return db.sync_queue.count();
}
