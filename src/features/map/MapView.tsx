import { useLiveQuery } from 'dexie-react-hooks';
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Navigation, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import { db } from '../../lib/db/database';
import type { ChargingStation } from '../../lib/db/database';
import {
  energyNeededKwh,
  formatDistance,
  haversineMeters,
  reachBadge,
  socOnArrival,
  type ReachBadge,
} from '../../lib/algorithms/range';

const YANGON: [number, number] = [96.1561, 16.7794];
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface LineGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

interface RouteInfo {
  distanceMeters: number;
  energyKwh: number;
  arrivalSoc: number;
  badge: ReachBadge;
  geometry: LineGeometry;
}

interface StationDetail {
  station: ChargingStation;
  distanceMeters: number;
  arrivalSoc: number;
  recommendation: 'Continue' | 'Stop Here';
}

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const stationMarkersRef = useRef<Marker[]>([]);
  const userPosRef = useRef<[number, number]>(YANGON);

  const stations = useLiveQuery(() => db.charging_stations.toArray()) ?? [];
  const vehicle = useLiveQuery(() => db.vehicles.get(LEAPMOTOR_B10.id));
  const latestTrip = useLiveQuery(() =>
    db.trips.orderBy('start_time').reverse().first(),
  );

  const soc = vehicle?.current_soc_percent ?? 72;
  const consumption =
    latestTrip?.avg_consumption_kwh_per_100km ?? LEAPMOTOR_B10.wltpConsumptionKwhPer100km;

  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [stationDetail, setStationDetail] = useState<StationDetail | null>(null);
  const [dest, setDest] = useState<[number, number] | null>(null);
  const [routing, setRouting] = useState(false);

  // Init map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: mapContainer.current,
      style: DARK_STYLE,
      center: YANGON,
      zoom: 12,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        userPosRef.current = coords;
        map.setCenter(coords);
        new Marker({ color: '#22D3EE' }).setLngLat(coords).addTo(map);
      },
      () => {
        new Marker({ color: '#22D3EE' }).setLngLat(YANGON).addTo(map);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );

    map.on('click', (e: MapMouseEvent) => {
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setDest(lngLat);
      setStationDetail(null);
      if (destMarkerRef.current) destMarkerRef.current.remove();
      destMarkerRef.current = new Marker({ color: '#A78BFA' })
        .setLngLat(lngLat)
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Station markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || stations.length === 0) return;

    const addMarkers = () => {
      stationMarkersRef.current.forEach((m) => m.remove());
      stationMarkersRef.current = [];

      for (const station of stations) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'w-4 h-4 rounded-full border-2 border-white shadow-lg cursor-pointer';
        el.style.backgroundColor =
          station.charger_type === 'DC' ? '#FB923C' : '#38BDF8';
        el.title = station.name;

        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const from = userPosRef.current;
          const dist = haversineMeters(
            from[1],
            from[0],
            station.latitude,
            station.longitude,
          );
          const arrival = socOnArrival(soc, dist / 1000, consumption);
          setStationDetail({
            station,
            distanceMeters: dist,
            arrivalSoc: arrival,
            recommendation: arrival < 20 ? 'Stop Here' : 'Continue',
          });
          setRouteInfo(null);
        });

        const marker = new Marker({ element: el })
          .setLngLat([station.longitude, station.latitude])
          .addTo(map);
        stationMarkersRef.current.push(marker);
      }
    };

    if (map.isStyleLoaded()) addMarkers();
    else map.once('load', addMarkers);
  }, [stations, soc, consumption]);

  // Route when dest changes
  useEffect(() => {
    if (!dest) return;
    const from = userPosRef.current;
    void fetchRoute(from, dest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest, soc, consumption]);

  async function fetchRoute(from: [number, number], to: [number, number]) {
    setRouting(true);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Routing failed');
      const data = await res.json();
      const route = data.routes?.[0];
      if (!route) throw new Error('No route');

      const distanceMeters = route.distance as number;
      const distanceKm = distanceMeters / 1000;
      const energyKwh = energyNeededKwh(distanceKm, consumption);
      const arrivalSoc = socOnArrival(soc, distanceKm, consumption);
      const badge = reachBadge(arrivalSoc);
      const raw = route.geometry as { type: string; coordinates: number[][] };
      const geometry: LineGeometry = {
        type: 'LineString',
        coordinates: raw.coordinates.map((c) => [c[0], c[1]] as [number, number]),
      };

      setRouteInfo({ distanceMeters, energyKwh, arrivalSoc, badge, geometry });
      drawRoute(geometry);
    } catch (err) {
      console.warn(err);
      // Offline fallback: straight-line estimate
      const dist = haversineMeters(from[1], from[0], to[1], to[0]) * 1.3;
      const energyKwh = energyNeededKwh(dist / 1000, consumption);
      const arrivalSoc = socOnArrival(soc, dist / 1000, consumption);
      setRouteInfo({
        distanceMeters: dist,
        energyKwh,
        arrivalSoc,
        badge: reachBadge(arrivalSoc),
        geometry: {
          type: 'LineString',
          coordinates: [from, to],
        },
      });
      drawRoute({ type: 'LineString', coordinates: [from, to] });
    } finally {
      setRouting(false);
    }
  }

  function drawRoute(geometry: LineGeometry) {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = 'route';
    const layerId = 'route-line';

    const apply = () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      map.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry },
      });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#22D3EE',
          'line-width': 4,
          'line-opacity': 0.85,
        },
      });

      const bounds = new LngLatBounds();
      geometry.coordinates.forEach((c: [number, number]) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }

  function clearRoute() {
    setDest(null);
    setRouteInfo(null);
    destMarkerRef.current?.remove();
    destMarkerRef.current = null;
    const map = mapRef.current;
    if (map?.getLayer('route-line')) map.removeLayer('route-line');
    if (map?.getSource('route')) map.removeSource('route');
  }

  const badgeColors: Record<ReachBadge, string> = {
    Safe: 'bg-success/20 text-success border-success/40',
    Caution: 'bg-warning/20 text-warning border-warning/40',
    'Cannot Reach': 'bg-danger/20 text-danger border-danger/40',
  };

  return (
    <div className="relative h-[calc(100dvh-4.5rem)]">
      <div ref={mapContainer} className="absolute inset-0" />

      <div className="absolute top-3 left-3 right-3 z-10 pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-surface/90 backdrop-blur px-3 py-2 border border-elevated text-xs text-slate-300">
          <MapPin size={14} className="text-primary" />
          Tap map to set destination · Orange = DC · Sky = AC
        </div>
      </div>

      {/* Route bottom sheet */}
      {routeInfo && (
        <div className="absolute bottom-0 inset-x-0 z-20 p-3 animate-in">
          <div className="rounded-2xl bg-surface/95 backdrop-blur border border-elevated p-4 shadow-2xl max-w-lg mx-auto">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Navigation className="text-primary" size={18} />
                <h2 className="font-semibold">Route</h2>
                {routing && <span className="text-xs text-slate-400">Updating…</span>}
              </div>
              <button
                type="button"
                onClick={clearRoute}
                className="p-1 rounded-lg hover:bg-elevated text-slate-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="Distance" value={formatDistance(routeInfo.distanceMeters)} />
              <MiniStat label="Energy" value={`${routeInfo.energyKwh.toFixed(1)} kWh`} />
              <MiniStat label="Arrival SOC" value={`${routeInfo.arrivalSoc.toFixed(0)}%`} />
            </div>
            <span
              className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${badgeColors[routeInfo.badge]}`}
            >
              {routeInfo.badge}
            </span>
          </div>
        </div>
      )}

      {/* Station detail sheet */}
      {stationDetail && (
        <div className="absolute bottom-0 inset-x-0 z-20 p-3">
          <div className="rounded-2xl bg-surface/95 backdrop-blur border border-elevated p-4 shadow-2xl max-w-lg mx-auto">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="font-semibold">{stationDetail.station.name}</h2>
                <p className="text-sm text-slate-400">
                  {stationDetail.station.charger_type} · {stationDetail.station.max_power_kw} kW
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStationDetail(null)}
                className="p-1 rounded-lg hover:bg-elevated text-slate-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <MiniStat label="Distance" value={formatDistance(stationDetail.distanceMeters)} />
              <MiniStat label="Arrival SOC" value={`${stationDetail.arrivalSoc.toFixed(0)}%`} />
            </div>
            <div
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                stationDetail.recommendation === 'Stop Here'
                  ? 'bg-warning/15 text-warning'
                  : 'bg-success/15 text-success'
              }`}
            >
              Recommendation: {stationDetail.recommendation}?
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-xl bg-primary/20 text-primary py-2.5 text-sm font-medium hover:bg-primary/30 transition"
              onClick={() => {
                setDest([stationDetail.station.longitude, stationDetail.station.latitude]);
                setStationDetail(null);
              }}
            >
              Route here
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-elevated/70 px-2.5 py-2">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
