import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileText, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { downloadTimesheetCsv, generateTimesheetPdf } from "../lib/reportPdf";
import { filterRowsByRole } from "../lib/kpiData";

export default function Report() {
  const { isSuperAdmin, isAdminArea, areaIds, user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyIntercompany, setOnlyIntercompany] = useState(false);
  const [includeContested, setIncludeContested] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .eq("stato", "Approvato")
      .order("data", { ascending: false });

    if (error) setError(error.message);
    else {
      const filteredByRole = filterRowsByRole((data ?? []) as TimesheetView[], areaIds, user?.email?.toLowerCase() ?? null, isSuperAdmin, isAdminArea);
      setRows(filteredByRole);
    }
    setLoading(false);
  }, [areaIds, isAdminArea, isSuperAdmin, month, user?.email, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (onlyIntercompany && r.tipo_movimento !== "Infragruppo fatturabile") return false;
    if (!includeContested && r.is_contested) return false;
    return true;
  }), [includeContested, onlyIntercompany, rows]);

  const totals = useMemo(() => ({
    ore: filteredRows.reduce((s, r) => s + Number(r.ore ?? 0), 0),
    orePesate: filteredRows.reduce((s, r) => s + Number(r.ore_pesate ?? 0), 0),
    importo: filteredRows.reduce((s, r) => s + Number(r.importo_visibile ?? 0), 0),
    contestate: filteredRows.filter((r) => r.is_contested).length,
  }), [filteredRows]);

  return (
    <div>
      <PageHeader
        title="Report PDF"
        description="Genera un PDF reale con il dettaglio delle ore e le descrizioni inserite dai dipendenti."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
            <button className="button secondary" onClick={() => downloadTimesheetCsv(filteredRows, `report-ore-${month}-${year}.csv`)} disabled={filteredRows.length === 0}><Download size={16} /> CSV</button>
            <button className="button" onClick={() => generateTimesheetPdf(filteredRows, { month, year }).save(`Report_ore_${year}_${String(month).padStart(2, "0")}.pdf`)} disabled={filteredRows.length === 0}><FileText size={16} /> Genera PDF</button>
          </>
        }
      />

      <div className="kpi-grid small">
        <div className="kpi-card"><span>Righe report</span><strong>{filteredRows.length}</strong><small>Filtrate</small></div>
        <div className="kpi-card"><span>Ore</span><strong>{numberIt(totals.ore)}</strong><small>{numberIt(totals.orePesate)} pesate</small></div>
        <div className="kpi-card"><span>Importo</span><strong>{euro(totals.importo)}</strong><small>{totals.contestate} contestate</small></div>
      </div>

      <div className="filters-bar pro-filters">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
        <label className="check-inline"><input type="checkbox" checked={onlyIntercompany} onChange={(e) => setOnlyIntercompany(e.target.checked)} /> Solo infragruppo</label>
        <label className="check-inline"><input type="checkbox" checked={includeContested} onChange={(e) => setIncludeContested(e.target.checked)} /> Includi contestate</label>
      </div>

      {error && <div className="alert error"><AlertTriangle size={16} /> {error}</div>}
      {loading && <div className="loading">Caricamento...</div>}

      {filteredRows.length === 0 ? (
        <EmptyState title="Nessun dato esportabile" text="Modifica i filtri oppure verifica che esistano ore approvate nel periodo selezionato." />
      ) : (
        <div className="table-wrap elevated-table">
          <table className="data-table compact">
            <thead><tr><th>Data</th><th>Dipendente</th><th>Da società</th><th>A società</th><th>Area</th><th>Commessa</th><th>Attività</th><th>Ore</th><th>Importo</th><th>Stato</th></tr></thead>
            <tbody>
              {filteredRows.slice(0, 120).map((r) => (
                <tr key={r.id} className={r.is_contested ? "row-contested" : undefined}>
                  <td>{r.data}</td>
                  <td>{r.employee_name}</td>
                  <td>{r.employer_company_code}</td>
                  <td>{r.beneficiary_company_code}</td>
                  <td>{r.codice_area}</td>
                  <td>{r.codice_commessa}</td>
                  <td>{r.codice_attivita}</td>
                  <td>{numberIt(r.ore)}</td>
                  <td>{r.importo_visibile === null ? "Riservato" : euro(r.importo_visibile)}</td>
                  <td>{r.is_contested ? <span className="status-pill da-correggere">Contestata</span> : <span className="status-pill approvato">Approvato</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length > 120 && <div className="alert warning mt">Anteprima limitata a 120 righe. Il PDF include comunque tutte le righe filtrate.</div>}
        </div>
      )}
    </div>
  );
}
