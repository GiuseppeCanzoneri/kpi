import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, Download, Gauge, RefreshCw, Trophy } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import { downloadKpiIndividualPdf, downloadKpiLeaderboardPdf } from "../lib/kpiReportPdf";
import type { KpiDashboardRow, KpiPeriodType, KpiTraceRow } from "../types/kpi";

function fmt(value: unknown) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function levelClass(level: string) {
  return `kpi-level ${level.toLowerCase().replaceAll(" ", "-")}`;
}

export default function KpiPerformance() {
  const { isSuperAdmin, isAdminArea, user } = useAuth();
  const canAdmin = isSuperAdmin || isAdminArea;
  const initial = currentMonthRange();
  const [periodType, setPeriodType] = useState<KpiPeriodType>("MONTH");
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [rows, setRows] = useState<KpiDashboardRow[]>([]);
  const [selected, setSelected] = useState<KpiDashboardRow | null>(null);
  const [trace, setTrace] = useState<KpiTraceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("v_kpi_leaderboard")
      .select("*")
      .eq("period_type", periodType)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .order("nome_gruppo", { ascending: true })
      .order("group_rank", { ascending: true });

    if (error) setError(error.message);
    else {
      const all = (data ?? []) as unknown as KpiDashboardRow[];
      const visible = canAdmin ? all : all.filter((row) => row.employee_email?.toLowerCase() === user?.email?.toLowerCase());
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
      const { data } = await supabase
        .from("v_kpi_score_trace")
        .select("*")
        .eq("score_id", selected.id)
        .order("data", { ascending: true });
      setTrace((data ?? []) as unknown as KpiTraceRow[]);
    };
    void run();
  }, [selected]);

  const top3 = useMemo(() => rows.filter((row) => row.eligible && Number(row.performance_index) >= 100 && Number(row.group_rank ?? 99) <= 3), [rows]);
  const best = top3[0] ?? rows[0] ?? null;

  return (
    <div className="kpi-performance-page">
      <PageHeader
        title="KPI Performance"
        description="Cruscotto individuale, classifica omogenea, badge e report PDF secondo specifiche Quantum. Legge i dati dal timesheet esistente."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>
            {canAdmin && <button className="button" onClick={() => void calculate()} disabled={loading}><Gauge size={16} /> Calcola periodo</button>}
            <button className="button secondary" onClick={() => downloadKpiLeaderboardPdf(rows, "Classifica KPI")} disabled={!rows.length}><Download size={16} /> PDF classifica</button>
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
        <div className="filters-summary"><strong>{rows.length}</strong> profili · <strong>{top3.length}</strong> top performer</div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Caricamento KPI...</div>}

      {best && (
        <section className="kpi-hero-card">
          <div className="kpi-person-card">
            <div className="kpi-avatar">{best.photo_url ? <img src={best.photo_url} alt={best.employee_name} /> : best.employee_name.slice(0, 1)}</div>
            <span className="eyebrow">Dipendente del periodo</span>
            <h2>{best.employee_name}</h2>
            <p>{best.nome_ruolo ?? "Ruolo KPI non assegnato"}</p>
            <strong>Indice {fmt(best.performance_index)}/120</strong>
            <small>{best.company_name} · {best.nome_area ?? best.nome_gruppo}</small>
          </div>
          <div className="kpi-metric-board">
            {["k1_saturazione", "k2_produzione", "k3_efficienza", "k4_qualita", "k5_puntualita"].map((key, index) => (
              <div className="kpi-mini" key={key}>
                <span>{["Saturazione", "Produzione", "Efficienza", "Qualità", "Puntualità"][index]}</span>
                <strong>{fmt((best as any)[key])}</strong>
              </div>
            ))}
            <div className="kpi-badges-strip">
              {(best.badges ?? []).length ? best.badges.map((badge) => <span key={badge.code}><Award size={14} /> {badge.label}</span>) : <span>Nessun badge consolidato</span>}
            </div>
          </div>
        </section>
      )}

      <div className="kpi-layout-two">
        <div className="table-wrap elevated-table">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Rank</th><th>Dipendente</th><th>Gruppo</th><th>PI</th><th>Livello</th><th>K1</th><th>K2</th><th>K3</th><th>K4</th><th>K5</th><th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={selected?.id === row.id ? "selected-row" : ""} onClick={() => setSelected(row)}>
                  <td><strong>{row.group_rank ?? "—"}</strong></td>
                  <td><strong>{row.employee_name}</strong><br /><span className="muted small-text">{row.employee_email}</span></td>
                  <td>{row.nome_gruppo ?? "—"}</td>
                  <td><strong>{fmt(row.performance_index)}</strong></td>
                  <td><span className={levelClass(row.livello)}>{row.livello}</span></td>
                  <td>{fmt(row.k1_saturazione)}</td>
                  <td>{fmt(row.k2_produzione)}</td>
                  <td>{fmt(row.k3_efficienza)}</td>
                  <td>{fmt(row.k4_qualita)}</td>
                  <td>{fmt(row.k5_puntualita)}</td>
                  <td><button className="icon-button" onClick={(e) => { e.stopPropagation(); downloadKpiIndividualPdf(row, trace); }} title="PDF individuale"><Download size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="kpi-detail-panel">
          {selected ? (
            <>
              <div className="panel-title"><Trophy size={18} /> Scheda individuale</div>
              <h3>{selected.employee_name}</h3>
              <span className={levelClass(selected.livello)}>{selected.livello}</span>
              <p className="muted">{selected.eligible ? "Idoneo alla premialità" : selected.eligibility_reason ?? "Non eleggibile"}</p>
              <div className="kpi-detail-grid">
                <span>Ore produttive <strong>{fmt(selected.productive_hours)}</strong></span>
                <span>Ore nette <strong>{fmt(selected.available_hours_net)}</strong></span>
                <span>Std prodotto <strong>{fmt(selected.standard_units)}</strong></span>
                <span>Rilavorazioni <strong>{fmt(selected.rework_hours)}</strong></span>
                <span>Validate <strong>{selected.validated_rows}/{selected.total_rows}</strong></span>
                <span>Giornate <strong>{selected.working_days}</strong></span>
              </div>
              <button className="button full" onClick={() => downloadKpiIndividualPdf(selected, trace)}><Download size={16} /> Scarica PDF completo</button>
            </>
          ) : <p className="muted">Calcola il periodo o seleziona una riga.</p>}
        </aside>
      </div>
    </div>
  );
}
