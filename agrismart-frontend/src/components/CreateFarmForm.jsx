import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { translateApiError } from '../i18n/errorMessages';

export default function CreateFarmForm({ onCreated }) {
  const { t } = useLocale();
  const { createFarm } = useAuth();
  const [name, setName] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [village, setVillage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const location = governorate || village ? { governorate: governorate || undefined, village: village || undefined } : undefined;
      const farm = await createFarm({ name, location });
      setName('');
      setGovernorate('');
      setVillage('');
      onCreated?.(farm);
    } catch (err) {
      setError(translateApiError(err, t) || t('farm.createFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-xs font-semibold text-slate-500">
        {t('farm.farmName')}
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('farm.farmNamePlaceholder')}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-slate-500">
          {t('farm.governorate')}
          <input
            value={governorate}
            onChange={(e) => setGovernorate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          {t('farm.village')}
          <input
            value={village}
            onChange={(e) => setVillage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}
      <button
        type="submit"
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        {t('farm.createFarm')}
      </button>
    </form>
  );
}
