import { useEffect, useState } from 'react';
import {
  Cpu, Wifi, BatteryFull, Signal, Clock, Droplet, Thermometer, FlaskConical,
  Plus, Loader2, Search, Check, X, Power, KeyRound, Ban, PlayCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { Card, Badge, Spinner, EmptyState, timeAgo } from '../components/ui';
import { MetricLineChart } from '../components/charts';

export default function Devices() {
  const { activeFarmId } = useAuth();
  const [devices, setDevices] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newSecret, setNewSecret] = useState(null);

  usePolling(async () => {
    const data = await api.get(`/dashboard/farms/${activeFarmId}/devices`);
    setDevices(data);
    setSelectedId((prev) => (prev && data.some((d) => d.deviceId === prev) ? prev : data[0]?.deviceId || null));
  }, 5000, [activeFarmId]);

  if (!devices) return <Spinner label="Loading devices…" />;

  const filtered = devices.filter(
    (d) => d.name.toLowerCase().includes(search.toLowerCase()) || d.deviceId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card
        title={`Devices (${devices.length})`}
        className="lg:col-span-1"
        padded={false}
        action={
          <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-brand-600">
            {adding ? <X size={14} /> : <Plus size={14} />} {adding ? 'Cancel' : 'Add'}
          </button>
        }
      >
        {adding && (
          <div className="border-b border-slate-50 p-4">
            <AddDeviceForm
              farmId={activeFarmId}
              onCreated={(secret) => {
                setAdding(false);
                setNewSecret(secret);
              }}
            />
          </div>
        )}
        {newSecret && <DeviceSecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />}

        {devices.length > 0 && (
          <div className="border-b border-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <Search size={14} className="text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search devices…"
                className="w-full text-xs text-slate-700 outline-none"
              />
            </div>
          </div>
        )}

        {devices.length === 0 ? (
          <div className="p-5"><EmptyState title="No devices yet" sub="Add one above, or run npm run demo." /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5"><EmptyState title="No matches" sub="Try a different search." /></div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-50">
            {filtered.map((d) => (
              <button
                key={d.deviceId}
                onClick={() => setSelectedId(d.deviceId)}
                className={`flex items-center justify-between gap-2 px-5 py-3.5 text-left transition ${
                  selectedId === d.deviceId ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${d.online ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
                    <Cpu size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">{d.name}</div>
                    <div className="text-[11px] text-slate-400">{d.deviceId}</div>
                  </div>
                </div>
                <Badge tone={d.online ? 'green' : 'slate'}>{d.online ? 'Online' : 'Offline'}</Badge>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="lg:col-span-2">
        {selectedId ? <DeviceDetail deviceId={selectedId} /> : <Card><EmptyState title="No device selected" /></Card>}
      </div>
    </div>
  );
}

function AddDeviceForm({ farmId, onCreated }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.post('/devices', { farmId, name: name || undefined });
      setName('');
      onCreated(data.deviceSecret);
    } catch (err) {
      setError(err.message || 'Could not add device.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Device name (e.g. ESP32-A002)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}
      <button
        type="submit"
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Provision Device
      </button>
    </form>
  );
}

function DeviceSecretBanner({ secret, onDismiss }) {
  return (
    <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold">Device secret (shown once)</div>
          <div className="mt-1 break-all font-mono">{secret}</div>
          <div className="mt-1 text-[11px]">Copy this now — it cannot be retrieved again. Use rotate-secret if lost.</div>
        </div>
        <button onClick={onDismiss}><X size={14} /></button>
      </div>
    </div>
  );
}

function DeviceDetail({ deviceId }) {
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('overview');
  const [history, setHistory] = useState([]);
  const [commands, setCommands] = useState([]);

  usePolling(async () => {
    const d = await api.get(`/dashboard/devices/${deviceId}`);
    setDetail(d);
  }, 5000, [deviceId]);

  useEffect(() => {
    if (tab === 'telemetry') {
      api.get(`/dashboard/devices/${deviceId}/telemetry?range=24h`).then(setHistory).catch(() => {});
    }
    if (tab === 'commands') {
      api.get(`/dashboard/devices/${deviceId}/commands`).then(setCommands).catch(() => {});
    }
  }, [tab, deviceId]);

  if (!detail) return <Spinner label="Loading device…" />;

  const { device, latestTelemetry } = detail;

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-slate-50 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-slate-800">{device.name}</h3>
            <Badge tone={device.online ? 'green' : 'slate'}>{device.online ? 'Online' : 'Offline'}</Badge>
            <Badge tone={device.status === 'active' ? 'green' : device.status === 'suspended' ? 'amber' : device.status === 'revoked' ? 'red' : 'slate'}>
              {device.status}
            </Badge>
          </div>
          <div className="text-xs text-slate-400">
            Last seen {timeAgo(device.lastSeenAt)} · {device.deviceId}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
          <div className="flex items-center gap-1"><Signal size={14} /> {device.signalStrengthDbm != null ? `${device.signalStrengthDbm} dBm` : '—'}</div>
          <div className="flex items-center gap-1"><BatteryFull size={14} /> {device.batteryPercent != null ? `${device.batteryPercent}%` : '—'}</div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-50 px-5 pt-2">
        {['overview', 'sensors', 'telemetry', 'commands', 'settings'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-bold capitalize ${
              tab === t ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <MiniStat icon={Wifi} label="Firmware" value={device.firmwareVersion || '—'} />
            <MiniStat icon={Clock} label="Status" value={device.status} />
            <MiniStat icon={Clock} label="Created" value={new Date(device.createdAt).toLocaleDateString()} />
          </div>
        )}

        {tab === 'sensors' && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <MiniStat icon={Droplet} label="Soil Moisture" value={latestTelemetry ? `${latestTelemetry.soilMoisturePercent}%` : '—'} />
            <MiniStat icon={Thermometer} label="Temperature" value={latestTelemetry ? `${latestTelemetry.temperatureCelsius}°C` : '—'} />
            <MiniStat icon={FlaskConical} label="EC / Salinity" value={latestTelemetry ? `${latestTelemetry.soilSalinityPpt} dS/m` : '—'} />
            {!latestTelemetry && <div className="col-span-full"><EmptyState title="No sensor readings yet" /></div>}
            {latestTelemetry && (
              <div className="col-span-full text-[11px] text-slate-400">Last reading {timeAgo(latestTelemetry.recordedAt)}</div>
            )}
          </div>
        )}

        {tab === 'telemetry' && (
          history.length ? (
            <TelemetryCharts history={history} />
          ) : (
            <EmptyState title="No telemetry yet" />
          )
        )}

        {tab === 'commands' && (
          commands.length ? (
            <div className="flex flex-col gap-2">
              {commands.map((c) => (
                <div key={c.commandId} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-xs">
                  <div>
                    <div className="font-bold text-slate-700">{c.type}</div>
                    <div className="text-slate-400">{timeAgo(c.createdAt)}</div>
                  </div>
                  <Badge tone={c.status === 'completed' ? 'green' : c.status === 'failed' ? 'red' : 'blue'}>{c.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No commands yet" />
          )
        )}

        {tab === 'settings' && <DeviceSettings device={device} />}
      </div>
    </Card>
  );
}

function TelemetryCharts({ history }) {
  return (
    <div className="flex flex-col gap-4">
      <MetricLineChart data={history} dataKey="soilMoisturePercent" unit="%" color="#178a58" domain={[0, 100]} />
      <MetricLineChart data={history} dataKey="temperatureCelsius" unit="°C" color="#f97316" />
      <MetricLineChart data={history} dataKey="soilSalinityPpt" unit=" dS/m" color="#0ea5e9" />
    </div>
  );
}

function DeviceSettings({ device }) {
  const [name, setName] = useState(device.name);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState(null);

  async function run(action, fn) {
    setError('');
    setBusy(action);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Rename</div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button
            onClick={() => run('rename', () => api.patch(`/devices/${device.deviceId}`, { name }))}
            disabled={busy === 'rename'}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy === 'rename' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}
      {secret && <DeviceSecretBanner secret={secret} onDismiss={() => setSecret(null)} />}

      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Lifecycle Actions</div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            icon={PlayCircle}
            label="Activate"
            busy={busy === 'activate'}
            onClick={() => run('activate', () => api.post(`/devices/${device.deviceId}/activate`, {}))}
          />
          <ActionButton
            icon={Ban}
            label="Suspend"
            busy={busy === 'suspend'}
            onClick={() => run('suspend', () => api.post(`/devices/${device.deviceId}/suspend`, {}))}
          />
          <ActionButton
            icon={KeyRound}
            label="Rotate Secret"
            busy={busy === 'rotate'}
            onClick={() =>
              run('rotate', async () => {
                const data = await api.post(`/devices/${device.deviceId}/rotate-secret`, {});
                setSecret(data.deviceSecret);
              })
            }
          />
          <ActionButton
            icon={Power}
            label="Revoke"
            danger
            busy={busy === 'revoke'}
            onClick={() => run('revoke', () => api.post(`/devices/${device.deviceId}/revoke`, {}))}
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, busy, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60 ${
        danger ? 'border-red-100 text-red-600 hover:bg-red-50' : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700'
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} {label}
    </button>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
        <Icon size={13} /> {label}
      </div>
      <div className="mt-1 text-sm font-extrabold text-slate-800">{value}</div>
    </div>
  );
}
