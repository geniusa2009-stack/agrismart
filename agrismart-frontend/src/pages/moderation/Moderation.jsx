import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Check, X, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, Spinner, EmptyState, ErrorState } from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';

const STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'];

// Mirrors security/rbac.js's isCommunityStaff() (moderator OR admin OR
// super_admin) — this is a UI convenience gate only; the real
// enforcement is server-side via authorizeRole on every /moderation/*
// route. A plain farmer landing here sees a polite "staff only"
// message instead of a page that renders and then 403s on every call.
const STAFF_ROLES = new Set(['moderator', 'admin', 'super_admin']);

/**
 * قائمة الإشراف — staff-only moderation queue, real API-backed against
 * /api/v1/moderation/reports. Not linked from the sidebar for non-staff
 * accounts (see Sidebar.jsx), but still gated here defensively in case
 * of direct navigation.
 */
export default function Moderation() {
  const { t, formatRelativeTime, isRtl, locale } = useLocale();
  const { user } = useAuth();
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);

  const isStaff = user && STAFF_ROLES.has(user.role);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '30' });
      if (status) qs.set('status', status);
      const { items: data } = await api.getPaginated(`/moderation/reports?${qs.toString()}`);
      setItems(data);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل البلاغات.');
    }
  }, [status]);

  useEffect(() => {
    if (!isStaff) return;
    setItems(null);
    load();
  }, [load, retryTick, isStaff]);

  function handleResolved(reportId, updated) {
    setItems((prev) => prev.map((r) => (r._id === reportId ? updated : r)));
  }

  if (!isStaff) {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className={`flex flex-col gap-4 ${isRtl ? 'text-right' : 'text-left'}`} lang={locale === 'en' ? 'en' : 'ar'}>
        <Card>
          <EmptyState title={t('moderation.accessDenied')} />
        </Card>
      </div>
    );
  }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`flex flex-col gap-4 ${isRtl ? 'text-right' : 'text-left'}`} lang={locale === 'en' ? 'en' : 'ar'}>
      <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-800">
        <ShieldAlert size={20} />
        {t('moderation.title')}
      </h1>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {['', ...STATUSES].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${status === s ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'}`}
          >
            {s ? t(`moderation.status.${s}`) : t('moderation.allStatuses')}
          </button>
        ))}
      </div>

      {!items && error && (
        <Card>
          <ErrorState title={t('common.error')} sub={error} onRetry={() => setRetryTick((n) => n + 1)} retryLabel={t('community.retry')} />
        </Card>
      )}
      {!items && !error && <Spinner label={t('community.loading')} />}
      {items && items.length === 0 && (
        <Card>
          <EmptyState title={t('moderation.empty')} sub={t('moderation.emptySub')} />
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <ReportRow key={r._id} report={r} onResolved={(updated) => handleResolved(r._id, updated)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportRow({ report, onResolved }) {
  const [note, setNote] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');

  const isFinal = report.status === 'resolved' || report.status === 'dismissed';

  async function act(newStatus) {
    setBusyAction(newStatus);
    setError('');
    try {
      const updated = await api.patch(`/moderation/reports/${report._id}`, {
        status: newStatus,
        resolutionNote: note.trim() || undefined,
      });
      onResolved(updated);
    } catch (err) {
      setError(err.message || 'تعذّر تنفيذ الإجراء.');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone={report.status === 'open' ? 'red' : report.status === 'reviewing' ? 'amber' : 'slate'}>
              {t(`moderation.status.${report.status}`)}
            </Badge>
            <Badge tone="slate">{t(`moderation.targetType.${report.targetType}`)}</Badge>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-700">{t(`moderation.reason.${report.reason}`)}</div>
          {report.description && <div className="mt-1 text-xs text-slate-500">{report.description}</div>}
          <div className="mt-1 text-[11px] text-slate-400">
            {t('moderation.reportedBy')}: {report.reporterId} · {formatRelativeTime(report.createdAt)}
          </div>
          {report.resolutionNote && (
            <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{report.resolutionNote}</div>
          )}
        </div>
      </div>

      {!isFinal && (
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-50 pt-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('moderation.resolutionNotePlaceholder')}
            maxLength={1000}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-500"
          />
          <div className="flex flex-wrap gap-2">
            {report.status !== 'reviewing' && (
              <button
                onClick={() => act('reviewing')}
                disabled={!!busyAction}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-60"
              >
                {busyAction === 'reviewing' && <Loader2 size={13} className="animate-spin" />}
                {t('moderation.markReviewing')}
              </button>
            )}
            <button
              onClick={() => act('resolved')}
              disabled={!!busyAction}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {busyAction === 'resolved' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t('moderation.resolve')}
            </button>
            <button
              onClick={() => act('dismissed')}
              disabled={!!busyAction}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-60"
            >
              {busyAction === 'dismissed' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              {t('moderation.dismiss')}
            </button>
          </div>
          {error && <div className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600">{error}</div>}
        </div>
      )}
    </Card>
  );
}
