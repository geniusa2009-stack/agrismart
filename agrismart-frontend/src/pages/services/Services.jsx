import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Plus, Loader2, X, Star, Flag, User } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, Badge, Spinner, EmptyState, ErrorState, ConfirmDialog, ConfirmRow } from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';

const SERVICE_TYPES = [
  'agricultural_consultant',
  'tractor_operator',
  'irrigation_technician',
  'soil_testing',
  'spraying_service',
  'harvesting_service',
  'machinery_maintenance',
  'other',
];
const TABS = ['discover', 'mine', 'requests'];

/**
 * الخدمات الزراعية — agricultural services discovery, "my services"
 * (provider management), and "my requests" (requester + provider
 * view). Mirrors the exact pattern established in
 * src/pages/equipment/Equipment.jsx, real API-backed only against
 * /api/v1/services and /api/v1/service-requests — no mock data.
 *
 * Field-name differences from the equipment/rentals module (confirmed
 * against the backend contract before writing this page): the owner
 * field is `providerId` not `ownerId`; a service request uses a single
 * optional `preferredDate`, not a `startDate`/`endDate` range (no
 * double-booking concern here — services aren't scheduled against a
 * shared calendar the way equipment is); `priceQuoted`/`pricingUnit`
 * are server-derived from the listing, never submitted by the client.
 */
export default function Services() {
  const { t, formatCurrency, formatDate, isRtl, locale } = useLocale();
  const [tab, setTab] = useState('discover');

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`flex flex-col gap-4 ${isRtl ? 'text-right' : 'text-left'}`} lang={locale === 'en' ? 'en' : 'ar'}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-800">{t('services.title')}</h1>
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
              tab === tb ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'
            }`}
          >
            {tb === 'discover' ? t('services.discover') : tb === 'mine' ? t('services.myServices') : t('services.myRequests')}
          </button>
        ))}
      </div>

      {tab === 'discover' && <Discover />}
      {tab === 'mine' && <MyServices />}
      {tab === 'requests' && <MyRequests />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------

function Discover() {
  const [serviceType, setServiceType] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '20' });
      if (serviceType) qs.set('serviceType', serviceType);
      if (governorate) qs.set('governorate', governorate);
      const { items: data } = await api.getPaginated(`/services?${qs.toString()}`);
      setItems(data);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الخدمات.');
    }
  }, [serviceType, governorate]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, retryTick]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          <option value="">{t('equipment.type')}</option>
          {SERVICE_TYPES.map((st) => (
            <option key={st} value={st}>
              {t(`serviceTypes.${st}`)}
            </option>
          ))}
        </select>
        <input
          value={governorate}
          onChange={(e) => setGovernorate(e.target.value)}
          placeholder={t('equipment.governorate')}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-brand-500"
        />
      </div>

      {!items && error && (
        <Card>
          <ErrorState title={t('common.error')} sub={error} onRetry={() => setRetryTick((n) => n + 1)} retryLabel={t('community.retry')} />
        </Card>
      )}
      {!items && !error && <Spinner label={t('services.discover')} />}
      {items && items.length === 0 && (
        <Card>
          <EmptyState title={t('services.emptyResults')} sub={t('services.emptyResultsSub')} />
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((sv) => (
            <ServiceCard key={sv._id} service={sv} onClick={() => setSelected(sv)} />
          ))}
        </div>
      )}

      {selected && <ServiceRequestDialog service={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ServiceCard({ service, onClick }) {
  const [reportSent, setReportSent] = useState(false);

  async function handleReport(e) {
    e.stopPropagation();
    try {
      await api.post('/moderation/reports', { targetType: 'service', targetId: service._id, reason: 'other' });
    } catch {
      // already reported or transient failure — still reflect as sent
    } finally {
      setReportSent(true);
    }
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <button onClick={onClick} className="flex w-full flex-col p-4 text-start">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
            <Wrench size={18} />
          </div>
          <Badge tone="slate">{t(`serviceTypes.${service.serviceType}`)}</Badge>
        </div>
        <div className="mt-2 text-sm font-bold text-slate-800">{service.title}</div>
        <div className="mt-0.5 text-xs text-slate-400">{service.location?.governorate || '—'}</div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-sm font-extrabold text-brand-700">
            {formatCurrency(service.pricing?.amount)} /{' '}
            {service.pricing?.unit === 'hour' ? t('equipment.perHour') : service.pricing?.unit === 'day' ? t('equipment.perDay') : t('equipment.perJob')}
          </div>
          {service.ratingCount > 0 ? (
            <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
              <Star size={13} fill="currentColor" /> {service.ratingAverage} ({service.ratingCount})
            </div>
          ) : (
            <div className="text-[10px] text-slate-300">{t('equipment.ratingNoReviews')}</div>
          )}
        </div>
      </button>
      <div className="flex justify-end border-t border-slate-50 px-4 py-1.5">
        <button
          onClick={handleReport}
          disabled={reportSent}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-500 disabled:opacity-50"
        >
          <Flag size={11} /> {reportSent ? t('community.report') + ' ✓' : t('community.report')}
        </button>
      </div>
    </Card>
  );
}

function ServiceRequestDialog({ service, onClose }) {
  const [preferredDate, setPreferredDate] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (service.providerId) {
      api
        .get(`/community/profiles/${service.providerId}`)
        .then((data) => {
          if (!cancelled) setProvider(data);
        })
        .catch(() => {
          // provider profile couldn't load — dialog still works without it
        });
    }
    return () => {
      cancelled = true;
    };
  }, [service.providerId]);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/services/${service._id}/requests`, {
        preferredDate: preferredDate ? new Date(preferredDate).toISOString() : undefined,
        message: message.trim() || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'تعذّر إرسال الطلب.');
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <ConfirmDialog title={t('services.requestSent')} confirmLabel={t('common.close')} cancelLabel={t('community.cancel')} onCancel={onClose} onConfirm={onClose}>
        <div className="text-xs text-slate-500">{t('services.requestSentSub')}</div>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={t('services.requestService')}
      confirmLabel={busy ? t('community.publishing') : t('services.requestService')}
      cancelLabel={t('community.cancel')}
      busy={busy}
      onCancel={onClose}
      onConfirm={submit}
    >
      <ConfirmRow label={service.title} value={formatCurrency(service.pricing?.amount)} />
      {provider && (
        <Link
          to={`/community/profile/${service.providerId}`}
          className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
        >
          <User size={13} />
          {t('services.provider')}: {provider.displayName}
        </Link>
      )}
      <div className="mt-2 flex flex-col gap-2">
        <label className="text-xs font-semibold text-slate-500">
          {t('services.preferredDate')}
          <input
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('services.messageToProvider')}
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
        {error && <div className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600">{error}</div>}
      </div>
    </ConfirmDialog>
  );
}

