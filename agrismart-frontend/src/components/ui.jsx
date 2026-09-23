import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';

export function Card({ title, subtitle, action, className = '', children, padded = true }) {
  return (
    <div className={`rounded-xl2 border border-slate-100 bg-white shadow-card transition-shadow duration-200 hover:shadow-cardHover ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-50 px-5 py-3.5">
          <div>
            {title && <h3 className="text-sm font-bold text-slate-800">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}

/** Lightweight shimmer placeholder for first-load states — real data
 * only, this is purely a loading affordance, no fabricated numbers. */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function Badge({ tone = 'slate', children }) {
  // "blue" intentionally maps to the AgriSmart accent teal (from the
  // logo's droplet/circuit color), not Tailwind's default sky blue —
  // the brand has no blue. Prop name kept as "blue" for call-site
  // compatibility; only the underlying color changed.
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-brand-100 text-brand-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-accent-100 text-accent-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = 'brand' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tones = { brand: 'bg-brand-500', amber: 'bg-amber-500', red: 'bg-red-500', sky: 'bg-sky-500' };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${tones[tone] || tones.brand}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, subTone = 'slate', iconTone = 'brand' }) {
  // AgriSmart brand palette only — no default Tailwind blue/purple.
  const iconTones = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-brand-50 text-brand-600',
    accent: 'bg-accent-50 text-accent-600',
    amber: 'bg-amber-50 text-amber-500',
    orange: 'bg-orange-50 text-orange-500',
    red: 'bg-red-50 text-red-500',
  };
  const subTones = { slate: 'text-slate-400', amber: 'text-amber-600', green: 'text-brand-600', red: 'text-red-600' };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="text-sm font-semibold text-slate-500">{label}</div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconTones[iconTone] || iconTones.brand}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="mt-2 text-3xl font-extrabold text-slate-800">{value}</div>
      {sub && <div className={`mt-1 text-xs font-semibold ${subTones[subTone] || subTones.slate}`}>{sub}</div>}
    </Card>
  );
}

export function Spinner({ label }) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
      {label ?? t('common.loading')}
    </div>
  );
}

export function EmptyState({ title, sub, action }) {
  return (
    <div className="py-8 text-center">
      <div className="text-sm font-semibold text-slate-500">{title}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** A real, honest error state for when a fetch fails — distinct from
 * EmptyState (which means "the request succeeded and there's genuinely
 * nothing there"). Always paired with a retry action so a transient
 * network failure isn't a dead end. */
export function ErrorState({ title, sub, onRetry, retryLabel }) {
  const { t } = useLocale();
  return (
    <div className="py-8 text-center">
      <div className="text-sm font-semibold text-red-600">{title ?? t('common.error')}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          {retryLabel ?? t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** Shared confirmation modal for any destructive/high-impact action
 * (irrigation start, emergency stop, device suspend/revoke, etc). */
export function ConfirmDialog({ title, children, onCancel, onConfirm, confirmLabel, confirmTone = 'brand', busy, cancelLabel }) {
  const { t } = useLocale();
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
  const toneClasses = confirmTone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-xl2 border border-slate-100 bg-white p-5 shadow-cardHover">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label={resolvedCancelLabel}>
            <XIcon />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">{children}</div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
          >
            {resolvedCancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white shadow-card disabled:opacity-60 ${toneClasses}`}
          >
            {busy && <SpinnerIcon />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small, consistent heading used above a group of cards/sections
 * (e.g. "الأنشطة الأخيرة", "خبراتي"). Keeps every page's section
 * headings the same size/weight/spacing instead of each page picking
 * its own ad-hoc <h2> styling. */
export function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-extrabold text-slate-700">{title}</h2>
      {action}
    </div>
  );
}

/** The ONE primary "here's what's happening / here's what to do"
 * surface per screen — farm status, the AI decision, irrigation
 * status. Deliberately heavier than a normal Card (decision shadow,
 * bigger headline) so it reads as *the* thing to look at first,
 * matching the "one main piece of information" rule. Never stacked
 * more than once per screen. */
export function DecisionCard({ icon, tone = 'brand', eyebrow, headline, children, action }) {
  const tones = {
    brand: { bg: 'bg-brand-50/70', ring: 'bg-brand-600', text: 'text-brand-900', iconText: 'text-brand-700' },
    accent: { bg: 'bg-accent-50/70', ring: 'bg-accent-600', text: 'text-accent-900', iconText: 'text-accent-700' },
    amber: { bg: 'bg-amber-50/70', ring: 'bg-amber-500', text: 'text-amber-900', iconText: 'text-amber-700' },
    slate: { bg: 'bg-slate-50', ring: 'bg-slate-400', text: 'text-slate-800', iconText: 'text-slate-600' },
  };
  const tv = tones[tone] || tones.brand;
  return (
    <div className={`rounded-xl2 border border-slate-100 ${tv.bg} p-5 shadow-decision`}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tv.ring} text-white`}>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && <div className={`text-xs font-bold ${tv.iconText}`}>{eyebrow}</div>}
          <div className={`mt-0.5 text-xl font-extrabold leading-snug ${tv.text}`}>{headline}</div>
          {children && <div className="mt-2 text-sm text-slate-600">{children}</div>}
        </div>
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A single big, obvious tap target — "quick actions" row on Home,
 * primary route into a feature (irrigation, farm, equipment,
 * community). Icon + short label only, no secondary text, so a
 * farmer recognizes it in under a second. */
export function ActionCard({ icon, label, onClick, to, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    accent: 'bg-accent-50 text-accent-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  const className = 'flex flex-1 flex-col items-center gap-2 rounded-xl2 border border-slate-100 bg-white px-3 py-4 text-center shadow-card transition-shadow hover:shadow-cardHover';
  const inner = (
    <>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tones[tone] || tones.brand}`}>
        {icon}
      </div>
      <span className="text-xs font-bold text-slate-700">{label}</span>
    </>
  );
  if (to) {
    return <Link to={to} onClick={onClick} className={className}>{inner}</Link>;
  }
  return <button type="button" onClick={onClick} className={className}>{inner}</button>;
}

/** Consistent round initial-letter avatar for community posts/profile
 * — no fabricated photo, just the person's own display name. */
export function Avatar({ name, size = 36 }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

export function ConfirmRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}

// Tiny inline icon fallbacks so this shared component doesn't force every
// caller of ui.jsx to also import lucide-react's X/Loader2 just for the
// dialog chrome — matches the visual weight of the lucide icons used
// elsewhere (14-18px stroke icons) without adding an import surface here.
function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

export function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
