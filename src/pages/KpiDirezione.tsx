import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, ShieldAlert } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import { downloadKpiLeaderboardPdf } from "../lib/kpiReportPdf";
import type { KpiDashboardRow, KpiPeriodType } from "../types/kpi";

function fmt(value: unknown) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function monthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export default function KpiDirezione() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;
  const initial = monthRange();
  const [periodType, setPeriodType] = useState<KpiPeriodType>("MONTH");
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [top, setTop] = useState<KpiDashboardRow[]>([]);
  const [anomalies, setAnomalies] = useState<(KpiDashboardRow & { anomaly_reason?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [topRes, anomalyRes] = await Promise.all([
      supabase.from("v_kpi_public_top3").select("*").eq("period_type", periodType).eq("period_start", periodStart).eq("period_end", periodEnd).order("nome_gruppo").order("group_rank"),
      supabase.from("v_kpi_anomalies").select("*").eq("period_type", periodType).eq("period_start", periodStart).eq("period_end", periodEnd).order("performance_index", { ascending: true }),
    ]);
    if (topRes.error || anomalyRes.error) setError(topRes.error?.message ?? anomalyRes.error?.message ?? "Errore caricamento KPI");
    else {
      setTop((topRes.data ?? []) as unknown as KpiDashboardRow[]);
      setAnomalies((anomalyRes.data ?? []) as unknown as (KpiDashboardRow & { anomaly_reason?: string })[]);
    }
    setLoading(false);
  }, [periodEnd, periodStart, periodType]);

  const calculate = async () => {
    setLoading(true);
    const { error } = await supabase.rpc("kpi_calculate_period", { p_period_type: periodType, p_period_start: periodStart, p_period_end: periodEnd });
    if (error) setError(error.message);
    await load();
    setLoading(false);
  };

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => ({
    top: top.length,
    anomalies: anomalies.length,
    low: anomalies.filter((row) => Number(row.performance_index) < 85).length,
    quality: anomalies.filter((row) => Number(row.k4_qualita) < 90).length,
  }), [anomalies, top.length]);

  if (!canAdmin) {
    return <div className="alert warning">Pannello riservato a Direzione, Super Admin e Admin Area.</div>;
  }

  return (
    <div>
      <PageHeader
        title="Direzione KPI"
        description="Pannello riservato: anomalie, risorse sotto standard, top performer e PDF direzionale. Non espone pubblicamente i punteggi bassi."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
            <button className="button" onClick={() => void calculate()} disabled={loading}><ShieldAlert size={16} /> Ricalcola</button>
            <button className="button secondary" onClick={() => downloadKpiLeaderboardPdf(top, "Top performer KPI")} disabled={!top.length}><Download size={16} /> PDF Top</button>
          </>
        }
      />

      <div className="filters-bar pro-filters">
        <label>Tipo periodo
          <select className="input" value={periodType} onChange={(e) => setPeriodType(e.target.value as KpiPeriodType)}>
            <option value="WEEK">Settimana</option>
            <option value="MONTH">Mese</option>
          </select>
        </label>
        <label>Dal <input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
        <label>Al <input className="input" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Aggiornamento KPI...</div>}

      <div className="kpi-grid small">
        <div className="kpi-card"><span>Top performer</span><strong>{stats.top}</strong><small>Pubblicabili</small></div>
        <div className="kpi-card"><span>Anomalie</span><strong>{stats.anomalies}</strong><small>Riservate</small></div>
        <div className="kpi-card"><span>PI sotto 85</span><strong>{stats.low}</strong><small>Attenzione direzione</small></div>
        <div className="kpi-card"><span>Qualità sotto soglia</span><strong>{stats.quality}</strong><small>K4 &lt; 90</small></div>
      </div>

      <section className="kpi-section-card">
        <div className="section-title"><h3>Top 3 per gruppo omogeneo</h3><button className="button secondary" onClick={() => downloadKpiLeaderboardPdf(top, "Top 3 KPI")}>PDF</button></div>
        <div className="table-wrap elevated-table">
          <table className="data-table compact">
            <thead><tr><th>Rank</th><th>Dipendente</th><th>Gruppo</th><th>PI</th><th>Qualità</th><th>Puntualità</th><th>Badge</th></tr></thead>
            <tbody>
              {top.map((row) => (
                <tr key={row.id}>
                  <td>{row.group_rank}</td>
                  <td><strong>{row.employee_name}</strong><br /><span className="muted small-text">{row.employee_email}</span></td>
                  <td>{row.nome_gruppo}</td>
                  <td><strong>{fmt(row.performance_index)}</strong></td>
                  <td>{fmt(row.k4_qualita)}</td>
                  <td>{fmt(row.k5_puntualita)}</td>
                  <td>{(row.badges ?? []).map((b) => b.label).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="kpi-section-card">
        <div className="section-title"><h3>Anomalie riservate</h3><span className="muted">Non pubblicare in bacheca interna</span></div>
        <div className="table-wrap elevated-table">
          <table className="data-table compact">
            <thead><tr><th>Dipendente</th><th>Gruppo</th><th>PI</th><th>K4</th><th>Righe validate</th><th>Motivo</th></tr></thead>
            <tbody>
              {anomalies.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.employee_name}</strong><br /><span className="muted small-text">{row.employee_email}</span></td>
                  <td>{row.nome_gruppo}</td>
                  <td>{fmt(row.performance_index)}</td>
                  <td>{fmt(row.k4_qualita)}</td>
                  <td>{row.validated_rows}/{row.total_rows}</td>
                  <td>{row.anomaly_reason ?? row.eligibility_reason ?? "Da verificare"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
