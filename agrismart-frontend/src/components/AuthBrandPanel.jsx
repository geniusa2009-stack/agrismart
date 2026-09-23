import { Activity, Droplets } from 'lucide-react';
import { useLocale } from '../i18n/LocaleContext';

// Official AgriSmart logo asset — used as-is, not recreated. See
// BRAND.md for the token/asset documentation.
const LOGO_SRC = '/agrismart-logo.png';

/**
 * Shared left-side brand panel for the Login and Register screens.
 * Desktop/tablet only (hidden below `lg`, where both screens fall back
 * to a single centered column with the logo shown inline instead).
 */
export default function AuthBrandPanel() {
  const { t } = useLocale();
  return (
    <div className="relative hidden w-[45%] shrink-0 overflow-hidden bg-brand-950 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
      {/* Restrained abstract field/data-grid visual — CSS only, no stock imagery */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #17ada6 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #22a86d 0%, transparent 70%)' }}
      />

      <div className="relative animate-[fadeSlideIn_0.6s_ease-out]">
        <img src={LOGO_SRC} alt="AgriSmart" className="h-14 w-auto object-contain" />
      </div>

      <div className="relative animate-[fadeSlideIn_0.7s_ease-out_0.1s_both]">
        <h1 className="max-w-sm text-[28px] font-extrabold leading-tight text-white">
          {t('auth.tagline')}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-brand-200">
          {t('auth.taglineSub')}
        </p>

        <div className="mt-8 flex items-center gap-6 text-brand-300">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Activity size={16} className="text-accent-400" /> {t('auth.featureTelemetry')}
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Droplets size={16} className="text-accent-400" /> {t('auth.featureIrrigation')}
          </div>
        </div>
      </div>

      <div className="relative text-[11px] font-medium text-brand-400">
        &copy; {new Date().getFullYear()} {t('auth.copyright')}
      </div>
    </div>
  );
}

export { LOGO_SRC };
