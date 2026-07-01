import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, Info, RefreshCw, Trophy } from "lucide-react";
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

function levelClass(level: string | null | undefined) {
  return `kpi-level ${String(level || "basso").toLowerCase().replaceAll(" ", "-")}`;
}

function score(row: KpiDashboardRow | null | undefined) {
  return Number(row?.performance_index ?? 0);
}

function areaName(row: KpiDashboardRow) {
  return row.nome_gruppo || row.nome_area || row.codice_area || "Senza area";
}

function sortOverall(rows: KpiDashboardRow[]) {
  return [...rows].sort((a, b) => {
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;

    const byQuality = Number(b.k4_qualita ?? 0) - Number(a.k4_qualita ?? 0);
    if (byQuality !== 0) return byQuality;

    const byDeadline = Number(b.k5_puntualita ?? 0) - Number(a.k5_puntualita ?? 0);
    if (byDeadline !== 0) return byDeadline;

    const byProduction = Number(b.k2_produzione ?? 0) - Number(a.k2_produzione ?? 0);
    if (byProduction !== 0) return byProduction;

    return String(a.employee_name ?? "").localeCompare(String(b.employee_name ?? ""));
  });
}

function groupByArea(rows: KpiDashboardRow[]) {
  const grouped = new Map<string, KpiDashboardRow[]>();

  rows.forEach((row) => {
    const key = areaName(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });

  return [...grouped.entries()]
    .map(([area, areaRows]) => ({ area, rows: sortOverall(areaRows) }))
    .sort((a, b) => a.area.localeCompare(b.area));
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
  const overallRows = useMemo(() => sortOverall(rows), [rows]);
  const areaGroups = useMemo(() => groupByArea(rows), [rows]);
  const bestOverall = overallRows[0] ?? null;
  const areaWinners = useMemo(() => areaGroups.map((group) => ({ area: group.area, winner: group.rows[0] })).filter((item) => item.winner), [areaGroups]);
  const topPerformers = useMemo(() => sortOverall(rows.filter((row) => row.is_top_performer || row.eligible)), [rows]);
  const topPerformer = topPerformers[0] ?? null;

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
      setLoading(false);
      return;
    }

    const all = (leaderboardRes.data ?? []) as unknown as KpiDashboardRow[];
    const visible = canAdmin ? all : all.filter((row) => row.employee_email?.toLowerCase() === user?.email?.toLowerCase());
    const sortedVisible = sortOverall(visible);

    setMetrics((metricRes.data ?? []) as unknown as KpiMetricSetting[]);
    setRows(sortedVisible);
    setSelected((prev) => sortedVisible.find((row) => row.id === prev?.id) ?? sortedVisible[0] ?? null);
    setLoading(false);
  }, [canAdmin, periodEnd, periodStart, periodType, user?.email]);

  const calculate = async () => {
    setLoading(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("kpi_calculate_period", {
      p_period_type: periodType,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });

    if (rpcError) setError(rpcError.message);
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

      const { data } = await supabase
        .from("v_kpi_score_trace")
        .select("*")
        .eq("score_id", selected.id)
        .order("data", { ascending: false });

      setTrace((data ?? []) as unknown as KpiTraceRow[]);
    };

    void run();
  }, [selected]);

  const previewIndividual = () => {
    if (!selected) return;
    const doc = createKpiIndividualPdf(selected, trace);
    setPdfPreview(makePdfPreview(doc, `${safeFilename(`kpi-${selected.employee_name}`)}.pdf`, `KPI ${selected.employee_name}`));
  };

  const previewLeaderboard = () => {
    const doc = createKpiLeaderboardPdf(overallRows, "Classifica KPI generale e per area");
    setPdfPreview(makePdfPreview(doc, "classifica-kpi-generale-area.pdf", "Classifica KPI generale e per area"));
  };

  return (
    <div className="page kpi-performance-page kpi-rankings-page">
      <div className="pro-header hero-dashboard">
        <div>
          <span className="eyebrow">Modulo KPI</span>
          <h2>KPI Performance</h2>
          <p>
            Classifica generale, migliori per area e scheda individuale. Il primo classificato generale è calcolato sul PI più alto del periodo, non sul rank del singolo gruppo.
          </p>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} /> Aggiorna
          </button>
          {canAdmin && (
            <button className="button" onClick={() => void calculate()} disabled={loading}>
              <RefreshCw size={16} /> Calcola periodo
            </button>
          )}
          <button className="button secondary" onClick={previewLeaderboard} disabled={!overallRows.length}>
            <Eye size={16} /> Anteprima PDF
          </button>
        </div>
      </div>

      <div className="filters-bar pro-filters">
        <label>
          Tipo periodo
          <select className="input small" value={periodType} onChange={(e) => setPeriodType(e.target.value as KpiPeriodType)}>
            <option value="WEEK">Settimana</option>
            <option value="MONTH">Mese</option>
          </select>
        </label>
        <label>
          Dal
          <input className="input small" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label>
          Al
          <input className="input small" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
        <span className="filters-summary">
          <strong>{overallRows.length}</strong> valutabili · <strong>{topPerformers.length}</strong> top performer
        </span>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading-card"><span className="spinner" /> Caricamento KPI...</div>}

      <div className="kpi-rank-hero-grid">
        <section className="panel kpi-hero-award">
          <span className="eyebrow"><Trophy size={16} /> Migliore assoluto</span>
          <h3>{bestOverall ? bestOverall.employee_name : "Nessun dato"}</h3>
          {bestOverall ? (
            <>
              <p>
                Primo nella <strong>classifica generale</strong>. Area: <strong>{areaName(bestOverall)}</strong>. Non coincide automaticamente con Top performer.
              </p>
              <div className="kpi-absolute-score">{fmt(bestOverall.performance_index)}/100</div>
              <span className={levelClass(bestOverall.livello)}>{bestOverall.livello}</span>
            </>
          ) : (
            <p>Calcola il periodo per generare la classifica.</p>
          )}
        </section>

        <section className="panel kpi-hero-award">
          <span className="eyebrow"><Trophy size={16} /> Riconoscimento</span>
          <h3>{topPerformer ? "Top performer del periodo" : "Nessun top performer"}</h3>
          {topPerformer ? (
            <div className="kpi-top-performer-card">
              <div className="kpi-avatar small-avatar">{topPerformer.photo_url ? <img src={topPerformer.photo_url} alt="" /> : topPerformer.employee_name.slice(0, 1)}</div>
              <div>
                <strong>{topPerformer.employee_name}</strong>
                <p>{areaName(topPerformer)} · PI {fmt(topPerformer.performance_index)}/100</p>
              </div>
            </div>
          ) : (
            <p>Nessuno soddisfa tutti i requisiti: PI almeno 80/100, KPI sopra soglia, timesheet completo e dati sufficienti.</p>
          )}
        </section>
      </div>

      <section className="panel kpi-section-card">
        <div className="panel-header align-start">
          <div>
            <h3>Cinque indicatori KPI</h3>
            <p>Ogni indicatore misura una cosa diversa. Qualità e Scadenze non sostituiscono Tempo produttivo, Produzione ed Efficienza.</p>
          </div>
        </div>
        <div className="kpi-general-metrics-grid">
          {kpiKeys.map(([code, key]) => {
            const setting = metricMap.get(code);
            const value = bestOverall ? Number(bestOverall[key] ?? 0) : 0;
            return (
              <button className="kpi-general-metric-card" key={code} type="button" onClick={() => setting && setInfoMetric(setting)}>
                <span className="kpi-code-pill">{code} <Info size={13} /></span>
                <strong>{setting?.nome_breve ?? setting?.nome ?? code}</strong>
                <b>{fmt(value)}</b>
                <small>Soglia {fmt(setting?.soglia_minima ?? 0)} · Peso {fmt(setting?.peso_percentuale ?? 0)}%</small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="kpi-layout-two rankings-layout">
        <section className="panel kpi-section-card">
          <div className="panel-header align-start">
            <div>
              <h3>Classifica generale</h3>
              <p>Ordine unico dal punteggio più alto al più basso, indipendente dall’area.</p>
            </div>
            <button className="button secondary" onClick={previewLeaderboard} disabled={!overallRows.length}>
              <Eye size={16} /> Anteprima PDF
            </button>
          </div>

          <div className="table-wrap elevated-table">
            <table className="data-table compact kpi-leaderboard-table">
              <thead>
                <tr>
                  <th>Rank generale</th>
                  <th>Dipendente</th>
                  <th>Area</th>
                  <th>PI</th>
                  <th>Livello</th>
                  <th>K1</th>
                  <th>K2</th>
                  <th>K3</th>
                  <th>K4</th>
                  <th>K5</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {overallRows.map((row, index) => (
                  <tr key={row.id} className={selected?.id === row.id ? "selected-row" : ""} onClick={() => setSelected(row)}>
                    <td><strong>#{index + 1}</strong></td>
                    <td>
                      <strong>{row.employee_name}</strong>
                      <br />
                      <small className="muted">{row.employee_email}</small>
                    </td>
                    <td>{areaName(row)}</td>
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
        </section>

        <aside className="kpi-detail-panel">
          <div className="panel-title"><Info size={16} /> Scheda individuale</div>
          {selected ? (
            <>
              <h3>{selected.employee_name}</h3>
              <p className="muted">{selected.nome_ruolo ?? "Ruolo KPI non assegnato"} · {selected.company_name ?? "Società non assegnata"}</p>
              <div className="kpi-detail-grid">
                <span>PI<strong>{fmt(selected.performance_index)}/100</strong></span>
                <span>Livello<strong>{selected.livello}</strong></span>
                <span>Righe validate<strong>{selected.validated_rows}/{selected.total_rows}</strong></span>
                <span>Ore produttive<strong>{fmt(selected.productive_hours)}</strong></span>
              </div>
              <p className="muted">{selected.eligibility_reason || "Nessuna anomalia bloccante registrata."}</p>
              <div className="panel-actions">
                <button className="button secondary" onClick={previewIndividual}><Eye size={16} /> Anteprima PDF</button>
                <button className="button secondary" onClick={() => downloadKpiIndividualPdf(selected, trace)}><Download size={16} /> Scarica</button>
              </div>
            </>
          ) : (
            <p>Calcola il periodo o seleziona una riga.</p>
          )}
        </aside>
      </div>

      <section className="panel kpi-section-card">
        <div className="panel-header align-start">
          <div>
            <h3>Classifica per area</h3>
            <p>Ogni area ha il proprio ordinamento. Il primo di area non è automaticamente il migliore assoluto.</p>
          </div>
        </div>

        <div className="kpi-area-board">
          {areaGroups.map((group) => (
            <div className="kpi-area-card" key={group.area}>
              <div className="kpi-area-card-head">
                <div>
                  <span className="eyebrow">Area</span>
                  <h4>{group.area}</h4>
                </div>
                <span className="count-badge">{group.rows.length}</span>
              </div>
              <ol className="kpi-area-ranking-list">
                {group.rows.slice(0, 5).map((row, index) => (
                  <li key={row.id} onClick={() => setSelected(row)} className={selected?.id === row.id ? "active" : ""}>
                    <span>#{index + 1}</span>
                    <strong>{row.employee_name}</strong>
                    <em>{fmt(row.performance_index)}/100</em>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="panel kpi-section-card">
        <div className="panel-header align-start">
          <div>
            <h3>Migliori per area</h3>
            <p>Vista rapida dei vincitori di area. Il migliore assoluto è il valore più alto tra tutti.</p>
          </div>
        </div>
        <div className="table-wrap elevated-table">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Area</th>
                <th>Primo di area</th>
                <th>PI</th>
                <th>Livello</th>
                <th>Esito</th>
              </tr>
            </thead>
            <tbody>
              {areaWinners.map(({ area, winner }) => (
                <tr key={area} onClick={() => setSelected(winner)} className={selected?.id === winner.id ? "selected-row" : ""}>
                  <td>{area}</td>
                  <td><strong>{winner.employee_name}</strong><br /><small className="muted">{winner.employee_email}</small></td>
                  <td><strong>{fmt(winner.performance_index)}</strong></td>
                  <td><span className={levelClass(winner.livello)}>{winner.livello}</span></td>
                  <td>{winner.is_top_performer || winner.eligible ? "Top performer" : "Solo primo di area"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {infoMetric && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal narrow">
            <div className="modal-header">
              <div>
                <span className="eyebrow">{infoMetric.code}</span>
                <h3>{infoMetric.popup_titolo ?? infoMetric.nome_breve ?? infoMetric.nome}</h3>
              </div>
              <button className="icon-button" onClick={() => setInfoMetric(null)}>×</button>
            </div>
            <p className="prose">{infoMetric.popup_testo ?? infoMetric.descrizione}</p>
            <div className="kpi-detail-grid">
              <span>Peso<strong>{fmt(infoMetric.peso_percentuale)}%</strong></span>
              <span>Soglia<strong>{fmt(infoMetric.soglia_minima ?? 0)}</strong></span>
              <span>Scala<strong>0-100</strong></span>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setInfoMetric(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {pdfPreview && <PdfPreviewModal preview={pdfPreview} onClose={closePreview} />}
    </div>
  );
}
