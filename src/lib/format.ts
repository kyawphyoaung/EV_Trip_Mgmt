/** Absolute datetime as YYYY-MM-DD HHh MMm */
export function formatAbsoluteDateTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}h ${min}m`;
}

/** Relative remaining duration e.g. "25 min" / "1h 40min" */
export function formatRemainingIn(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return 'now';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
