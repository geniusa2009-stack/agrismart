import { NavLink } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { LayoutDashboard, Sprout, Cpu, Droplets, BarChart3, Bell, Settings, Users, Tractor, UserCircle, Wrench, ShoppingBasket, BellRing, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { usePolling } from '../hooks';

// Official AgriSmart logo asset — used as-is, not recreated. See
// BRAND.md for the token/asset documentation.
const LOGO_SRC = '/agrismart-logo.png';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/farm', label: 'My Farm', icon: Sprout },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/irrigation', label: 'Irrigation', icon: Droplets },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// The new Community + Marketplace layer's entry points — Arabic labels
// deliberately, even inside this otherwise-English sidebar (Overnight
// Community task, section 15: "All user-facing community text should
// be Arabic"). Their destination pages are a separate dir="rtl"
// subtree; only the nav labels themselves live in the LTR sidebar.
const COMMUNITY_NAV_ITEMS = [
  { to: '/community', label: 'المجتمع', icon: Users, end: true },
  { to: '/community/profile', label: 'ملفي الشخصي', icon: UserCircle },
  { to: '/equipment', label: 'تأجير المعدات', icon: Tractor },
  { to: '/services', label: 'الخدمات الزراعية', icon: Wrench },
  { to: '/marketplace', label: 'السوق الزراعي', icon: ShoppingBasket },
  { to: '/notifications', label: 'الإشعارات', icon: BellRing },
];

// Same staff check as Moderation.jsx's client-side gate (mirrors
// security/rbac.js's isCommunityStaff()) — only rendered as a nav
// entry for moderator/admin/super_admin accounts; a plain farmer never
// sees it, though the route itself also gates defensively.
const STAFF_ROLES = new Set(['moderator', 'admin', 'super_admin']);
const MODERATION_NAV_ITEM = { to: '/moderation', label: 'قائمة الإشراف', icon: ShieldAlert };

export default function Sidebar({ mobile = false, onNavigate }) {
  const { activeFarm, activeFarmId, farms, setActiveFarmId, user } = useAuth();

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
            {item.label === 'Dashboard' ? 'Home' : item.label}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-brand-100 bg-white px-4 py-7 md:flex">
      <div className="mb-9 flex items-center px-1">
        {/* Official logo — includes the AgriSmart wordmark + tagline
            baked into the asset itself, used as-is per brand guidelines. */}
        <img src={LOGO_SRC} alt="AgriSmart" className="h-16 w-auto object-contain" />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-300">Monitor</div>
        {NAV_ITEMS.slice(0, 4).map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}

        <div className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-300">Manage</div>
        {NAV_ITEMS.slice(4).map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}

        <div className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-300">Community</div>
        {COMMUNITY_NAV_ITEMS.map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} badge={badges[item.to]} />
        ))}
        {user && STAFF_ROLES.has(user.role) && <NavItem item={MODERATION_NAV_ITEM} onNavigate={onNavigate} />}
      </nav>

      <div className="mt-3 rounded-xl2 border border-brand-100 bg-brand-50/60 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-500">Farm</div>
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
          <div className="mt-0.5 truncate text-sm font-bold text-brand-900">{activeFarm?.name || 'No farm yet'}</div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-200 text-[11px] font-bold text-brand-800">
            {(activeFarm?.name || 'F').charAt(0)}
          </div>
          Owner
        </div>
      </div>
    </aside>
  );
}

function NavItem({ item, onNavigate, badge }) {
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
          {isActive && <span className="absolute -left-4 h-5 w-1 rounded-r-full bg-brand-600" />}
          <item.icon size={18} />
          <span className="flex-1">{item.label}</span>
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
