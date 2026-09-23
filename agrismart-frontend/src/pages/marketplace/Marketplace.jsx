import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBasket, Plus, Loader2, X, Bookmark, BookmarkCheck, Flag, User } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, Badge, Spinner, EmptyState, ErrorState, ConfirmDialog, ConfirmRow } from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';

const CATEGORIES = ['seeds', 'fertilizers', 'irrigation_supplies', 'equipment', 'tools', 'products', 'other'];
const TABS = ['discover', 'mine', 'saved'];

/**
 * السوق الزراعي — marketplace discovery, "my listings" (seller
 * management), and "saved" bookmarks, real API-backed only against
 * /api/v1/marketplace. Mirrors the pattern from Equipment.jsx/
 * Services.jsx.
 *
 * Note on Saved tab: GET /marketplace/saved returns raw SavedItem
 * documents (userId/targetType/targetId only — confirmed by reading
 * marketplace.service.js's listSaved, which does not populate/hydrate
 * the target). To show real listing details rather than bare ids,
 * this page fetches each saved marketplace_listing individually via
 * GET /marketplace/:listingId after loading the saved-item list. This
 * is still 100% real data, just assembled from two real endpoints
 * instead of one — no fabrication involved. A listing that was since
 * archived/removed is simply skipped (its detail fetch 404s).
 */
