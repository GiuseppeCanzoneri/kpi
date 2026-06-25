import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Briefcase, Clock, FileSpreadsheet, ReceiptText, TrendingUp, Users } from "lucide-react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { filterRowsByRole } from "../lib/kpiData";

export default function Index() {
  const { isSuperAdmin, isAdminArea, areaIds, canViewAmounts, user } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;
  const [entries, setEntries] = useState<TimesheetView[]>([]);
  const [activeProjects, setActiveProjects] = useState(0);
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const [ts, projects, employees] = await Promise.all([
      supabase
        .from("v_timesheet_entries")
        .select("*")
        .eq("mese", now.getMonth() + 1)
        .eq("anno", now.getFullYear())
        .eq("stato", "Approvato"),
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("stato", "Aperta"),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("attivo", true),
    ]);

    if (!ts.error) {
      setEntries(filterRowsByRole((ts.data ?? []) as TimesheetView[], areaIds, user?.email?.toLowerCase() ?? null, isSuperAdmin, isAdminArea));
    }
    setActiveProjects(projects.count ?? 0);
    setActiveEmployees(employees.count ?? 0);
    setLoading(false);
  }, [areaIds, isAdminArea, isSuperAdmin, user?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const totalHours = entries.reduce((acc, curr) => acc + Number(curr.ore ?? 0), 0);
    const weightedHours = entries.reduce((acc, curr) => acc + Number(curr.ore_pesate ?? 0), 0);
    const totalAmount = entries.reduce((acc, curr) => acc + Number(curr.importo_visibile ?? 0), 0);
    const contested = entries.filter((e) => e.is_contested).length;
    return { totalHours, weightedHours, totalAmount, contested };
  }, [entries]);

  const chartData = useMemo(() => {
    const areaMap = new Map<string, number>();
    entries.forEach((e) => {
      const area = e.nome_area || e.codice_area || "N/A";
      areaMap.set(area, (areaMap.get(area) || 0) + Number(e.ore ?? 0));
    });
    return Array.from(areaMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [entries]);

  if (loading) return <div className="loading-card"><div className="spinner" /><strong>Caricamento dashboard...</strong></div>;

  return (
    <div>
      <div className="pro-header hero-dashboard">
        <div>
          <span className="eyebrow">Sistema operativo</span>
          <h2>Dashboard KPI</h2>
          <p>Panoramica veloce delle ore approvate, dei flussi infragruppo e dei dati pronti per report e fatturazione.</p>
        </div>
        <Link to="/timesheet" className="button xl">Inserisci ore <ArrowRight size={17} /></Link>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><Clock size={20} /><span>Ore approvate</span><strong>{numberIt(stats.totalHours)}</strong><small>{numberIt(stats.weightedHours)} ore pesate</small></div>
        {canViewAmounts && <div className="kpi-card"><TrendingUp size={20} /><span>Importo mese</span><strong>{euro(stats.totalAmount)}</strong><small>Valore economico</small></div>}
        <div className="kpi-card"><FileSpreadsheet size={20} /><span>Contestazioni</span><strong>{stats.contested}</strong><small>Non bloccano i calcoli</small></div>
        <div className="kpi-card"><Briefcase size={20} /><span>Commesse aperte</span><strong>{activeProjects}</strong><small>Archivio operativo</small></div>
        <div className="kpi-card"><Users size={20} /><span>Dipendenti attivi</span><strong>{activeEmployees}</strong><small>Risorse abilitate</small></div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div><h3>Distribuzione ore per area</h3><p>Solo ore approvate del mese corrente.</p></div></div>
          {chartData.length === 0 ? <div className="empty-state"><strong>Nessun dato</strong><p>Carica ore nel timesheet per alimentare il grafico.</p></div> : (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value) => numberIt(Number(value))} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="panel quick-panel">
          <div className="panel-header"><div><h3>Azioni rapide</h3><p>Accessi diretti alle funzioni principali.</p></div></div>
          <div className="quick-actions">
            <QuickLink to="/timesheet" title="Inserisci ore" text="Carica o correggi timesheet" icon={<Clock size={18} />} />
            {canAdmin && <QuickLink to="/riepilogo" title="Riepilogo mese" text="Controlla ore e importi" icon={<FileSpreadsheet size={18} />} />}
            {canAdmin && <QuickLink to="/fatture" title="Fatture infragruppo" text="Genera prospetti" icon={<ReceiptText size={18} />} />}
            <QuickLink to="/report" title="Report PDF" text="Esporta report periodo" icon={<FileSpreadsheet size={18} />} />
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickLink({ to, title, text, icon }: { to: string; title: string; text: string; icon: ReactNode }) {
  return (
    <Link to={to} className="quick-link">
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{text}</small>
      <ArrowRight size={15} />
    </Link>
  );
}
