import { useEffect, useMemo, useState } from "react";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../integrations/supabase/client";
import { euro, numberIt } from "../lib/format";
import { filterRowsByRole } from "../lib/kpiData";
import type { TimesheetView } from "../types/db";

function currentMonth() {
  return new Date().getMonth() + 1;
}

function currentYear() {
  return new Date().getFullYear();
}

function groupSum(rows: TimesheetView[], key: keyof TimesheetView) {
  const result = new Map<string, number>();
  rows.forEach((row) => {
    const label = String(row[key] ?? "Non assegnato");
    result.set(label, (result.get(label) ?? 0) + Number(row.ore ?? 0));
  });
  return Array.from(result.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

export default function Dashboard() {
  const { areaIds, user, isSuperAdmin, isAdminArea, canViewAmounts } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(currentYear());
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_timesheet_entries")
        .select("*")
        .eq("mese", month)
        .eq("anno", year)
        .order("data", { ascending: false });

      if (error) {
        console.error("Errore dashboard KPI", error);
        setRows([]);
      } else {
        setRows(filterRowsByRole((data ?? []) as TimesheetView[], areaIds, user?.email ?? null, isSuperAdmin, isAdminArea));
      }
      setLoading(false);
    }

    void loadRows();
  }, [areaIds, isAdminArea, isSuperAdmin, month, user?.email, year]);

  const totals = useMemo(() => {
    const ore = rows.reduce((sum, row) => sum + Number(row.ore ?? 0), 0);
    const orePesate = rows.reduce((sum, row) => sum + Number(row.ore_pesate ?? 0), 0);
    const importo = rows.reduce((sum, row) => sum + Number(row.importo_visibile ?? row.importo ?? 0), 0);
    const infragruppo = rows.filter((row) => row.tipo_movimento === "Infragruppo fatturabile");
    const interne = rows.filter((row) => row.tipo_movimento === "Interno non fatturabile");
    return {
      ore,
      orePesate,
      importo,
      oreInfragruppo: infragruppo.reduce((sum, row) => sum + Number(row.ore ?? 0), 0),
      importoInfragruppo: infragruppo.reduce((sum, row) => sum + Number(row.importo_visibile ?? row.importo ?? 0), 0),
      oreInterne: interne.reduce((sum, row) => sum + Number(row.ore ?? 0), 0),
      bozza: rows.filter((row) => row.stato === "Bozza").length,
      correzione: rows.filter((row) => row.stato === "Da correggere").length,
      approvate: rows.filter((row) => row.stato === "Approvato").length,
    };
  }, [rows]);

  const byArea = useMemo(() => groupSum(rows, "nome_area"), [rows]);
  const byEmployee = useMemo(() => groupSum(rows, "employee_name"), [rows]);
  const byActivity = useMemo(() => groupSum(rows, "nome_categoria"), [rows]);

  return (
    <section>
      <PageHeader
        title="Dashboard KPI"
        subtitle="Vista sintetica delle ore, dei movimenti infragruppo e delle attività per area."
        actions={
          <div className="filter-row compact-filter">
            <select className="input" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{String(item).padStart(2, "0")}</option>)}
            </select>
            <input className="input" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
          </div>
        }
      />

      <div className="kpi-grid">
        <KpiCard label="Ore totali" value={numberIt(totals.ore)} hint="Ore inserite nel mese" />
        <KpiCard label="Ore pesate" value={numberIt(totals.orePesate)} hint="Con coefficienti attività" />
        <KpiCard label="Infragruppo" value={numberIt(totals.oreInfragruppo)} hint="Ore fatturabili tra società" />
        <KpiCard label="Interne" value={numberIt(totals.oreInterne)} hint="Non fatturabili" />
        {canViewAmounts ? <KpiCard label="Importo infragruppo" value={euro(totals.importoInfragruppo)} hint="Solo righe visibili" /> : null}
        {canViewAmounts ? <KpiCard label="Totale valorizzato" value={euro(totals.importo)} hint="Ore x tariffa" /> : null}
        <KpiCard label="Bozze" value={totals.bozza} hint="Da completare" />
        <KpiCard label="Da correggere" value={totals.correzione} hint="Richiedono intervento" />
        <KpiCard label="Approvate" value={totals.approvate} hint="Pronte per riepilogo" />
      </div>

      {loading ? <div className="panel">Caricamento dashboard…</div> : rows.length === 0 ? <EmptyState title="Nessun dato nel periodo" text="Inserisci o importa ore approvate per popolare la dashboard." /> : (
        <div className="dashboard-grid">
          <SummaryPanel title="Ore per area" rows={byArea} />
          <SummaryPanel title="Ore per dipendente" rows={byEmployee} />
          <SummaryPanel title="Ore per attività" rows={byActivity} />
        </div>
      )}
    </section>
  );
}

function SummaryPanel({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="panel summary-panel">
      <h3>{title}</h3>
      <div className="summary-list">
        {rows.map(([label, value]) => (
          <div className="summary-row" key={label}>
            <span>{label}</span>
            <strong>{numberIt(value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