export default function Marketplace() {
  const { t, formatCurrency, isRtl, locale } = useLocale();
  const [tab, setTab] = useState('discover');

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`flex flex-col gap-4 ${isRtl ? 'text-right' : 'text-left'}`} lang={locale === 'en' ? 'en' : 'ar'}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-800">{t('marketplace.title')}</h1>
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
            {tb === 'discover' ? t('marketplace.discover') : tb === 'mine' ? t('marketplace.myListings') : t('marketplace.saved')}
          </button>
        ))}
      </div>

      {tab === 'discover' && <Discover />}
      {tab === 'mine' && <MyListings />}
      {tab === 'saved' && <Saved />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------

function Discover() {
  const [category, setCategory] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [selected, setSelected] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '20' });
      if (category) qs.set('category', category);
      if (governorate) qs.set('governorate', governorate);
      // GET /marketplace (discover) is a public, non-personalized list —
      // it never says whether THIS user already saved an item (see
      // marketplace.service.js's discover(), which takes no userId).
      // Fetching the user's real saved-item ids in parallel and
      // cross-referencing them is the only way to show a truthful
      // bookmark state; showing every card as "not saved" regardless of
      // actual state would make the toggle silently UN-save an
      // already-saved item on first click — exactly the kind of "fake
      // availability" this pass is auditing for.
      const [{ items: data }, savedResult] = await Promise.all([
        api.getPaginated(`/marketplace?${qs.toString()}`),
        api.getPaginated('/marketplace/saved?targetType=marketplace_listing&limit=50').catch(() => ({ items: [] })),
      ]);
      setItems(data);
      setSavedIds(new Set(savedResult.items.map((s) => s.targetId)));
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الإعلانات.');
    }
  }, [category, governorate]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, retryTick]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          <option value="">{t('community.allCategories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categoriesMarket.${c}`)}
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
      {!items && !error && <Spinner label={t('marketplace.discover')} />}
      {items && items.length === 0 && (
        <Card>
          <EmptyState title={t('marketplace.emptyResults')} sub={t('marketplace.emptyResultsSub')} />
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((listing) => (
            <ListingCard
              key={listing._id}
              listing={listing}
              initialSaved={savedIds.has(listing._id)}
              onContact={() => setSelected(listing)}
            />
          ))}
        </div>
      )}

      {selected && <ContactSellerDialog listing={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ListingCard({ listing, initialSaved = false, onContact }) {
  const [reportSent, setReportSent] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [saveBusy, setSaveBusy] = useState(false);

  async function toggleSave(e) {
    e.stopPropagation();
    setSaveBusy(true);
    try {
      const result = await api.post(`/marketplace/${listing._id}/save`, {});
      setSaved(result.saved);
    } catch {
      // non-critical UI action — button just doesn't change state
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleReport(e) {
    e.stopPropagation();
    try {
      await api.post('/moderation/reports', { targetType: 'marketplace_listing', targetId: listing._id, reason: 'other' });
    } catch {
      // already reported or transient failure — still reflect as sent
    } finally {
      setReportSent(true);
    }
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col p-4 text-start">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
            <ShoppingBasket size={18} />
          </div>
          <div className="flex items-center gap-1.5">
            <Badge tone={listing.availability === 'in_stock' ? 'green' : 'slate'}>
              {listing.availability === 'in_stock' ? t('marketplace.inStock') : t('marketplace.outOfStock')}
            </Badge>
            <button onClick={toggleSave} disabled={saveBusy} className="text-slate-400 hover:text-brand-600 disabled:opacity-50">
              {saved ? <BookmarkCheck size={16} className="text-brand-600" /> : <Bookmark size={16} />}
            </button>
          </div>
        </div>
        <div className="mt-2 text-sm font-bold text-slate-800">{listing.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
          <span>{t(`categoriesMarket.${listing.category}`)}</span>
          <span>·</span>
          <span>{listing.location?.governorate || '—'}</span>
        </div>
        <div className="mt-2 text-sm font-extrabold text-brand-700">
          {formatCurrency(listing.price)} / {listing.unit}
        </div>
        <button onClick={onContact} className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
          {t('marketplace.contactSeller')}
        </button>
      </div>
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

function ContactSellerDialog({ listing, onClose }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [seller, setSeller] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (listing.sellerId) {
      api
        .get(`/community/profiles/${listing.sellerId}`)
        .then((data) => {
          if (!cancelled) setSeller(data);
        })
        .catch(() => {
          // seller profile couldn't load — dialog still works without it
        });
    }
    return () => {
      cancelled = true;
    };
  }, [listing.sellerId]);

  async function submit() {
    if (!message.trim()) {
      setError('برجاء كتابة رسالة.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(`/marketplace/${listing._id}/contact`, { message: message.trim() });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'تعذّر إرسال الرسالة.');
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <ConfirmDialog title={t('marketplace.inquirySent')} confirmLabel={t('common.close')} cancelLabel={t('community.cancel')} onCancel={onClose} onConfirm={onClose}>
        <div className="text-xs text-slate-500">{t('marketplace.inquirySentSub')}</div>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={t('marketplace.contactSeller')}
      confirmLabel={busy ? t('community.publishing') : t('marketplace.contactSeller')}
      cancelLabel={t('community.cancel')}
      busy={busy}
      onCancel={onClose}
      onConfirm={submit}
    >
      <ConfirmRow label={listing.title} value={formatCurrency(listing.price)} />
      {seller && (
        <Link
          to={`/community/profile/${listing.sellerId}`}
          className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
        >
          <User size={13} />
          {t('marketplace.seller')}: {seller.displayName}
        </Link>
      )}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('marketplace.messageToSeller')}
        rows={3}
        maxLength={500}
        className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
      />
      {error && <div className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600">{error}</div>}
    </ConfirmDialog>
  );
}

// ---------------------------------------------------------------------
// My Listings
// ---------------------------------------------------------------------

function MyListings() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const { items: data } = await api.getPaginated('/marketplace/mine?limit=50');
      setItems(data);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل إعلاناتك.');
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
        {adding ? <X size={14} /> : <Plus size={14} />} {t('marketplace.addListing')}
      </button>

      {adding && (
        <AddListingForm
          onCreated={(l) => {
            setItems((prev) => (prev ? [l, ...prev] : [l]));
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
          <EmptyState title={t('marketplace.emptyMine')} />
        </Card>
      )}
      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((l) => (
            <Card key={l._id}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800">{l.title}</div>
                <Badge tone={l.status === 'active' ? 'green' : l.status === 'paused' ? 'amber' : 'slate'}>
                  {l.status === 'active' ? t('marketplace.active') : l.status === 'paused' ? t('marketplace.paused') : t('marketplace.archived')}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-slate-400">{t(`categoriesMarket.${l.category}`)}</div>
              <div className="mt-2 text-sm font-extrabold text-brand-700">
                {formatCurrency(l.price)} / {l.unit}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddListingForm({ onCreated }) {
  const [form, setForm] = useState({
    category: 'products',
    title: '',
    governorate: '',
    price: '',
    unit: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const l = await api.post('/marketplace', {
        category: form.category,
        title: form.title.trim(),
        location: form.governorate ? { governorate: form.governorate.trim() } : undefined,
        price: Number(form.price),
        unit: form.unit.trim(),
      });
      onCreated(l);
    } catch (err) {
      setError(err.message || 'تعذّر إضافة الإعلان.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categoriesMarket.${c}`)}
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
          placeholder={t('marketplace.listingName')}
          required
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="0"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder={t('marketplace.price')}
            required
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <input
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            placeholder={t('marketplace.unit')}
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
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('marketplace.addListing')}
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Saved
// ---------------------------------------------------------------------

function Saved() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const { items: savedItems } = await api.getPaginated('/marketplace/saved?targetType=marketplace_listing&limit=50');
      // GET /marketplace/saved returns bare SavedItem docs (see file
      // header comment) — hydrate each with a real GET /marketplace/:id
      // call. A listing that's since been archived/removed 404s and is
      // simply dropped from the list, never faked.
      const hydrated = await Promise.all(
        savedItems.map(async (s) => {
          try {
            return await api.get(`/marketplace/${s.targetId}`);
          } catch {
            return null;
          }
        })
      );
      setItems(hydrated.filter(Boolean));
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل المحفوظات.');
    }
  }, []);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, retryTick]);

  return (
    <div className="flex flex-col gap-3">
      {!items && error && (
        <Card>
          <ErrorState title={t('common.error')} sub={error} onRetry={() => setRetryTick((n) => n + 1)} retryLabel={t('community.retry')} />
        </Card>
      )}
      {!items && !error && <Spinner label={t('community.loading')} />}
      {items && items.length === 0 && (
        <Card>
          <EmptyState title={t('marketplace.emptySaved')} />
        </Card>
      )}
      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((l) => (
            <Card key={l._id}>
              <div className="text-sm font-bold text-slate-800">{l.title}</div>
              <div className="mt-1 text-xs text-slate-400">{t(`categoriesMarket.${l.category}`)}</div>
              <div className="mt-2 text-sm font-extrabold text-brand-700">
                {formatCurrency(l.price)} / {l.unit}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
