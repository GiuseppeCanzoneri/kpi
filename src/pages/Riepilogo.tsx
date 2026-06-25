import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../integrations/supabase/client";
import type { MonthlySummaryLive } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { printMonthlySummaryReport } from "../lib/reportPdf";

type AggregateRow = {
  key: string;
  employer_company_id: string;
  beneficiary_company_id: string;
  business_area_id: string;
  da: string;
  a: string;
  area: string;
  ore: number;
  orePesate: number;
  imponibile: number;
  iva: number;
  totale: number;
  righe: number;
  contestazioni: boolean;
};

export default function Riepilogo() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<MonthlySummaryLive[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshingDb, setRefreshingDb] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("v_kpi_monthly_summary_live")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .order("employer_company_code", { ascending: true })
      .order("beneficiary_company_code", { ascending: true })
      .order("codice_area", { ascending: true });

    if (error) setError(error.message);
    else setRows((data ?? []) as MonthlySummaryLive[]);
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo<AggregateRow[]>(() => {
    const map = new Map<string, AggregateRow>();
    rows.forEach((r) => {
      const key = `${r.employer_company_id}-${r.beneficiary_company_id}-${r.business_area_id}`;
      const current = map.get(key) ?? {
        key,
        employer_company_id: r.employer_company_id,
        beneficiary_company_id: r.beneficiary_company_id,
        business_area_id: r.business_area_id,
        da: r.employer_company_code ?? r.employer_company_name ?? "—",
        a: r.beneficiary_company_code ?? r.beneficiary_company_name ?? "—",
        area: r.codice_area ?? r.nome_area ?? "—",
        ore: 0,
        orePesate: 0,
        imponibile: 0,
        iva: 0,
        totale: 0,
        righe: 0,
        contestazioni: false,
      };
      current.ore += Number(r.ore_totali ?? 0);
      current.orePesate += Number(r.ore_pesate_totali ?? 0);
      current.imponibile += Number(r.imponibile ?? 0);
      current.iva += Number(r.iva ?? 0);
      current.totale += Number(r.totale_lordo ?? 0);
      current.righe += Number(r.numero_righe ?? 0);
      current.contestazioni = current.contestazioni || Boolean(r.contiene_contestazioni);
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => `${a.da}${a.a}${a.area}`.localeCompare(`${b.da}${b.a}${b.area}`));
  }, [rows]);

  const totals = useMemo(() => ({
    ore: summary.reduce((a, r) => a + r.ore, 0),
    orePesate: summary.reduce((a, r) => a + r.orePesate, 0),
    imponibile: summary.reduce((a, r) => a + r.imponibile, 0),
    iva: summary.reduce((a, r) => a + r.iva, 0),
    totale: summary.reduce((a, r) => a + r.totale, 0),
    contestazioni: summary.filter((r) => r.contestazioni).length,
  }), [summary]);

  const refreshDb = async () => {
    setRefreshingDb(true);
    setError(null);
    const { error } = await supabase.rpc("kpi_refresh_monthly_summaries", { p_mese: month, p_anno: year });
    setRefreshingDb(false);
    if (error) setError(error.message);
    else await load();
  };

  return (
    <div>
      <PageHeader
        title="Riepilogo mese"
        description="Riepilogo live delle ore approvate. Non dipende più da una tabella vuota: legge direttamente dai timesheet approvati."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
            <button className="button secondary" onClick={() => void refreshDb()} disabled={refreshingDb}><RefreshCw size={16} /> {refreshingDb ? "Rigenero..." : "Rigenera DB"}</button>
            <button className="button" onClick={() => printMonthlySummaryReport(summary, { month, year })} disabled={summary.length === 0}><FileText size={16} /> PDF</button>
          </>
        }
      />

      <div className="kpi-grid">
        <div className="kpi-card"><span>Ore approvate</span><strong>{numberIt(totals.ore)}</strong><small>Mese {month}/{year}</small></div>
        <div className="kpi-card"><span>Ore pesate</span><strong>{numberIt(totals.orePesate)}</strong><small>Coefficienti applicati</small></div>
        <div className="kpi-card"><span>Imponibile</span><strong>{euro(totals.imponibile)}</strong><small>Base fatturabile</small></div>
        <div className="kpi-card"><span>IVA</span><strong>{euro(totals.iva)}</strong><small>Calcolo 22%</small></div>
        <div className="kpi-card"><span>Contestazioni</span><strong>{totals.contestazioni}</strong><small>Incluse nel riepilogo</small></div>
      </div>

      <div className="filters-bar pro-filters">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
        <div className="filters-summary"><strong>{summary.length}</strong> flussi · <strong>{euro(totals.totale)}</strong> totale lordo</div>
      </div>

      {error && <div className="alert error"><AlertTriangle size={16} /> {error}</div>}
      {loading && <div className="loading">Caricamento...</div>}

      {summary.length === 0 ? (
        <EmptyState title="Nessun dato per il mese selezionato" text="Se hai caricato ore, verifica di aver lanciato lo script SQL e che i timesheet siano Approvato." />
      ) : (
        <div className="table-wrap elevated-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Da società</th><th>A società</th><th>Area</th><th>Righe</th><th>Ore approvate</th><th>Ore pesate</th><th>Imponibile</th><th>IVA 22%</th><th>Totale lordo</th><th>Note</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.key} className={r.contestazioni ? "row-contested" : undefined}>
                  <td><strong>{r.da}</strong></td>
                  <td>{r.a}</td>
                  <td>{r.area}</td>
                  <td>{r.righe}</td>
                  <td>{numberIt(r.ore)}</td>
                  <td>{numberIt(r.orePesate)}</td>
                  <td>{euro(r.imponibile)}</td>
                  <td>{euro(r.iva)}</td>
                  <td><strong>{euro(r.totale)}</strong></td>
                  <td>{r.contestazioni ? <span className="status-pill da-correggere">Contiene contestazioni</span> : <span className="status-pill approvato">OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
