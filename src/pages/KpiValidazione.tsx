import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  HelpCircle,
  RefreshCw,
  Save,
  Search,
  Target,
  X,
} from "lucide-react";
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
  descrizione: string | null;
  ore: number;
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

type Preset = {
  label: string;
  help: string;
  outcome: string;
  bonus?: number;
  rework?: number;
  exclusion?: string;
  critical?: boolean;
  note: string;
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

const presets: Preset[] = [
  {
    label: "OK standard",
    help: "Lavoro corretto, nessuna rilavorazione, scadenza rispettata.",
    outcome: "approvata_primo_controllo",
    bonus: 0,
    rework: 0,
    note: "Lavoro validato al primo controllo. Nessuna rilavorazione richiesta.",
  },
  {
    label: "Qualità alta",
    help: "Lavoro sopra lo standard atteso. Il bonus serve solo come motivazione positiva.",
    outcome: "qualita_eccezionale",
    bonus: 10,
    rework: 0,
    note: "Qualità superiore allo standard atteso per accuratezza, completezza e autonomia.",
  },
  {
    label: "Integrazione lieve",
    help: "Piccola correzione formale. Penalizza poco K4.",
    outcome: "integrazione_lieve",
    bonus: 0,
    rework: 0,
    note: "Richiesta integrazione lieve. Il lavoro resta utilizzabile con piccole correzioni.",
  },
  {
    label: "Integrazione rilevante",
    help: "Correzione sostanziale. Penalizza K4.",
    outcome: "integrazione_rilevante",
    bonus: 0,
    rework: 0.5,
    note: "Richiesta integrazione rilevante per completare o correggere il lavoro consegnato.",
  },
  {
    label: "Respinta / rifatta",
    help: "Lavoro da rifare. Penalizza molto K4 e può incidere su K3.",
    outcome: "respinta_rifatta",
    bonus: 0,
    rework: 1,
    note: "Attività respinta o da rifare. Necessaria rilavorazione imputabile.",
  },
  {
    label: "Blocco esterno",
    help: "Ritardo non imputabile. Va motivato e non deve penalizzare K5.",
    outcome: "approvata_primo_controllo",
    bonus: 0,
    rework: 0,
    exclusion: "blocco_esterno",
    note: "Attività condizionata da blocco esterno documentato. Ritardo non imputabile al dipendente.",
  },
  {
    label: "Critica",
    help: "Errore grave. Blocca il premio e limita K4.",
    outcome: "non_conformita_critica",
    bonus: 0,
    rework: 1,
    critical: true,
    note: "Non conformità critica rilevata. Necessario intervento correttivo e valutazione del responsabile.",
  },
];

function currentMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(value));
}

