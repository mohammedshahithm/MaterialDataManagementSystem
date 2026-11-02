import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, FolderArchive, HardDrive,
  Database, FileText, Settings, Cpu
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/batches', icon: Package, label: 'Batches' },
  { to: '/backup', icon: FolderArchive, label: 'Download History & Storage' },
  { to: '/storage', icon: HardDrive, label: 'Storage' },
  { to: '/audit-logs', icon: FileText, label: 'Audit Logs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white flex flex-col z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide">MDMS</h1>
            <p className="text-[10px] text-slate-400 leading-tight">Material Data Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation - Complete features for every factory operator */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Terminal Navigation
        </p>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <item.icon className="w-[18px] h-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Shared Terminal Status Indicator */}
      <div className="px-3 py-4 border-t border-slate-700/50 bg-slate-950/40">
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-sm">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate text-slate-100">
              Shared Factory Terminal
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              <p className="text-[10px] text-emerald-400 font-medium">Station Online · Full Access</p>
            </div>
          </div>
        </div>
        <p className="text-[9px] text-slate-500 px-2 mt-2 leading-tight">
          Internal Corporate Network
        </p>
      </div>
    </aside>
  );
}
