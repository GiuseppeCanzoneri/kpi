import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, RefreshCw, Save, Search, Sparkles, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { MissingFieldsModal } from "../components/MissingFieldsModal";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import { findMissingFields } from "../lib/formValidation";

type QueueRow = {
  id: string;
  data: string;
  business_area_id: string | null;
  employee_name: string;
  employee_email: string;
  nome_area: string | null;
  codice_area: string | null;
  codice_commessa: string | null;
  descrizione_commessa: string | null;
  codice_attivita: string | null;
  nome_categoria: string | null;
  descrizione: string | null;
  ore: number;
  kpi_quality_outcome: string;
  kpi_quality_bonus?: number;
  kpi_due_date: string | null;
  kpi_completed_at: string | null;
  kpi_rework_hours: number;
  kpi_exclusion_reason: string | null;
  kpi_excluded_hours: number;
  kpi_validation_note: string | null;
  kpi_priority: boolean;
  kpi_critical_nonconformity: boolean;
  kpi_validated_at: string | null;
  kpi_validation_status: string;
};

type Area = { id: string; codice_area: string; nome_area: string };
type EditingState = {
  id: string;
  employee_name: string;
  codice_commessa: string | null;
  codice_attivita: string | null;
  kpi_quality_outcome: string;
  kpi_quality_bonus: number;
  kpi_rework_hours: number;
  kpi_due_date: string;
  kpi_completed_at: string;
  kpi_exclusion_reason: string;
  kpi_excluded_hours: number;
  kpi_validation_note: string;
  kpi_priority: boolean;
  kpi_critical_nonconformity: boolean;
};

const qualityOptions = [
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

function currentMonthRange() {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10) };
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(value));
}

function clean(value: unknown) { return String(value ?? "").toLowerCase(); }

