import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../../components/Card';
import { LEAPMOTOR_B10 } from '../../config/vehicle';
import {
  computeDrivingBehavior,
  type DrivingBehaviorScore,
} from '../../lib/algorithms/drivingBehavior';
import { predictChargingTime } from '../../lib/algorithms/charging';
import { db, type TripPoint } from '../../lib/db/database';

const PIE_COLORS = ['#22D3EE', '#A78BFA', '#FBBF24'];

export function AnalysisPage() {
  const trips = useLiveQuery(() =>
    db.trips
      .filter((t) => t.end_time != null)
      .toArray()
      .then((rows) =>
        rows.sort(
          (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
        ),
      ),
  ) ?? [];

  const sessions = useLiveQuery(() =>
    db.charging_sessions.filter((s) => s.end_time != null).toArray(),
  ) ?? [];

  const [behavior, setBehavior] = useState<DrivingBehaviorScore>({
    label: 'Normal',
    hardEventRatio: 0,
    hardEvents: 0,
    totalSamples: 0,
  });

  useEffect(() => {
    async function run() {
      const latest = trips[0];
      if (!latest) return;
      const points: TripPoint[] = await db.trip_points
        .where('trip_id')
        .equals(latest.id)
        .toArray();
      setBehavior(computeDrivingBehavior(points, latest.avg_consumption_kwh_per_100km));
    }
    void run();
  }, [trips]);

  const last10 = trips.slice(0, 10).reverse();
  const consumptionData = last10.map((t, i) => ({
    name: `T${i + 1}`,
    consumption: Number((t.avg_consumption_kwh_per_100km ?? 0).toFixed(2)),
  }));

  const energyTotals = trips.reduce(
    (acc, t) => ({
      driving: acc.driving + t.energy_driving_kwh,
      hvac: acc.hvac + t.energy_hvac_kwh,
      other: acc.other + t.energy_other_kwh,
    }),
    { driving: 0, hvac: 0, other: 0 },
  );
  const pieData = [
    { name: 'Driving', value: Number(energyTotals.driving.toFixed(2)) },
    { name: 'HVAC', value: Number(energyTotals.hvac.toFixed(2)) },
    { name: 'Other', value: Number(energyTotals.other.toFixed(2)) },
  ].filter((d) => d.value > 0);

  const chargingEfficiency = sessions.slice(0, 8).map((s, i) => {
    const pred = predictChargingTime(
      s.start_soc,
      s.end_soc ?? s.start_soc,
      s.max_power_kw,
      s.charger_type,
      LEAPMOTOR_B10.usableCapacityKwh,
    );
    return {
      name: `S${i + 1}`,
      actual: Number((s.avg_power_kw ?? 0).toFixed(2)),
      predicted: Number(pred.predictedAvgPowerKw.toFixed(2)),
    };
  });

  const rangeAnxiety = last10.map((t, i) => ({
    name: `T${i + 1}`,
    arrivalSoc: t.end_soc_percent ?? 0,
  }));

  const labelColor =
    behavior.label === 'Aggressive'
      ? 'text-danger'
      : behavior.label === 'Efficient'
        ? 'text-success'
        : 'text-primary';

  return (
    <div className="px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <header>
        <p className="text-xs uppercase tracking-widest text-secondary/80">Insights</p>
        <h1 className="text-2xl font-semibold">Analysis</h1>
      </header>

      <Card>
        <h2 className="text-sm font-medium mb-3">Avg consumption (last 10 trips)</h2>
        {consumptionData.length === 0 ? (
          <Empty />
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={consumptionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2630" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="consumption"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  name="kWh/100km"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-medium mb-3">Energy mix</h2>
        {pieData.length === 0 ? (
          <Empty />
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex justify-center gap-4 text-xs mt-1">
          {pieData.map((d, i) => (
            <span key={d.name} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: PIE_COLORS[i] }}
              />
              {d.name}
            </span>
          ))}
        </div>
      </Card>

      <Card gradient>
        <h2 className="text-sm font-medium mb-2">Driving Behavior Score</h2>
        <p className={`text-3xl font-bold ${labelColor}`}>{behavior.label}</p>
        <p className="text-xs text-slate-400 mt-2">
          Hard events: {behavior.hardEvents}/{behavior.totalSamples} (
          {(behavior.hardEventRatio * 100).toFixed(0)}%)
        </p>
        <p className="text-[11px] text-slate-500 mt-1">
          Aggressive if &gt;30% hard events · Efficient if consumption &lt;{' '}
          {LEAPMOTOR_B10.wltpConsumptionKwhPer100km}
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-medium mb-3">Charging efficiency (actual vs predicted kW)</h2>
        {chargingEfficiency.length === 0 ? (
          <Empty />
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chargingEfficiency}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2630" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="actual" fill="#22D3EE" name="Actual" radius={[4, 4, 0, 0]} />
                <Bar dataKey="predicted" fill="#A78BFA" name="Predicted" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-medium mb-3">Range anxiety (arrival SOC)</h2>
        {rangeAnxiety.length === 0 ? (
          <Empty />
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rangeAnxiety}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2630" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="arrivalSoc"
                  stroke="#FBBF24"
                  strokeWidth={2}
                  name="Arrival SOC %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

const tooltipStyle = {
  background: '#151B23',
  border: '1px solid #1E2630',
  borderRadius: 8,
};

function Empty() {
  return <p className="text-sm text-slate-500 py-6 text-center">Not enough data yet.</p>;
}
