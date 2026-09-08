import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Sprout, Cpu, Droplets, BarChart3, Bell, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/farm', label: 'My Farm', icon: Sprout },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/irrigation', label: 'Irrigation', icon: Droplets },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ mobile = false, onNavigate }) {
  const { activeFarm, activeFarmId, farms, setActiveFarmId } = useAuth();

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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-brand-100 bg-white px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-card">
          <Sprout size={22} />
        </div>
        <div>
          <div className="text-lg font-extrabold leading-tight text-brand-900">AgriSmart</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-400">
            Smart Farming. Better Future.
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-600 text-white shadow-card' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 rounded-xl2 border border-brand-100 bg-brand-50/60 p-3">
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