export default function KpiValidazione() {
  const { isSuperAdmin, isAdminArea, areaIds } = useAuth();
  const canValidate = isSuperAdmin || isAdminArea;
  const initial = currentMonthRange();
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [qualityQuick, setQualityQuick] = useState("approvata_primo_controllo");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    const [areaRes, queueRes] = await Promise.all([
      supabase.from("business_areas").select("id,codice_area,nome_area").eq("attiva", true).order("nome_area"),
      supabase.from("v_kpi_validation_queue").select("*").gte("data", periodStart).lte("data", periodEnd).order("data", { ascending: false }),
    ]);
    const firstError = areaRes.error || queueRes.error;
    if (firstError) setError(firstError.message);
    else {
      const visibleAreas = ((areaRes.data ?? []) as Area[]).filter((a) => isSuperAdmin || areaIds.includes(a.id));
      let visibleRows = (queueRes.data ?? []) as unknown as QueueRow[];
      if (!isSuperAdmin) visibleRows = visibleRows.filter((r) => !r.business_area_id || areaIds.includes(r.business_area_id));
      setAreas(visibleAreas);
      setRows(visibleRows);
      setSelectedIds([]);
    }
    setLoading(false);
  }, [areaIds, isSuperAdmin, periodEnd, periodStart]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => {
    const query = clean(search);
    return rows.filter((row) => {
      if (areaId && row.business_area_id !== areaId) return false;
      if (onlyOpen && row.kpi_validated_at) return false;
      if (!query) return true;
      return [row.employee_name, row.employee_email, row.codice_commessa, row.descrizione_commessa, row.codice_attivita, row.nome_categoria, row.descrizione].some((value) => clean(value).includes(query));
    });
  }, [areaId, onlyOpen, rows, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const done = rows.filter((row) => row.kpi_validated_at).length;
    return { total, done, open: total - done, critical: rows.filter((row) => row.kpi_critical_nonconformity).length, rework: rows.reduce((sum, row) => sum + Number(row.kpi_rework_hours ?? 0), 0) };
  }, [rows]);

  const toggleSelected = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  const selectAllVisible = () => {
    const ids = filteredRows.map((row) => row.id);
    setSelectedIds((prev) => prev.length === ids.length ? [] : ids);
  };

  const validateRows = async (ids: string[]) => {
    if (!ids.length) {
      setMissingFields(["Seleziona almeno una riga da validare"]);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error } = await supabase.rpc("kpi_bulk_validate_timesheet", {
      p_ids: ids,
      p_quality_outcome: qualityQuick,
      p_note: "Validazione veloce da pannello KPI",
      p_set_completed_at: true,
    });
    setSaving(false);
    if (error) setError(error.message);
    else { setMessage(`${data ?? 0} righe validate.`); await load(); }
  };

  const bulkValidatePeriod = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error } = await supabase.rpc("kpi_bulk_validate_period", {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_business_area_id: areaId || null,
      p_employee_id: null,
      p_quality_outcome: qualityQuick,
      p_only_not_validated: true,
    });
    setSaving(false);
    if (error) setError(error.message);
    else { setMessage(`${data ?? 0} righe validate sul periodo.`); await load(); }
  };

  const calculate = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error } = await supabase.rpc("kpi_calculate_period", { p_period_type: "MONTH", p_period_start: periodStart, p_period_end: periodEnd });
    setSaving(false);
    if (error) setError(error.message);
    else setMessage(`Calcolo KPI completato per ${data ?? 0} dipendenti.`);
  };

  const openEdit = (row: QueueRow) => {
    setEditing({
      id: row.id,
      employee_name: row.employee_name,
      codice_commessa: row.codice_commessa,
      codice_attivita: row.codice_attivita,
      kpi_quality_outcome: row.kpi_quality_outcome === "da_validare" ? "approvata_primo_controllo" : row.kpi_quality_outcome,
      kpi_quality_bonus: Number(row.kpi_quality_bonus ?? 0),
      kpi_rework_hours: Number(row.kpi_rework_hours ?? 0),
      kpi_due_date: row.kpi_due_date ?? "",
      kpi_completed_at: row.kpi_completed_at ? String(row.kpi_completed_at).slice(0, 16) : "",
      kpi_exclusion_reason: row.kpi_exclusion_reason ?? "",
      kpi_excluded_hours: Number(row.kpi_excluded_hours ?? 0),
      kpi_validation_note: row.kpi_validation_note ?? "",
      kpi_priority: Boolean(row.kpi_priority),
      kpi_critical_nonconformity: Boolean(row.kpi_critical_nonconformity),
    });
  };

  const saveSingle = async () => {
    if (!editing) return;
    const missing = findMissingFields([
      { label: "Esito qualità", value: editing.kpi_quality_outcome },
      ...(editing.kpi_critical_nonconformity ? [{ label: "Nota validazione per non conformità critica", value: editing.kpi_validation_note }] : []),
      ...(editing.kpi_exclusion_reason ? [{ label: "Ore escluse", value: editing.kpi_excluded_hours }] : []),
    ]);
    if (editing.kpi_exclusion_reason && Number(editing.kpi_excluded_hours) <= 0) missing.push("Ore escluse maggiori di zero");
    if (missing.length) { setMissingFields(missing); return; }

    setSaving(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.rpc("kpi_validate_timesheet_entry", {
      p_entry_id: editing.id,
      p_quality_outcome: editing.kpi_quality_outcome,
      p_quality_bonus: Number(editing.kpi_quality_bonus || 0),
      p_rework_hours: Number(editing.kpi_rework_hours || 0),
      p_due_date: editing.kpi_due_date || null,
      p_completed_at: editing.kpi_completed_at ? new Date(editing.kpi_completed_at).toISOString() : null,
      p_exclusion_reason: editing.kpi_exclusion_reason || null,
      p_excluded_hours: Number(editing.kpi_excluded_hours || 0),
      p_validation_note: editing.kpi_validation_note || null,
      p_priority: Boolean(editing.kpi_priority),
      p_critical_nonconformity: Boolean(editing.kpi_critical_nonconformity),
    });
    setSaving(false);
    if (error) setError(error.message);
    else { setEditing(null); setMessage("Riga validata correttamente."); await load(); }
  };

  return (
    <div className="quantum-page validation-fast-page">
      <PageHeader
        title="Validazione KPI veloce"
        description="Valida in blocco le righe corrette. Apri il dettaglio solo per eccezioni, rilavorazioni, ritardi o esclusioni."
        actions={<><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Aggiorna</button><button className="button" onClick={() => void calculate()} disabled={saving}><Calculator size={16} /> Calcola KPI</button></>}
      />

      {!canValidate && <div className="alert warning">La validazione KPI è riservata ad Admin Area e Super Admin.</div>}
      {error && <div className="alert error"><AlertTriangle size={16} />{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="kpi-grid five">
        <div className="kpi-card"><span>Righe periodo</span><strong>{stats.total}</strong><small>Totale approvate</small></div>
        <div className="kpi-card"><span>Da validare</span><strong>{stats.open}</strong><small>Azionabili subito</small></div>
        <div className="kpi-card"><span>Validate</span><strong>{stats.done}</strong><small>Pronte per calcolo</small></div>
        <div className="kpi-card"><span>Rilavorazioni</span><strong>{stats.rework.toLocaleString("it-IT")}</strong><small>Ore imputabili</small></div>
        <div className="kpi-card"><span>Critiche</span><strong>{stats.critical}</strong><small>Bloccano premio</small></div>
      </section>

      <section className="validation-command-panel">
        <div className="validation-filters">
          <label>Dal<input className="input" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
          <label>Al<input className="input" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label>
          <label>Area<select className="input" value={areaId} onChange={(e) => setAreaId(e.target.value)}><option value="">Tutte le aree</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.codice_area} · {area.nome_area}</option>)}</select></label>
          <label>Esito rapido<select className="input" value={qualityQuick} onChange={(e) => setQualityQuick(e.target.value)}>{qualityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="ts-search-field"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca dipendente, commessa, attività, descrizione..." />{search && <button type="button" onClick={() => setSearch("")}><X size={14} /></button>}</div>
        <div className="validation-actions-row">
          <label className="check-inline"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Solo da validare</label>
          <button className="button secondary" onClick={selectAllVisible}>{selectedIds.length ? "Deseleziona" : "Seleziona visibili"}</button>
          <button className="button secondary" onClick={() => void validateRows(selectedIds)} disabled={saving}><CheckCircle2 size={16} /> Valida selezionate ({selectedIds.length})</button>
          <button className="button" onClick={() => void bulkValidatePeriod()} disabled={saving}><Sparkles size={16} /> Valida tutto OK</button>
        </div>
      </section>

      <section className="validation-list">
        {filteredRows.map((row) => (
          <article className={`validation-row-card ${row.kpi_validated_at ? "validated" : "open"}`} key={row.id}>
            <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelected(row.id)} />
            <div className="validation-date"><strong>{shortDate(row.data)}</strong><span>{row.ore} ore</span></div>
            <div className="validation-main">
              <h3>{row.employee_name}</h3>
              <p>{row.codice_commessa} · {row.codice_attivita} · {row.codice_area}</p>
              <small>{row.descrizione || "Nessuna descrizione inserita dal dipendente."}</small>
            </div>
            <div className="validation-status">
              <span className={row.kpi_validated_at ? "status-pill ok" : "status-pill da-correggere"}>{row.kpi_validated_at ? "Validata" : "Da validare"}</span>
              <small>Qualità: {row.kpi_quality_outcome}</small>
              <small>Scadenza: {row.kpi_due_date ?? "non impostata"}</small>
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={() => openEdit(row)}>Dettaglio</button>
              <button className="button" onClick={() => void validateRows([row.id])}>OK</button>
            </div>
          </article>
        ))}
        {!filteredRows.length && <div className="empty-state"><strong>Nessuna riga da validare</strong><p>Controlla periodo, area o filtro “solo da validare”.</p></div>}
      </section>

      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal large pro-modal">
            <div className="modal-header"><div><span className="eyebrow">Dettaglio validazione</span><h3>{editing.employee_name}</h3><p>{editing.codice_commessa} · {editing.codice_attivita}</p></div><button className="icon-button" onClick={() => setEditing(null)}>×</button></div>
            <div className="form-grid refined">
              <label>Esito qualità<select className="input" value={editing.kpi_quality_outcome} onChange={(e) => setEditing({ ...editing, kpi_quality_outcome: e.target.value })}>{qualityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Bonus qualità<input className="input" type="number" value={editing.kpi_quality_bonus} onChange={(e) => setEditing({ ...editing, kpi_quality_bonus: Number(e.target.value) })} /></label>
              <label>Ore rilavorazione<input className="input" type="number" step="0.25" value={editing.kpi_rework_hours} onChange={(e) => setEditing({ ...editing, kpi_rework_hours: Number(e.target.value) })} /></label>
              <label>Scadenza KPI<input className="input" type="date" value={editing.kpi_due_date} onChange={(e) => setEditing({ ...editing, kpi_due_date: e.target.value })} /></label>
              <label>Completata il<input className="input" type="datetime-local" value={editing.kpi_completed_at} onChange={(e) => setEditing({ ...editing, kpi_completed_at: e.target.value })} /></label>
              <label>Motivo esclusione<select className="input" value={editing.kpi_exclusion_reason} onChange={(e) => setEditing({ ...editing, kpi_exclusion_reason: e.target.value })}>{exclusionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Ore escluse<input className="input" type="number" step="0.25" value={editing.kpi_excluded_hours} onChange={(e) => setEditing({ ...editing, kpi_excluded_hours: Number(e.target.value) })} /></label>
              <label className="check-row"><input type="checkbox" checked={editing.kpi_priority} onChange={(e) => setEditing({ ...editing, kpi_priority: e.target.checked })} /> Attività prioritaria</label>
              <label className="check-row"><input type="checkbox" checked={editing.kpi_critical_nonconformity} onChange={(e) => setEditing({ ...editing, kpi_critical_nonconformity: e.target.checked })} /> Non conformità critica</label>
              <label className="full">Nota validazione<textarea className="input textarea-large" value={editing.kpi_validation_note} onChange={(e) => setEditing({ ...editing, kpi_validation_note: e.target.value })} /></label>
            </div>
            <div className="modal-actions"><button className="button secondary" onClick={() => setEditing(null)}>Annulla</button><button className="button" onClick={() => void saveSingle()} disabled={saving}><Save size={16} /> Salva validazione</button></div>
          </div>
        </div>
      )}

      {missingFields.length > 0 && <MissingFieldsModal fields={missingFields} onClose={() => setMissingFields([])} />}
    </div>
  );
}