function clean(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function toDateInput(value: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function toDateTimeInput(value: string | null) {
  if (!value) return "";
  return String(value).slice(0, 16);
}

function fmt(value: unknown) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function qualityLabel(value: string) {
  return qualityOptions.find(([code]) => code === value)?.[1] ?? value;
}

function exclusionLabel(value: string) {
  return exclusionOptions.find(([code]) => code === value)?.[1] ?? value;
}

function estimateK4(editing: EditingState) {
  let base = 100;
  if (editing.kpi_quality_outcome === "integrazione_lieve") base = 95;
  if (editing.kpi_quality_outcome === "integrazione_rilevante") base = 85;
  if (editing.kpi_quality_outcome === "respinta_rifatta") base = 70;
  if (editing.kpi_quality_outcome === "non_conformita_critica" || editing.kpi_critical_nonconformity) base = 60;
  const reworkPenalty = Math.min(30, Number(editing.kpi_rework_hours || 0) * 5);
  const bonus = editing.kpi_quality_outcome === "qualita_eccezionale" ? Math.min(10, Number(editing.kpi_quality_bonus || 0)) : 0;
  return Math.max(0, Math.min(100, base + bonus - reworkPenalty));
}

function estimateK5(editing: EditingState) {
  if (editing.kpi_exclusion_reason) return { score: 100, text: "Esclusa dal calcolo per causa documentata." };
  if (!editing.kpi_due_date) return { score: 100, text: "Nessuna scadenza impostata: non penalizza K5, ma è meno tracciabile." };
  if (!editing.kpi_completed_at) return { score: 70, text: "Scadenza presente ma completamento non indicato." };
  const due = new Date(`${editing.kpi_due_date}T23:59:59`);
  const done = new Date(editing.kpi_completed_at);
  if (done.getTime() <= due.getTime()) return { score: 100, text: "Completata entro la scadenza." };
  return { score: 60, text: "Completata dopo la scadenza. Penalizza K5 se il ritardo è imputabile." };
}

function buildPositiveNote(editing: EditingState) {
  if (editing.kpi_quality_outcome === "qualita_eccezionale") {
    return "Qualità superiore allo standard: lavoro completo, accurato e utilizzabile senza rilavorazioni.";
  }
  if (editing.kpi_exclusion_reason) {
    return `Esclusione motivata: ${exclusionLabel(editing.kpi_exclusion_reason)}. La causa non è imputabile al dipendente.`;
  }
  if (editing.kpi_quality_outcome === "approvata_primo_controllo") {
    return "Lavoro approvato al primo controllo, senza rilavorazioni e con scadenza rispettata se presente.";
  }
  return "Validazione registrata dal responsabile. Verificare qualità, rilavorazioni e scadenza.";
}

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
    if (firstError) {
      setError(firstError.message);
    } else {
      const visibleAreas = ((areaRes.data ?? []) as Area[]).filter((area) => isSuperAdmin || areaIds.includes(area.id));
      let visibleRows = (queueRes.data ?? []) as unknown as QueueRow[];
      if (!isSuperAdmin) visibleRows = visibleRows.filter((row) => !row.business_area_id || areaIds.includes(row.business_area_id));
      setAreas(visibleAreas);
      setRows(visibleRows);
      setSelectedIds([]);
    }

    setLoading(false);
  }, [areaIds, isSuperAdmin, periodEnd, periodStart]);

  useEffect(() => {
    void load();
  }, [load]);

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
    return {
      total,
      done,
      open: total - done,
      critical: rows.filter((row) => row.kpi_critical_nonconformity).length,
      rework: rows.reduce((sum, row) => sum + Number(row.kpi_rework_hours ?? 0), 0),
    };
  }, [rows]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const selectAllVisible = () => {
    const ids = filteredRows.map((row) => row.id);
    setSelectedIds((prev) => (prev.length === ids.length ? [] : ids));
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
    else {
      setMessage(`${data ?? 0} righe validate.`);
      await load();
    }
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
    else {
      setMessage(`${data ?? 0} righe validate sul periodo.`);
      await load();
    }
  };

  const calculate = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error } = await supabase.rpc("kpi_calculate_period", {
      p_period_type: "MONTH",
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
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
      descrizione: row.descrizione,
      ore: Number(row.ore ?? 0),
      kpi_quality_outcome: row.kpi_quality_outcome === "da_validare" ? "approvata_primo_controllo" : row.kpi_quality_outcome,
      kpi_quality_bonus: Number(row.kpi_quality_bonus ?? 0),
      kpi_rework_hours: Number(row.kpi_rework_hours ?? 0),
      kpi_due_date: toDateInput(row.kpi_due_date),
      kpi_completed_at: toDateTimeInput(row.kpi_completed_at),
      kpi_exclusion_reason: row.kpi_exclusion_reason ?? "",
      kpi_excluded_hours: Number(row.kpi_excluded_hours ?? 0),
      kpi_validation_note: row.kpi_validation_note ?? "",
      kpi_priority: Boolean(row.kpi_priority),
      kpi_critical_nonconformity: Boolean(row.kpi_critical_nonconformity),
    });
  };

  const applyPreset = (preset: Preset) => {
    if (!editing) return;
    setEditing({
      ...editing,
      kpi_quality_outcome: preset.outcome,
      kpi_quality_bonus: Number(preset.bonus ?? 0),
      kpi_rework_hours: Number(preset.rework ?? 0),
      kpi_exclusion_reason: preset.exclusion ?? "",
      kpi_excluded_hours: preset.exclusion ? Math.max(0, editing.ore) : 0,
      kpi_critical_nonconformity: Boolean(preset.critical),
      kpi_validation_note: preset.note,
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
    if (missing.length) {
      setMissingFields(missing);
      return;
    }

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
    else {
      setEditing(null);
      setMessage("Riga validata correttamente.");
      await load();
    }
  };

  const estimatedK5 = editing ? estimateK5(editing) : null;

  return (
    <div className="page kpi-validation-page">
      <section className="pro-header kpi-validation-hero">
        <div>
          <span className="eyebrow">Modulo KPI</span>
          <h2>Validazione KPI</h2>
          <p>
            Questa pagina serve a confermare qualità, scadenze, rilavorazioni ed esclusioni. Non forza tutto il punteggio a 100: K1, K2 e K3 dipendono da ore, target ruolo e tempo standard attività.
          </p>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} /> Aggiorna
          </button>
          <button className="button" onClick={() => void calculate()} disabled={saving}>
            <Calculator size={16} /> Calcola KPI
          </button>
        </div>
      </section>

      <section className="kpi-validation-guide panel">
        <div className="kpi-guide-title">
          <HelpCircle size={19} />
          <div>
            <h3>Come ottenere un valore positivo</h3>
            <p>La validazione lavora direttamente su K4 Qualità e K5 Scadenze. Gli altri KPI arrivano dai dati già registrati.</p>
          </div>
        </div>
        <div className="kpi-guide-grid">
          <div><strong>K1 Tempo produttivo</strong><span>Sale con ore produttive validate rispetto alle ore disponibili nette. Non basta mettere “eccellente”.</span></div>
          <div><strong>K2 Produzione</strong><span>Sale se l’attività ha tempo standard e complessità adeguati rispetto al target del ruolo.</span></div>
          <div><strong>K3 Efficienza</strong><span>Sale se le ore standard prodotte sono vicine o superiori alle ore realmente impiegate.</span></div>
          <div><strong>K4 Qualità</strong><span>Si controlla qui: approvata, integrazione, respinta, rilavorazioni, criticità.</span></div>
          <div><strong>K5 Scadenze</strong><span>Si controlla qui: scadenza, data completamento, blocchi esterni o esclusioni motivate.</span></div>
        </div>
        <div className="kpi-guide-warning">
          <AlertTriangle size={18} />
          <span>Per test realistici non usare una sola riga su un mese intero: usa un periodo breve oppure configura target ruolo e tempi standard coerenti.</span>
        </div>
      </section>

      {!canValidate && <div className="alert warning">La validazione KPI è riservata ad Admin Area e Super Admin.</div>}
      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="kpi-grid kpi-validation-stats">
        <div className="kpi-card"><span>Righe periodo</span><strong>{stats.total}</strong><small>Totale presenti</small></div>
        <div className="kpi-card"><span>Da validare</span><strong>{stats.open}</strong><small>Azionabili subito</small></div>
        <div className="kpi-card"><span>Validate</span><strong>{stats.done}</strong><small>Pronte per calcolo</small></div>
        <div className="kpi-card"><span>Rilavorazioni</span><strong>{fmt(stats.rework)}</strong><small>Ore imputabili</small></div>
        <div className="kpi-card"><span>Critiche</span><strong>{stats.critical}</strong><small>Bloccano premio</small></div>
      </section>

      <section className="filters-bar kpi-validation-filters">
        <label>Dal <input className="input small" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
        <label>Al <input className="input small" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
        <label>Area
          <select className="input" value={areaId} onChange={(event) => setAreaId(event.target.value)}>
            <option value="">Tutte le aree</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.codice_area} · {area.nome_area}</option>)}
          </select>
        </label>
        <label>Esito rapido
          <select className="input" value={qualityQuick} onChange={(event) => setQualityQuick(event.target.value)}>
            {qualityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>

      <section className="filters-bar kpi-validation-searchbar">
        <div className="search-box">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca dipendente, commessa, attività, descrizione..." />
          {search && <button type="button" onClick={() => setSearch("")}><X size={14} /></button>}
        </div>
        <label className="check-inline"><input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} /> Solo da validare</label>
        <button className="button secondary" type="button" onClick={selectAllVisible}>{selectedIds.length ? "Deseleziona" : "Seleziona visibili"}</button>
        <button className="button secondary" type="button" onClick={() => void validateRows(selectedIds)} disabled={saving}>Valida selezionate ({selectedIds.length})</button>
        <button className="button" type="button" onClick={() => void bulkValidatePeriod()} disabled={saving || !canValidate}>Valida tutto OK</button>
      </section>

      <section className="kpi-validation-list">
        {filteredRows.map((row) => {
          const isValidated = Boolean(row.kpi_validated_at);
          return (
            <article key={row.id} className={`kpi-validation-row ${isValidated ? "is-validated" : "is-open"}`}>
              <label className="kpi-row-check"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelected(row.id)} /></label>
              <div className="kpi-row-date"><strong>{shortDate(row.data)}</strong><span>{fmt(row.ore)} ore</span></div>
              <div className="kpi-row-body">
                <div className="kpi-row-titleline">
                  <h3>{row.employee_name}</h3>
                  <span className={`status-pill ${isValidated ? "ok" : "bozza"}`}>{isValidated ? "Validata" : "Da validare"}</span>
                </div>
                <p className="kpi-row-meta">{row.codice_commessa ?? "—"} · {row.codice_attivita ?? "—"} · {row.codice_area ?? "—"}</p>
                <p className="kpi-row-description">{row.descrizione || "Nessuna descrizione inserita dal dipendente."}</p>
                <div className="kpi-row-tags">
                  <span>Qualità: {qualityLabel(row.kpi_quality_outcome)}</span>
                  <span>Scadenza: {row.kpi_due_date ?? "non impostata"}</span>
                  {row.kpi_rework_hours > 0 && <span>Rilavorazione: {fmt(row.kpi_rework_hours)} h</span>}
                </div>
              </div>
              <div className="kpi-row-actions">
                <button className="button secondary" type="button" onClick={() => openEdit(row)}>Dettaglio</button>
                <button className="button" type="button" onClick={() => void validateRows([row.id])} disabled={saving || !canValidate}>OK</button>
              </div>
            </article>
          );
        })}
        {!filteredRows.length && (
          <div className="empty-state"><strong>Nessuna riga da validare</strong><p>Controlla periodo, area o filtro “solo da validare”.</p></div>
        )}
      </section>

      {editing && estimatedK5 && (
        <div className="modal-backdrop">
          <div className="modal-card kpi-validation-modal">
            <div className="modal-header kpi-validation-modal-header">
              <div>
                <span className="eyebrow">Dettaglio validazione</span>
                <h3>{editing.employee_name}</h3>
                <p>{editing.codice_commessa ?? "—"} · {editing.codice_attivita ?? "—"}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>

            <div className="kpi-validation-modal-grid">
              <aside className="kpi-validation-help-panel">
                <div className="panel-title"><Target size={18} /> Impatto stimato</div>
                <div className="kpi-score-preview-card">
                  <span>K4 Qualità</span>
                  <strong>{fmt(estimateK4(editing))}/100</strong>
                  <p>Dipende da esito qualità, rilavorazioni e criticità. Non modifica K1, K2 e K3.</p>
                </div>
                <div className="kpi-score-preview-card">
                  <span>K5 Scadenze</span>
                  <strong>{fmt(estimatedK5.score)}/100</strong>
                  <p>{estimatedK5.text}</p>
                </div>
                <div className="kpi-positive-box">
                  <strong>Quando è positivo?</strong>
                  <p>Usa “Approvata al primo controllo”, zero rilavorazioni, completamento entro scadenza e una nota chiara se vuoi motivare il risultato.</p>
                </div>
                <div className="kpi-preset-stack">
                  {presets.map((preset) => (
                    <button key={preset.label} type="button" className="kpi-preset-button" onClick={() => applyPreset(preset)}>
                      <strong>{preset.label}</strong>
                      <span>{preset.help}</span>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="kpi-validation-form-panel">
                <div className="kpi-registered-activity">
                  <span>Attività registrata</span>
                  <p>{editing.descrizione || "Nessuna descrizione inserita dal dipendente."}</p>
                </div>

                <div className="kpi-form-grid-clear">
                  <label>Esito qualità
                    <select className="input" value={editing.kpi_quality_outcome} onChange={(event) => setEditing({ ...editing, kpi_quality_outcome: event.target.value })}>
                      {qualityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <small>Incide su K4. “Eccellente” non rende automaticamente ottimi K1, K2 e K3.</small>
                  </label>
                  <label>Bonus qualità
                    <input className="input" type="number" min="0" max="10" step="1" value={editing.kpi_quality_bonus} onChange={(event) => setEditing({ ...editing, kpi_quality_bonus: Number(event.target.value) })} />
                    <small>Solo motivazione positiva. Non usare per gonfiare dati bassi.</small>
                  </label>
                  <label>Ore rilavorazione
                    <input className="input" type="number" min="0" step="0.25" value={editing.kpi_rework_hours} onChange={(event) => setEditing({ ...editing, kpi_rework_hours: Number(event.target.value) })} />
                    <small>Ore perse per correzioni imputabili. Penalizza K4 e può incidere su K3.</small>
                  </label>
                  <label>Scadenza KPI
                    <input className="input" type="date" value={editing.kpi_due_date} onChange={(event) => setEditing({ ...editing, kpi_due_date: event.target.value })} />
                    <small>Serve per K5. Se non c’è una vera scadenza, lascia vuoto.</small>
                  </label>
                  <label>Completata il
                    <input className="input" type="datetime-local" value={editing.kpi_completed_at} onChange={(event) => setEditing({ ...editing, kpi_completed_at: event.target.value })} />
                    <small>Se completata entro la scadenza, K5 resta positivo.</small>
                  </label>
                  <label>Motivo esclusione
                    <select className="input" value={editing.kpi_exclusion_reason} onChange={(event) => setEditing({ ...editing, kpi_exclusion_reason: event.target.value })}>
                      {exclusionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <small>Usalo solo per cause non imputabili: cliente, blocco esterno, ferie, permessi.</small>
                  </label>
                  <label>Ore escluse
                    <input className="input" type="number" min="0" step="0.25" value={editing.kpi_excluded_hours} onChange={(event) => setEditing({ ...editing, kpi_excluded_hours: Number(event.target.value) })} />
                    <small>Compila solo se hai indicato un motivo di esclusione.</small>
                  </label>
                  <label className="check-row"><input type="checkbox" checked={editing.kpi_priority} onChange={(event) => setEditing({ ...editing, kpi_priority: event.target.checked })} /> Attività prioritaria</label>
                  <label className="check-row"><input type="checkbox" checked={editing.kpi_critical_nonconformity} onChange={(event) => setEditing({ ...editing, kpi_critical_nonconformity: event.target.checked })} /> Non conformità critica</label>
                  <label className="span-2">Nota validazione / motivazione responsabile
                    <textarea className="input textarea-large" value={editing.kpi_validation_note} onChange={(event) => setEditing({ ...editing, kpi_validation_note: event.target.value })} />
                    <small>Scrivi perché il lavoro è positivo, cosa va corretto oppure perché un ritardo è esterno.</small>
                  </label>
                </div>

                <div className="kpi-modal-actions">
                  <button className="button secondary" type="button" onClick={() => setEditing({ ...editing, kpi_validation_note: buildPositiveNote(editing) })}>Usa nota suggerita</button>
                  <button className="button secondary" type="button" onClick={() => setEditing(null)}>Annulla</button>
                  <button className="button" type="button" onClick={() => void saveSingle()} disabled={saving || !canValidate}><Save size={16} /> Salva validazione</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {missingFields.length > 0 && <MissingFieldsModal fields={missingFields} onClose={() => setMissingFields([])} />}
    </div>
  );
}
