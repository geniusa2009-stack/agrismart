import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Card, Spinner, EmptyState, ErrorState } from '../components/ui';
import { MoistureAreaChart, MetricLineChart } from '../components/charts';

const RANGES = [
  { key: 'live', label: 'Live' },
  { key: '24h', label: '24 Hours' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
];

export default function Analytics() {
  const { activeFarmId } = useAuth();
  const [devices, setDevices] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [range, setRange] = useState('24h');
  const [history, setHistory] = useState(null);
  const [devicesError, setDevicesError] = useState('');
  const [devicesRetryTick, setDevicesRetryTick] = useState(0);
  const [historyError, setHistoryError] = useState('');
  const [historyRetryTick, setHistoryRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDevicesError('');
    api.get(`/dashboard/farms/${activeFarmId}/devices`)
      .then((data) => {
        if (cancelled) return;
        setDevices(data);
        setDeviceId((prev) => prev || data[0]?.deviceId || null);
      })
      .catch((err) => {
        if (!cancelled) setDevicesError(err.message || 'Could not load devices.');
      });
    return () => {
      cancelled = true;
    };
  }, [activeFarmId, devicesRetryTick]);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    setHistory(null);
    setHistoryError('');
    api.get(`/dashboard/devices/${deviceId}/telemetry?range=${range}`)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(err.message || 'Could not load telemetry.');
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, range, historyRetryTick]);

  if (!devices && devicesError) {
    return (
      <Card title="Telemetry Analytics">
        <ErrorState title="Couldn't load devices" sub={devicesError} onRetry={() => setDevicesRetryTick((t) => t + 1)} />
      </Card>
    );
  }

  if (!devices) return <Spinner label="Loading analytics…" />;
  if (devices.length === 0) return <EmptyState title="No devices yet" />;

  return (
    <Card
      title="Telemetry Analytics"
      action={
        <select
          value={deviceId || ''}
          onChange={(e) => setDeviceId(e.target.value)}
          aria-label="Select device"
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.name}</option>
          ))}
        </select>
      }
    >
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
              range === r.key ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {historyError ? (
        <ErrorState title="Couldn't load telemetry" sub={historyError} onRetry={() => setHistoryRetryTick((t) => t + 1)} />
      ) : !history ? (
        <Spinner label="Loading readings…" />
      ) : history.length === 0 ? (
        <EmptyState title="No telemetry in this range" sub="Run npm run demo to generate simulated readings." />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Soil Moisture (%)</div>
            <MoistureAreaChart data={history} height={200} />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Temperature (°C)</div>
              <MetricLineChart data={history} dataKey="temperatureCelsius" unit="°C" color="#f97316" />
            </div>
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">EC / Salinity (dS/m)</div>
              <MetricLineChart data={history} dataKey="soilSalinityPpt" unit=" dS/m" color="#17ada6" />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
