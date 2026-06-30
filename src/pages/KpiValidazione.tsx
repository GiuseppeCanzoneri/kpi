import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Save } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { TimesheetView } from "../types/db";

const qualityOptions = [
  ["da_validare", "Da validare"],
  ["approvata_primo_controllo", "Approvata al primo controllo"],
  ["qualita_eccezionale", "Qualità eccezionale"],
  ["integrazione_lieve", "Integrazione lieve"],
  ["integrazione_rilevante", "Integrazione rilevante"],
  ["respinta_rifatta", "Respinta / rifatta"],
  ["non_conformita_critica", "Non conformità critica"],
];

const exclusionOptions = [
  ["", "Nessuna esclusione"],
  ["ferie", "Ferie"],
  ["malattia", "Malattia"],
  ["permesso", "Permesso"],
  ["formazione_autorizzata", "Formazione autorizzata"],
  ["blocco_esterno", "Blocco esterno documentato"],
  ["attesa_cliente", "Attesa cliente / terzi"],
];

type Row = TimesheetView & Record<string, any>;

function todayRange() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export default function KpiValidazione() {
  const { isSuperAdmin, isAdminArea } = useAuth();
  const canValidate = isSuperAdmin || isAdminArea;
  const initial = todayRange();
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .order("data", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [month, year]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.rpc("kpi_validate_timesheet_entry", {
      p_entry_id: editing.id,
      p_quality_outcome: editing.kpi_quality_outcome ?? "approvata_primo_controllo",
      p_quality_bonus: Number(editing.kpi_quality_bonus ?? 0),
      p_rework_hours: Number(editing.kpi_rework_hours ?? 0),
      p_due_date: editing.kpi_due_date || null,
      p_completed_at: editing.kpi_completed_at || null,
      p_exclusion_reason: editing.kpi_exclusion_reason || null,
      p_excluded_hours: Number(editing.kpi_excluded_hours ?? 0),
      p_validation_note: editing.kpi_validation_note || null,
      p_priority: Boolean(editing.kpi_priority),
      p_critical_nonconformity: Boolean(editing.kpi_critical_nonconformity),
    });
    setSaving(false);
    if (error) setError(error.message);
    else {
      setEditing(null);
      await load();
    }
  };

  return (
    <div>
      <PageHeader
        title="Validazione KPI"
        description="Classifica qualità, scadenze, rilavorazioni ed esclusioni. Il timesheet resta invariato: qui validi solo i dati KPI."
        actions={<button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button>}
      />

      {!canValidate && <div className="alert warning">La validazione KPI è riservata ad Admin Area e Super Admin.</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="filters-bar pro-filters">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
        <div className="filters-summary"><strong>{rows.length}</strong> righe · <strong>{rows.filter((row) => row.kpi_validated_at).length}</strong> validate</div>
      </div>

      <div className="table-wrap elevated-table">
        <table className="data-table compact">
          <thead>
            <tr><th>Data</th><th>Dipendente</th><th>Commessa</th><th>Attività</th><th>Ore</th><th>Qualità</th><th>Scadenza</th><th>Rilavorazioni</th><th>Esclusione</th><th>Azioni</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.data}</td>
                <td><strong>{row.employee_name}</strong><br /><span className="muted small-text">{row.employee_email}</span></td>
                <td>{row.codice_commessa}</td>
                <td>{row.codice_attivita}</td>
                <td>{row.ore}</td>
                <td>{row.kpi_quality_outcome ?? "da_validare"}</td>
                <td>{row.kpi_due_date ?? "—"}</td>
                <td>{row.kpi_rework_hours ?? 0}</td>
                <td>{row.kpi_exclusion_reason ?? "—"}</td>
                <td><button className="icon-button" disabled={!canValidate} onClick={() => setEditing(row)}><CheckCircle2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-backdrop">
          <div className="modal large pro-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Validazione KPI</span>
                <h3>{editing.employee_name}</h3>
                <p className="muted">{editing.codice_commessa} · {editing.codice_attivita}</p>
              </div>
              <button className="icon-button" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="form-grid refined">
              <label>Esito qualità
                <select className="input" value={editing.kpi_quality_outcome ?? "da_validare"} onChange={(e) => setEditing({ ...editing, kpi_quality_outcome: e.target.value })}>
                  {qualityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Bonus qualità<input className="input" type="number" min={0} max={20} step="1" value={editing.kpi_quality_bonus ?? 0} onChange={(e) => setEditing({ ...editing, kpi_quality_bonus: Number(e.target.value) })} /></label>
              <label>Ore rilavorazione<input className="input" type="number" min={0} step="0.25" value={editing.kpi_rework_hours ?? 0} onChange={(e) => setEditing({ ...editing, kpi_rework_hours: Number(e.target.value) })} /></label>
              <label>Scadenza KPI<input className="input" type="date" value={editing.kpi_due_date ?? ""} onChange={(e) => setEditing({ ...editing, kpi_due_date: e.target.value })} /></label>
              <label>Completata il<input className="input" type="datetime-local" value={(editing.kpi_completed_at ?? "").slice(0, 16)} onChange={(e) => setEditing({ ...editing, kpi_completed_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
              <label>Motivo esclusione
                <select className="input" value={editing.kpi_exclusion_reason ?? ""} onChange={(e) => setEditing({ ...editing, kpi_exclusion_reason: e.target.value })}>
                  {exclusionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Ore escluse<input className="input" type="number" min={0} step="0.25" value={editing.kpi_excluded_hours ?? 0} onChange={(e) => setEditing({ ...editing, kpi_excluded_hours: Number(e.target.value) })} /></label>
              <label><input type="checkbox" checked={Boolean(editing.kpi_priority)} onChange={(e) => setEditing({ ...editing, kpi_priority: e.target.checked })} /> Attività prioritaria</label>
              <label><input type="checkbox" checked={Boolean(editing.kpi_critical_nonconformity)} onChange={(e) => setEditing({ ...editing, kpi_critical_nonconformity: e.target.checked })} /> Non conformità critica</label>
              <label className="full">Nota validazione<textarea className="input" value={editing.kpi_validation_note ?? ""} onChange={(e) => setEditing({ ...editing, kpi_validation_note: e.target.value })} /></label>
            </div>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setEditing(null)}>Annulla</button>
              <button className="button" onClick={() => void save()} disabled={saving}><Save size={16} /> {saving ? "Salvataggio..." : "Salva validazione"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
