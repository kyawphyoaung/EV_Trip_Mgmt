import { useLiveQuery } from 'dexie-react-hooks';
import { LngLatBounds, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ChevronLeft, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../../components/Card';
import { SyncStatusIcon } from '../../components/SyncStatusIcon';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import {
  formatDistance,
  formatDurationSeconds,
  haversineMeters,
} from '../../lib/algorithms/range';
import { db, type Trip, type TripPoint } from '../../lib/db/database';
import { writeTrip, writeTripPoint, writeVehicle } from '../../lib/db/repository';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export function TripHistory() {
  const trips = useLiveQuery(() =>
    db.trips.orderBy('start_time').reverse().toArray(),
  ) ?? [];
  const vehicle = useLiveQuery(() => db.vehicles.get(LEAPMOTOR_B10.id));
  const activeTrip = trips.find((t) => t.end_time == null) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const selectedPoints = useLiveQuery(
    () =>
      selectedId
        ? db.trip_points.where('trip_id').equals(selectedId).sortBy('timestamp')
        : Promise.resolve([] as TripPoint[]),
    [selectedId],
  );

  // GPS watch while trip active
  useEffect(() => {
    if (!activeTrip) return;

    let lastPoint: { lat: number; lon: number; time: number } | null = null;
    let watchId: number;

    const savePoint = async (lat: number, lon: number) => {
      const soc = vehicle?.current_soc_percent ?? 70;
      const point: TripPoint = {
        id: crypto.randomUUID(),
        trip_id: activeTrip.id,
        latitude: lat,
        longitude: lon,
        soc_percent: soc,
        timestamp: new Date().toISOString(),
        synced_at: null,
      };
      await writeTripPoint(point);

      const points = await db.trip_points.where('trip_id').equals(activeTrip.id).toArray();
      let distance = 0;
      const sorted = [...points].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        distance += haversineMeters(
          sorted[i - 1].latitude,
          sorted[i - 1].longitude,
          sorted[i].latitude,
          sorted[i].longitude,
        );
      }
      const durationSeconds = Math.round(
        (Date.now() - new Date(activeTrip.start_time).getTime()) / 1000,
      );
      await writeTrip({
        ...activeTrip,
        distance_meters: distance,
        duration_seconds: durationSeconds,
        updated_at: new Date().toISOString(),
      });
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const now = Date.now();
        if (!lastPoint) {
          lastPoint = { lat, lon, time: now };
          void savePoint(lat, lon);
          return;
        }
        const dist = haversineMeters(lastPoint.lat, lastPoint.lon, lat, lon);
        const elapsed = now - lastPoint.time;
        if (dist >= 1000 || elapsed >= 60_000) {
          lastPoint = { lat, lon, time: now };
          void savePoint(lat, lon);
        }
      },
      (err) => console.warn('Geolocation error', err),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeTrip?.id, vehicle?.current_soc_percent]);

  async function startTrip() {
    const soc = vehicle?.current_soc_percent ?? 72;
    const trip: Trip = {
      id: crypto.randomUUID(),
      trip_name: `Trip ${new Date().toLocaleString()}`,
      start_time: new Date().toISOString(),
      end_time: null,
      start_soc_percent: soc,
      end_soc_percent: null,
      distance_meters: 0,
      duration_seconds: 0,
      avg_consumption_kwh_per_100km: null,
      energy_driving_kwh: 0,
      energy_hvac_kwh: 0,
      energy_other_kwh: 0,
      sync_status: 'pending',
      updated_at: new Date().toISOString(),
    };
    await writeTrip(trip);
  }

  async function endTrip() {
    if (!activeTrip) return;
    setEnding(true);
    const endSocStr = window.prompt('End SOC %', String(vehicle?.current_soc_percent ?? 50));
    if (endSocStr == null) {
      setEnding(false);
      return;
    }
    const endSoc = Number(endSocStr);
    const distanceKm = activeTrip.distance_meters / 1000;
    const socUsed = Math.max(0, activeTrip.start_soc_percent - endSoc);
    const energyUsed = (socUsed / 100) * LEAPMOTOR_B10.usableCapacityKwh;
    const avgConsumption =
      distanceKm > 0.1 ? (energyUsed / distanceKm) * 100 : null;
    const energyDriving = energyUsed * 0.75;
    const energyHvac = energyUsed * 0.15;
    const energyOther = energyUsed * 0.1;
    const durationSeconds = Math.round(
      (Date.now() - new Date(activeTrip.start_time).getTime()) / 1000,
    );

    await writeTrip({
      ...activeTrip,
      end_time: new Date().toISOString(),
      end_soc_percent: endSoc,
      duration_seconds: durationSeconds,
      avg_consumption_kwh_per_100km: avgConsumption,
      energy_driving_kwh: energyDriving,
      energy_hvac_kwh: energyHvac,
      energy_other_kwh: energyOther,
      updated_at: new Date().toISOString(),
    });

    await writeVehicle({
      id: LEAPMOTOR_B10.id,
      battery_capacity_kwh: LEAPMOTOR_B10.batteryCapacityKwh,
      current_soc_percent: endSoc,
      updated_at: new Date().toISOString(),
    });
    setEnding(false);
  }

  if (selectedId) {
    const trip = trips.find((t) => t.id === selectedId);
    return (
      <TripDetail
        trip={trip}
        points={selectedPoints ?? []}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-secondary/80">Drive</p>
          <h1 className="text-2xl font-semibold">Trips</h1>
        </div>
        {!activeTrip ? (
          <button
            type="button"
            onClick={() => void startTrip()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-base px-3 py-2 text-sm font-semibold"
          >
            <Play size={16} />
            Start New Trip
          </button>
        ) : (
          <button
            type="button"
            disabled={ending}
            onClick={() => void endTrip()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-danger/20 text-danger px-3 py-2 text-sm font-semibold"
          >
            <Square size={16} />
            End Trip
          </button>
        )}
      </header>

      {activeTrip && (
        <Card gradient>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-primary animate-pulse">● Recording</p>
            <SyncStatusIcon status={activeTrip.sync_status} />
          </div>
          <p className="font-medium">{activeTrip.trip_name}</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-xl bg-base/50 px-3 py-2">
              <p className="text-[10px] text-slate-500 uppercase">Distance</p>
              <p className="font-semibold">{formatDistance(activeTrip.distance_meters)}</p>
            </div>
            <div className="rounded-xl bg-base/50 px-3 py-2">
              <p className="text-[10px] text-slate-500 uppercase">Duration</p>
              <p className="font-semibold">
                {formatDurationSeconds(
                  Math.round((Date.now() - new Date(activeTrip.start_time).getTime()) / 1000),
                )}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {trips.filter((t) => t.end_time).length === 0 && !activeTrip && (
          <p className="text-sm text-slate-500">No trips yet.</p>
        )}
        {trips
          .filter((t) => t.end_time)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className="w-full text-left"
            >
              <Card className="!p-3 hover:border-primary/30 transition">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{t.trip_name}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(t.start_time).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-300 mt-1 tabular-nums">
                      {formatDistance(t.distance_meters)} ·{' '}
                      {formatDurationSeconds(t.duration_seconds)} ·{' '}
                      {(t.avg_consumption_kwh_per_100km ?? 0).toFixed(1)} kWh/100km
                    </p>
                  </div>
                  <SyncStatusIcon status={t.sync_status} />
                </div>
              </Card>
            </button>
          ))}
      </div>
    </div>
  );
}

function TripDetail({
  trip,
  points,
  onBack,
}: {
  trip?: Trip;
  points: TripPoint[];
  onBack: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current || points.length === 0) return;
    const map = new MapLibreMap({
      container: mapRef.current,
      style: DARK_STYLE,
      center: [points[0].longitude, points[0].latitude],
      zoom: 12,
    });

    const coords = points.map((p) => [p.longitude, p.latitude] as [number, number]);

    map.on('load', () => {
      map.addSource('trip', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
      });
      map.addLayer({
        id: 'trip-line',
        type: 'line',
        source: 'trip',
        paint: { 'line-color': '#A78BFA', 'line-width': 4 },
      });
      const bounds = new LngLatBounds();
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
    });

    return () => map.remove();
  }, [points]);

  const chartData = points.map((p) => ({
    time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    soc: p.soc_percent,
  }));

  if (!trip) {
    return (
      <div className="p-4">
        <button type="button" onClick={onBack} className="text-primary text-sm">
          Back
        </button>
        <p className="mt-4 text-slate-400">Trip not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto pb-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-primary"
      >
        <ChevronLeft size={16} />
        Back
      </button>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{trip.trip_name}</h1>
          <p className="text-xs text-slate-400">{new Date(trip.start_time).toLocaleString()}</p>
        </div>
        <SyncStatusIcon status={trip.sync_status} />
      </div>

      <div className="h-48 rounded-2xl overflow-hidden border border-elevated">
        {points.length > 0 ? (
          <div ref={mapRef} className="w-full h-full" />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-slate-500 bg-surface">
            No GPS points
          </div>
        )}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Distance" value={formatDistance(trip.distance_meters)} />
          <Stat label="Duration" value={formatDurationSeconds(trip.duration_seconds)} />
          <Stat
            label="Avg consumption"
            value={`${(trip.avg_consumption_kwh_per_100km ?? 0).toFixed(1)} kWh/100km`}
          />
          <Stat
            label="SOC"
            value={`${trip.start_soc_percent}% → ${trip.end_soc_percent ?? '—'}%`}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-medium mb-2">Energy breakdown</h2>
        <div className="space-y-1 text-sm">
          <Row label="Driving" value={`${trip.energy_driving_kwh.toFixed(2)} kWh`} />
          <Row label="HVAC" value={`${trip.energy_hvac_kwh.toFixed(2)} kWh`} />
          <Row label="Other" value={`${trip.energy_other_kwh.toFixed(2)} kWh`} />
        </div>
      </Card>

      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-medium mb-2">SOC over time</h2>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2630" />
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#151B23', border: '1px solid #1E2630' }}
                />
                <Line type="monotone" dataKey="soc" stroke="#22D3EE" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
