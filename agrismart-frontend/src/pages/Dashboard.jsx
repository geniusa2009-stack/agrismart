import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Droplet, Thermometer, FlaskConical, Waves, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { Card, StatCard, Badge, Spinner, EmptyState, timeAgo } from '../components/ui';
import { MoistureAreaChart, DevicesDonut } from '../components/charts';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { activeFarm, activeFarmId, user } = useAuth();
  const displayName = user?.email ? user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'there';
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');

  usePolling(async () => {
    try {
      const data = await api.get(`/dashboard/farms/${activeFarmId}/summary`);
      setSummary(data);
      setError('');

      const primaryDeviceId = data.devices[0]?.deviceId;
      if (primaryDeviceId) {
        const h = await api.get(`/dashboard/devices/${primaryDeviceId}/telemetry?range=24h`);
        setHistory(h);
      }
    } catch (err) {
      setError(err.message);
    }
  }, 5000, [activeFarmId]);

  if (error) return <EmptyState title="Could not load dashboard" sub={error} />;
  if (!summary) return <Spinner label="Loading your farm…" />;

  const primaryDevice = summary.devices[0];
  const latest = primaryDevice ? summary.latestTelemetryByDevice[primaryDevice.deviceId] : null;
  const primaryValve = summary.valves[0];
  const unresolvedAlerts = summary.alerts.filter((a) => !a.acknowledged);
  const criticalAlerts = unresolvedAlerts.filter((a) => a.severity === 'critical').length;
  const allOperational = criticalAlerts === 0 && summary.deviceCounts.offline === 0;

  const moisture = latest?.soilMoisturePercent;
  const temperature = latest?.temperatureCelsius;
  const ec = latest?.soilSalinityPpt;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">
            {greeting()}, {displayName}! 👋
          </h1>
          <p className="text-sm text-slate-500">Here&apos;s what&apos;s happening on {activeFarm?.name || 'your farm'} today.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl2 border border-slate-100 bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-card">
            {activeFarm?.location?.village || activeFarm?.location?.governorate
              ? `${activeFarm.location.village || ''}${activeFarm.location.village && activeFarm.location.governorate ? ', ' : ''}${activeFarm.location.governorate || ''}`
              : 'Location not set'}
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-xl2 border px-4 py-2 text-xs font-bold shadow-card ${
              allOperational ? 'border-brand-100 bg-brand-50 text-brand-700' : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}
          >
            {allOperational ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {allOperational ? 'All Systems Operational' : `${criticalAlerts + summary.deviceCounts.offline} Issue(s)`}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Droplet}
          label="Soil Moisture"
          value={moisture != null ? `${moisture}%` : '—'}
          sub={moisture == null ? 'No data yet' : moisture < 30 ? 'Low' : moisture > 85 ? 'High' : 'Moderate'}
          subTone={moisture != null && (moisture < 30 || moisture > 85) ? 'amber' : 'slate'}
        />
        <StatCard
          icon={Thermometer}
          label="Temperature"
          value={temperature != null ? `${temperature}°C` : '—'}
          sub={temperature != null && temperature > 35 ? 'High' : 'Normal'}
          subTone={temperature != null && temperature > 35 ? 'amber' : 'green'}
        />
        <StatCard
          icon={FlaskConical}
          label="EC / Salinity"
          value={ec != null ? `${ec} dS/m` : '—'}
          sub="Normal"
          subTone="green"
        />
        <StatCard
          icon={Waves}
          label="Irrigation Status"
          value={primaryValve?.commandedState === 'open' ? 'ON' : 'OFF'}
          sub={primaryValve?.commandedState === 'open' ? 'Running' : 'Idle'}
          subTone={primaryValve?.commandedState === 'open' ? 'green' : 'slate'}
        />
      </div>

      {/* Chart + donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Soil Moisture (Last 24 Hours)" className="lg:col-span-2">
          {history.length ? <MoistureAreaChart data={history} /> : <EmptyState title="No telemetry yet" sub="Run npm run demo to start simulated readings." />}
        </Card>
        <Card
          title="Devices Overview"
          action={
            <Link to="/devices" className="flex items-center gap-1 text-xs font-semibold text-brand-600">
              View All <ArrowRight size={12} />
            </Link>
          }
        >
          <div className="flex items-center justify-around">
            <DevicesDonut online={summary.deviceCounts.online} offline={summary.deviceCounts.offline} maintenance={summary.deviceCounts.maintenance} />
            <div className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Online <span className="text-slate-800">{summary.deviceCounts.online}</span></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Offline <span className="text-slate-800">{summary.deviceCounts.offline}</span></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Maintenance <span className="text-slate-800">{summary.deviceCounts.maintenance}</span></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Active irrigation + alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Active Irrigation">
          {primaryValve?.commandedState === 'open' ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <Droplet className="text-sky-500" size={16} /> {primaryValve.name}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Commanded open{primaryValve.lastOpenedAt ? ` · ${timeAgo(primaryValve.lastOpenedAt)}` : ''}
                </div>
              </div>
              <Badge tone="green">Running</Badge>
            </div>
          ) : (
            <EmptyState title="No active irrigation" sub="The valve is currently closed." />
          )}
        </Card>

        <Card
          title="Recent Alerts"
          action={
            <Link to="/alerts" className="flex items-center gap-1 text-xs font-semibold text-brand-600">
              View All <ArrowRight size={12} />
            </Link>
          }
        >
          {unresolvedAlerts.length === 0 ? (
            <EmptyState title="No alerts" sub="Everything looks good." />
          ) : (
            <div className="flex flex-col gap-2">
              {unresolvedAlerts.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className={a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'} />
                    <div>
                      <div className="text-xs font-bold text-slate-700">{a.title}</div>
                      <div className="text-[11px] text-slate-400">{a.message}</div>
                    </div>
                  </div>
                  <Badge tone={a.severity === 'critical' ? 'red' : 'amber'}>{a.severity}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <SystemFlow />
    </div>
  );
}

function SystemFlow() {
  const steps = ['Sensor', 'ESP32 Device', 'Cloud Backend', 'AI / Logic', 'Valve'];
  return (
    <Card title="How AgriSmart Works">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">{step}</div>
            {i < steps.length - 1 && <ArrowRight size={14} className="text-brand-300" />}
          </div>
        ))}
      </div>
    </Card>
  );
}
