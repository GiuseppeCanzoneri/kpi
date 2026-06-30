import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Eye, RefreshCw, ShieldAlert, Trophy } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { PdfPreviewModal, type PdfPreviewState } from "../components/PdfPreviewModal";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import { createKpiLeaderboardPdf } from "../lib/kpiReportPdf";
import { makePdfPreview, revokePdfPreview } from "../lib/pdfPreview";
import type { KpiDashboardRow, KpiPeriodType } from "../types/kpi";

function fmt(value: unknown) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function monthRange() {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10) };
}

export default function KpiDirezione() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;
  const initial = monthRange();
  const [periodType, setPeriodType] = useState<KpiPeriodType>("MONTH");
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [top, setTop] = useState<KpiDashboardRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<KpiDashboardRow[]>([]);
  const [anomalies, setAnomalies] = useState<(KpiDashboardRow & { anomaly_reason?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);

  const closePreview = () => { revokePdfPreview(pdfPreview); setPdfPreview(null); };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    const [topRes, leaderboardRes, anomalyRes] = await Promise.all([
      supabase.from("v_kpi_top_performers").select("*").eq("period_type", periodType).eq("period_start", periodStart).eq("period_end", periodEnd).order("nome_gruppo").order("group_rank"),
      supabase.from("v_kpi_leaderboard").select("*").eq("period_type", periodType).eq("period_start", periodStart).eq("period_end", periodEnd).order("nome_gruppo").order("group_rank"),
      supabase.from("v_kpi_anomalies").select("*").eq("period_type", periodType).eq("period_start", periodStart).eq("period_end", periodEnd).order("performance_index", { ascending: true }),
    ]);
    const firstError = topRes.error || leaderboardRes.error || anomalyRes.error;
    if (firstError) setError(firstError.message);
    else {
      setTop((topRes.data ?? []) as unknown as KpiDashboardRow[]);
      setLeaderboard((leaderboardRes.data ?? []) as unknown as KpiDashboardRow[]);
      setAnomalies((anomalyRes.data ?? []) as unknown as (KpiDashboardRow & { anomaly_reason?: string })[]);
    }
    setLoading(false);
  }, [periodEnd, periodStart, periodType]);

  useEffect(() => { void load(); }, [load]);

  const calculate = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    const { data, error } = await supabase.rpc("kpi_calculate_period", { p_period_type: periodType, p_period_start: periodStart, p_period_end: periodEnd });
    if (error) setError(error.message);
    else setMessage(`Calcolo completato per ${data ?? 0} dipendenti.`);
    await load();
    setLoading(false);
  };

  const stats = useMemo(() => ({
    classifica: leaderboard.length,
    top: top.length,
    anomalies: anomalies.length,
    low: anomalies.filter((row) => Number(row.performance_index) < 60).length,
    quality: anomalies.filter((row) => Number(row.k4_qualita) < 85).length,
    notValidated: anomalies.filter((row) => Number(row.validated_rows ?? 0) < Number(row.total_rows ?? 0)).length,
  }), [anomalies, leaderboard.length, top.length]);

  const topByGroup = useMemo(() => {
    const map = new Map<string, KpiDashboardRow[]>();
    top.forEach((row) => {
      const key = row.nome_gruppo ?? "Altro";
      map.set(key, [...(map.get(key) ?? []), row]);
    });
    return Array.from(map.entries());
  }, [top]);

  const previewLeaderboard = () => {
    const doc = createKpiLeaderboardPdf(leaderboard, "Classifica KPI direzione");
    setPdfPreview(makePdfPreview(doc, "classifica-kpi-direzione.pdf", "Classifica KPI direzione"));
  };

  if (!canAdmin) return <div className="alert warning">Pannello riservato a Direzione, Super Admin e Admin Area.</div>;

  return (
    <div className="quantum-page direction-page">
      <PageHeader
        title="Direzione KPI"
        description="Classifica completa riservata, Top performer pubblicabili e anomalie da gestire. Scala operativa 0-100."
        actions={<><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button><button className="button" onClick={() => void calculate()} disabled={loading}><Calculator size={16} /> Ricalcola</button><button className="button secondary" onClick={previewLeaderboard} disabled={!leaderboard.length}><Eye size={16} /> Anteprima PDF</button></>}
      />

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="quantum-toolbar">
        <label>Periodo<select className="input" value={periodType} onChange={(e) => setPeriodType(e.target.value as KpiPeriodType)}><option value="WEEK">Settimana</option><option value="MONTH">Mese</option></select></label>
        <label>Dal<input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
        <label>Al<input className="input" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label>
        <div className="quantum-toolbar-summary">Prima valida i dati, poi calcola e pubblica solo i Top performer.</div>
      </section>

      {loading && <div className="loading-card"><div className="spinner" /> Aggiornamento KPI...</div>}

      <section className="kpi-grid five">
        <div className="kpi-card"><span>Valutabili</span><strong>{stats.classifica}</strong><small>In classifica</small></div>
        <div className="kpi-card"><span>Top performer</span><strong>{stats.top}</strong><small>Pubblicabili</small></div>
        <div className="kpi-card"><span>Anomalie</span><strong>{stats.anomalies}</strong><small>Riservate</small></div>
        <div className="kpi-card"><span>PI basso</span><strong>{stats.low}</strong><small>Sotto 60</small></div>
        <div className="kpi-card"><span>Non validate</span><strong>{stats.notValidated}</strong><small>Prima del premio</small></div>
      </section>

      <section className="direction-grid">
        <div className="quantum-panel">
          <div className="quantum-panel-head"><div><span className="eyebrow"><Trophy size={14} /> Bacheca interna</span><h3>Top performer per gruppo</h3><p>Questa sezione è pubblicabile. Se non ci sono idonei, mostra “Nessun top performer nel periodo”.</p></div></div>
          {topByGroup.map(([group, people]) => (
            <div className="top-group-card" key={group}>
              <h4>{group}</h4>
              {people.map((row) => (<div className="top-person-row" key={row.id}><span>#{row.group_rank}</span><strong>{row.employee_name}</strong><b>{fmt(row.performance_index)}/100</b></div>))}
            </div>
          ))}
          {!topByGroup.length && <div className="empty-state"><strong>Nessun top performer nel periodo</strong><p>Nessun dipendente soddisfa tutti i requisiti di riconoscimento.</p></div>}
        </div>

        <div className="quantum-panel">
          <div className="quantum-panel-head"><div><span className="eyebrow"><ShieldAlert size={14} /> Riservato</span><h3>Anomalie da gestire</h3><p>Non pubblicare in bacheca interna.</p></div></div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead><tr><th>Dipendente</th><th>Gruppo</th><th>PI</th><th>K4</th><th>Validate</th><th>Motivo</th></tr></thead>
              <tbody>{anomalies.map((row) => (<tr key={row.id}><td><strong>{row.employee_name}</strong><br /><span className="muted small-text">{row.employee_email}</span></td><td>{row.nome_gruppo ?? "—"}</td><td>{fmt(row.performance_index)}</td><td>{fmt(row.k4_qualita)}</td><td>{row.validated_rows}/{row.total_rows}</td><td>{row.anomaly_reason ?? row.eligibility_reason ?? "Da verificare"}</td></tr>))}</tbody>
            </table>
          </div>
          {!anomalies.length && <div className="empty-state"><strong>Nessuna anomalia</strong><p>Il periodo risulta pulito rispetto alle soglie configurate.</p></div>}
        </div>
      </section>

      {pdfPreview && <PdfPreviewModal preview={pdfPreview} onClose={closePreview} />}
    </div>
  );
}
