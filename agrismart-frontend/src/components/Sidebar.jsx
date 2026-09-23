import { NavLink } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { LayoutDashboard, Sprout, Cpu, Droplets, BarChart3, Bell, Settings, Users, Tractor, UserCircle, Wrench, ShoppingBasket, BellRing, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';
import { useLocale } from '../i18n/LocaleContext';
import LanguageSwitcher from './LanguageSwitcher';

// Official AgriSmart logo asset — used as-is, not recreated. See
// BRAND.md for the token/asset documentation.
const LOGO_SRC = '/agrismart-logo.png';

// Nav keys resolve through t('nav.<key>') so every label follows the
// active locale (ar / ar-eg / en) instead of being hardcoded — see
// i18n/LocaleContext.jsx. Icons are direction-neutral (no arrows), so
// they don't need RTL mirroring.
const NAV_ITEMS = [
  { to: '/', key: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/farm', key: 'myFarm', icon: Sprout },
  { to: '/devices', key: 'devices', icon: Cpu },
  { to: '/irrigation', key: 'irrigation', icon: Droplets },
  { to: '/analytics', key: 'analytics', icon: BarChart3 },
  { to: '/alerts', key: 'alerts', icon: Bell },
  { to: '/settings', key: 'settings', icon: Settings },
];

// The Community + Marketplace layer's entry points. Previously hardcoded
// Arabic labels regardless of app locale; now resolved through the same
// t() as the rest of the sidebar so they follow ar / ar-eg / en too.
// Their destination pages still set their own dir="rtl" wrapper
// independently for now (see FINAL_REPORT's localization audit note —
// not yet migrated onto useLocale()'s app-wide dir).
const COMMUNITY_NAV_ITEMS = [
  { to: '/community', key: 'nav.community', icon: Users, end: true },
  { to: '/community/profile', key: 'community.myProfile', icon: UserCircle },
  { to: '/equipment', key: 'equipment.title', icon: Tractor },
  { to: '/services', key: 'services.title', icon: Wrench },
  { to: '/marketplace', key: 'marketplace.title', icon: ShoppingBasket },
  { to: '/notifications', key: 'notifications.title', icon: BellRing },
];

// Same staff check as Moderation.jsx's client-side gate (mirrors
// security/rbac.js's isCommunityStaff()) — only rendered as a nav
// entry for moderator/admin/super_admin accounts; a plain farmer never
// sees it, though the route itself also gates defensively.
const STAFF_ROLES = new Set(['moderator', 'admin', 'super_admin']);
const MODERATION_NAV_ITEM = { to: '/moderation', key: 'moderation.title', icon: ShieldAlert };

export default function Sidebar({ mobile = false, onNavigate }) {
  const { activeFarm, activeFarmId, farms, setActiveFarmId, user } = useAuth();
  const { t } = useLocale();

  // Unread community-notification count, polled every 30s — same
  // pattern as the rest of the app's polling (see src/hooks.js). Only
  // polls once a user session exists (no point hitting an authed
  // endpoint before login completes).
  const [unreadCount, setUnreadCount] = useState(0);
  const loadUnread = useCallback(async () => {
    if (!user) return;
    try {
      const { unreadCount: count } = await api.getNotifications('/notifications?limit=1');
      setUnreadCount(count);
    } catch {
      // transient failure — badge simply doesn't update this tick
    }
  }, [user]);
  usePolling(loadUnread, 30000, [loadUnread]);

  const badges = unreadCount > 0 ? { '/notifications': unreadCount } : {};

  if (mobile) {
    const MOBILE_ITEMS = NAV_ITEMS.slice(0, 4).concat(NAV_ITEMS[5]);
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-around border-t border-brand-100 bg-white/95 px-1 py-1.5 backdrop-blur md:hidden">
        {MOBILE_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium ${
                isActive ? 'text-brand-600' : 'text-slate-400'
              }`
            }
          >
            <item.icon size={20} strokeWidth={2} />
            {item.key === 'dashboard' ? t('nav.home') : t(`nav.${item.key}`)}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-e border-brand-100 bg-white px-4 py-7 md:flex">
      <div className="mb-9 flex items-center px-1">
        {/* Official logo — includes the AgriSmart wordmark + tagline
            baked into the asset itself, used as-is per brand guidelines. */}
        <img src={LOGO_SRC} alt="AgriSmart" className="h-16 w-auto object-contain" />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-300">{t('nav.monitor')}</div>
        {NAV_ITEMS.slice(0, 4).map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} t={t} />
        ))}

        <div className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-300">{t('nav.manage')}</div>
        {NAV_ITEMS.slice(4).map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} t={t} />
        ))}

        <div className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-300">{t('nav.community')}</div>
        {COMMUNITY_NAV_ITEMS.map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} badge={badges[item.to]} t={t} />
        ))}
        {user && STAFF_ROLES.has(user.role) && <NavItem item={MODERATION_NAV_ITEM} onNavigate={onNavigate} t={t} />}
      </nav>

      <LanguageSwitcher compact />

      <div className="mt-3 rounded-xl2 border border-brand-100 bg-brand-50/60 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-500">{t('nav.myFarm')}</div>
        {farms.length > 1 ? (
          <select
            value={activeFarmId || ''}
            onChange={(e) => setActiveFarmId(e.target.value)}
            className="mt-1 w-full truncate rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-sm font-bold text-brand-900"
          >
            {farms.map((f) => (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
          </select>
        ) : (
          <div className="mt-0.5 truncate text-sm font-bold text-brand-900">{activeFarm?.name || t('nav.farmFallback')}</div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-200 text-[11px] font-bold text-brand-800">
            {(activeFarm?.name || 'F').charAt(0)}
          </div>
          {t('nav.owner')}
        </div>
      </div>
    </aside>
  );
}

function NavItem({ item, onNavigate, badge, t }) {
  const label = item.key.includes('.') ? t(item.key) : t(`nav.${item.key}`);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-600 text-white shadow-card' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -start-4 h-5 w-1 rounded-e-full bg-brand-600" />}
          <item.icon size={18} />
          <span className="flex-1">{label}</span>
          {badge ? (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                isActive ? 'bg-white/25 text-white' : 'bg-red-500 text-white'
              }`}
            >
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}
