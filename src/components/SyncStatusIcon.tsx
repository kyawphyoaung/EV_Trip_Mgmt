import { CloudCheck, CloudOff } from 'lucide-react';
import type { SyncStatus } from '../lib/db/database';

interface Props {
  status?: SyncStatus | string | null;
  syncedAt?: string | null;
  className?: string;
  size?: number;
}

export function SyncStatusIcon({ status, syncedAt, className = '', size = 16 }: Props) {
  const synced = status === 'synced' || Boolean(syncedAt);

  if (synced) {
    return (
      <span title="Synced" className={`inline-flex text-success ${className}`}>
        <CloudCheck size={size} />
      </span>
    );
  }

  return (
    <span title="Local only — pending sync" className={`inline-flex text-warning ${className}`}>
      <CloudOff size={size} />
    </span>
  );
}
