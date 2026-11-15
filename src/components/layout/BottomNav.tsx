import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Route,
  Zap,
  BarChart3,
  Settings,
} from 'lucide-react';

const items: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/trips', label: 'Trips', icon: Route },
  { to: '/charging', label: 'Charging', icon: Zap },
  { to: '/analysis', label: 'Analysis', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-elevated bg-surface/95 backdrop-blur-md safe-bottom">
      <ul className="flex items-stretch justify-around max-w-lg mx-auto px-1 py-1.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl text-[10px] font-medium transition-colors ${
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <Icon size={20} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
