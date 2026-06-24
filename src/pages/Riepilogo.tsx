import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import type { TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { EmptyState } from "../components/EmptyState";

export default function Riepilogo() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
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
    else setRows((data ?? []) as TimesheetView[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [month, year]);

  const summary = useMemo(() => {
    const map = new Map<string, any>();
    rows.filter((r) => r.tipo_movimento === "Infragruppo fatturabile").forEach((r) => {
      const key = `${r.employer_company_id}-${r.beneficiary_company_id}-${r.business_area_id}`;
      const current = map.get(key) ?? {
        da: r.employer_company_code,
        a: r.beneficiary_company_code,
        area: r.codice_area,
        ore: 0,
        orePesate: 0,
        imponibile: 0,
      };
      current.ore += Number(r.ore ?? 0);
      current.orePesate += Number(r.ore_pesate ?? 0);
      current.imponibile += Number(r.importo_visibile ?? 0);
      map.set(key, current);
    });
    return Array.from(map.values()).map((r) => ({ ...r, iva: r.imponibile * 0.22, totale: r.imponibile * 1.22, stato: r.imponibile > 0 ? "Da emettere" : "Non necessaria" }));
  }, [rows]);

  return (
    <div>
      <PageHeader title="Riepilogo mese" subtitle="Prospetto approvato da usare prima delle fatture infragruppo." actions={<button className="button secondary" onClick={load}><RefreshCw size={16} /> Aggiorna</button>} />
      <div className="filters-bar">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
      </div>
      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Caricamento...</div>}
      <section className="panel">
        {summary.length === 0 ? <EmptyState title="Nessun importo infragruppo approvato" text="Il riepilogo usa solo righe Approvato e Infragruppo fatturabile." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Da società</th><th>A società</th><th>Area</th><th>Ore approvate</th><th>Ore pesate</th><th>Imponibile</th><th>IVA 22%</th><th>Totale lordo</th><th>Esito</th></tr></thead>
              <tbody>{summary.map((r) => <tr key={`${r.da}-${r.a}-${r.area}`}><td>{r.da}</td><td>{r.a}</td><td>{r.area}</td><td>{numberIt(r.ore)}</td><td>{numberIt(r.orePesate)}</td><td>{euro(r.imponibile)}</td><td>{euro(r.iva)}</td><td>{euro(r.totale)}</td><td>{r.stato}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
