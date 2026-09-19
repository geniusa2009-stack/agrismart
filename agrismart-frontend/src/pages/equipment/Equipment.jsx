import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tractor, Plus, Loader2, X, Star, Flag, User } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, Badge, Spinner, EmptyState, ErrorState, ConfirmDialog, ConfirmRow } from '../../components/ui';
import { t, formatCurrency, formatDate } from '../../i18n';

const EQUIPMENT_TYPES = ['tractor', 'harvester', 'sprayer', 'cultivator', 'irrigation_equipment', 'other'];
const TABS = ['discover', 'mine', 'rentals'];

/**
 * تأجير المعدات — equipment discovery, "my equipment" (owner
 * management), and "my rentals" (requester + owner view), all real
 * API-backed against /api/v1/equipment and /api/v1/rentals. One page
 * with tabs rather than three separate routes/files, per the task
 * brief's "do not over-engineer" guidance for this foundation pass —
 * the underlying backend already supports all three views fully;
 * splitting into separate pages later is a pure frontend refactor with
 * no backend change needed.
 */
export default function Equipment() {
  const [tab, setTab] = useState('discover');

  return (
    <div dir="rtl" className="flex flex-col gap-4 text-right" lang="ar">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-800">{t('equipment.title')}</h1>
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
            {tb === 'discover' ? t('equipment.discover') : tb === 'mine' ? t('equipment.myEquipment') : t('equipment.myRentals')}
          </button>
        ))}
      </div>

      {tab === 'discover' && <Discover />}
      {tab === 'mine' && <MyEquipment />}
      {tab === 'rentals' && <MyRentals />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------

function Discover() {
  const [equipmentType, setEquipmentType] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '20' });
      if (equipmentType) qs.set('equipmentType', equipmentType);
      if (governorate) qs.set('governorate', governorate);
      const { items: data } = await api.getPaginated(`/equipment?${qs.toString()}`);
      setItems(data);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل المعدات.');
    }
  }, [equipmentType, governorate]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, retryTick]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={equipmentType}
          onChange={(e) => setEquipmentType(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          <option value="">{t('equipment.type')}</option>
          {EQUIPMENT_TYPES.map((et) => (
            <option key={et} value={et}>
              {t(`equipmentTypes.${et}`)}
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
      {!items && !error && <Spinner label={t('equipment.discover')} />}
      {items && items.length === 0 && (
        <Card>
          <EmptyState title={t('equipment.emptyResults')} sub={t('equipment.emptyResultsSub')} />
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((eq) => (
            <EquipmentCard key={eq._id} equipment={eq} onClick={() => setSelected(eq)} />
          ))}
        </div>
      )}

      {selected && <RentalRequestDialog equipment={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function EquipmentCard({ equipment, onClick }) {
  const [reportSent, setReportSent] = useState(false);

  async function handleReport(e) {
    e.stopPropagation();
    try {
      await api.post('/moderation/reports', { targetType: 'equipment', targetId: equipment._id, reason: 'other' });
    } catch {
      // already reported or transient failure — still reflect as sent
    } finally {
      setReportSent(true);
    }
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <button onClick={onClick} className="flex w-full flex-col p-4 text-right">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
            <Tractor size={18} />
          </div>
          <Badge tone="slate">{t(`equipmentTypes.${equipment.equipmentType}`)}</Badge>
        </div>
        <div className="mt-2 text-sm font-bold text-slate-800">{equipment.title}</div>
        <div className="mt-0.5 text-xs text-slate-400">{equipment.location?.governorate || '—'}</div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-sm font-extrabold text-brand-700">
            {formatCurrency(equipment.pricing?.amount)} / {equipment.pricing?.unit === 'hour' ? t('equipment.perHour') : equipment.pricing?.unit === 'day' ? t('equipment.perDay') : t('equipment.perJob')}
          </div>
          {equipment.ratingCount > 0 ? (
            <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
              <Star size={13} fill="currentColor" /> {equipment.ratingAverage} ({equipment.ratingCount})
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

function RentalRequestDialog({ equipment, onClose }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [owner, setOwner] = useState(null);

  // Real owner info, fetched from the same public-profile endpoint the
  // Profile page uses — never fabricated, and never more than the
  // profile endpoint itself already exposes publicly (no email/role/
  // internal fields).
  useEffect(() => {
    let cancelled = false;
    if (equipment.ownerId) {
      api
        .get(`/community/profiles/${equipment.ownerId}`)
        .then((data) => {
          if (!cancelled) setOwner(data);
        })
        .catch(() => {
          // owner profile couldn't load — dialog still works without it
        });
    }
    return () => {
      cancelled = true;
    };
  }, [equipment.ownerId]);

  async function submit() {
    if (!startDate || !endDate) {
      setError('برجاء اختيار تاريخ البداية والنهاية.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(`/equipment/${equipment._id}/rental-requests`, {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        message: message.trim() || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'تعذّر إرسال طلب الاستئجار.');
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <ConfirmDialog title="تم إرسال الطلب" confirmLabel={t('common.close')} cancelLabel={t('community.cancel')} onCancel={onClose} onConfirm={onClose}>
        <div className="text-xs text-slate-500">سيتم إعلامك عند رد المالك على طلبك.</div>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={t('equipment.requestRental')}
      confirmLabel={busy ? t('community.publishing') : t('equipment.requestRental')}
      cancelLabel={t('community.cancel')}
      busy={busy}
      onCancel={onClose}
      onConfirm={submit}
    >
      <ConfirmRow label={equipment.title} value={formatCurrency(equipment.pricing?.amount)} />
      {owner && (
        <Link
          to={`/community/profile/${equipment.ownerId}`}
          className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
        >
          <User size={13} />
          {t('equipment.owner')}: {owner.displayName}
        </Link>
      )}
      <div className="mt-2 flex flex-col gap-2">
        <label className="text-xs font-semibold text-slate-500">
          {t('equipment.from')}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          {t('equipment.to')}
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`${t('common.optional')} — رسالة للمالك`}
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
        {error && <div className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600">{error}</div>}
      </div>
    </ConfirmDialog>
  );
}

// ---------------------------------------------------------------------
// My Equipment
// ---------------------------------------------------------------------

function MyEquipment() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const { items: data } = await api.getPaginated('/equipment/mine?limit=50');
      setItems(data);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل معداتك.');
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
        {adding ? <X size={14} /> : <Plus size={14} />} {t('equipment.addEquipment')}
      </button>

      {adding && (
        <AddEquipmentForm
          onCreated={(eq) => {
            setItems((prev) => (prev ? [eq, ...prev] : [eq]));
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
          <EmptyState title={t('equipment.emptyMine')} />
        </Card>
      )}
      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((eq) => (
            <Card key={eq._id}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800">{eq.title}</div>
                <Badge tone={eq.status === 'active' ? 'green' : eq.status === 'paused' ? 'amber' : 'slate'}>
                  {eq.status === 'active' ? t('equipment.active') : eq.status === 'paused' ? t('equipment.paused') : t('equipment.archived')}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-slate-400">{t(`equipmentTypes.${eq.equipmentType}`)}</div>
              <div className="mt-2 text-sm font-extrabold text-brand-700">{formatCurrency(eq.pricing?.amount)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddEquipmentForm({ onCreated }) {
  const [form, setForm] = useState({
    equipmentType: 'tractor',
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
      const eq = await api.post('/equipment', {
        equipmentType: form.equipmentType,
        title: form.title.trim(),
        location: form.governorate ? { governorate: form.governorate.trim() } : undefined,
        pricing: { unit: form.unit, amount: Number(form.amount) },
      });
      onCreated(eq);
    } catch (err) {
      setError(err.message || 'تعذّر إضافة المعدة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.equipmentType}
            onChange={(e) => setForm((f) => ({ ...f, equipmentType: e.target.value }))}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            {EQUIPMENT_TYPES.map((et) => (
              <option key={et} value={et}>
                {t(`equipmentTypes.${et}`)}
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
          placeholder="اسم المعدة"
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
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('equipment.addEquipment')}
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------
// My Rentals
// ---------------------------------------------------------------------

function MyRentals() {
  const [as, setAs] = useState('requester');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [reviewTarget, setReviewTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const { items: data } = await api.getPaginated(`/rentals?as=${as}&limit=50`);
      setItems(data);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل طلبات الإيجار.');
    }
  }, [as]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, retryTick]);

  async function act(rentalId, action) {
    try {
      const updated = await api.patch(`/rentals/${rentalId}/status`, { action });
      setItems((prev) => prev.map((r) => (r._id === rentalId ? updated : r)));
    } catch (err) {
      setError(err.message || 'تعذّر تنفيذ الإجراء.');
    }
  }

  function handleReviewed(rentalId) {
    setItems((prev) => prev.map((r) => (r._id === rentalId ? { ...r, reviewedByRequester: true } : r)));
    setReviewTarget(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 self-start rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setAs('requester')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${as === 'requester' ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'}`}
        >
          {t('equipment.asRenter')}
        </button>
        <button
          onClick={() => setAs('owner')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${as === 'owner' ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500'}`}
        >
          {t('equipment.asOwner')}
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
          <EmptyState title={t('equipment.emptyRentals')} />
        </Card>
      )}
      {items && items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <Card key={r._id}>
              <div className="flex items-center justify-between">
                <Badge
                  tone={
                    r.status === 'accepted' || r.status === 'completed'
                      ? 'green'
                      : r.status === 'requested'
                      ? 'blue'
                      : 'red'
                  }
                >
                  {t(`equipment.status.${r.status}`)}
                </Badge>
                <div className="text-[11px] text-slate-400">
                  {formatDate(r.startDate)} — {formatDate(r.endDate)}
                </div>
              </div>
              <div className="mt-2 text-sm font-bold text-slate-800">{formatCurrency(r.priceQuoted)}</div>
              {r.message && <div className="mt-1 text-xs text-slate-500">{r.message}</div>}

              {as === 'owner' && r.status === 'requested' && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => act(r._id, 'accept')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">
                    {t('equipment.accept')}
                  </button>
                  <button onClick={() => act(r._id, 'reject')} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600">
                    {t('equipment.reject')}
                  </button>
                </div>
              )}
              {as === 'owner' && r.status === 'accepted' && (
                <button onClick={() => act(r._id, 'complete')} className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">
                  {t('equipment.markCompleted')}
                </button>
              )}
              {(r.status === 'requested' || r.status === 'accepted') && (
                <button onClick={() => act(r._id, 'cancel')} className="mt-3 mr-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500">
                  {t('equipment.cancelRequest')}
                </button>
              )}
              {as === 'requester' && r.status === 'completed' && (
                <button
                  onClick={() => setReviewTarget(r)}
                  disabled={r.reviewedByRequester}
                  className="mt-3 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-600 disabled:opacity-50"
                >
                  {r.reviewedByRequester ? t('equipment.alreadyReviewed') : t('equipment.leaveReview')}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {reviewTarget && (
        <ReviewRentalDialog rental={reviewTarget} onClose={() => setReviewTarget(null)} onReviewed={() => handleReviewed(reviewTarget._id)} />
      )}
    </div>
  );
}

function ReviewRentalDialog({ rental, onClose, onReviewed }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/rentals/${rental._id}/review`, { rating, comment: comment.trim() || undefined });
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
      <ConfirmDialog title={t('equipment.reviewSubmitted')} confirmLabel={t('common.close')} cancelLabel={t('community.cancel')} onCancel={onClose} onConfirm={onClose}>
        <div className="text-xs text-slate-500" />
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={t('equipment.leaveReview')}
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
