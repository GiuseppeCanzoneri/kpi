import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { supabase } from "../integrations/supabase/client";
import type { TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { EmptyState } from "../components/EmptyState";

export default function Dashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .order("data", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as TimesheetView[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [month, year]);

  const kpi = useMemo(() => {
    const approved = rows.filter((r) => r.stato === "Approvato");
    const infragroup = approved.filter((r) => r.tipo_movimento === "Infragruppo fatturabile");
    return {
      oreTotali: sum(rows, "ore"),
      orePesate: sum(rows, "ore_pesate"),
      importo: rows.reduce((acc, r) => acc + Number(r.importo_visibile ?? 0), 0),
      oreInfragruppo: sum(infragroup, "ore"),
      importoInfragruppo: infragroup.reduce((acc, r) => acc + Number(r.importo_visibile ?? 0), 0),
      bozza: rows.filter((r) => r.stato === "Bozza").length,
      correggere: rows.filter((r) => r.stato === "Da correggere").length,
      approvate: approved.length,
      fatturate: rows.filter((r) => r.stato === "Fatturato").length,
      dipendenti: new Set(rows.map((r) => r.employee_id)).size,
      commesse: new Set(rows.map((r) => r.project_id)).size,
    };
  }, [rows]);

  const byArea = group(rows, "nome_area", "ore");
  const byEmployee = group(rows, "employee_name", "ore");
  const byCompany = group(rows, "beneficiary_company_code", "ore");
  const flows = group(rows.filter((r) => r.tipo_movimento === "Infragruppo fatturabile"), (r) => `${r.employer_company_code} → ${r.beneficiary_company_code}`, "ore");

  return (
    <div>
      <PageHeader
        title="Dashboard KPI"
        subtitle="Vista mensile ore, ore pesate e flussi infragruppo filtrati dai tuoi permessi."
        actions={<button className="button secondary" onClick={load}><RefreshCw size={16} /> Aggiorna</button>}
      />

      <div className="filters-bar">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Caricamento...</div>}

      <div className="kpi-grid">
        <KpiCard label="Ore totali" value={numberIt(kpi.oreTotali)} />
        <KpiCard label="Ore pesate" value={numberIt(kpi.orePesate)} />
        <KpiCard label="Importo visibile" value={euro(kpi.importo)} />
        <KpiCard label="Ore infragruppo approvate" value={numberIt(kpi.oreInfragruppo)} />
        <KpiCard label="Importo infragruppo" value={euro(kpi.importoInfragruppo)} />
        <KpiCard label="Bozze" value={kpi.bozza} />
        <KpiCard label="Da correggere" value={kpi.correggere} />
        <KpiCard label="Righe approvate" value={kpi.approvate} />
        <KpiCard label="Dipendenti" value={kpi.dipendenti} />
        <KpiCard label="Commesse" value={kpi.commesse} />
      </div>

      {rows.length === 0 ? <EmptyState title="Nessuna ora nel periodo" text="Inserisci ore nel timesheet o importa il modello Excel." /> : (
        <div className="dashboard-grid">
          <ChartPanel title="Ore per area" data={byArea} />
          <ChartPanel title="Ore per dipendente" data={byEmployee} />
          <ChartPanel title="Ore per società beneficiaria" data={byCompany} />
          <SummaryTable title="Flussi infragruppo" data={flows} />
        </div>
      )}
    </div>
  );
}

function sum(rows: TimesheetView[], key: keyof TimesheetView) {
  return rows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0);
}

function group(rows: TimesheetView[], key: keyof TimesheetView | ((row: TimesheetView) => string), valueKey: keyof TimesheetView) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const label = typeof key === "function" ? key(r) : String(r[key] ?? "N/D");
    m.set(label, (m.get(label) ?? 0) + Number(r[valueKey] ?? 0));
  });
  return Array.from(m, ([name, value]) => ({ name, value: Number(value.toFixed(2)) })).sort((a, b) => b.value - a.value);
}

function ChartPanel({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <section className="panel chart-panel">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data.slice(0, 10)} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-25} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="var(--primary)" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

function SummaryTable({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <table className="data-table compact">
        <thead><tr><th>Flusso</th><th>Ore</th></tr></thead>
        <tbody>{data.map((row) => <tr key={row.name}><td>{row.name}</td><td>{numberIt(row.value)}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
