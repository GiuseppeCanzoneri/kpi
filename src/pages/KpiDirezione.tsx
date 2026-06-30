import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Download, RefreshCw, ShieldAlert, Trophy } from "lucide-react";
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

function levelClass(level: string) {
  return `kpi-level ${String(level || "basso").toLowerCase().replaceAll(" ", "-")}`;
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
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
    top: top.length,
    anomalies: anomalies.length,
    low: anomalies.filter((row) => Number(row.performance_index) < 85).length,
    quality: anomalies.filter((row) => Number(row.k4_qualita) < 90).length,
    notValidated: anomalies.filter((row) => Number(row.validated_rows ?? 0) < Number(row.total_rows ?? 0)).length,
  }), [anomalies, top.length]);

  const topByGroup = useMemo(() => {
    const map = new Map<string, KpiDashboardRow[]>();
    top.forEach((row) => {
      const key = row.nome_gruppo ?? "Altro";
      map.set(key, [...(map.get(key) ?? []), row]);
    });
    return Array.from(map.entries());
  }, [top]);

  if (!canAdmin) {
    return <div className="alert warning">Pannello riservato a Direzione, Super Admin e Admin Area.</div>;
  }

  return (
    <div className="kpi-direction-page quantum-clean-page">
      <PageHeader
        title="Direzione KPI"
        description="Pannello riservato: top performer, anomalie e criticità. I punteggi bassi restano privati e non finiscono in bacheca."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
            <button className="button" onClick={() => void calculate()} disabled={loading}><Calculator size={16} /> Ricalcola</button>
            <button className="button secondary" onClick={() => downloadKpiLeaderboardPdf(top, "Top performer KPI")} disabled={!top.length}><Download size={16} /> PDF Top</button>
          </>
        }
      />

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="direction-hero quantum-hero compact">
        <div>
          <span className="eyebrow">Controllo Direzione</span>
          <h2>{periodType === "MONTH" ? "Mese" : "Settimana"} in verifica</h2>
          <p>Periodo dal <strong>{periodStart}</strong> al <strong>{periodEnd}</strong>. Prima valida i dati, poi calcola e pubblica solo top performer.</p>
        </div>
        <div className="period-box">
          <select className="input" value={periodType} onChange={(e) => setPeriodType(e.target.value as KpiPeriodType)}>
            <option value="WEEK">Settimana</option>
            <option value="MONTH">Mese</option>
          </select>
          <input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <input className="input" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
      </section>

      {loading && <div className="loading-card"><div className="spinner" /> Aggiornamento KPI...</div>}

      <section className="direction-stats-grid">
        <div><Trophy size={18} /><span>Top performer</span><strong>{stats.top}</strong><small>Pubblicabili</small></div>
        <div className={stats.anomalies ? "warn" : ""}><ShieldAlert size={18} /><span>Anomalie</span><strong>{stats.anomalies}</strong><small>Riservate</small></div>
        <div className={stats.low ? "danger" : ""}><AlertTriangle size={18} /><span>PI sotto 85</span><strong>{stats.low}</strong><small>Da verificare</small></div>
        <div className={stats.quality ? "danger" : ""}><AlertTriangle size={18} /><span>Qualità sotto soglia</span><strong>{stats.quality}</strong><small>K4 &lt; 90</small></div>
        <div className={stats.notValidated ? "warn" : ""}><AlertTriangle size={18} /><span>Righe non validate</span><strong>{stats.notValidated}</strong><small>Prima del premio</small></div>
      </section>

      <div className="direction-layout">
        <section className="quantum-panel">
          <div className="quantum-panel-head">
            <div>
              <span className="eyebrow">Bacheca interna</span>
              <h3>Top 3 per gruppo omogeneo</h3>
              <p>Mostra solo i migliori per gruppo. Nessuna esposizione dei dipendenti sotto standard.</p>
            </div>
            <button className="button secondary" onClick={() => downloadKpiLeaderboardPdf(top, "Top 3 KPI")} disabled={!top.length}>PDF</button>
          </div>

          <div className="top-groups-grid">
            {topByGroup.map(([group, people]) => (
              <div className="top-group-card" key={group}>
                <h4>{group}</h4>
                {people.map((row) => (
                  <div className="top-person" key={row.id}>
                    <span className="rank-badge">#{row.group_rank}</span>
                    <div>
                      <strong>{row.employee_name}</strong>
                      <small>{row.employee_email}</small>
                    </div>
                    <div className="pi-score">{fmt(row.performance_index)}</div>
                  </div>
                ))}
              </div>
            ))}
            {!topByGroup.length && <div className="empty-state"><strong>Nessun top performer pubblicabile</strong><p>Calcola il periodo oppure verifica le condizioni di eleggibilità.</p></div>}
          </div>
        </section>

        <section className="quantum-panel danger-panel">
          <div className="quantum-panel-head">
            <div>
              <span className="eyebrow">Riservato</span>
              <h3>Anomalie da gestire</h3>
              <p>Questa lista resta solo per Direzione/Admin. Serve per piani correttivi e validazioni mancanti.</p>
            </div>
          </div>

          <div className="anomaly-list">
            {anomalies.map((row) => (
              <article className="anomaly-card" key={row.id}>
                <div>
                  <strong>{row.employee_name}</strong>
                  <span>{row.employee_email}</span>
                </div>
                <div className="anomaly-metrics">
                  <span>PI <strong>{fmt(row.performance_index)}</strong></span>
                  <span>K4 <strong>{fmt(row.k4_qualita)}</strong></span>
                  <span>Validate <strong>{row.validated_rows}/{row.total_rows}</strong></span>
                </div>
                <p>{row.anomaly_reason ?? row.eligibility_reason ?? "Da verificare"}</p>
                <span className={levelClass(row.livello)}>{row.livello}</span>
              </article>
            ))}
            {!anomalies.length && <div className="empty-state"><strong>Nessuna anomalia</strong><p>Il periodo risulta pulito rispetto alle soglie configurate.</p></div>}
          </div>
        </section>
      </div>
    </div>
  );
}
