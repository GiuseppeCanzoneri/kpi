import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FilePlus2, RefreshCw, Download } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import type { IntercompanyInvoiceView, InvoiceStatus, MonthlySummaryLive, TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { useAuth } from "../hooks/useAuth";
import { printInvoicesReport, printTimesheetReport } from "../lib/reportPdf";

const invoiceStatuses: InvoiceStatus[] = ["Non necessaria", "Da emettere", "Emessa", "Pagata"];

type CandidateFlow = {
  key: string;
  da: string;
  a: string;
  imponibile: number;
  ore: number;
};

export default function Fatture() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const canManage = isSuperAdmin || isAdminArea;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [invoices, setInvoices] = useState<IntercompanyInvoiceView[]>([]);
  const [liveRows, setLiveRows] = useState<MonthlySummaryLive[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [inv, live] = await Promise.all([
      supabase
        .from("v_intercompany_invoices")
        .select("*")
        .eq("mese", month)
        .eq("anno", year)
        .order("employer_company_code", { ascending: true }),
      supabase
        .from("v_kpi_monthly_summary_live")
        .select("*")
        .eq("mese", month)
        .eq("anno", year),
    ]);

    const firstError = inv.error || live.error;
    if (firstError) setError(firstError.message);
    setInvoices((inv.data ?? []) as IntercompanyInvoiceView[]);
    setLiveRows((live.data ?? []) as MonthlySummaryLive[]);
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const candidateFlows = useMemo(() => {
    const map = new Map<string, CandidateFlow>();

    liveRows.forEach((r) => {
      if (r.employer_company_id === r.beneficiary_company_id) return;
      const key = `${r.employer_company_id}-${r.beneficiary_company_id}`;
      const current = map.get(key) ?? {
        key,
        da: r.employer_company_code ?? r.employer_company_name ?? "—",
        a: r.beneficiary_company_code ?? r.beneficiary_company_name ?? "—",
        imponibile: 0,
        ore: 0,
      };
      current.imponibile += Number(r.imponibile ?? 0);
      current.ore += Number(r.ore_totali ?? 0);
      map.set(key, current);
    });

    return Array.from(map.values()).filter((r) => r.imponibile > 0);
  }, [liveRows]);

  const totals = useMemo(
    () => ({
      imponibile: invoices.reduce((sum, i) => sum + Number(i.imponibile ?? 0), 0),
      iva: invoices.reduce((sum, i) => sum + Number(i.iva ?? 0), 0),
      totale: invoices.reduce((sum, i) => sum + Number(i.totale ?? 0), 0),
    }),
    [invoices],
  );

  const generateInvoices = async () => {
    if (!canManage) return;
    setGenerating(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.rpc("kpi_generate_intercompany_invoices", {
      p_mese: month,
      p_anno: year,
    });

    if (error) {
      setGenerating(false);
      setError(error.message);
      return;
    }

    setGenerating(false);
    setMessage(`Fatture generate/aggiornate con successo. Ora puoi scaricare i PDF.`);
    await load();
  };

  const updateStatus = async (invoice: IntercompanyInvoiceView, stato: InvoiceStatus) => {
    setError(null);
    setMessage(null);

    const { error } = await supabase.rpc("kpi_set_invoice_status", {
      p_invoice_id: invoice.id,
      p_stato: stato,
      p_numero_fattura: null,
      p_data_fattura: null,
      p_note: null,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(`Stato aggiornato.`);
    await load();
  };

  const generateSingleInvoicePdf = async (invoice: IntercompanyInvoiceView) => {
    setExportingPdf(true);
    setError(null);

    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .eq("mese", invoice.mese)
      .eq("anno", invoice.anno)
      .eq("stato", "Approvato")
      .order("data", { ascending: true });

    setExportingPdf(false);

    if (error) {
      setError(error.message);
      return;
    }

    const details = ((data ?? []) as TimesheetView[]).filter(
      (r) =>
        r.employer_company_id === invoice.employer_company_id &&
        r.beneficiary_company_id === invoice.beneficiary_company_id &&
        r.tipo_movimento === "Infragruppo fatturabile",
    );

    printInvoicesReport([invoice], { month: invoice.mese, year: invoice.anno });

    if (details.length > 0) {
      printTimesheetReport(details, {
        month: invoice.mese,
        year: invoice.anno,
        title: `Dettaglio ore - ${invoice.employer_company_code ?? "Da"} → ${invoice.beneficiary_company_code ?? "A"}`,
      });
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Fatture infragruppo"
        description="Genera i prospetti per le prestazioni tra società diverse. Una volta generati, puoi scaricare il riepilogo totale o i singoli dettagli."
        actions={
          <div className="actions-row">
            <button className="button secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={16} />
              Aggiorna
            </button>
            <button className="button" onClick={() => void generateInvoices()} disabled={!canManage || generating || candidateFlows.length === 0}>
              <FilePlus2 size={16} />
              {generating ? "Generazione in corso..." : "Genera fatture"}
            </button>
            {invoices.length > 0 && (
              <button className="button secondary" onClick={() => printInvoicesReport(invoices, { month, year })}>
                <Download size={16} />
                Scarica tutto (Riepilogo)
              </button>
            )}
          </div>
        }
      />

      <section className="kpi-grid three">
        <div className="kpi-card"><span>Prospetti in lista</span><strong>{invoices.length}</strong><small>Mese {month}/{year}</small></div>
        <div className="kpi-card"><span>Imponibile totale</span><strong>{euro(totals.imponibile)}</strong><small>Somma flussi</small></div>
        <div className="kpi-card"><span>Totale lordo</span><strong>{euro(totals.totale)}</strong><small>IVA inclusa</small></div>
      </section>

      <section className="panel filters-panel">
        <div className="filters-row">
          <label>Mese <input className="input compact" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
          <label>Anno <input className="input compact" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
        </div>
        <div className="panel-total">
          <strong>{candidateFlows.length}</strong> flussi infragruppo rilevati · <strong>{numberIt(candidateFlows.reduce((s, r) => s + r.ore, 0))}</strong> ore totali
        </div>
      </section>

      {error && <div className="alert error"><AlertTriangle size={16} />{error}</div>}
      {message && <div className="alert success">{message}</div>}
      {loading && <div className="panel muted">Caricamento dati...</div>}

      {candidateFlows.length === 0 && liveRows.length > 0 && (
        <div className="panel muted">
          Non ci sono flussi infragruppo per questo mese (tutte le ore sono interne alla stessa società).
        </div>
      )}

      {invoices.length === 0 && candidateFlows.length > 0 && !loading && (
        <div className="empty-state">
          <strong>Fatture non ancora generate</strong>
          <p>Sono stati rilevati flussi infragruppo. Clicca su "Genera fatture" per caricarli in questa lista.</p>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="table-wrap elevated-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Emittente</th>
                <th>Destinataria</th>
                <th>Imponibile</th>
                <th>IVA</th>
                <th>Totale</th>
                <th>Stato</th>
                <th className="text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.employer_company_code ?? i.employer_company_name}</strong></td>
                  <td>{i.beneficiary_company_code ?? i.beneficiary_company_name}</td>
                  <td>{euro(i.imponibile)}</td>
                  <td>{euro(i.iva)}</td>
                  <td><strong>{euro(i.totale)}</strong></td>
                  <td>
                    {canManage ? (
                      <select className="input small" value={i.stato} onChange={(e) => void updateStatus(i, e.target.value as InvoiceStatus)}>
                        {invoiceStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="status-pill approvato">{i.stato}</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="row-actions justify-end">
                      <button className="icon-button" onClick={() => void generateSingleInvoicePdf(i)} disabled={exportingPdf} title="Scarica PDF Prospetto + Dettagli">
                        <Download size={15} /> PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}