import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, RefreshCw, Save, Settings2, SlidersHorizontal, Target } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";

type MetricSetting = {
  code: "K1" | "K2" | "K3" | "K4" | "K5";
  nome: string;
  descrizione: string | null;
  peso_percentuale: number;
  attivo: boolean;
  soglia_minima: number | null;
  formula_label: string | null;
  note: string | null;
};

type KpiRole = {
  id: string;
  codice_ruolo: string;
  nome_ruolo: string;
  group_id: string;
  attivo: boolean;
};

type TargetRow = {
  id?: string;
  kpi_role_id: string;
  period_type: "WEEK" | "MONTH";
  valid_from: string;
  target_saturation_percent: number;
  target_production_units: number;
  available_hours: number;
  min_working_days: number;
  note?: string | null;
};

const defaultMetricLabels: Record<string, string> = {
  K1: "Saturazione produttiva",
  K2: "Produzione standardizzata",
  K3: "Efficienza",
  K4: "Qualità",
  K5: "Puntualità",
};

function numberIt(value: unknown) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

export default function KpiImpostazioni() {
  const [metrics, setMetrics] = useState<MetricSetting[]>([]);
  const [roles, setRoles] = useState<KpiRole[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<"MONTH" | "WEEK">("MONTH");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalWeight = useMemo(() => metrics.filter((m) => m.attivo).reduce((sum, m) => sum + Number(m.peso_percentuale ?? 0), 0), [metrics]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const [metricRes, roleRes, targetRes] = await Promise.all([
      supabase.from("kpi_metric_settings").select("*").order("code"),
      supabase.from("kpi_roles").select("id,codice_ruolo,nome_ruolo,group_id,attivo").eq("attivo", true).order("codice_ruolo"),
      supabase.from("kpi_targets").select("*").order("period_type").order("valid_from", { ascending: false }),
    ]);

    const firstError = metricRes.error || roleRes.error || targetRes.error;
    if (firstError) setError(firstError.message);
    else {
      setMetrics((metricRes.data ?? []) as MetricSetting[]);
      setRoles((roleRes.data ?? []) as KpiRole[]);
      setTargets((targetRes.data ?? []) as TargetRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveMetric = async (metric: MetricSetting) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.rpc("kpi_upsert_metric_setting", {
      p_code: metric.code,
      p_peso_percentuale: Number(metric.peso_percentuale),
      p_attivo: Boolean(metric.attivo),
      p_soglia_minima: metric.soglia_minima === null || metric.soglia_minima === undefined ? null : Number(metric.soglia_minima),
      p_note: metric.note ?? null,
    });
    setSaving(false);
    if (error) setError(error.message);
    else {
      setMessage(`${metric.code} aggiornato correttamente.`);
      await load();
    }
  };

  const targetFor = (roleId: string, periodType: "WEEK" | "MONTH") => {
    const found = targets.find((t) => t.kpi_role_id === roleId && t.period_type === periodType);
    if (found) return found;
    return {
      kpi_role_id: roleId,
      period_type: periodType,
      valid_from: "2026-01-01",
      target_saturation_percent: 80,
      target_production_units: periodType === "WEEK" ? 32 : 140,
      available_hours: periodType === "WEEK" ? 40 : 168,
      min_working_days: periodType === "WEEK" ? 3 : 15,
      note: "",
    } satisfies TargetRow;
  };

  const updateTarget = (next: TargetRow) => {
    setTargets((prev) => {
      const index = prev.findIndex((t) => t.kpi_role_id === next.kpi_role_id && t.period_type === next.period_type);
      if (index === -1) return [next, ...prev];
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
  };

  const saveTarget = async (target: TargetRow) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload = {
      kpi_role_id: target.kpi_role_id,
      period_type: target.period_type,
      valid_from: target.valid_from || "2026-01-01",
      target_saturation_percent: Number(target.target_saturation_percent || 0),
      target_production_units: Number(target.target_production_units || 0),
      available_hours: Number(target.available_hours || 0),
      min_working_days: Number(target.min_working_days || 1),
      note: target.note || null,
    };

    const { error } = await supabase
      .from("kpi_targets")
      .upsert(payload, { onConflict: "kpi_role_id,period_type,valid_from" });

    setSaving(false);
    if (error) setError(error.message);
    else {
      setMessage("Target salvato correttamente.");
      await load();
    }
  };

  return (
    <div className="kpi-settings-page quantum-clean-page">
      <PageHeader
        title="Impostazioni KPI"
        description="Configura pesi K1-K5 e target per ruolo. Le modifiche valgono dai nuovi calcoli in avanti: i periodi già chiusi restano tracciati."
        actions={
          <button className="button secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} /> Aggiorna
          </button>
        }
      />

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="quantum-hero compact">
        <div>
          <span className="eyebrow">Motore Quantum</span>
          <h2>Pesi dell’indice PI</h2>
          <p>Il PI viene calcolato come media ponderata dei KPI attivi. Il totale pesi attivi oggi è <strong>{numberIt(totalWeight)}%</strong>.</p>
        </div>
        <div className={`weight-meter ${Math.round(totalWeight) === 100 ? "ok" : "warn"}`}>
          <Calculator size={20} />
          <strong>{numberIt(totalWeight)}%</strong>
          <span>{Math.round(totalWeight) === 100 ? "Configurazione corretta" : "Meglio portarlo a 100"}</span>
        </div>
      </section>

      <section className="kpi-settings-grid">
        {metrics.map((metric) => (
          <article key={metric.code} className="metric-config-card">
            <div className="metric-config-top">
              <div className="metric-code">{metric.code}</div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={metric.attivo}
                  onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, attivo: e.target.checked } : m))}
                />
                Attivo
              </label>
            </div>
            <h3>{metric.nome || defaultMetricLabels[metric.code]}</h3>
            <p>{metric.descrizione}</p>
            <div className="metric-form-row">
              <label>Peso %
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={metric.peso_percentuale}
                  onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, peso_percentuale: Number(e.target.value) } : m))}
                />
              </label>
              <label>Soglia minima
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={120}
                  step="1"
                  value={metric.soglia_minima ?? ""}
                  placeholder="—"
                  onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, soglia_minima: e.target.value === "" ? null : Number(e.target.value) } : m))}
                />
              </label>
            </div>
            <label className="note-label">Nota interna
              <textarea
                className="input"
                value={metric.note ?? ""}
                onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, note: e.target.value } : m))}
              />
            </label>
            <button className="button full" onClick={() => void saveMetric(metric)} disabled={saving}>
              <Save size={16} /> Salva {metric.code}
            </button>
          </article>
        ))}
      </section>

      <section className="quantum-panel">
        <div className="quantum-panel-head">
          <div>
            <span className="eyebrow">Target per ruolo</span>
            <h3>Standard di confronto</h3>
            <p>Qui imposti saturazione attesa, produzione attesa, ore disponibili e giornate minime per ogni ruolo KPI.</p>
          </div>
          <div className="segmented">
            <button className={selectedPeriod === "WEEK" ? "active" : ""} onClick={() => setSelectedPeriod("WEEK")}>Settimana</button>
            <button className={selectedPeriod === "MONTH" ? "active" : ""} onClick={() => setSelectedPeriod("MONTH")}>Mese</button>
          </div>
        </div>

        <div className="target-list">
          {roles.map((role) => {
            const target = targetFor(role.id, selectedPeriod);
            return (
              <div className="target-row" key={`${role.id}-${selectedPeriod}`}>
                <div className="target-title">
                  <Target size={18} />
                  <div>
                    <strong>{role.nome_ruolo}</strong>
                    <span>{role.codice_ruolo}</span>
                  </div>
                </div>
                <label>Saturazione %
                  <input className="input" type="number" value={target.target_saturation_percent} onChange={(e) => updateTarget({ ...target, target_saturation_percent: Number(e.target.value) })} />
                </label>
                <label>Produzione target
                  <input className="input" type="number" step="0.25" value={target.target_production_units} onChange={(e) => updateTarget({ ...target, target_production_units: Number(e.target.value) })} />
                </label>
                <label>Ore disponibili
                  <input className="input" type="number" step="0.25" value={target.available_hours} onChange={(e) => updateTarget({ ...target, available_hours: Number(e.target.value) })} />
                </label>
                <label>Giorni min.
                  <input className="input" type="number" value={target.min_working_days} onChange={(e) => updateTarget({ ...target, min_working_days: Number(e.target.value) })} />
                </label>
                <button className="icon-button" onClick={() => void saveTarget(target)} disabled={saving}><Save size={15} /> Salva</button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
