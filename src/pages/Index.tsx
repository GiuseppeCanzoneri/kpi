"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { LayoutDashboard, Users, Briefcase, Clock, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { euro, numberIt } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const Index = () => {
  const { isSuperAdmin, isAdminArea, areaIds, canViewAmounts } = useAuth();
  const [stats, setStats] = useState({
    totalHours: 0,
    weightedHours: 0,
    totalAmount: 0,
    pendingApprovals: 0,
    activeProjects: 0,
    activeEmployees: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Base query for timesheet entries
      let query = supabase.from('v_timesheet_entries').select('*');
      
      // Apply role-based filters
      if (!isSuperAdmin && isAdminArea) {
        query = query.in('business_area_id', areaIds);
      } else if (!isSuperAdmin && !isAdminArea) {
        // User area - only their own
        const { data: { user } } = await supabase.auth.getUser();
        if (user) query = query.eq('employee_email', user.email);
      }

      const { data: entries, error } = await query;

      if (entries) {
        const totalHours = entries.reduce((acc, curr) => acc + Number(curr.ore), 0);
        const weightedHours = entries.reduce((acc, curr) => acc + Number(curr.ore_pesate), 0);
        const totalAmount = entries.reduce((acc, curr) => acc + Number(curr.importo_visibile || 0), 0);
        const pendingApprovals = entries.filter(e => e.stato === 'Bozza' || e.stato === 'Da correggere').length;
        
        const uniqueProjects = new Set(entries.map(e => e.project_id)).size;
        const uniqueEmployees = new Set(entries.map(e => e.employee_id)).size;

        setStats({
          totalHours,
          weightedHours,
          totalAmount,
          pendingApprovals,
          activeProjects: uniqueProjects,
          activeEmployees: uniqueEmployees
        });

        // Group by area for chart
        const areaMap = new Map();
        entries.forEach(e => {
          const area = e.nome_area || 'N/A';
          areaMap.set(area, (areaMap.get(area) || 0) + Number(e.ore));
        });
        
        setChartData(Array.from(areaMap, ([name, value]) => ({ name, value })));
      }
      setLoading(false);
    };

    fetchData();
  }, [isSuperAdmin, isAdminArea, areaIds]);

  if (loading) return <div className="p-8 text-center text-muted">Caricamento dashboard...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Panoramica KPI e Contabilità Ore Infragruppo</p>
        </div>
        <div className="flex gap-2">
          <div className="status-pill">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-2"></span>
            Sistema Online
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <span>Ore Totali</span>
          <strong>{numberIt(stats.totalHours)}</strong>
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Clock size={12} /> {numberIt(stats.weightedHours)} ore pesate
          </div>
        </div>
        {canViewAmounts && (
          <div className="kpi-card">
            <span>Importo Totale</span>
            <strong className="text-blue-600">{euro(stats.totalAmount)}</strong>
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <TrendingUp size={12} /> Valore economico
            </div>
          </div>
        )}
        <div className="kpi-card">
          <span>Da Approvare</span>
          <strong className={stats.pendingApprovals > 0 ? "text-amber-600" : ""}>
            {stats.pendingApprovals}
          </strong>
          <div className="text-xs text-slate-400">Righe in attesa</div>
        </div>
        <div className="kpi-card">
          <span>Commesse</span>
          <strong>{stats.activeProjects}</strong>
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Briefcase size={12} /> Progetti attivi
          </div>
        </div>
        <div className="kpi-card">
          <span>Dipendenti</span>
          <strong>{stats.activeEmployees}</strong>
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Users size={12} /> Risorse coinvolte
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel">
          <h3 className="text-lg font-bold mb-6">Distribuzione Ore per Area</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <h3 className="text-lg font-bold mb-6">Azioni Rapide</h3>
          <div className="grid grid-cols-2 gap-4">
            <a href="/timesheet" className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Clock size={20} />
              </div>
              <div className="font-bold text-sm">Inserisci Ore</div>
              <div className="text-xs text-slate-400">Compila il tuo timesheet</div>
            </a>
            {(isSuperAdmin || isAdminArea) && (
              <a href="/approvazioni" className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <LayoutDashboard size={20} />
                </div>
                <div className="font-bold text-sm">Approva Ore</div>
                <div className="text-xs text-slate-400">Gestisci le richieste</div>
              </a>
            )}
            <a href="/report" className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <TrendingUp size={20} />
              </div>
              <div className="font-bold text-sm">Reportistica</div>
              <div className="text-xs text-slate-400">Esporta dati in PDF/CSV</div>
            </a>
            {isSuperAdmin && (
              <a href="/anagrafiche" className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group">
                <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center mb-3 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                  <Users size={20} />
                </div>
                <div className="font-bold text-sm">Anagrafiche</div>
                <div className="text-xs text-slate-400">Gestione database</div>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;