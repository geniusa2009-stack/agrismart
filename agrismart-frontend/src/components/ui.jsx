export function Card({ title, action, className = '', children, padded = true }) {
  return (
    <div className={`rounded-xl2 border border-slate-100 bg-white shadow-card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-50 px-5 py-3.5">
          {title && <h3 className="text-sm font-bold text-slate-800">{title}</h3>}
          {action}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-brand-100 text-brand-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-sky-100 text-sky-700',
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
  const iconTones = {
    brand: 'bg-sky-50 text-sky-500',
    amber: 'bg-amber-50 text-amber-500',
    red: 'bg-red-50 text-red-500',
    green: 'bg-brand-50 text-brand-600',
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

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
      {label}
    </div>
  );
}

export function EmptyState({ title, sub }) {
  return (
    <div className="py-8 text-center">
      <div className="text-sm font-semibold text-slate-500">{title}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
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
