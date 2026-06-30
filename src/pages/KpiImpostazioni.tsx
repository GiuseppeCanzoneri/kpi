import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, RefreshCw, Save, Target } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { MissingFieldsModal } from "../components/MissingFieldsModal";
import { supabase } from "../integrations/supabase/client";
import { findMissingFields } from "../lib/formValidation";
import type { KpiMetricSetting } from "../types/kpi";

type KpiRole = { id: string; codice_ruolo: string; nome_ruolo: string; group_id: string; attivo: boolean };
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

function numberIt(value: unknown) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

export default function KpiImpostazioni() {
  const [metrics, setMetrics] = useState<KpiMetricSetting[]>([]);
  const [roles, setRoles] = useState<KpiRole[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<"MONTH" | "WEEK">("MONTH");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
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
      setMetrics((metricRes.data ?? []) as unknown as KpiMetricSetting[]);
      setRoles((roleRes.data ?? []) as KpiRole[]);
      setTargets((targetRes.data ?? []) as TargetRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveMetric = async (metric: KpiMetricSetting) => {
    const missing = findMissingFields([
      { label: `${metric.code} - nome breve`, value: metric.nome_breve ?? metric.nome },
      { label: `${metric.code} - peso percentuale`, value: metric.peso_percentuale },
      { label: `${metric.code} - soglia minima`, value: metric.soglia_minima },
      { label: `${metric.code} - testo popup informativo`, value: metric.popup_testo },
    ]);
    if (missing.length) {
      setMissingFields(missing);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.rpc("kpi_upsert_metric_setting", {
      p_code: metric.code,
      p_nome_breve: metric.nome_breve ?? metric.nome,
      p_descrizione: metric.descrizione ?? null,
      p_popup_testo: metric.popup_testo ?? null,
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
    const role = roles.find((r) => r.id === target.kpi_role_id);
    const missing = findMissingFields([
      { label: `${role?.nome_ruolo ?? "Ruolo"} - data validità`, value: target.valid_from },
      { label: `${role?.nome_ruolo ?? "Ruolo"} - saturazione %`, value: target.target_saturation_percent },
      { label: `${role?.nome_ruolo ?? "Ruolo"} - produzione target`, value: target.target_production_units },
      { label: `${role?.nome_ruolo ?? "Ruolo"} - ore disponibili`, value: target.available_hours },
      { label: `${role?.nome_ruolo ?? "Ruolo"} - giorni minimi`, value: target.min_working_days },
    ]);
    if (missing.length) {
      setMissingFields(missing);
      return;
    }

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
    const { error } = await supabase.from("kpi_targets").upsert(payload, { onConflict: "kpi_role_id,period_type,valid_from" });
    setSaving(false);
    if (error) setError(error.message);
    else {
      setMessage("Target salvato correttamente.");
      await load();
    }
  };

  return (
    <div className="quantum-page">
      <PageHeader
        title="Impostazioni KPI"
        description="Configura nomi brevi, popup informativi, pesi e soglie K1-K5. Il cruscotto usa scala 0-100."
        actions={<button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>}
      />

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="quantum-panel">
        <div className="quantum-panel-head">
          <div>
            <span className="eyebrow">Motore KPI</span>
            <h3>K1-K5</h3>
            <p>I pesi devono totalizzare 100%. Qualità e Scadenze restano separati.</p>
          </div>
          <span className={Math.round(totalWeight) === 100 ? "status-pill ok" : "status-pill da-correggere"}>{numberIt(totalWeight)}%</span>
        </div>

        <div className="metric-config-grid">
          {metrics.map((metric) => (
            <article className="metric-config-card" key={metric.code}>
              <div className="metric-config-head">
                <strong>{metric.code}</strong>
                <label className="check-inline"><input type="checkbox" checked={metric.attivo} onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, attivo: e.target.checked } : m))} /> Attivo</label>
              </div>
              <label>Nome breve<input className="input" value={metric.nome_breve ?? metric.nome} onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, nome_breve: e.target.value, nome: e.target.value } : m))} /></label>
              <label>Descrizione sintetica<textarea className="input" value={metric.descrizione ?? ""} onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, descrizione: e.target.value } : m))} /></label>
              <label>Testo popup informativo<textarea className="input textarea-large" value={metric.popup_testo ?? ""} onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, popup_testo: e.target.value } : m))} /></label>
              <div className="metric-config-numbers">
                <label>Peso %<input className="input" type="number" value={metric.peso_percentuale} onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, peso_percentuale: Number(e.target.value) } : m))} /></label>
                <label>Soglia<input className="input" type="number" value={metric.soglia_minima ?? ""} onChange={(e) => setMetrics((prev) => prev.map((m) => m.code === metric.code ? { ...m, soglia_minima: e.target.value === "" ? null : Number(e.target.value) } : m))} /></label>
              </div>
              <p className="muted"><Info size={14} /> Scala operativa: 0-100</p>
              <button className="button full" onClick={() => void saveMetric(metric)} disabled={saving}><Save size={16} /> Salva {metric.code}</button>
            </article>
          ))}
        </div>
      </section>

      <section className="quantum-panel">
        <div className="quantum-panel-head">
          <div>
            <span className="eyebrow">Target per ruolo</span>
            <h3>Standard di confronto</h3>
            <p>Saturazione attesa, produzione attesa, ore disponibili e giornate minime.</p>
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
                <div className="target-title"><Target size={18} /><div><strong>{role.nome_ruolo}</strong><span>{role.codice_ruolo}</span></div></div>
                <label>Dal<input className="input" type="date" value={target.valid_from} onChange={(e) => updateTarget({ ...target, valid_from: e.target.value })} /></label>
                <label>Saturazione %<input className="input" type="number" value={target.target_saturation_percent} onChange={(e) => updateTarget({ ...target, target_saturation_percent: Number(e.target.value) })} /></label>
                <label>Produzione target<input className="input" type="number" step="0.25" value={target.target_production_units} onChange={(e) => updateTarget({ ...target, target_production_units: Number(e.target.value) })} /></label>
                <label>Ore disponibili<input className="input" type="number" step="0.25" value={target.available_hours} onChange={(e) => updateTarget({ ...target, available_hours: Number(e.target.value) })} /></label>
                <label>Giorni min.<input className="input" type="number" value={target.min_working_days} onChange={(e) => updateTarget({ ...target, min_working_days: Number(e.target.value) })} /></label>
                <button className="icon-button" onClick={() => void saveTarget(target)} disabled={saving}><Save size={15} /> Salva</button>
              </div>
            );
          })}
        </div>
      </section>

      {missingFields.length > 0 && <MissingFieldsModal fields={missingFields} onClose={() => setMissingFields([])} />}
    </div>
  );
}
