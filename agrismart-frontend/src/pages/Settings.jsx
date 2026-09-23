import { useState } from 'react';
import { LogOut, Mail, User, Loader2, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui';
import { useLocale } from '../i18n/LocaleContext';
import { translateApiError } from '../i18n/errorMessages';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function Settings() {
  const { user, logout, updateProfile } = useAuth();
  const { t } = useLocale();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      await updateProfile({ fullName });
      setSaved(true);
    } catch (err) {
      setError(translateApiError(err, t) || t('settings.saveError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title={t('settings.language')} subtitle={t('settings.languageSub')}>
        <LanguageSwitcher />
      </Card>

      <Card title={t('settings.account')}>
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
          <Mail size={16} className="text-slate-400" /> {user?.email || t('settings.signedIn')}
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-slate-500">
            {t('settings.fullName')}
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <User size={14} className="text-slate-400" />
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full text-sm text-slate-800 outline-none"
              />
            </div>
          </label>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {t('settings.save')}
          </button>
          {saved && <div className="text-xs font-semibold text-brand-600">{t('settings.saved')}</div>}
        </form>

        <button
          onClick={logout}
          className="mt-5 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100"
        >
          <LogOut size={16} /> {t('settings.signOut')}
        </button>
      </Card>
      <Card title={t('settings.aboutMvp')}>
        <p className="text-xs leading-relaxed text-slate-500">
          {t('settings.aboutMvpBody')}
        </p>
      </Card>
    </div>
  );
}
