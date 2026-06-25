import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FilePlus2, FileText, Info, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../integrations/supabase/client";
import type { IntercompanyInvoiceView, InvoiceStatus, TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { useAuth } from "../hooks/useAuth";
import { generateIntercompanyInvoicesPdf } from "../lib/reportPdf";

const invoiceStatuses: InvoiceStatus[] = ["Non necessaria", "Da emettere", "Emessa", "Pagata"];

type FlowRow = {
  key: string;
  employer_company_id: string;
  beneficiary_company_id: string;
  da: string;
  a: string;
  ore: number;
  imponibile: number;
  righe: number;
  eligible: boolean;
  reason: string;
};

export default function Fatture() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const canManage = isSuperAdmin || isAdminArea;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [invoices, setInvoices] = useState<IntercompanyInvoiceView[]>([]);
  const [timesheetRows, setTimesheetRows] = useState<TimesheetView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [inv, ts] = await Promise.all([
      supabase
        .from("v_intercompany_invoices")
        .select("*")
        .eq("mese", month)
        .eq("anno", year)
        .order("employer_company_code", { ascending: true }),
      supabase
        .from("v_timesheet_entries")
        .select("*")
        .eq("mese", month)
        .eq("anno", year)
        .eq("stato", "Approvato"),
    ]);

    const firstError = inv.error || ts.error;
    if (firstError) setError(firstError.message);

    setInvoices((inv.data ?? []) as IntercompanyInvoiceView[]);
    setTimesheetRows((ts.data ?? []) as TimesheetView[]);
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const flows = useMemo<FlowRow[]>(() => {
    const map = new Map<string, FlowRow>();

    timesheetRows.forEach((row) => {
      const key = `${row.employer_company_id}-${row.beneficiary_company_id}`;
      const sameCompany = row.employer_company_id === row.beneficiary_company_id;
      const isInvoiceType = row.tipo_movimento === "Infragruppo fatturabile";
      const current = map.get(key) ?? {
        key,
        employer_company_id: row.employer_company_id,
        beneficiary_company_id: row.beneficiary_company_id,
        da: row.employer_company_code ?? row.employer_company_name ?? "—",
        a: row.beneficiary_company_code ?? row.beneficiary_company_name ?? "—",
        ore: 0,
        imponibile: 0,
        righe: 0,
        eligible: !sameCompany && isInvoiceType,
        reason: sameCompany
          ? "Interno: stessa società, nessuna fattura infragruppo"
          : isInvoiceType
            ? "Fatturabile infragruppo"
            : "Movimento non fatturabile",
      };

      current.ore += Number(row.ore ?? 0);
      current.imponibile += Number(row.importo_visibile ?? 0);
      current.righe += 1;
      current.eligible = current.eligible || (!sameCompany && isInvoiceType);
      if (current.eligible) current.reason = "Fatturabile infragruppo";
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => `${a.da}${a.a}`.localeCompare(`${b.da}${b.a}`));
  }, [timesheetRows]);

  const eligibleFlows = useMemo(() => flows.filter((flow) => flow.eligible && flow.imponibile > 0), [flows]);
  const internalFlows = useMemo(() => flows.filter((flow) => !flow.eligible), [flows]);

  const totals = useMemo(() => ({
    imponibile: invoices.reduce((sum, invoice) => sum + Number(invoice.imponibile ?? 0), 0),
    iva: invoices.reduce((sum, invoice) => sum + Number(invoice.iva ?? 0), 0),
    totale: invoices.reduce((sum, invoice) => sum + Number(invoice.totale ?? 0), 0),
    oreFlussi: flows.reduce((sum, flow) => sum + flow.ore, 0),
  }), [flows, invoices]);

  const generateInvoices = async () => {
    if (!canManage) return;

    if (eligibleFlows.length === 0) {
      setMessage("Nessuna fattura generata: nel mese selezionato i flussi sono interni alla stessa società oppure non fatturabili.");
      return;
    }

    setGenerating(true);
    setError(null);
    setMessage(null);

    const { data, error } = await supabase.rpc("kpi_generate_intercompany_invoices", { p_mese: month, p_anno: year });

    setGenerating(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(`Generazione completata. Prospetti creati/aggiornati: ${Number(data ?? 0)}.`);
    await load();
  };

  const updateStatus = async (invoice: IntercompanyInvoiceView, stato: InvoiceStatus) => {
    const { error } = await supabase.from("intercompany_invoices").update({ stato }).eq("id", invoice.id);
    if (error) setError(error.message);
    else await load();
  };

  const exportPdf = async () => {
    setGeneratingPdf(true);
    setError(null);

    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .eq("stato", "Approvato")
      .order("data", { ascending: true })
      .order("employee_name", { ascending: true });

    setGeneratingPdf(false);

    if (error) {
      setError(error.message);
      return;
    }

    const details = ((data ?? []) as TimesheetView[]).filter((row) => row.employer_company_id !== row.beneficiary_company_id && row.tipo_movimento === "Infragruppo fatturabile");
    const doc = generateIntercompanyInvoicesPdf(invoices, details, { month, year });
    doc.save(`Fatture_infragruppo_${year}_${String(month).padStart(2, "0")}.pdf`);
  };

  return (
    <div>
      <PageHeader
        title="Fatture infragruppo"
        description="Mostra i flussi del mese e genera prospetti solo quando la società datrice è diversa dalla società beneficiaria. I flussi interni restano visibili ma non producono fattura."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
            <button className="button" onClick={() => void generateInvoices()} disabled={!canManage || generating || eligibleFlows.length === 0}><FilePlus2 size={16} /> {generating ? "Genero..." : "Genera fatture"}</button>
            <button className="button secondary" onClick={() => void exportPdf()} disabled={invoices.length === 0 || generatingPdf}><FileText size={16} /> {generatingPdf ? "Genero..." : "PDF completo"}</button>
          </>
        }
      />

      <div className="kpi-grid">
        <div className="kpi-card"><span>Flussi mese</span><strong>{flows.length}</strong><small>{numberIt(totals.oreFlussi)} ore approvate</small></div>
        <div className="kpi-card"><span>Fatturabili</span><strong>{eligibleFlows.length}</strong><small>Società diverse</small></div>
        <div className="kpi-card"><span>Interni</span><strong>{internalFlows.length}</strong><small>Non generano fattura</small></div>
        <div className="kpi-card"><span>Prospetti</span><strong>{invoices.length}</strong><small>Mese {month}/{year}</small></div>
        <div className="kpi-card"><span>Totale lordo</span><strong>{euro(totals.totale)}</strong><small>Fatture generate</small></div>
      </div>

      <div className="filters-bar pro-filters">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(event) => setMonth(Number(event.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
        <div className="filters-summary"><strong>{eligibleFlows.length}</strong> flussi fatturabili · <strong>{euro(eligibleFlows.reduce((sum, flow) => sum + flow.imponibile, 0))}</strong> imponibile potenziale</div>
      </div>

      {error && <div className="alert error"><AlertTriangle size={16} /> {error}</div>}
      {message && <div className="alert success"><Info size={16} /> {message}</div>}
      {loading && <div className="loading">Caricamento...</div>}

      {flows.length > 0 && eligibleFlows.length === 0 && (
        <div className="alert warning">
          Nel mese selezionato ci sono ore approvate, ma non ci sono vere fatture infragruppo da generare: nel riepilogo attuale la società “da” coincide con la società “a”, oppure il movimento non è fatturabile.
        </div>
      )}

      {flows.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Flussi rilevati dal timesheet</h3>
              <p>Questo controllo evita schermate vuote: qui vedi perché una fattura viene generata o esclusa.</p>
            </div>
          </div>
          <div className="table-wrap elevated-table">
            <table className="data-table">
              <thead>
                <tr><th>Da società</th><th>A società</th><th>Righe</th><th>Ore</th><th>Imponibile</th><th>Esito</th></tr>
              </thead>
              <tbody>
                {flows.map((flow) => (
                  <tr key={flow.key}>
                    <td><strong>{flow.da}</strong></td>
                    <td>{flow.a}</td>
                    <td>{flow.righe}</td>
                    <td>{numberIt(flow.ore)}</td>
                    <td>{euro(flow.imponibile)}</td>
                    <td>{flow.eligible ? <span className="status-pill approvato">Da fatturare</span> : <span className="status-pill muted-pill">{flow.reason}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {invoices.length === 0 ? (
        <EmptyState title="Nessun prospetto fattura generato" text="Se i flussi sono interni alla stessa società è corretto che non venga generata una fattura infragruppo. Per generarla, la società beneficiaria deve essere diversa dalla società datrice del dipendente." />
      ) : (
        <div className="table-wrap elevated-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Società emittente</th><th>Società destinataria</th><th>Competenza</th><th>Imponibile</th><th>IVA</th><th>Totale</th><th>Numero fattura</th><th>Data fattura</th><th>Stato</th><th>Note</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.employer_company_code ?? invoice.employer_company_name}</strong></td>
                  <td>{invoice.beneficiary_company_code ?? invoice.beneficiary_company_name}</td>
                  <td>{invoice.mese}/{invoice.anno}</td>
                  <td>{euro(invoice.imponibile)}</td>
                  <td>{euro(invoice.iva)}</td>
                  <td><strong>{euro(invoice.totale)}</strong></td>
                  <td>{invoice.numero_fattura ?? "—"}</td>
                  <td>{invoice.data_fattura ?? "—"}</td>
                  <td>
                    {canManage ? (
                      <select className="input small" value={invoice.stato} onChange={(event) => void updateStatus(invoice, event.target.value as InvoiceStatus)}>
                        {invoiceStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    ) : (
                      <span className="status-pill">{invoice.stato}</span>
                    )}
                  </td>
                  <td className="muted small-text">{invoice.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
