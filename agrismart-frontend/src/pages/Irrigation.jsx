import { useState } from 'react';
import { Droplet, Power, Loader2, ShieldAlert, Settings2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { Card, Badge, ProgressBar, Spinner, EmptyState } from '../components/ui';

const DURATIONS = [
  { label: '30 sec', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
];

export default function Irrigation() {
  const { activeFarmId } = useAuth();
  const [valves, setValves] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [duration, setDuration] = useState(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emergencyBusy, setEmergencyBusy] = useState(false);

  usePolling(async () => {
    const data = await api.get(`/dashboard/farms/${activeFarmId}/valves`);
    setValves(data);
    setSelectedId((prev) => (prev && data.some((v) => v.valveId === prev) ? prev : data[0]?.valveId || null));
  }, 4000, [activeFarmId]);

  if (!valves) return <Spinner label="Loading irrigation…" />;
  if (valves.length === 0) return <EmptyState title="No valves yet" sub="Add a device on the Devices page, then run npm run demo to provision a demo valve." />;

  const valve = valves.find((v) => v.valveId === selectedId) || valves[0];
  const isOpen = valve.commandedState === 'open';

  async function openValve() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/irrigation/valves/${valve.valveId}/open`, { requestedDurationSeconds: duration });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function closeValve() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/irrigation/valves/${valve.valveId}/close`, {});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function emergencyStop() {
    setEmergencyBusy(true);
    setError('');
    try {
      await api.post(`/irrigation/farms/${activeFarmId}/emergency-stop`, {});
    } catch (err) {
      setError(err.message);
    } finally {
      setEmergencyBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={emergencyStop}
          disabled={emergencyBusy}
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 shadow-card hover:bg-red-100 disabled:opacity-60"
        >
          {emergencyBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
          Emergency Stop All Valves
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Valves" className="lg:col-span-1" padded={false}>
          <div className="flex flex-col divide-y divide-slate-50">
            {valves.map((v) => (
              <button
                key={v.valveId}
                onClick={() => setSelectedId(v.valveId)}
                className={`flex items-center justify-between px-5 py-3.5 text-left ${selectedId === v.valveId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
              >
                <div className="text-sm font-bold text-slate-800">{v.name}</div>
                <div className="flex items-center gap-1.5">
                  {v.automationEnabled && <Badge tone="blue">Auto</Badge>}
                  <Badge tone={v.commandedState === 'open' ? 'green' : 'slate'}>{v.commandedState}</Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Irrigation Control" className="lg:col-span-2">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-base font-extrabold text-slate-800">
                  <Droplet className="text-sky-500" size={18} /> {valve.name}
                </div>
                <Badge tone={isOpen ? 'green' : 'slate'}>{isOpen ? 'Active' : 'Idle'}</Badge>
              </div>
              <div className="flex flex-col items-center">
                <div className={`flex h-16 w-16 items-center justify-center rounded-full border-4 ${isOpen ? 'border-brand-500 text-brand-600' : 'border-slate-200 text-slate-400'}`}>
                  <Droplet size={24} fill={isOpen ? 'currentColor' : 'none'} />
                </div>
                <div className="mt-1 text-xs font-bold uppercase">{isOpen ? 'Open' : 'Closed'}</div>
              </div>
            </div>

            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}

            <IrrigationModeToggle key={valve.valveId} valve={valve} />

            {!valve.automationEnabled && (
              <>
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Irrigation Duration</div>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d.seconds}
                        onClick={() => setDuration(d.seconds)}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                          duration === d.seconds ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:border-brand-300'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={isOpen ? closeValve : openValve}
                  disabled={busy}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-card disabled:opacity-60 ${
                    isOpen ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-600 hover:bg-brand-700'
                  }`}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                  {isOpen ? 'Stop Irrigation' : 'Start Irrigation'}
                </button>
              </>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Today&apos;s Usage</span>
                <span>{valve.todayUsageSeconds}s / {valve.dailyAllowanceSeconds}s</span>
              </div>
              <ProgressBar value={valve.todayUsageSeconds} max={valve.dailyAllowanceSeconds} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function IrrigationModeToggle({ valve }) {
  const [mode, setMode] = useState(valve.automationEnabled ? 'automatic' : 'manual');
  const [settings, setSettings] = useState({
    autoOpenBelowPercent: valve.autoOpenBelowPercent,
    autoCloseAbovePercent: valve.autoCloseAbovePercent,
    autoDurationSeconds: valve.autoDurationSeconds,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function setMode_(next) {
    setMode(next);
    setError('');
    setBusy(true);
    try {
      await api.patch(`/irrigation/valves/${valve.valveId}/automation`, { automationEnabled: next === 'automatic' });
    } catch (err) {
      setError(err.message);
      setMode(next === 'automatic' ? 'manual' : 'automatic');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    setSaved(false);
    try {
      await api.patch(`/irrigation/valves/${valve.valveId}/automation`, settings);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        <Settings2 size={13} /> Irrigation Mode
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setMode_('manual')}
          disabled={busy}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${mode === 'manual' ? 'bg-brand-600 text-white' : 'border border-slate-200 text-slate-500'}`}
        >
          Manual
        </button>
        <button
          onClick={() => setMode_('automatic')}
          disabled={busy}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${mode === 'automatic' ? 'bg-brand-600 text-white' : 'border border-slate-200 text-slate-500'}`}
        >
          Automatic
        </button>
      </div>

      {error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}

      {mode === 'automatic' && (
        <form onSubmit={saveSettings} className="mt-3 flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
          <div className="text-xs font-bold text-slate-600">Automation Settings</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-[11px] font-semibold text-slate-500">
              Open below (%)
              <input
                type="number" min="0" max="100"
                value={settings.autoOpenBelowPercent}
                onChange={(e) => setSettings((s) => ({ ...s, autoOpenBelowPercent: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              Close above (%)
              <input
                type="number" min="0" max="100"
                value={settings.autoCloseAbovePercent}
                onChange={(e) => setSettings((s) => ({ ...s, autoCloseAbovePercent: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              Duration (sec)
              <input
                type="number" min="1"
                value={settings.autoDurationSeconds}
                onChange={(e) => setSettings((s) => ({ ...s, autoDurationSeconds: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />} Save Settings
          </button>
          {saved && <div className="text-[11px] font-semibold text-brand-600">Saved.</div>}
          <p className="text-[11px] text-slate-400">
            When automatic, AgriSmart opens this valve when soil moisture drops below the threshold and closes it once
            it recovers — applied to real telemetry as it arrives.
          </p>
        </form>
      )}
    </div>
  );
}
