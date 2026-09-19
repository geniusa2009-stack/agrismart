import { useState } from 'react';
import { Sprout, Cpu, Droplets, Pencil, Trash2, Plus, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { Card, Spinner } from '../components/ui';
import CreateFarmForm from '../components/CreateFarmForm';

export default function Farm() {
  const { activeFarm, activeFarmId, updateFarm, deleteFarm } = useAuth();
  const [summary, setSummary] = useState(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  usePolling(async () => {
    const data = await api.get(`/dashboard/farms/${activeFarmId}/summary`);
    setSummary(data);
  }, 6000, [activeFarmId]);

  if (!summary) return <Spinner label="Loading farm…" />;

  async function handleDelete() {
    setError('');
    setDeleting(true);
    try {
      await deleteFarm(activeFarmId);
    } catch (err) {
      setError(err.message || 'Could not delete farm.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {editing ? (
          <EditFarmForm
            farm={activeFarm}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
            updateFarm={updateFarm}
          />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Sprout size={22} />
              </div>
              <div>
                <div className="text-lg font-extrabold text-slate-800">{activeFarm?.name}</div>
                <div className="text-xs text-slate-400">
                  {activeFarm?.location?.village || activeFarm?.location?.governorate
                    ? `${activeFarm.location.village || ''}${activeFarm.location.village && activeFarm.location.governorate ? ', ' : ''}${activeFarm.location.governorate || ''}`
                    : 'Location not set'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-brand-300 hover:text-brand-700"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-lg border border-red-100 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            </div>
          </div>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Devices">
          <div className="flex items-center gap-2 text-2xl font-extrabold text-slate-800">
            <Cpu size={20} className="text-brand-600" /> {summary.deviceCounts.total}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {summary.deviceCounts.online} online · {summary.deviceCounts.offline} offline · {summary.deviceCounts.maintenance} maintenance
          </div>
        </Card>
        <Card title="Valves">
          <div className="flex items-center gap-2 text-2xl font-extrabold text-slate-800">
            <Droplets size={20} className="text-accent-500" /> {summary.valves.length}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {summary.valves.filter((v) => v.commandedState === 'open').length} currently open
          </div>
        </Card>
      </div>

      <Card
        title="Your Farms"
        action={
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-brand-600"
          >
            {adding ? <X size={14} /> : <Plus size={14} />} {adding ? 'Cancel' : 'Add Farm'}
          </button>
        }
      >
        {adding && (
          <div className="mb-4 border-b border-slate-50 pb-4">
            <CreateFarmForm onCreated={() => setAdding(false)} />
          </div>
        )}
        <p className="text-xs text-slate-400">
          Switch between your farms using the selector in the sidebar.
        </p>
      </Card>
    </div>
  );
}

function EditFarmForm({ farm, onCancel, onSaved, updateFarm }) {
  const [name, setName] = useState(farm?.name || '');
  const [governorate, setGovernorate] = useState(farm?.location?.governorate || '');
  const [village, setVillage] = useState(farm?.location?.village || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await updateFarm(farm._id, {
        name,
        location: governorate || village ? { governorate: governorate || undefined, village: village || undefined } : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not update farm.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-xs font-semibold text-slate-500">
        Farm name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-slate-500">
          Governorate
          <input
            value={governorate}
            onChange={(e) => setGovernorate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Village
          <input
            value={village}
            onChange={(e) => setVillage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} Save
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-500">
          Cancel
        </button>
      </div>
    </form>
  );
}
