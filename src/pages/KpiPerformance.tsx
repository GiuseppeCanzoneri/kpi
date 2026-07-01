import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, Info, RefreshCw, Trophy } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { PdfPreviewModal, type PdfPreviewState } from "../components/PdfPreviewModal";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import { createKpiIndividualPdf, createKpiLeaderboardPdf, downloadKpiIndividualPdf } from "../lib/kpiReportPdf";
import { makePdfPreview, revokePdfPreview, safeFilename } from "../lib/pdfPreview";
import type { KpiDashboardRow, KpiMetricSetting, KpiPeriodType, KpiTraceRow } from "../types/kpi";

function fmt(value: unknown) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function currentMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

function levelClass(level: string) {
  return `kpi-level ${String(level || "basso").toLowerCase().replaceAll(" ", "-")}`;
}

const kpiKeys = [
  ["K1", "k1_saturazione"],
  ["K2", "k2_produzione"],
  ["K3", "k3_efficienza"],
  ["K4", "k4_qualita"],
  ["K5", "k5_puntualita"],
] as const;

export default function KpiPerformance() {
  const { isSuperAdmin, isAdminArea, user } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;
  const initial = currentMonthRange();
  const [periodType, setPeriodType] = useState<KpiPeriodType>("MONTH");
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [metrics, setMetrics] = useState<KpiMetricSetting[]>([]);
  const [rows, setRows] = useState<KpiDashboardRow[]>([]);
  const [selected, setSelected] = useState<KpiDashboardRow | null>(null);
  const [trace, setTrace] = useState<KpiTraceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMetric, setInfoMetric] = useState<KpiMetricSetting | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);

  const metricMap = useMemo(() => new Map(metrics.map((m) => [m.code, m])), [metrics]);

  const closePreview = () => {
    revokePdfPreview(pdfPreview);
    setPdfPreview(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [metricRes, leaderboardRes] = await Promise.all([
      supabase.from("kpi_metric_settings").select("*").order("code"),
      supabase
        .from("v_kpi_leaderboard")
        .select("*")
        .eq("period_type", periodType)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .order("nome_gruppo", { ascending: true })
        .order("group_rank", { ascending: true }),
    ]);

    const firstError = metricRes.error || leaderboardRes.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      const all = (leaderboardRes.data ?? []) as unknown as KpiDashboardRow[];
      const visible = canAdmin ? all : all.filter((row) => row.employee_email?.toLowerCase() === user?.email?.toLowerCase());
      setMetrics((metricRes.data ?? []) as unknown as KpiMetricSetting[]);
      setRows(visible);
      setSelected((prev) => visible.find((row) => row.id === prev?.id) ?? visible[0] ?? null);
    }

    setLoading(false);
  }, [canAdmin, periodEnd, periodStart, periodType, user?.email]);

  const calculate = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("kpi_calculate_period", {
      p_period_type: periodType,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    if (error) setError(error.message);
    await load();
    setLoading(false);
  };

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const run = async () => {
      if (!selected) {
        setTrace([]);
        return;
      }
      const { data } = await supabase
        .from("v_kpi_score_trace")
        .select("*")
        .eq("score_id", selected.id)
        .order("data", { ascending: false });
      setTrace((data ?? []) as unknown as KpiTraceRow[]);
    };
    void run();
  }, [selected]);

  const topPerformers = useMemo(() => rows.filter((row) => row.is_top_performer || row.eligible), [rows]);
  const firstClassified = rows[0] ?? null;
  const topPerformer = topPerformers[0] ?? null;

  const previewIndividual = () => {
    if (!selected) return;
    const doc = createKpiIndividualPdf(selected, trace);
    setPdfPreview(makePdfPreview(doc, `${safeFilename(`kpi-${selected.employee_name}`)}.pdf`, `KPI ${selected.employee_name}`));
  };

  const previewLeaderboard = () => {
    const doc = createKpiLeaderboardPdf(rows, "Classifica KPI");
    setPdfPreview(makePdfPreview(doc, "classifica-kpi.pdf", "Classifica KPI"));
  };

  return (
    <div className="kpi-performance-page quantum-page">
      <PageHeader
        title="KPI Performance"
        description="Cruscotto su scala 0-100. La classifica ordina tutti i valutabili; il riconoscimento Top performer richiede indice almeno 80/100, nessun KPI sotto soglia e dati completi."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
            <button className="button" onClick={() => void calculate()} disabled={loading}>Calcola periodo</button>
            <button className="button secondary" onClick={previewLeaderboard} disabled={!rows.length}><Eye size={16} /> Anteprima classifica</button>
          </>
        }
      />

      <section className="quantum-toolbar">
        <label>Tipo periodo
          <select className="input" value={periodType} onChange={(e) => setPeriodType(e.target.value as KpiPeriodType)}>
            <option value="WEEK">Settimana</option>
            <option value="MONTH">Mese</option>
          </select>
        </label>
        <label>Dal <input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
        <label>Al <input className="input" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label>
        <div className="quantum-toolbar-summary"><strong>{rows.length}</strong> valutabili · <strong>{topPerformers.length}</strong> top performer</div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading-card"><div className="spinner" /> Caricamento KPI...</div>}

      <section className="quantum-hero-grid">
        <article className="quantum-winner-card">
          <span className="eyebrow">Riconoscimento</span>
          <h3>{topPerformer ? "Top performer del periodo" : "Nessun top performer"}</h3>
          {topPerformer ? (
            <>
              <div className="quantum-avatar">{topPerformer.photo_url ? <img src={topPerformer.photo_url} alt="" /> : topPerformer.employee_name.slice(0, 1)}</div>
              <strong>{topPerformer.employee_name}</strong>
              <p>{topPerformer.nome_gruppo ?? "Gruppo non assegnato"} · PI {fmt(topPerformer.performance_index)}/100</p>
            </>
          ) : (
            <p>Nessuno soddisfa tutti i requisiti: PI almeno 80/100, KPI sopra soglia, timesheet completo e dati sufficienti.</p>
          )}
        </article>

        <article className="quantum-winner-card muted-card">
          <span className="eyebrow">Classifica</span>
          <h3>Primo classificato</h3>
          {firstClassified ? (
            <>
              <strong>{firstClassified.employee_name}</strong>
              <p>È il punteggio più alto del periodo, ma non coincide sempre con Top performer.</p>
              <div className="big-number">{fmt(firstClassified.performance_index)}/100</div>
            </>
          ) : <p>Calcola il periodo per generare la classifica.</p>}
        </article>

        <article className="quantum-kpi-board">
          {kpiKeys.map(([code, key]) => {
            const setting = metricMap.get(code);
            const value = firstClassified ? Number((firstClassified as any)[key] ?? 0) : 0;
            return (
              <div className="quantum-kpi-mini" key={code}>
                <button className="info-dot" type="button" onClick={() => setting && setInfoMetric(setting)}><Info size={15} /></button>
                <span>{code}</span>
                <strong>{setting?.nome_breve ?? setting?.nome ?? code}</strong>
                <b>{fmt(value)}</b>
                <small>Soglia {fmt(setting?.soglia_minima ?? 0)}</small>
              </div>
            );
          })}
        </article>
      </section>

      <section className="quantum-layout-two">
        <div className="quantum-panel">
          <div className="quantum-panel-head">
            <div>
              <span className="eyebrow">Classifica completa</span>
              <h3>Tutti i dipendenti valutabili</h3>
              <p>Ordine dal punteggio più alto. I punteggi bassi sono visibili solo nelle pagine autorizzate.</p>
            </div>
            <button className="button secondary" onClick={previewLeaderboard} disabled={!rows.length}><Eye size={16} /> Anteprima PDF</button>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr><th>Rank</th><th>Dipendente</th><th>Gruppo</th><th>PI</th><th>Livello</th><th>K1</th><th>K2</th><th>K3</th><th>K4</th><th>K5</th><th>Stato</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={selected?.id === row.id ? "selected-row" : ""} onClick={() => setSelected(row)}>
                    <td>#{row.group_rank ?? "—"}</td>
                    <td><strong>{row.employee_name}</strong><br /><span className="muted small-text">{row.employee_email}</span></td>
                    <td>{row.nome_gruppo ?? "—"}</td>
                    <td><strong>{fmt(row.performance_index)}</strong></td>
                    <td><span className={levelClass(row.livello)}>{row.livello}</span></td>
                    <td>{fmt(row.k1_saturazione)}</td><td>{fmt(row.k2_produzione)}</td><td>{fmt(row.k3_efficienza)}</td><td>{fmt(row.k4_qualita)}</td><td>{fmt(row.k5_puntualita)}</td>
                    <td>{row.is_top_performer || row.eligible ? <span className="status-pill ok">Top performer</span> : <span className="status-pill muted-pill">Solo classifica</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="kpi-detail-panel">
          {selected ? (
            <>
              <div className="panel-title"><Trophy size={16} /> Scheda individuale</div>
              <h3>{selected.employee_name}</h3>
              <p className="muted">{selected.nome_ruolo ?? "Ruolo KPI non assegnato"} · {selected.company_name ?? "Società non assegnata"}</p>
              <div className="kpi-detail-grid">
                <span>PI<strong>{fmt(selected.performance_index)}/100</strong></span>
                <span>Righe validate<strong>{selected.validated_rows}/{selected.total_rows}</strong></span>
                <span>Ore produttive<strong>{fmt(selected.productive_hours)}</strong></span>
                <span>Rilavorazioni<strong>{fmt(selected.rework_hours)}</strong></span>
              </div>
              <p className="muted">{selected.eligibility_reason || "Nessuna anomalia bloccante registrata."}</p>
              <div className="panel-actions">
                <button className="button" onClick={previewIndividual}><Eye size={16} /> Anteprima PDF</button>
                <button className="button secondary" onClick={() => downloadKpiIndividualPdf(selected, trace)}><Download size={16} /> Scarica</button>
              </div>
            </>
          ) : <p className="muted">Calcola il periodo o seleziona una riga.</p>}
        </aside>
      </section>

      {infoMetric && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="metric-info-modal">
            <span className="eyebrow">{infoMetric.code}</span>
            <h3>{infoMetric.popup_titolo ?? infoMetric.nome_breve ?? infoMetric.nome}</h3>
            <p>{infoMetric.popup_testo ?? infoMetric.descrizione}</p>
            <div className="metric-info-grid">
              <span>Peso<strong>{fmt(infoMetric.peso_percentuale)}%</strong></span>
              <span>Soglia<strong>{fmt(infoMetric.soglia_minima ?? 0)}</strong></span>
              <span>Scala<strong>0-100</strong></span>
            </div>
            <div className="modal-actions"><button className="button" onClick={() => setInfoMetric(null)}>Chiudi</button></div>
          </div>
        </div>
      )}

      {pdfPreview && <PdfPreviewModal preview={pdfPreview} onClose={closePreview} />}
    </div>
  );
}
