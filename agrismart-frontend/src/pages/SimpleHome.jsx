import { Link } from 'react-router-dom';
import { Wifi, WifiOff, ArrowRight, ArrowLeft, Droplet, CircleCheck, CircleAlert, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFarmSnapshot } from '../hooks';
import { EmptyState } from '../components/ui';
import { useLocale } from '../i18n/LocaleContext';

// Matches AiInsightCard.jsx / Dashboard.jsx's own low-moisture rule —
// used ONLY as a fallback ring color when no AI verdict is available
// yet, never as a substitute verdict.
const DEFAULT_LOW_MOISTURE_THRESHOLD = 30;

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'dashboard.goodMorning';
  if (h < 18) return 'dashboard.goodAfternoon';
  return 'dashboard.goodEvening';
}

/**
 * Turns the real /ai/recommendations/:valveId payload (same object
 * AiInsightCard.jsx renders — never re-derived independently) into
 * one of exactly four honest, farmer-facing verdict states. No
 * probability/confidence number is shown here — that's what Advanced
 * Mode's technical-mode toggle is for; Simple Mode only ever answers
 * the one question a farmer actually asked: "does it need water?"
 */
function resolveVerdict(aiInsight) {
  if (!aiInsight) return 'loading';
  if (!aiInsight.available) return 'collecting';
  if (aiInsight.recommendation === 'insufficient_data') return 'collecting';
  if (aiInsight.recommendation === 'recommend_irrigation') return 'needsWater';
  if (aiInsight.recommendation === 'monitor') return 'monitor';
  return 'fine';
}

const VERDICT_STYLE = {
  loading: { ring: 'stroke-slate-200', badge: 'bg-slate-100 text-slate-500', Icon: Loader2 },
  collecting: { ring: 'stroke-slate-300', badge: 'bg-slate-100 text-slate-600', Icon: CircleAlert },
  needsWater: { ring: 'stroke-amber-500', badge: 'bg-amber-50 text-amber-700', Icon: CircleAlert },
  monitor: { ring: 'stroke-brand-400', badge: 'bg-brand-50 text-brand-700', Icon: CircleCheck },
  fine: { ring: 'stroke-brand-500', badge: 'bg-brand-50 text-brand-700', Icon: CircleCheck },
};

/** Big, centered circular gauge — the one number a farmer glances at.
 * Pure SVG, no charting library: this needs to render instantly and
 * read clearly at a glance, not offer hover/zoom interactivity. */
function MoistureRing({ moisture, ringClassName }) {
  const size = 208;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = moisture == null ? 0 : Math.max(0, Math.min(100, moisture));
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-slate-100" fill="none" />
        {moisture != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            className={`transition-all duration-700 ease-out ${ringClassName}`}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center">
        {moisture != null ? (
          <>
            <span className="text-5xl font-extrabold tabular-nums text-slate-800">{Math.round(moisture)}</span>
            <span className="text-lg font-bold text-slate-400">%</span>
          </>
        ) : (
          <Droplet size={40} className="text-slate-300" />
        )}
      </div>
    </div>
  );
}

export default function SimpleHome() {
  const { activeFarm, activeFarmId } = useAuth();
  const { t, isRtl, formatRelativeTime: timeAgoT } = useLocale();
  const { summary, aiInsight, error } = useFarmSnapshot(activeFarmId);

  const BackChevron = isRtl ? ArrowLeft : ArrowRight;

  if (!activeFarmId) {
    return <EmptyState title={t('simpleMode.noFarmYet')} sub={t('simpleMode.noFarmYetDetail')} />;
  }
  if (error) {
    return <EmptyState title={t('dashboard.couldNotLoad')} sub={error} />;
  }

  const primaryDevice = summary?.devices?.[0] || null;
  const latest = primaryDevice ? summary?.latestTelemetryByDevice?.[primaryDevice.deviceId] : null;
  const moisture = latest?.soilMoisturePercent ?? null;

  const verdictKey = resolveVerdict(aiInsight);
  const style = VERDICT_STYLE[verdictKey];
  const VerdictIcon = style.Icon;
  const ringClassName = verdictKey === 'loading' || verdictKey === 'collecting'
    ? (moisture != null && moisture < DEFAULT_LOW_MOISTURE_THRESHOLD ? 'stroke-amber-400' : 'stroke-brand-400')
    : style.ring;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-500">{t(greetingKey())}</div>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-900">
            {activeFarm?.name || t('dashboard.yourFarm')}
          </h1>
        </div>
        <Link
          to="/"
          className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-card transition-shadow hover:shadow-cardHover"
        >
          {t('simpleMode.switchToAdvanced')}
          <BackChevron size={13} />
        </Link>
      </div>

      {/* Moisture ring */}
      <div className="flex flex-col items-center gap-2 rounded-xl2 border border-slate-100 bg-white py-8 shadow-card">
        <MoistureRing moisture={moisture} ringClassName={ringClassName} />
        <div className="mt-1 text-sm font-bold text-slate-600">{t('simpleMode.soilMoistureLabel')}</div>
        <div className="text-xs text-slate-400">
          {moisture != null ? t('simpleMode.lastUpdated', { time: timeAgoT(latest?.recordedAt) }) : t('simpleMode.noReadingYet')}
        </div>
      </div>

      {/* Verdict */}
      <div className="flex items-start gap-3 rounded-xl2 border border-slate-100 bg-white p-5 shadow-decision">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.badge}`}>
          <VerdictIcon size={22} className={verdictKey === 'loading' ? 'animate-spin' : ''} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-extrabold leading-snug text-slate-800">
            {t(`simpleMode.verdict.${verdictKey}`)}
          </div>
          {verdictKey !== 'loading' && (
            <div className="mt-1 text-sm text-slate-500">{t(`simpleMode.verdict.${verdictKey}Detail`)}</div>
          )}
        </div>
      </div>

      {/* Device connectivity */}
      {primaryDevice && (
        <div className="flex items-center gap-2.5 rounded-xl2 border border-slate-100 bg-white px-4 py-3 shadow-card">
          {primaryDevice.online ? (
            <Wifi size={18} className="shrink-0 text-brand-500" />
          ) : (
            <WifiOff size={18} className="shrink-0 text-amber-500" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-700">
              {primaryDevice.online ? t('simpleMode.deviceConnected') : t('simpleMode.deviceOffline')}
            </div>
            {!primaryDevice.online && (
              <div className="text-xs text-slate-400">{t('simpleMode.deviceOfflineDetail')}</div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Link
          to="/irrigation"
          className="flex items-center justify-center gap-2.5 rounded-xl2 bg-accent-600 px-5 py-4 text-base font-extrabold text-white shadow-decision transition-transform hover:scale-[1.02] hover:bg-accent-700 active:scale-[0.98]"
        >
          <Droplet size={20} />
          {t('simpleMode.irrigateNow')}
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('agrismart:open-chat'))}
          className="flex items-center justify-center gap-2.5 rounded-xl2 border-2 border-brand-100 bg-brand-50/60 px-5 py-4 text-base font-extrabold text-brand-800 transition-colors hover:bg-brand-50"
        >
          <img src="/agrismart-mark.png" alt="" className="h-6 w-6 object-contain" />
          {t('simpleMode.askAgriSmart')}
        </button>
      </div>
    </div>
  );
}
