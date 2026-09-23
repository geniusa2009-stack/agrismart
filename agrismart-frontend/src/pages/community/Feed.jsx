import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Heart, Flag, Loader2, Send, User, Users, MessageCirclePlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, Spinner, EmptyState, ErrorState, ConfirmDialog } from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';
import { translateApiError } from '../../i18n/errorMessages';

const CATEGORY_KEYS = [
  'question',
  'advice',
  'experience',
  'crop_problem',
  'irrigation',
  'soil',
  'equipment',
  'market_prices',
  'news',
  'general',
];

// Distinct visual treatment for the three post types the spec calls
// out by name (سؤال / نصيحة / تجربة من أرضي) — every other real
// category still renders, just falls back to the generic green badge
// + its normal category label instead of a dedicated one.
const POST_TYPE_TONE = { question: 'amber', advice: 'blue', experience: 'green' };
function postTypeLabel(category, t) {
  if (category === 'question' || category === 'advice' || category === 'experience') {
    return t(`community.postType.${category}`);
  }
  return t(`categories.${category}`);
}

/**
 * المجتمع — the agricultural community feed. Real API-backed only: no
 * post, comment, reaction, or follower count on this page is
 * fabricated — everything comes from /api/v1/community/* (see
 * agrismart-backend/src/modules/community). RTL/Arabic-first per the
 * Overnight Community task, section 15 — this page (and the rest of
 * src/pages/community, src/pages/equipment) is a SEPARATE, dir="rtl"
 * subtree from the existing English/LTR IoT screens, which are
 * untouched.
 */
