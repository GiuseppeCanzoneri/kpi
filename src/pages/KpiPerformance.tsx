import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, HelpCircle, Info, RefreshCw, Trophy } from "lucide-react";
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

function metricExplanation(code: string) {
  switch (code) {
    case "K1":
      return "Ore produttive validate rispetto alle ore disponibili nette e al target del ruolo.";
    case "K2":
      return "Produzione standard ponderata: tempo standard attività × complessità, confrontato con il target del ruolo.";
    case "K3":
      return "Efficienza: ore standard prodotte divise per ore effettivamente usate.";
    case "K4":
      return "Qualità: esito validazione, integrazioni, respinte, rilavorazioni e criticità.";
    case "K5":
      return "Scadenze: attività completate entro il termine, escluse le cause esterne documentate.";
    default:
      return "Indicatore KPI.";
  }
}

function diagnose(row: KpiDashboardRow | null) {
  if (!row) return [];
  const items: { title: string; text: string; tone?: "ok" | "warn" | "bad" }[] = [];

  if (Number(row.k1_saturazione ?? 0) < 60) {
    items.push({
      title: "K1 basso",
      text: `Ore produttive ${fmt(row.productive_hours)} su ore disponibili nette ${fmt(row.available_hours_net)}. Se il periodo è un mese intero con poche ore, K1 resta basso.`,
      tone: "bad",
    });
  } else {
    items.push({ title: "K1 positivo", text: "Le ore produttive validate sono coerenti con il target del ruolo.", tone: "ok" });
  }

  if (Number(row.k2_produzione ?? 0) < 60) {
    items.push({
      title: "K2 basso",
      text: `Produzione standard ${fmt(row.standard_units)}. Controlla tempo standard e complessità delle attività: una riga validata “eccellente” non aumenta il volume prodotto.`,
      tone: "bad",
    });
  } else {
    items.push({ title: "K2 positivo", text: "La produzione standard ponderata è sufficiente rispetto al target.", tone: "ok" });
  }

  if (Number(row.k3_efficienza ?? 0) < 70) {
    items.push({
      title: "K3 basso",
      text: `Efficienza calcolata su standard ${fmt(row.standard_units)} rispetto a ore produttive ${fmt(row.productive_hours)}. Se standard < ore usate, K3 scende.`,
      tone: "warn",
    });
  } else {
    items.push({ title: "K3 positivo", text: "Le ore standard prodotte sono coerenti con le ore effettive.", tone: "ok" });
  }

  if (Number(row.k4_qualita ?? 0) >= 85) {
    items.push({ title: "K4 positivo", text: "La validazione qualità è corretta. Questo però incide solo su Qualità, non su produzione e saturazione.", tone: "ok" });
  }

  if (Number(row.k5_puntualita ?? 0) >= 85) {
    items.push({ title: "K5 positivo", text: "Le scadenze risultano rispettate o non penalizzanti.", tone: "ok" });
  }

  if (Number(row.working_days ?? 0) < 15 && row.period_type === "MONTH") {
    items.push({
      title: "Dati insufficienti",
      text: `Giornate lavorate rilevate: ${fmt(row.working_days)}. Per il mese servono dati completi, altrimenti il Top performer resta bloccato.`,
      tone: "warn",
    });
  }

  if (row.eligibility_reason) {
    items.push({ title: "Motivo blocco", text: row.eligibility_reason, tone: "warn" });
  }

  return items;
}

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

  const metricMap = useMemo(() => new Map(metrics.map((metric) => [metric.code, metric])), [metrics]);

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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const run = async () => {
      if (!selected) {
        setTrace([]);
        return;
      }
      const { data } = await supabase.from("v_kpi_score_trace").select("*").eq("score_id", selected.id).order("data", { ascending: false });
      setTrace((data ?? []) as unknown as KpiTraceRow[]);
    };
    void run();
  }, [selected]);

  const topPerformers = useMemo(() => rows.filter((row) => row.is_top_performer || row.eligible), [rows]);
  const firstClassified = rows[0] ?? null;
  const topPerformer = topPerformers[0] ?? null;
  const selectedDiagnosis = useMemo(() => diagnose(selected), [selected]);

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
    <div className="page kpi-performance-page kpi-performance-clear-page">
      <section className="pro-header kpi-performance-hero">
        <div>
          <span className="eyebrow">Modulo KPI</span>
          <h2>KPI Performance</h2>
          <p>
            Il cruscotto separa classifica, primo classificato e Top performer. Un esito qualità “eccellente” non rende automaticamente eccellenti K1, K2 e K3.
          </p>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
          <button className="button" onClick={() => void calculate()} disabled={loading}><RefreshCw size={16} /> Calcola periodo</button>
          <button className="button secondary" onClick={previewLeaderboard} disabled={!rows.length}><Eye size={16} /> Anteprima classifica</button>
        </div>
      </section>

      <section className="filters-bar kpi-performance-filters">
        <label>Tipo periodo
          <select className="input small" value={periodType} onChange={(event) => setPeriodType(event.target.value as KpiPeriodType)}>
            <option value="WEEK">Settimana</option>
            <option value="MONTH">Mese</option>
          </select>
        </label>
        <label>Dal <input className="input small" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
        <label>Al <input className="input small" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
        <span className="filters-summary"><strong>{rows.length}</strong> valutabili · <strong>{topPerformers.length}</strong> top performer</span>
      </section>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading-card"><div className="spinner" />Caricamento KPI...</div>}

      <section className="kpi-performance-top-grid">
        <div className="kpi-recognition-card">
          <div className="panel-title"><Trophy size={18} /> Riconoscimento</div>
          <h3>{topPerformer ? "Top performer del periodo" : "Nessun top performer"}</h3>
          {topPerformer ? (
            <div className="kpi-winner-box">
              <div className="kpi-avatar">{topPerformer.photo_url ? <img src={topPerformer.photo_url} alt={topPerformer.employee_name} /> : topPerformer.employee_name.slice(0, 1)}</div>
              <div><strong>{topPerformer.employee_name}</strong><span>{topPerformer.nome_gruppo ?? "Gruppo non assegnato"} · PI {fmt(topPerformer.performance_index)}/100</span></div>
            </div>
          ) : (
            <p>Nessuno soddisfa tutti i requisiti: PI almeno 80/100, KPI sopra soglia, timesheet completo e dati sufficienti.</p>
          )}
        </div>

        <div className="kpi-recognition-card">
          <div className="panel-title"><Trophy size={18} /> Classifica</div>
          <h3>Primo classificato</h3>
          {firstClassified ? (
            <div className="kpi-first-box">
              <strong>{firstClassified.employee_name}</strong>
              <p>È il punteggio più alto del periodo, ma non coincide sempre con Top performer.</p>
              <span>{fmt(firstClassified.performance_index)}/100</span>
            </div>
          ) : <p>Calcola il periodo per generare la classifica.</p>}
        </div>
      </section>

      <section className="panel kpi-metrics-clear-panel">
        <div className="panel-header">
          <div>
            <h3>Cinque indicatori KPI</h3>
            <p>Ogni indicatore misura una cosa diversa. Qualità e Scadenze non sostituiscono Tempo produttivo, Produzione ed Efficienza.</p>
          </div>
        </div>
        <div className="kpi-metric-grid-clear">
          {kpiKeys.map(([code, key]) => {
            const setting = metricMap.get(code);
            const value = firstClassified ? Number((firstClassified as unknown as Record<string, unknown>)[key] ?? 0) : 0;
            return (
              <button key={code} type="button" className="kpi-metric-card-clear" onClick={() => setting && setInfoMetric(setting)}>
                <span className="kpi-code">{code}<Info size={15} /></span>
                <strong>{setting?.nome_breve ?? setting?.nome ?? code}</strong>
                <b>{fmt(value)}</b>
                <small>Soglia {fmt(setting?.soglia_minima ?? 0)} · Peso {fmt(setting?.peso_percentuale ?? 0)}%</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="kpi-layout-two kpi-performance-main-layout">
        <div className="panel flush-panel">
          <div className="panel-header kpi-table-header-clear">
            <div>
              <h3>Classifica completa</h3>
              <p>Ordine dal punteggio più alto. I punteggi bassi sono visibili solo nelle pagine autorizzate.</p>
            </div>
            <button className="button secondary" onClick={previewLeaderboard} disabled={!rows.length}><Eye size={16} /> Anteprima PDF</button>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Rank</th><th>Dipendente</th><th>Gruppo</th><th>PI</th><th>Livello</th><th>K1</th><th>K2</th><th>K3</th><th>K4</th><th>K5</th><th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={selected?.id === row.id ? "selected-row" : ""} onClick={() => setSelected(row)}>
                    <td>#{row.group_rank ?? "—"}</td>
                    <td><strong>{row.employee_name}</strong><br /><small>{row.employee_email}</small></td>
                    <td>{row.nome_gruppo ?? "—"}</td>
                    <td><strong>{fmt(row.performance_index)}</strong></td>
                    <td><span className={levelClass(row.livello)}>{row.livello}</span></td>
                    <td>{fmt(row.k1_saturazione)}</td>
                    <td>{fmt(row.k2_produzione)}</td>
                    <td>{fmt(row.k3_efficienza)}</td>
                    <td>{fmt(row.k4_qualita)}</td>
                    <td>{fmt(row.k5_puntualita)}</td>
                    <td>{row.is_top_performer || row.eligible ? <span className="status-pill ok">Top performer</span> : <span className="status-pill muted-pill">Solo classifica</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="kpi-detail-panel kpi-detail-panel-clear">
          {selected ? (
            <>
              <div className="panel-title"><HelpCircle size={18} /> Scheda individuale</div>
              <h3>{selected.employee_name}</h3>
              <p className="muted">{selected.nome_ruolo ?? "Ruolo KPI non assegnato"} · {selected.company_name ?? "Società non assegnata"}</p>
              <div className="kpi-detail-grid">
                <span>PI<strong>{fmt(selected.performance_index)}/100</strong></span>
                <span>Livello<strong>{selected.livello}</strong></span>
                <span>Righe validate<strong>{selected.validated_rows}/{selected.total_rows}</strong></span>
                <span>Ore produttive<strong>{fmt(selected.productive_hours)}</strong></span>
                <span>Ore disponibili<strong>{fmt(selected.available_hours_net)}</strong></span>
                <span>Standard prodotto<strong>{fmt(selected.standard_units)}</strong></span>
                <span>Rilavorazioni<strong>{fmt(selected.rework_hours)}</strong></span>
                <span>Giornate<strong>{fmt(selected.working_days)}</strong></span>
              </div>

              <div className="kpi-diagnosis-box">
                <strong>Perché esce questo risultato?</strong>
                {selectedDiagnosis.map((item) => (
                  <div key={`${item.title}-${item.text}`} className={`kpi-diagnosis-item ${item.tone ?? "warn"}`}>
                    <span>{item.title}</span>
                    <p>{item.text}</p>
                  </div>
                ))}
              </div>

              <div className="kpi-trace-box">
                <strong>Ultime attività considerate</strong>
                {trace.slice(0, 5).map((item) => (
                  <div key={item.timesheet_entry_id} className="kpi-trace-row">
                    <span>{item.data}</span>
                    <p>{item.codice_commessa ?? "—"} · {item.codice_attivita ?? "—"}</p>
                    <small>Ore {fmt(item.ore)} · Std {fmt(item.standard_units)} · Qualità {fmt(item.quality_points)}</small>
                  </div>
                ))}
                {!trace.length && <p className="muted">Nessun dettaglio disponibile.</p>}
              </div>

              <div className="panel-actions">
                <button className="button secondary" onClick={previewIndividual}><Eye size={16} /> Anteprima PDF</button>
                <button className="button" onClick={() => downloadKpiIndividualPdf(selected, trace)}><Download size={16} /> Scarica</button>
              </div>
            </>
          ) : <p>Seleziona un dipendente dalla classifica.</p>}
        </aside>
      </section>

      {infoMetric && (
        <div className="modal-backdrop">
          <div className="modal-card kpi-info-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">{infoMetric.code}</span>
                <h3>{infoMetric.nome_breve ?? infoMetric.nome}</h3>
              </div>
              <button className="icon-button" onClick={() => setInfoMetric(null)}>×</button>
            </div>
            <div className="prose kpi-info-body">
              <p>{infoMetric.popup_testo ?? infoMetric.descrizione ?? metricExplanation(infoMetric.code)}</p>
              <p><strong>Formula:</strong> {infoMetric.formula_label ?? metricExplanation(infoMetric.code)}</p>
              <p><strong>Soglia:</strong> {fmt(infoMetric.soglia_minima)} · <strong>Peso:</strong> {fmt(infoMetric.peso_percentuale)}%</p>
              {infoMetric.note && <p><strong>Note:</strong> {infoMetric.note}</p>}
            </div>
          </div>
        </div>
      )}

      {pdfPreview && <PdfPreviewModal preview={pdfPreview} onClose={closePreview} />}
    </div>
  );
}
