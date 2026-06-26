import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FilePlus2, FileText, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../integrations/supabase/client";
import type { IntercompanyInvoiceView, InvoiceStatus, MonthlySummaryLive, TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { useAuth } from "../hooks/useAuth";
import { printInvoicesReport, printTimesheetReport } from "../lib/reportPdf";
import { filterRowsByRole } from "../lib/kpiData";

const invoiceStatuses: InvoiceStatus[] = ["Non necessaria", "Da emettere", "Emessa", "Pagata"];

type CandidateFlow = {
  key: string;
  da: string;
  a: string;
  imponibile: number;
  ore: number;
};

export default function Fatture() {
  const { isSuperAdmin, isAdminArea, areaIds, user } = useAuth();
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

    const { data, error } = await supabase.rpc("kpi_generate_intercompany_invoices", {
      p_mese: month,
      p_anno: year,
    });

    if (error) {
      setGenerating(false);
      setError(error.message);
      return;
    }

    const { data: freshInvoices, error: invoiceError } = await supabase
      .from("v_intercompany_invoices")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .order("employer_company_code", { ascending: true });

    setGenerating(false);

    if (invoiceError) {
      setError(invoiceError.message);
      return;
    }

    const generatedRows = (freshInvoices ?? []) as IntercompanyInvoiceView[];
    setMessage(`Fatture generate/aggiornate: ${Number(data ?? generatedRows.length)}. Lo stato già modificato viene mantenuto.`);
    await load();

    if (generatedRows.length > 0) {
      printInvoicesReport(generatedRows, { month, year });
    }
  };

  const generateDetailPdf = async () => {
    setExportingPdf(true);
    setError(null);

    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .eq("stato", "Approvato")
      .order("data", { ascending: true });

    setExportingPdf(false);

    if (error) {
      setError(error.message);
      return;
    }

    const visibleRows = filterRowsByRole(
      (data ?? []) as TimesheetView[],
      areaIds,
      user?.email?.toLowerCase() ?? null,
      isSuperAdmin,
      isAdminArea,
    );

    const invoiceRows = visibleRows.filter((r) => r.employer_company_id !== r.beneficiary_company_id);

    if (invoiceRows.length === 0) {
      window.alert("Non ci sono ore infragruppo da esportare: per il mese selezionato le ore risultano interne alla stessa società.");
      return;
    }

    printTimesheetReport(invoiceRows, {
      month,
      year,
      title: "Fatture infragruppo - dettaglio ore dipendenti",
    });
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

    setMessage(`Stato fattura aggiornato: ${stato}.`);
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
        description="Genera prospetti solo quando la società datrice è diversa dalla società beneficiaria. Il PDF dettagli esporta le descrizioni scritte dai dipendenti."
        actions={
          <div className="actions-row">
            <button className="button secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={16} />
              Aggiorna
            </button>
            <button className="button secondary" onClick={() => void generateInvoices()} disabled={!canManage || generating || candidateFlows.length === 0}>
              <FilePlus2 size={16} />
              {generating ? "Genero..." : "Genera fatture"}
            </button>
            <button className="button secondary" onClick={() => printInvoicesReport(invoices, { month, year })} disabled={invoices.length === 0}>
              <FileText size={16} />
              PDF prospetti
            </button>
            <button className="button" onClick={() => void generateDetailPdf()} disabled={liveRows.length === 0 || exportingPdf}>
              <FileText size={16} />
              {exportingPdf ? "Genero..." : "PDF dettagli"}
            </button>
          </div>
        }
      />

      <section className="kpi-grid three">
        <div className="kpi-card"><span>Prospetti</span><strong>{invoices.length}</strong><small>Mese {month}/{year}</small></div>
        <div className="kpi-card"><span>Imponibile</span><strong>{euro(totals.imponibile)}</strong><small>Somma fatture</small></div>
        <div className="kpi-card"><span>Totale lordo</span><strong>{euro(totals.totale)}</strong><small>IVA inclusa</small></div>
      </section>

      <section className="panel filters-panel">
        <label>
          Mese
          <input className="input compact" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
        </label>
        <label>
          Anno
          <input className="input compact" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        <div className="panel-total">
          <strong>{candidateFlows.length}</strong> flussi fatturabili · <strong>{numberIt(candidateFlows.reduce((s, r) => s + r.ore, 0))}</strong> ore
        </div>
      </section>

      {error && <div className="alert"><AlertTriangle size={16} />{error}</div>}
      {message && <div className="alert success">{message}</div>}
      {loading && <div className="panel muted">Caricamento...</div>}

      {candidateFlows.length === 0 && liveRows.length > 0 && (
        <div className="panel muted">
          Le ore del mese sono presenti, ma non generano fatture infragruppo perché risultano interne alla stessa società.
        </div>
      )}

      {candidateFlows.length > 0 && invoices.length === 0 && (
        <div className="panel muted">
          Ci sono flussi infragruppo approvati per il mese selezionato. Premi Genera fatture per creare i prospetti.
        </div>
      )}

      {invoices.length === 0 ? (
        <EmptyState title="Nessuna fattura generata" text="Genera i prospetti solo se ci sono flussi tra società diverse." />
      ) : (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Società emittente</th>
                <th>Società destinataria</th>
                <th>Competenza</th>
                <th>Imponibile</th>
                <th>IVA</th>
                <th>Totale</th>
                <th>Numero fattura</th>
                <th>Data fattura</th>
                <th>Stato</th>
                <th>Note</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.employer_company_code ?? i.employer_company_name}</strong></td>
                  <td>{i.beneficiary_company_code ?? i.beneficiary_company_name}</td>
                  <td>{i.mese}/{i.anno}</td>
                  <td>{euro(i.imponibile)}</td>
                  <td>{euro(i.iva)}</td>
                  <td><strong>{euro(i.totale)}</strong></td>
                  <td>{i.numero_fattura ?? "—"}</td>
                  <td>{i.data_fattura ?? "—"}</td>
                  <td>
                    {canManage ? (
                      <select className="input small" value={i.stato} onChange={(e) => void updateStatus(i, e.target.value as InvoiceStatus)}>
                        {invoiceStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="badge ok">{i.stato}</span>
                    )}
                  </td>
                  <td>{i.note ?? "—"}</td>
                  <td>
                    <button className="button secondary small" type="button" onClick={() => void generateSingleInvoicePdf(i)} disabled={exportingPdf}>
                      PDF
                    </button>
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