export default function Feed() {
  const { user } = useAuth();
  const { t, formatRelativeTime, isRtl, locale } = useLocale();
  const [category, setCategory] = useState('');
  const [posts, setPosts] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [page, setPage] = useState(1);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerCategory, setComposerCategory] = useState('question');

  function openComposer(initialCategory) {
    setComposerCategory(initialCategory);
    setComposerOpen(true);
  }

  const loadFeed = useCallback(
    async (pageToLoad, append) => {
      try {
        const qs = new URLSearchParams({ page: String(pageToLoad), limit: '10' });
        if (category) qs.set('category', category);
        const { items, pagination: p } = await api.getPaginated(`/community/posts?${qs.toString()}`);
        setPosts((prev) => (append && prev ? [...prev, ...items] : items));
        setPagination(p);
        setLoadError('');
      } catch (err) {
        setLoadError(translateApiError(err, t) || t('community.errorLoading'));
      }
    },
    [category]
  );

  useEffect(() => {
    setPosts(null);
    setPage(1);
    loadFeed(1, false);
  }, [loadFeed, retryTick]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    loadFeed(next, true);
  }

  function handleCreated(post) {
    setPosts((prev) => (prev ? [post, ...prev] : [post]));
    setComposerOpen(false);
  }

  function handleDeleted(postId) {
    setPosts((prev) => (prev ? prev.filter((p) => p._id !== postId) : prev));
  }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`flex flex-col gap-4 ${isRtl ? 'text-right' : 'text-left'}`} lang={locale === 'en' ? 'en' : 'ar'}>
      {!composerOpen && (
        <div className="rounded-xl2 border border-brand-100 bg-brand-50/50 p-5">
          <div className="flex items-center gap-2 text-brand-700">
            <Users size={20} />
            <h1 className="text-lg font-extrabold text-slate-800">{t('community.heroTitle')}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">{t('community.heroSubtitle')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => openComposer('question')}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
            >
              <MessageCirclePlus size={15} /> {t('community.askFarmers')}
            </button>
            <button
              onClick={() => openComposer('experience')}
              className="rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50"
            >
              {t('community.shareExperience')}
            </button>
          </div>
        </div>
      )}

      {composerOpen && (
        <Composer
          initialCategory={composerCategory}
          onCreated={handleCreated}
          onCancel={() => setComposerOpen(false)}
        />
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <CategoryChip active={category === ''} onClick={() => setCategory('')} label={t('community.allCategories')} />
        {CATEGORY_KEYS.map((c) => (
          <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)} label={t(`categories.${c}`)} />
        ))}
      </div>

      {!posts && loadError && (
        <Card>
          <ErrorState
            title={t('community.errorLoading')}
            sub={loadError}
            onRetry={() => setRetryTick((n) => n + 1)}
            retryLabel={t('community.retry')}
          />
        </Card>
      )}
      {!posts && !loadError && <Spinner label={t('community.loading')} />}
      {posts && posts.length === 0 && (
        <Card>
          <EmptyState
            title={t('community.emptyFeed')}
            sub={t('community.emptyFeedSub')}
            action={
              !composerOpen && (
                <button
                  onClick={() => openComposer('question')}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
                >
                  {t('community.emptyFeedCta')}
                </button>
              )
            }
          />
        </Card>
      )}

      {posts && posts.length > 0 && (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <PostCard key={post._id} post={post} currentUserId={user?.id} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      {posts && pagination && pagination.hasNextPage && (
        <button
          onClick={loadMore}
          className="self-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          {t('community.loadMore')}
        </button>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${
        active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

// The three quick-pick categories a farmer reaches for most, matching
// the composer's spec. The full category list (crop_problem,
// irrigation, soil, equipment, market_prices, news, general) stays
// available in the select below — this row is a shortcut, not a
// replacement, so nothing narrower than what the API already accepts
// is lost. No photo/image button here: post.model.js has an
// `attachments` schema field but no real upload endpoint/UI wired to
// it yet, so a camera button would be a fake control — left out
// honestly rather than faking it.
const QUICK_CATEGORIES = [
  { key: 'question', emoji: '❓' },
  { key: 'experience', emoji: '🌱' },
  { key: 'advice', emoji: '💡' },
];

function Composer({ onCreated, onCancel, initialCategory = 'question' }) {
  const { t } = useLocale();
  const [body, setBody] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const post = await api.post('/community/posts', { body: body.trim(), category });
      setBody('');
      onCreated(post);
    } catch (err) {
      setError(translateApiError(err, t) || t('community.publishFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-base font-extrabold text-slate-800">{t('community.composerHeadline')}</h2>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_CATEGORIES.map((qc) => (
            <button
              key={qc.key}
              type="button"
              onClick={() => setCategory(qc.key)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                category === qc.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{qc.emoji}</span> {t(`community.postType.${qc.key}`)}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('community.whatsOnYourMind')}
          rows={3}
          maxLength={5000}
          className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <div className="flex items-center justify-between gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600"
          >
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">
              {t('community.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || !body.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {busy ? t('community.publishing') : t('community.publish')}
            </button>
          </div>
        </div>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}
      </form>
    </Card>
  );
}

function PostCard({ post, currentUserId, onDeleted }) {
  const { t, formatRelativeTime } = useLocale();
  const [reactionCount, setReactionCount] = useState(post.reactionCount);
  const [reacted, setReacted] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const isOwner = currentUserId && String(post.authorId) === String(currentUserId);

  async function toggleReaction() {
    try {
      const result = await api.post(`/community/posts/${post._id}/reactions`, { type: 'like' });
      setReacted(result.reacted);
      setReactionCount((c) => (result.reacted ? c + (reacted ? 0 : 1) : Math.max(0, c - 1)));
    } catch {
      // non-critical UI action — silently ignore a transient failure,
      // the button state simply doesn't change.
    }
  }

  async function handleDelete() {
    setBusyDelete(true);
    try {
      await api.delete(`/community/posts/${post._id}`);
      onDeleted(post._id);
    } catch {
      setBusyDelete(false);
      setConfirmDelete(false);
    }
  }

  async function handleReport() {
    try {
      await api.post('/moderation/reports', { targetType: 'post', targetId: post._id, reason: 'spam' });
      setReportSent(true);
    } catch {
      // already reported or transient failure — button just stops responding meaningfully
      setReportSent(true);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Badge tone={POST_TYPE_TONE[post.category] || 'green'}>{postTypeLabel(post.category, t)}</Badge>
          {post.category === 'question' && post.commentCount > 0 && (
            <Badge tone="blue">{t('community.hasReplies')}</Badge>
          )}
          <span className="me-2 text-[11px] text-slate-400">{formatRelativeTime(post.createdAt)}</span>
          <Link
            to={isOwner ? '/community/profile' : `/community/profile/${post.authorId}`}
            className="me-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-brand-600"
          >
            <User size={11} /> {t('community.viewProfile')}
          </Link>
        </div>
        {isOwner && (
          <button onClick={() => setConfirmDelete(true)} className="text-xs font-bold text-red-500 hover:underline">
            {t('community.delete')}
          </button>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{post.body}</p>

      <div className="mt-4 flex items-center gap-4 border-t border-slate-50 pt-3 text-xs font-semibold text-slate-500">
        <button onClick={toggleReaction} className={`flex items-center gap-1.5 ${reacted ? 'text-red-500' : ''}`}>
          <Heart size={15} fill={reacted ? 'currentColor' : 'none'} /> {reactionCount}
        </button>
        <button onClick={() => setCommentsOpen((v) => !v)} className="flex items-center gap-1.5">
          <MessageCircle size={15} /> {post.commentCount}
        </button>
        {!isOwner && (
          <button onClick={handleReport} disabled={reportSent} className="mr-auto flex items-center gap-1.5 disabled:opacity-50">
            <Flag size={14} /> {reportSent ? t('community.report') + ' ✓' : t('community.report')}
          </button>
        )}
      </div>

      {commentsOpen && <CommentsSection postId={post._id} />}

      {confirmDelete && (
        <ConfirmDialog
          title={t('community.deleteConfirmTitle')}
          confirmLabel={t('community.delete')}
          cancelLabel={t('community.cancel')}
          confirmTone="red"
          busy={busyDelete}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        >
          <div className="text-xs text-slate-500">{t('community.deleteConfirmBody')}</div>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function CommentsSection({ postId }) {
  const { t, formatRelativeTime } = useLocale();
  const [comments, setComments] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getPaginated(`/community/posts/${postId}/comments?limit=20`)
      .then(({ items }) => setComments(items))
      .catch((err) => setError(translateApiError(err, t) || t('community.commentsLoadFailed')));
  }, [postId]);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const comment = await api.post(`/community/posts/${postId}/comments`, { body: text.trim() });
      setComments((prev) => (prev ? [...prev, comment] : [comment]));
      setText('');
    } catch {
      // leave text as-is so the user can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-50 pt-3">
      {error && <div className="text-xs text-red-500">{error}</div>}
      {!comments && !error && <div className="text-xs text-slate-400">{t('community.loading')}</div>}
      {comments && comments.length === 0 && <div className="text-xs text-slate-400">{t('community.noCommentsYet')}</div>}
      {comments && comments.length > 0 && (
        <div className="flex flex-col gap-2">
          {comments.map((c) => (
            <div key={c._id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {c.body}
              <div className="mt-1 text-[10px] text-slate-400">{formatRelativeTime(c.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="mt-2 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('community.addComment')}
          maxLength={2000}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-brand-500"
        />
        <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-brand-600 p-1.5 text-white disabled:opacity-60">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
