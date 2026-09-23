import { Languages } from 'lucide-react';
import { useLocale, LOCALES } from '../i18n/LocaleContext';

/**
 * The real language/mode switcher — section 3/4/18 of the localization
 * brief ("the user must be able to choose" between farmer-friendly
 * Egyptian Arabic, general Arabic, and English). Persisted via
 * LocaleContext (localStorage), flips document dir/lang immediately,
 * no page reload needed since every migrated page reads its strings
 * from useLocale()'s t() on every render.
 */
export default function LanguageSwitcher({ compact = false }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className={compact ? 'mb-3 rounded-xl2 border border-slate-100 bg-slate-50/60 p-2' : ''}>
      {!compact && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
          <Languages size={13} /> {t('language.switcherLabel')}
        </div>
      )}
      <div className="flex gap-1">
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={locale === code}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
              locale === code ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-white hover:text-brand-700'
            }`}
          >
            {t(`language.${code === 'ar-eg' ? 'arEg' : code}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
