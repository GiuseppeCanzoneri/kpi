"use client";

import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Info, 
  Building2, 
  BadgeDollarSign, 
  Users, 
  Briefcase, 
  ListTodo, 
  Clock, 
  FileText, 
  Receipt,
  LogOut,
  Shield,
  Database,
  PieChart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export const AppSidebar = () => {
  const location = useLocation();
  const { isSuperAdmin, isAdminArea, signOut, user, roles } = useAuth();

  const roleLabel = isSuperAdmin ? "SUPER_ADMIN" : isAdminArea ? "ADMIN_AREA" : "USER_AREA";

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Clock, label: 'Timesheet', path: '/timesheet' },
    { icon: ListTodo, label: 'Approvazioni', path: '/approvazioni', hidden: !isSuperAdmin && !isAdminArea },
    { icon: PieChart, label: 'Riepilogo Mese', path: '/riepilogo' },
    { icon: Receipt, label: 'Fatture Infragruppo', path: '/fatture', hidden: !isSuperAdmin },
    { icon: FileText, label: 'Report PDF', path: '/report' },
    { icon: Database, label: 'Anagrafiche', path: '/anagrafiche', hidden: !isSuperAdmin && !isAdminArea },
    { icon: Shield, label: 'Accessi & Ruoli', path: '/accessi', hidden: !isSuperAdmin && !isAdminArea },
    { icon: Info, label: 'Istruzioni', path: '/istruzioni' },
  ];

  return (
    <div className="sidebar">
      <div className="brand-card">
        <div className="brand-mark">K</div>
        <div>
          <h1>KPI Infragruppo</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Contabilità Ore</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">Menu Principale</div>
        <nav className="nav">
          {menuItems.filter(item => !item.hidden).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "nav-link",
                location.pathname === item.path && "active"
              )}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-auto pt-6 border-t border-slate-800 space-y-4">
        <div className="px-2">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Utente Attivo</div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-blue-400 border border-slate-700">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold truncate">{user?.email}</div>
              <div className="text-[10px] text-slate-400 font-medium">{roleLabel}</div>
            </div>
          </div>
        </div>
        
        <button 
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors text-sm font-medium"
        >
          <LogOut size={18} />
          <span>Esci dal sistema</span>
        </button>
      </div>
    </div>
  );
};