// ---------------------------------------------------------------------
// My Services
// ---------------------------------------------------------------------

function MyServices() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const { items: data } = await api.getPaginated('/services/mine?limit=50');
      setItems(data);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل خدماتك.');
    }
  }, []);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, retryTick]);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setAdding((v) => !v)}
        className="flex items-center justify-center gap-1.5 self-start rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
      >
        {adding ? <X size={14} /> : <Plus size={14} />} {t('services.addService')}
      </button>

      {adding && (
        <AddServiceForm
          onCreated={(sv) => {
            setItems((prev) => (prev ? [sv, ...prev] : [sv]));
            setAdding(false);
          }}
        />
      )}

      {!items && error && (
        <Card>
          <ErrorState title={t('common.error')} sub={error} onRetry={() => setRetryTick((n) => n + 1)} retryLabel={t('community.retry')} />
        </Card>
      )}
      {!items && !error && <Spinner label={t('community.loading')} />}
      {items && items.length === 0 && (
        <Card>
          <EmptyState title={t('services.emptyMine')} />
        </Card>
      )}
      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((sv) => (
            <Card key={sv._id}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800">{sv.title}</div>
                <Badge tone={sv.status === 'active' ? 'green' : sv.status === 'paused' ? 'amber' : 'slate'}>
                  {sv.status === 'active' ? t('equipment.active') : sv.status === 'paused' ? t('equipment.paused') : t('equipment.archived')}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-slate-400">{t(`serviceTypes.${sv.serviceType}`)}</div>
              <div className="mt-2 text-sm font-extrabold text-brand-700">{formatCurrency(sv.pricing?.amount)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddServiceForm({ onCreated }) {
  const [form, setForm] = useState({
    serviceType: 'agricultural_consultant',
    title: '',
    governorate: '',
    unit: 'day',
    amount: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const sv = await api.post('/services', {
        serviceType: form.serviceType,
        title: form.title.trim(),
        location: form.governorate ? { governorate: form.governorate.trim() } : undefined,
        pricing: { unit: form.unit, amount: Number(form.amount) },
      });
      onCreated(sv);
    } catch (err) {
      setError(err.message || 'تعذّر إضافة الخدمة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.serviceType}
            onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value }))}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            {SERVICE_TYPES.map((st) => (
              <option key={st} value={st}>
                {t(`serviceTypes.${st}`)}
              </option>
            ))}
          </select>
          <input
            value={form.governorate}
            onChange={(e) => setForm((f) => ({ ...f, governorate: e.target.value }))}
            placeholder={t('equipment.governorate')}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </div>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={t('services.serviceName')}
          required
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="hour">{t('equipment.perHour')}</option>
            <option value="day">{t('equipment.perDay')}</option>
            <option value="job">{t('equipment.perJob')}</option>
          </select>
          <input
            type="number"
            min="1"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder={t('equipment.price')}
            required
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </div>
        {error && <div className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('services.addService')}
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------
// My Requests
// ---------------------------------------------------------------------

function MyRequests() {
  const [as, setAs] = useState('requester');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [reviewTarget, setReviewTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const { items: data } = await api.getPaginated(`/service-requests?as=${as}&limit=50`);
      setItems(data);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الطلبات.');
    }
  }, [as]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, retryTick]);

  async function act(requestId, action) {
    try {
      const updated = await api.patch(`/service-requests/${requestId}/status`, { action });
      setItems((prev) => prev.map((r) => (r._id === requestId ? updated : r)));
    } catch (err) {
      setError(err.message || 'تعذّر تنفيذ الإجراء.');
    }
  }

  function handleReviewed(requestId) {
    setItems((prev) => prev.map((r) => (r._id === requestId ? { ...r, reviewedByRequester: true } : r)));
    setReviewTarget(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 self-start rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setAs('requester')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${as === 'requester' ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'}`}
        >
          {t('services.asRequester')}
        </button>
        <button
          onClick={() => setAs('provider')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${as === 'provider' ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'}`}
        >
          {t('services.asProvider')}
        </button>
      </div>

      {!items && error && (
        <Card>
          <ErrorState title={t('common.error')} sub={error} onRetry={() => setRetryTick((n) => n + 1)} retryLabel={t('community.retry')} />
        </Card>
      )}
      {!items && !error && <Spinner label={t('community.loading')} />}
      {items && items.length === 0 && (
        <Card>
          <EmptyState title={t('services.emptyRequests')} />
        </Card>
      )}
      {items && items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <Card key={r._id}>
              <div className="flex items-center justify-between">
                <Badge
                  tone={
                    r.status === 'accepted' || r.status === 'in_progress' || r.status === 'completed'
                      ? 'green'
                      : r.status === 'requested'
                      ? 'blue'
                      : 'red'
                  }
                >
                  {t(`services.status.${r.status}`)}
                </Badge>
                {r.preferredDate && <div className="text-[11px] text-slate-400">{formatDate(r.preferredDate)}</div>}
              </div>
              <div className="mt-2 text-sm font-bold text-slate-800">{formatCurrency(r.priceQuoted)}</div>
              {r.message && <div className="mt-1 text-xs text-slate-500">{r.message}</div>}

              {as === 'provider' && r.status === 'requested' && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => act(r._id, 'accept')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">
                    {t('services.accept')}
                  </button>
                  <button onClick={() => act(r._id, 'reject')} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600">
                    {t('services.reject')}
                  </button>
                </div>
              )}
              {as === 'provider' && r.status === 'accepted' && (
                <button onClick={() => act(r._id, 'start')} className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">
                  {t('services.start')}
                </button>
              )}
              {as === 'provider' && r.status === 'in_progress' && (
                <button onClick={() => act(r._id, 'complete')} className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">
                  {t('services.markCompleted')}
                </button>
              )}
              {(r.status === 'requested' || r.status === 'accepted' || r.status === 'in_progress') && (
                <button
                  onClick={() => act(r._id, 'cancel')}
                  className="mt-3 me-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500"
                >
                  {t('services.cancelRequest')}
                </button>
              )}
              {as === 'requester' && r.status === 'completed' && (
                <button
                  onClick={() => setReviewTarget(r)}
                  disabled={r.reviewedByRequester}
                  className="mt-3 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-600 disabled:opacity-50"
                >
                  {r.reviewedByRequester ? t('services.alreadyReviewed') : t('services.leaveReview')}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {reviewTarget && (
        <ReviewRequestDialog request={reviewTarget} onClose={() => setReviewTarget(null)} onReviewed={() => handleReviewed(reviewTarget._id)} />
      )}
    </div>
  );
}

function ReviewRequestDialog({ request, onClose, onReviewed }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/service-requests/${request._id}/review`, { rating, comment: comment.trim() || undefined });
      setDone(true);
      onReviewed();
    } catch (err) {
      setError(err.message || 'تعذّر إرسال التقييم.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <ConfirmDialog title={t('services.reviewSubmitted')} confirmLabel={t('common.close')} cancelLabel={t('community.cancel')} onCancel={onClose} onConfirm={onClose}>
        <div className="text-xs text-slate-500" />
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={t('services.leaveReview')}
      confirmLabel={busy ? t('community.publishing') : t('equipment.submitReview')}
      cancelLabel={t('community.cancel')}
      busy={busy}
      onCancel={onClose}
      onConfirm={submit}
    >
      <div className="text-xs font-semibold text-slate-500">{t('equipment.yourRating')}</div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} ${t('equipment.yourRating')}`}>
            <Star size={22} className={n <= rating ? 'text-amber-500' : 'text-slate-200'} fill={n <= rating ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('equipment.reviewComment')}
        rows={3}
        maxLength={1000}
        className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
      />
      {error && <div className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600">{error}</div>}
    </ConfirmDialog>
  );
}
