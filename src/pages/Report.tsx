import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import type { TimesheetView } from "../types/db";
import { generateTimesheetPdf } from "../lib/reportPdf";
import { downloadBlob } from "../lib/format";

export default function Report() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from("v_timesheet_entries").select("*").eq("mese", month).eq("anno", year).order("data", { ascending: false });
    if (status) query = query.eq("stato", status);
    const { data, error } = await query;
    if (error) setError(error.message);
    else setRows((data ?? []) as TimesheetView[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [month, year, status]);

  const exportPdf = () => {
    const doc = generateTimesheetPdf(rows, { month, year });
    doc.save(`Elenco_Ore_Registrate_${year}_${String(month).padStart(2, "0")}.pdf`);
  };

  const exportCsv = () => {
    const header = ["Data", "Utente", "Da società", "A società", "Commessa", "Area", "Centro costo", "Ore", "Ore pesate", "Tariffa", "Importo", "Categoria", "Descrizione", "Stato"];
    const csv = [header, ...rows.map((r) => [r.data, r.employee_name, r.employer_company_code, r.beneficiary_company_code, r.codice_commessa, r.codice_area, r.centro_costo ?? "", r.ore, r.ore_pesate, r.tariffa_oraria_visibile ?? "Riservato", r.importo_visibile ?? "Riservato", r.codice_attivita, r.descrizione ?? "", r.stato])]
      .map((line) => line.map((v) => `"${String(v).split('"').join('""')}"`).join(";"))
      .join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `Elenco_Ore_${year}_${month}.csv`);
  };

  return (
    <div>
      <PageHeader title="Report PDF" subtitle="Genera il report “Elenco Ore Registrate” da allegare alle fatture infragruppo." actions={<><button className="button secondary" onClick={load}><RefreshCw size={16} /> Aggiorna</button><button className="button" onClick={exportPdf} disabled={rows.length === 0}><Download size={16} /> PDF</button><button className="button secondary" onClick={exportCsv} disabled={rows.length === 0}>CSV</button></>} />
      <div className="filters-bar">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
        <label>Stato <select className="input small" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tutti</option><option>Bozza</option><option>Da correggere</option><option>Approvato</option><option>Fatturato</option></select></label>
      </div>
      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Caricamento...</div>}
      <section className="panel">
        <p><strong>{rows.length}</strong> righe pronte for il report.</p>
        <p className="muted">Il report rispetta la visibilità Supabase: SUPER_ADMIN globale, ADMIN_AREA sulle aree assegnate, USER_AREA personale.</p>
      </section>
    </div>
  );
}