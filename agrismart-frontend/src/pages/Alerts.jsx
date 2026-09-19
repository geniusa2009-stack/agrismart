import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { Card, Badge, Spinner, EmptyState, ErrorState, timeAgo } from '../components/ui';

const FILTERS = ['all', 'critical', 'warning', 'notice', 'resolved'];

const ICONS = { critical: AlertCircle, warning: AlertTriangle, notice: Info };
const TONES = { critical: 'red', warning: 'amber', notice: 'blue' };
const ICON_COLOR_CLASS = { critical: 'text-red-500', warning: 'text-amber-500', notice: 'text-accent-500' };

export default function Alerts() {
  const { activeFarmId } = useAuth();
  const [alerts, setAlerts] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [actionError, setActionError] = useState('');

  usePolling(async () => {
    try {
      const data = await api.get(`/dashboard/farms/${activeFarmId}/alerts`);
      setAlerts(data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Could not load alerts.');
    }
  }, 5000, [activeFarmId, retryTick]);

  if (!alerts && loadError) {
    return (
      <Card title="Alerts">
        <ErrorState title="Couldn't load alerts" sub={loadError} onRetry={() => setRetryTick((t) => t + 1)} />
      </Card>
    );
  }

  if (!alerts) return <Spinner label="Loading alerts…" />;

  const filtered =
    filter === 'all' ? alerts.filter((a) => !a.acknowledged)
    : filter === 'resolved' ? alerts.filter((a) => a.acknowledged)
    : alerts.filter((a) => a.severity === filter && !a.acknowledged);

  async function toggleAck(alert) {
    setBusyId(alert.id);
    setActionError('');
    try {
      const encoded = encodeURIComponent(alert.id);
      if (alert.acknowledged) {
        await api.delete(`/dashboard/farms/${activeFarmId}/alerts/${encoded}/acknowledge`);
      } else {
        await api.post(`/dashboard/farms/${activeFarmId}/alerts/${encoded}/acknowledge`);
      }
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, acknowledged: !a.acknowledged } : a)));
    } catch (err) {
      // Leave state as-is (next poll will reconcile) but tell the user
      // the click didn't actually do anything — silently no-oping on a
      // failed acknowledge/reopen would look like a bug.
      setActionError(err.message || 'Could not update this alert. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card title="Alerts">
      {actionError && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{actionError}</div>
      )}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${
              filter === f ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="text-brand-400" size={28} />
          <EmptyState title="No alerts" sub="Everything looks good on this farm." />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((a) => {
            const Icon = ICONS[a.severity] || Info;
            return (
              <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <Icon size={18} className={`mt-0.5 ${ICON_COLOR_CLASS[a.severity] || 'text-slate-400'}`} />
                  <div>
                    <div className="text-sm font-bold text-slate-700">{a.title}</div>
                    <div className="text-xs text-slate-500">{a.message}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{timeAgo(a.at)} · {a.deviceId}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={TONES[a.severity] || 'slate'}>{a.severity}</Badge>
                  <button
                    onClick={() => toggleAck(a)}
                    disabled={busyId === a.id}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold disabled:opacity-60 ${
                      a.acknowledged ? 'border-slate-200 text-slate-500' : 'border-brand-200 text-brand-700 hover:bg-brand-50'
                    }`}
                  >
                    {busyId === a.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : a.acknowledged ? (
                      <RotateCcw size={12} />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    {a.acknowledged ? 'Reopen' : 'Resolve'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
