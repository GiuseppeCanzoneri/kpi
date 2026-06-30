import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Eye, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { PdfPreviewModal, type PdfPreviewState } from "../components/PdfPreviewModal";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { TimesheetView } from "../types/db";
import { euro, numberIt } from "../lib/format";
import { createTimesheetReportDoc, downloadTimesheetCsv } from "../lib/reportPdf";
import { filterRowsByRole } from "../lib/kpiData";
import { makePdfPreview, revokePdfPreview, safeFilename } from "../lib/pdfPreview";
import { toast } from "sonner";

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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);

  const closePreview = () => {
    revokePdfPreview(pdfPreview);
    setPdfPreview(null);
  };

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

    if (error) {
      setError(error.message);
    } else {
      const filteredByRole = filterRowsByRole(
        (data ?? []) as TimesheetView[],
        areaIds,
        user?.email?.toLowerCase() ?? null,
        isSuperAdmin,
        isAdminArea
      );
      setRows(filteredByRole);
    }

    setLoading(false);
  }, [areaIds, isAdminArea, isSuperAdmin, month, user?.email, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const uniqueEmployees = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      if (row.employee_id && row.employee_name) map.set(row.employee_id, row.employee_name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (onlyIntercompany && row.tipo_movimento !== "Infragruppo fatturabile") return false;
        if (!includeContested && row.is_contested) return false;
        if (selectedEmployeeId && row.employee_id !== selectedEmployeeId) return false;
        return true;
      }),
    [includeContested, onlyIntercompany, rows, selectedEmployeeId]
  );

  const totals = useMemo(
    () => ({
      ore: filteredRows.reduce((sum, row) => sum + Number(row.ore ?? 0), 0),
      orePesate: filteredRows.reduce((sum, row) => sum + Number(row.ore_pesate ?? 0), 0),
      importo: filteredRows.reduce((sum, row) => sum + Number(row.importo_visibile ?? 0), 0),
      contestate: filteredRows.filter((row) => row.is_contested).length,
    }),
    [filteredRows]
  );

  const handlePreviewPdf = () => {
    if (filteredRows.length === 0) {
      toast.error("Nessuna riga da esportare nel periodo selezionato");
      return;
    }

    const employeeName = selectedEmployeeId
      ? uniqueEmployees.find((employee) => employee.id === selectedEmployeeId)?.name ?? "Dipendente"
      : "Tutti i dipendenti";

    const title = selectedEmployeeId ? `Report ore - ${employeeName}` : "Report ore completo";
    const fileName = selectedEmployeeId
      ? `report-ore-${safeFilename(employeeName)}-${year}-${String(month).padStart(2, "0")}.pdf`
      : `report-ore-completo-${year}-${String(month).padStart(2, "0")}.pdf`;

    try {
      const doc = createTimesheetReportDoc(filteredRows, { month, year, title });
      setPdfPreview(makePdfPreview(doc, fileName, title));
    } catch (err) {
      console.error("Errore anteprima PDF", err);
      toast.error("Errore durante la creazione dell'anteprima PDF");
    }
  };

  return (
    <div className="report-page quantum-page">
      <PageHeader
        title="Report"
        description="Report dettagliato delle ore approvate, con anteprima PDF prima del download. Le righe sono ordinate dalla più recente alla meno recente."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={16} /> Aggiorna
            </button>
            <button className="button secondary" onClick={() => downloadTimesheetCsv(filteredRows, `report-ore-${month}-${year}.csv`)} disabled={!filteredRows.length}>
              <Download size={16} /> CSV
            </button>
            <button className="button" onClick={handlePreviewPdf} disabled={!filteredRows.length}>
              <Eye size={16} /> Anteprima PDF
            </button>
          </>
        }
      />

      <section className="kpi-grid four report-kpi-grid">
        <div className="kpi-card"><span>Righe report</span><strong>{filteredRows.length}</strong><small>Filtrate</small></div>
        <div className="kpi-card"><span>Ore</span><strong>{numberIt(totals.ore)}</strong><small>{numberIt(totals.orePesate)} pesate</small></div>
        <div className="kpi-card"><span>Importo</span><strong>{euro(totals.importo)}</strong><small>Solo importi visibili</small></div>
        <div className="kpi-card"><span>Contestazioni</span><strong>{totals.contestate}</strong><small>Incluse nei filtri</small></div>
      </section>

      <section className="filters-bar report-filters-bar">
        <label>Mese
          <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
        </label>
        <label>Anno
          <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        <label>Dipendente
          <select className="input" value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
            <option value="">Tutti i dipendenti</option>
            {uniqueEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </label>
        <label className="check-inline"><input type="checkbox" checked={onlyIntercompany} onChange={(e) => setOnlyIntercompany(e.target.checked)} /> Solo infragruppo</label>
        <label className="check-inline"><input type="checkbox" checked={includeContested} onChange={(e) => setIncludeContested(e.target.checked)} /> Includi contestate</label>
      </section>

      {error && <div className="alert error"><AlertTriangle size={16} /> {error}</div>}
      {loading && <div className="loading-card"><Loader2 className="spinner" size={18} /> Caricamento report...</div>}

      {filteredRows.length === 0 ? (
        <EmptyState title="Nessuna riga disponibile" text="Modifica i filtri oppure aggiorna il periodo selezionato." />
      ) : (
        <section className="panel flush-panel">
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Data</th><th>Dipendente</th><th>Da società</th><th>A società</th><th>Area</th><th>Commessa</th><th>Attività</th><th>Ore</th><th>Importo</th><th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 120).map((row) => (
                  <tr key={row.id}>
                    <td>{row.data}</td>
                    <td><strong>{row.employee_name}</strong><br /><small className="muted">{row.employee_email}</small></td>
                    <td>{row.employer_company_code}</td>
                    <td>{row.beneficiary_company_code}</td>
                    <td>{row.codice_area}</td>
                    <td>{row.codice_commessa}</td>
                    <td>{row.codice_attivita}</td>
                    <td>{numberIt(row.ore)}</td>
                    <td>{row.importo_visibile === null ? "Riservato" : euro(row.importo_visibile)}</td>
                    <td>{row.is_contested ? <span className="status-pill da-correggere">Contestata</span> : <span className="status-pill approvato">Approvato</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 120 && <div className="alert warning mt">Anteprima tabella limitata a 120 righe. Il PDF include tutte le righe filtrate.</div>}
        </section>
      )}

      {pdfPreview && <PdfPreviewModal preview={pdfPreview} onClose={closePreview} />}
    </div>
  );
}
