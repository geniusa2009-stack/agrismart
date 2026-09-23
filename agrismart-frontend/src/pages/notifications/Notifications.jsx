import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { usePolling } from '../../hooks';
import { Card, Spinner, EmptyState, ErrorState } from '../../components/ui';
import { useLocale } from '../../i18n/LocaleContext';

// Deep-link destinations by notification type — the notification
// payload only carries ids (see notification.model.js's header
// comment), and the current tabbed pages don't support opening a
// specific item by id, so this links to the relevant TAB rather than
// a specific rental/request/post. Real navigation, not a fake link.
const TYPE_LINKS = {
  rental_requested: '/equipment',
  rental_accepted: '/equipment',
  rental_rejected: '/equipment',
  rental_cancelled: '/equipment',
  rental_completed: '/equipment',
  service_requested: '/services',
  service_accepted: '/services',
  service_rejected: '/services',
  service_completed: '/services',
  service_cancelled: '/services',
  new_comment: '/community',
  new_reaction: '/community',
  new_follower: '/community',
  moderation_action: '/community',
  review_received: '/equipment',
  marketplace_inquiry: '/marketplace',
};

/**
 * الإشعارات — polling-based (no WebSocket infrastructure exists, same
 * reasoning as the rest of this pass — see notification.model.js).
 * Real API-backed only against GET/PATCH /api/v1/notifications.
 */
export default function Notifications() {
  const { t, formatRelativeTime, isRtl, locale } = useLocale();
  const [items, setItems] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const { items: data, unreadCount: count } = await api.getNotifications('/notifications?limit=50');
      setItems(data);
      setUnreadCount(count);
      setError('');
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الإشعارات.');
    }
  }, []);

  usePolling(load, 30000, [load]);

  async function markRead(id) {
    try {
      await api.patch(`/notifications/${id}/read`, {});
      setItems((prev) => (prev ? prev.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)) : prev));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // transient failure — item just stays unread
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await api.patch('/notifications/read-all', {});
      setItems((prev) => (prev ? prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })) : prev));
      setUnreadCount(0);
    } catch {
      // transient failure — leave state as-is
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`flex flex-col gap-4 ${isRtl ? 'text-right' : 'text-left'}`} lang={locale === 'en' ? 'en' : 'ar'}>
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-800">
          <Bell size={20} />
          {t('notifications.title')}
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{unreadCount}</span>
          )}
        </h1>
        {items && items.length > 0 && unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <CheckCheck size={14} /> {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {!items && error && (
        <Card>
          <ErrorState title={t('common.error')} sub={error} onRetry={load} retryLabel={t('community.retry')} />
        </Card>
      )}
      {!items && !error && <Spinner label={t('community.loading')} />}
      {items && items.length === 0 && (
        <Card>
          <EmptyState title={t('notifications.empty')} sub={t('notifications.emptySub')} />
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((n) => (
            <NotificationRow key={n._id} notification={n} onRead={() => markRead(n._id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationRow({ notification, onRead }) {
  const { t, formatRelativeTime } = useLocale();
  const isUnread = !notification.readAt;
  const link = TYPE_LINKS[notification.type] || '/community';

  return (
    <Link
      to={link}
      onClick={() => {
        if (isUnread) onRead();
      }}
      className="block"
    >
      <Card className={isUnread ? 'border-brand-200 bg-brand-50/40' : ''}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
            <div className="text-sm font-semibold text-slate-700">
              {t(`notifications.types.${notification.type}`)}
            </div>
          </div>
          <span className="shrink-0 text-[11px] text-slate-400">{formatRelativeTime(notification.createdAt)}</span>
        </div>
      </Card>
    </Link>
  );
}
