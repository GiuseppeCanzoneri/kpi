import { useEffect, useMemo, useState } from "react";
import { FilePlus2, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import type { Company, IntercompanyInvoice, TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { EmptyState } from "../components/EmptyState";
import { useAuth } from "../hooks/useAuth";

export default function Fatture() {
  const { isSuperAdmin } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [invoices, setInvoices] = useState<IntercompanyInvoice[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [approvedRows, setApprovedRows] = useState<TimesheetView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [inv, comp, ts] = await Promise.all([
      supabase.from("intercompany_invoices").select("*").eq("mese", month).eq("anno", year),
      supabase.from("companies").select("*"),
      supabase.from("v_timesheet_entries").select("*").eq("mese", month).eq("anno", year).eq("stato", "Approvato").eq("tipo_movimento", "Infragruppo fatturabile"),
    ]);
    const firstError = inv.error || comp.error || ts.error;
    if (firstError) setError(firstError.message);
    setInvoices((inv.data ?? []) as IntercompanyInvoice[]);
    setCompanies((comp.data ?? []) as Company[]);
    setApprovedRows((ts.data ?? []) as TimesheetView[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [month, year]);

  const suggestions = useMemo(() => {
    const m = new Map<string, { employer: string; beneficiary: string; imponibile: number; ore: number }>();
    approvedRows.forEach((r) => {
      const key = `${r.employer_company_id}-${r.beneficiary_company_id}`;
      const current = m.get(key) ?? { employer: r.employer_company_id, beneficiary: r.beneficiary_company_id, imponibile: 0, ore: 0 };
      current.imponibile += Number(r.importo_visibile ?? 0);
      current.ore += Number(r.ore ?? 0);
      m.set(key, current);
    });
    return Array.from(m.values()).filter((s) => !invoices.some((i) => i.employer_company_id === s.employer && i.beneficiary_company_id === s.beneficiary));
  }, [approvedRows, invoices]);

  const companyCode = (id: string) => companies.find((c) => c.id === id)?.codice_societa ?? id;

  const createInvoices = async () => {
    if (!isSuperAdmin) return;
    const payload = suggestions.map((s) => ({
      employer_company_id: s.employer,
      beneficiary_company_id: s.beneficiary,
      mese: month,
      anno: year,
      imponibile: Number(s.imponibile.toFixed(2)),
      iva: Number((s.imponibile * 0.22).toFixed(2)),
      totale: Number((s.imponibile * 1.22).toFixed(2)),
      stato: s.imponibile > 0 ? "Da emettere" : "Non necessaria",
      note: `Prestazioni di servizi tecnici infragruppo - ${month}/${year} - come da report ore allegato`,
    }));
    const { error } = await supabase.from("intercompany_invoices").insert(payload);
    if (error) setError(error.message);
    else await load();
  };

  const updateStatus = async (invoice: IntercompanyInvoice, stato: string) => {
    const { error } = await supabase.from("intercompany_invoices").update({ stato }).eq("id", invoice.id);
    if (error) setError(error.message);
    else await load();
  };

  return (
    <div>
      <PageHeader title="Fatture infragruppo" subtitle="Prospetto interno per emissione fatture. Non genera XML fattura elettronica." actions={<><button className="button secondary" onClick={load}><RefreshCw size={16} /> Aggiorna</button>{isSuperAdmin && suggestions.length > 0 && <button className="button" onClick={createInvoices}><FilePlus2 size={16} /> Crea prospetti</button>}</>} />
      <div className="filters-bar">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
      </div>
      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Caricamento...</div>}

      {suggestions.length > 0 && <div className="alert">Ci sono {suggestions.length} flussi approvati non ancora trasformati in prospetto fattura.</div>}

      <section className="panel">
        {invoices.length === 0 ? <EmptyState title="Nessun prospetto fattura" text="Crea i prospetti partendo dalle righe approvate infragruppo." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Società emittente</th><th>Società destinataria</th><th>Competenza</th><th>Imponibile</th><th>IVA</th><th>Totale</th><th>Numero fattura</th><th>Data fattura</th><th>Stato</th></tr></thead>
              <tbody>{invoices.map((i) => <tr key={i.id}><td>{companyCode(i.employer_company_id)}</td><td>{companyCode(i.beneficiary_company_id)}</td><td>{i.mese}/{i.anno}</td><td>{euro(i.imponibile)}</td><td>{euro(i.iva)}</td><td>{euro(i.totale)}</td><td>{i.numero_fattura ?? <span className="muted">—</span>}</td><td>{i.data_fattura ?? <span className="muted">—</span>}</td><td>{isSuperAdmin ? <select className="input small" value={i.stato} onChange={(e) => updateStatus(i, e.target.value)}><option>Non necessaria</option><option>Da emettere</option><option>Emessa</option><option>Pagata</option></select> : i.stato}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
      <div className="muted mt">Ore approvate infragruppo del periodo: {numberIt(approvedRows.reduce((a, r) => a + Number(r.ore ?? 0), 0))}</div>
    </div>
  );
}
