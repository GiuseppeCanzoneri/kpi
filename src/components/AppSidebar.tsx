"use client";

import React from 'react';
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
  ReceiptItalianLira,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Info, label: 'Istruzioni', path: '/istruzioni' },
  { icon: Building2, label: 'Società', path: '/societa' },
  { icon: BadgeDollarSign, label: 'Profili & Tariffe', path: '/profili-tariffe' },
  { icon: Users, label: 'Dipendenti', path: '/dipendenti' },
  { icon: Briefcase, label: 'Commesse', path: '/commesse' },
  { icon: ListTodo, label: 'Attività', path: '/attivita' },
  { icon: Clock, label: 'Timesheet', path: '/timesheet' },
  { icon: FileText, label: 'Riepilogo Mese', path: '/riepilogo-mese' },
  { icon: ReceiptItalianLira, label: 'Fatture Infragruppo', path: '/fatture-infragruppo' },
];

export const AppSidebar = () => {
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="w-64 bg-slate-900 text-white h-screen flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-blue-400">KPI Infragruppo</h1>
        <p className="text-xs text-slate-400 mt-1">Contabilità Ore Tecnica</p>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {menuItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                  location.pathname === item.path 
                    ? "bg-blue-600 text-white" 
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-slate-300 hover:bg-red-900/30 hover:text-red-400 transition-colors text-sm"
        >
          <LogOut size={18} />
          <span>Esci</span>
        </button>
      </div>
    </div>
  );
};