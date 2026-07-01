import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock,
  HelpCircle,
  Info,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { MissingFieldsModal } from "../components/MissingFieldsModal";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import { findMissingFields } from "../lib/formValidation";

type QualityCode =
  | "approvata_primo_controllo"
  | "qualita_eccezionale"
  | "integrazione_lieve"
  | "integrazione_rilevante"
  | "respinta_rifatta"
  | "non_conformita_critica";

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
  kpi_quality_outcome: QualityCode;
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

type QualityOption = {
  value: QualityCode;
  label: string;
  short: string;
  baseScore: number;
  effect: string;
  when: string;
  suggestedNote: string;
  tone: "good" | "excellent" | "warning" | "danger";
};

const qualityOptions: QualityOption[] = [
  {
    value: "approvata_primo_controllo",
    label: "Approvata al primo controllo",
    short: "OK primo controllo",
    baseScore: 100,
    tone: "good",
    effect: "K4 resta positivo: il lavoro è corretto e utilizzabile senza correzioni.",
    when: "Usala quando l’attività è completa, chiara, consegnabile e non richiede integrazioni.",
    suggestedNote: "Lavoro validato: completo, corretto e utilizzabile senza rilavorazioni.",
  },
  {
    value: "qualita_eccezionale",
    label: "Qualità eccezionale",
    short: "Eccellente",
    baseScore: 100,
    tone: "excellent",
    effect: "K4 resta al massimo; il bonus serve come motivazione positiva tracciata.",
    when: "Usala solo se il lavoro supera lo standard atteso per accuratezza, completezza o impatto.",
    suggestedNote: "Lavoro superiore allo standard: elevata completezza, autonomia e qualità del risultato.",
  },
  {
    value: "integrazione_lieve",
    label: "Integrazione lieve",
    short: "Piccola integrazione",
    baseScore: 95,
    tone: "warning",
    effect: "K4 cala poco: correzione formale o integrazione minima.",
    when: "Usala per piccole mancanze che non compromettono il lavoro finale.",
    suggestedNote: "Richiesta piccola integrazione formale. Il lavoro resta sostanzialmente utilizzabile.",
  },
  {
    value: "integrazione_rilevante",
    label: "Integrazione rilevante",
    short: "Integrazione importante",
    baseScore: 85,
    tone: "warning",
    effect: "K4 scende vicino alla soglia: il lavoro richiede un intervento sostanziale.",
    when: "Usala quando mancano parti importanti o servono correzioni operative rilevanti.",
    suggestedNote: "Richiesta integrazione rilevante: mancano elementi necessari per considerare l’attività completa.",
  },
  {
    value: "respinta_rifatta",
    label: "Respinta / rifatta",
    short: "Da rifare",
    baseScore: 70,
    tone: "danger",
    effect: "K4 va sotto soglia: il lavoro non è idoneo e richiede rifacimento.",
    when: "Usala quando il risultato non è utilizzabile o deve essere rifatto in modo significativo.",
    suggestedNote: "Attività respinta o da rifare: il risultato non è utilizzabile nello stato attuale.",
  },
  {
    value: "non_conformita_critica",
    label: "Non conformità critica",
    short: "Critica",
    baseScore: 60,
    tone: "danger",
    effect: "K4 viene bloccato e il dipendente non è eleggibile al riconoscimento del periodo.",
    when: "Usala solo per errori gravi, rischi, non conformità o problemi che richiedono intervento della Direzione.",
    suggestedNote: "Non conformità critica: errore grave da analizzare con responsabile e Direzione.",
  },
];

const exclusionOptions = [
  { value: "", label: "Nessuna esclusione", help: "Le ore restano nel calcolo KPI." },
  { value: "ferie", label: "Ferie", help: "Ore non disponibili: non devono penalizzare K1." },
  { value: "malattia", label: "Malattia", help: "Ore non disponibili: non devono penalizzare K1." },
  { value: "permesso", label: "Permesso", help: "Ore autorizzate da sottrarre al monte ore disponibile." },
  { value: "formazione_autorizzata", label: "Formazione autorizzata", help: "Formazione ammessa: non penalizza la produttività." },
  { value: "blocco_esterno", label: "Blocco esterno documentato", help: "Blocco non imputabile al dipendente." },
  { value: "attesa_cliente", label: "Attesa cliente / terzi", help: "Attesa non imputabile: da motivare in nota." },
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

function nowDateTimeLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalizeDateTime(value: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function qualityInfo(value: string) {
  return qualityOptions.find((option) => option.value === value) ?? qualityOptions[0];
}

function isNegativeOutcome(value: QualityCode) {
  return ["integrazione_lieve", "integrazione_rilevante", "respinta_rifatta", "non_conformita_critica"].includes(value);
}

function estimateK4(editing: EditingState) {
  const info = qualityInfo(editing.kpi_quality_outcome);
  const bonus = editing.kpi_quality_outcome === "qualita_eccezionale" ? Math.min(20, Math.max(0, editing.kpi_quality_bonus || 0)) : 0;
  const reworkPenalty = Math.max(0, editing.kpi_rework_hours || 0) * 3;
  const criticalCap = editing.kpi_critical_nonconformity || editing.kpi_quality_outcome === "non_conformita_critica" ? 60 : 100;
  return Math.max(0, Math.min(criticalCap, info.baseScore + bonus - reworkPenalty));
}

function estimateK5(editing: EditingState) {
  if (!editing.kpi_due_date) return { label: "Non valutata", score: null as number | null, note: "Nessuna scadenza KPI impostata." };
  if (!editing.kpi_completed_at) return { label: "Da completare", score: null as number | null, note: "Scadenza presente ma data completamento mancante." };

  const due = new Date(`${editing.kpi_due_date}T23:59:59`);
  const completed = new Date(editing.kpi_completed_at);
  if (editing.kpi_exclusion_reason) {
    return { label: "Esclusa", score: null, note: "Ritardo o blocco indicato come non imputabile." };
  }
  if (completed.getTime() <= due.getTime()) return { label: "In tempo", score: 100, note: "Attività completata entro la scadenza." };
  return { label: "In ritardo", score: 60, note: "Attività completata dopo la scadenza. Serve nota se il ritardo non è imputabile." };
}

function fieldHelpForOutcome(value: QualityCode) {
  const info = qualityInfo(value);
  return `${info.when} ${info.effect}`;
}

export default function KpiValidazione() {
  const { isSuperAdmin, isAdminArea, areaIds } = useAuth();
  const canValidate = isSuperAdmin || isAdminArea;
  const initial = currentMonthRange();

  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [qualityQuick, setQualityQuick] = useState<QualityCode>("approvata_primo_controllo");
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
      positive: rows.filter((row) => ["approvata_primo_controllo", "qualita_eccezionale"].includes(row.kpi_quality_outcome)).length,
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
    const { data, error: rpcError } = await supabase.rpc("kpi_bulk_validate_timesheet", {
      p_ids: ids,
      p_quality_outcome: qualityQuick,
      p_note: `Validazione veloce: ${qualityInfo(qualityQuick).suggestedNote}`,
      p_set_completed_at: true,
    });
    setSaving(false);
    if (rpcError) setError(rpcError.message);
    else {
      setMessage(`${data ?? 0} righe validate con esito “${qualityInfo(qualityQuick).label}”.`);
      await load();
    }
  };

  const bulkValidatePeriod = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error: rpcError } = await supabase.rpc("kpi_bulk_validate_period", {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_business_area_id: areaId || null,
      p_employee_id: null,
      p_quality_outcome: qualityQuick,
      p_only_not_validated: true,
    });
    setSaving(false);
    if (rpcError) setError(rpcError.message);
    else {
      setMessage(`${data ?? 0} righe validate sul periodo con esito “${qualityInfo(qualityQuick).label}”.`);
      await load();
    }
  };

  const calculate = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error: rpcError } = await supabase.rpc("kpi_calculate_period", {
      p_period_type: "MONTH",
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    setSaving(false);
    if (rpcError) setError(rpcError.message);
    else setMessage(`Calcolo KPI completato per ${data ?? 0} dipendenti.`);
  };

  const openEdit = (row: QueueRow) => {
    const rawOutcome = row.kpi_quality_outcome === "da_validare" ? "approvata_primo_controllo" : row.kpi_quality_outcome;
    setEditing({
      id: row.id,
      employee_name: row.employee_name,
      codice_commessa: row.codice_commessa,
      codice_attivita: row.codice_attivita,
      descrizione: row.descrizione,
      ore: Number(row.ore ?? 0),
      kpi_quality_outcome: qualityOptions.some((option) => option.value === rawOutcome) ? (rawOutcome as QualityCode) : "approvata_primo_controllo",
      kpi_quality_bonus: Number(row.kpi_quality_bonus ?? 0),
      kpi_rework_hours: Number(row.kpi_rework_hours ?? 0),
      kpi_due_date: row.kpi_due_date ?? "",
      kpi_completed_at: normalizeDateTime(row.kpi_completed_at),
      kpi_exclusion_reason: row.kpi_exclusion_reason ?? "",
      kpi_excluded_hours: Number(row.kpi_excluded_hours ?? 0),
      kpi_validation_note: row.kpi_validation_note ?? "",
      kpi_priority: Boolean(row.kpi_priority),
      kpi_critical_nonconformity: Boolean(row.kpi_critical_nonconformity),
    });
  };

  const updateEditing = (patch: Partial<EditingState>) => {
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const applyPreset = (preset: "ok" | "excellent" | "light" | "relevant" | "rejected" | "external" | "critical") => {
    if (!editing) return;
    const now = editing.kpi_completed_at || nowDateTimeLocal();
    if (preset === "ok") {
      updateEditing({
        kpi_quality_outcome: "approvata_primo_controllo",
        kpi_quality_bonus: 0,
        kpi_rework_hours: 0,
        kpi_completed_at: now,
        kpi_exclusion_reason: "",
        kpi_excluded_hours: 0,
        kpi_critical_nonconformity: false,
        kpi_validation_note: qualityInfo("approvata_primo_controllo").suggestedNote,
      });
    }
    if (preset === "excellent") {
      updateEditing({
        kpi_quality_outcome: "qualita_eccezionale",
        kpi_quality_bonus: 10,
        kpi_rework_hours: 0,
        kpi_completed_at: now,
        kpi_exclusion_reason: "",
        kpi_excluded_hours: 0,
        kpi_critical_nonconformity: false,
        kpi_validation_note: qualityInfo("qualita_eccezionale").suggestedNote,
      });
    }
    if (preset === "light") {
      updateEditing({
        kpi_quality_outcome: "integrazione_lieve",
        kpi_quality_bonus: 0,
        kpi_rework_hours: Math.max(editing.kpi_rework_hours || 0, 0.25),
        kpi_completed_at: now,
        kpi_critical_nonconformity: false,
        kpi_validation_note: qualityInfo("integrazione_lieve").suggestedNote,
      });
    }
    if (preset === "relevant") {
      updateEditing({
        kpi_quality_outcome: "integrazione_rilevante",
        kpi_quality_bonus: 0,
        kpi_rework_hours: Math.max(editing.kpi_rework_hours || 0, 1),
        kpi_completed_at: now,
        kpi_critical_nonconformity: false,
        kpi_validation_note: qualityInfo("integrazione_rilevante").suggestedNote,
      });
    }
    if (preset === "rejected") {
      updateEditing({
        kpi_quality_outcome: "respinta_rifatta",
        kpi_quality_bonus: 0,
        kpi_rework_hours: Math.max(editing.kpi_rework_hours || 0, editing.ore || 1),
        kpi_completed_at: now,
        kpi_critical_nonconformity: false,
        kpi_validation_note: qualityInfo("respinta_rifatta").suggestedNote,
      });
    }
    if (preset === "external") {
      updateEditing({
        kpi_exclusion_reason: "blocco_esterno",
        kpi_excluded_hours: Math.max(editing.kpi_excluded_hours || 0, editing.ore || 1),
        kpi_validation_note: "Blocco esterno documentato: ritardo o inattività non imputabile al dipendente.",
      });
    }
    if (preset === "critical") {
      updateEditing({
        kpi_quality_outcome: "non_conformita_critica",
        kpi_quality_bonus: 0,
        kpi_rework_hours: Math.max(editing.kpi_rework_hours || 0, editing.ore || 1),
        kpi_critical_nonconformity: true,
        kpi_validation_note: qualityInfo("non_conformita_critica").suggestedNote,
      });
    }
  };

  const saveSingle = async () => {
    if (!editing) return;

    const missing = findMissingFields([
      { label: "Esito qualità", value: editing.kpi_quality_outcome },
      ...(isNegativeOutcome(editing.kpi_quality_outcome) ? [{ label: "Nota validazione: spiega il problema o cosa migliorare", value: editing.kpi_validation_note }] : []),
      ...(editing.kpi_critical_nonconformity ? [{ label: "Nota validazione per non conformità critica", value: editing.kpi_validation_note }] : []),
      ...(editing.kpi_exclusion_reason ? [{ label: "Ore escluse", value: editing.kpi_excluded_hours }] : []),
      ...(editing.kpi_due_date ? [{ label: "Data completamento attività", value: editing.kpi_completed_at }] : []),
    ]);

    if (editing.kpi_exclusion_reason && Number(editing.kpi_excluded_hours) <= 0) missing.push("Ore escluse maggiori di zero");
    if (editing.kpi_quality_outcome === "qualita_eccezionale" && Number(editing.kpi_quality_bonus) <= 0) missing.push("Bonus qualità maggiore di zero per qualità eccezionale");

    const k5 = estimateK5(editing);
    if (k5.label === "In ritardo" && !editing.kpi_validation_note.trim()) missing.push("Nota validazione per attività in ritardo");

    if (missing.length) {
      setMissingFields(missing);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: rpcError } = await supabase.rpc("kpi_validate_timesheet_entry", {
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
      p_critical_nonconformity: Boolean(editing.kpi_critical_nonconformity || editing.kpi_quality_outcome === "non_conformita_critica"),
    });
    setSaving(false);
    if (rpcError) setError(rpcError.message);
    else {
      setEditing(null);
      setMessage("Riga validata correttamente. Ora puoi calcolare il periodo KPI.");
      await load();
    }
  };

  const currentQuality = editing ? qualityInfo(editing.kpi_quality_outcome) : qualityOptions[0];
  const k4Estimate = editing ? estimateK4(editing) : 100;
  const k5Estimate = editing ? estimateK5(editing) : { label: "Non valutata", score: null, note: "" };

  return (
    <div className="page kpi-validation-page">
      <PageHeader
        title="Validazione KPI"
        subtitle="Qui il responsabile trasforma le ore approvate in dati KPI: qualità, scadenze, rilavorazioni ed esclusioni. La regola è semplice: valida tutto ciò che è corretto in blocco, apri il dettaglio solo per eccezioni."
        actions={
          <>
            <button className="button secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={16} /> Aggiorna
            </button>
            <button className="button" onClick={() => void calculate()} disabled={saving}>
              <Calculator size={16} /> Calcola KPI
            </button>
          </>
        }
      />

      {!canValidate && <div className="alert error">La validazione KPI è riservata ad Admin Area e Super Admin.</div>}
      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="kpi-validation-guide panel">
        <div>
          <span className="eyebrow"><HelpCircle size={15} /> Guida veloce per il responsabile</span>
          <h3>Come ottenere un valore positivo</h3>
          <p>
            Una riga genera un risultato positivo quando è <strong>approvata al primo controllo</strong>, ha <strong>zero rilavorazioni</strong>, è <strong>completata entro la scadenza</strong> e non contiene criticità. Le esclusioni vanno usate solo per ferie, malattia, blocchi esterni o attese non imputabili.
          </p>
        </div>
        <div className="kpi-guide-grid">
          <div><strong>K1 Tempo produttivo</strong><span>Dipende dalle ore produttive validate rispetto alle ore disponibili nette. Le ore escluse non penalizzano.</span></div>
          <div><strong>K2 Produzione</strong><span>Dipende dalle attività completate e dal tempo standard/complessità dell’attività.</span></div>
          <div><strong>K3 Efficienza</strong><span>Premia il rapporto corretto tra tempo standard prodotto e ore effettive.</span></div>
          <div><strong>K4 Qualità</strong><span>È il campo più importante in validazione: errori, integrazioni e rilavorazioni abbassano il punteggio.</span></div>
          <div><strong>K5 Scadenze</strong><span>È positivo se esiste una scadenza e l’attività risulta completata entro il termine.</span></div>
        </div>
      </section>

      <section className="kpi-grid validation-stats-grid">
        <div className="kpi-card"><span>Righe periodo</span><strong>{stats.total}</strong><small>Totale disponibili</small></div>
        <div className="kpi-card"><span>Da validare</span><strong>{stats.open}</strong><small>Azionabili subito</small></div>
        <div className="kpi-card"><span>Validate</span><strong>{stats.done}</strong><small>Pronte per calcolo</small></div>
        <div className="kpi-card"><span>Rilavorazioni</span><strong>{stats.rework.toLocaleString("it-IT")}</strong><small>Ore imputabili</small></div>
        <div className="kpi-card"><span>Critiche</span><strong>{stats.critical}</strong><small>Bloccano premio</small></div>
      </section>

      <section className="validation-toolbar panel">
        <div className="validation-filters-grid">
          <label>Dal <input className="input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
          <label>Al <input className="input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
          <label>
            Area
            <select className="input" value={areaId} onChange={(event) => setAreaId(event.target.value)}>
              <option value="">Tutte le aree</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.codice_area} · {area.nome_area}</option>)}
            </select>
          </label>
          <label>
            Esito rapido
            <select className="input" value={qualityQuick} onChange={(event) => setQualityQuick(event.target.value as QualityCode)}>
              {qualityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="validation-search-row">
          <div className="search-box validation-search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca dipendente, commessa, attività, descrizione..." />
            {search && <button type="button" onClick={() => setSearch("")}><X size={14} /></button>}
          </div>
          <label className="check-inline">
            <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} /> Solo da validare
          </label>
          <button className="button secondary" onClick={selectAllVisible}>{selectedIds.length ? "Deseleziona" : "Seleziona visibili"}</button>
          <button className="button secondary" onClick={() => void validateRows(selectedIds)} disabled={saving || !canValidate}>Valida selezionate ({selectedIds.length})</button>
          <button className="button" onClick={() => void bulkValidatePeriod()} disabled={saving || !canValidate}>
            <Sparkles size={16} /> Valida tutto OK
          </button>
        </div>
        <div className="validation-rule-note">
          <Info size={16} />
          <span><strong>Uso pratico:</strong> se le righe sono corrette usa “Valida tutto OK”. Se ci sono errori, ritardi, esclusioni o rilavorazioni, apri “Dettaglio” solo su quelle righe.</span>
        </div>
      </section>

      <section className="validation-list">
        {filteredRows.map((row) => {
          const rowQuality = qualityInfo(row.kpi_quality_outcome);
          const selected = selectedIds.includes(row.id);
          return (
            <article key={row.id} className={`validation-row-card ${row.kpi_validated_at ? "is-validated" : "is-open"} ${selected ? "is-selected" : ""}`}>
              <label className="validation-checkbox"><input type="checkbox" checked={selected} onChange={() => toggleSelected(row.id)} /></label>
              <div className="validation-date-card"><strong>{shortDate(row.data)}</strong><span>{Number(row.ore ?? 0).toLocaleString("it-IT")} ore</span></div>
              <div className="validation-row-main">
                <div className="validation-row-head">
                  <div>
                    <h3>{row.employee_name}</h3>
                    <p>{row.codice_commessa ?? "—"} · {row.codice_attivita ?? "—"} · {row.codice_area ?? "—"}</p>
                  </div>
                  <span className={`validation-status ${row.kpi_validated_at ? "ok" : "todo"}`}>{row.kpi_validated_at ? "Validata" : "Da validare"}</span>
                </div>
                <p className="validation-description">{row.descrizione || "Nessuna descrizione inserita dal dipendente."}</p>
                <div className="validation-mini-facts">
                  <span className={`quality-chip ${rowQuality.tone}`}>Qualità: {rowQuality.short}</span>
                  <span>Scadenza: {row.kpi_due_date ?? "non impostata"}</span>
                  {row.kpi_rework_hours > 0 && <span>Rilavorazione: {row.kpi_rework_hours} ore</span>}
                  {row.kpi_exclusion_reason && <span>Esclusione: {row.kpi_exclusion_reason}</span>}
                </div>
              </div>
              <div className="validation-row-actions">
                <button className="button secondary" onClick={() => openEdit(row)}>Dettaglio</button>
                <button className="button" onClick={() => void validateRows([row.id])} disabled={!canValidate || saving}>OK</button>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && (
          <div className="empty-state">
            <strong>Nessuna riga da validare</strong>
            <p>Controlla periodo, area o filtro “solo da validare”.</p>
          </div>
        )}
      </section>

      {editing && (
        <div className="modal-backdrop validation-modal-backdrop">
          <div className="modal validation-modal">
            <div className="modal-header validation-modal-header">
              <div>
                <span className="eyebrow">Dettaglio validazione</span>
                <h3>{editing.employee_name}</h3>
                <p>{editing.codice_commessa ?? "—"} · {editing.codice_attivita ?? "—"}</p>
              </div>
              <button className="icon-button" onClick={() => setEditing(null)}><X size={17} /></button>
            </div>

            <div className="validation-modal-layout">
              <aside className="validation-score-panel">
                <span className="eyebrow"><Target size={14} /> Impatto stimato</span>
                <div className="score-preview-card">
                  <span>K4 Qualità</span>
                  <strong>{k4Estimate.toLocaleString("it-IT", { maximumFractionDigits: 0 })}/100</strong>
                  <small>{currentQuality.effect}</small>
                </div>
                <div className="score-preview-card">
                  <span>K5 Scadenze</span>
                  <strong>{k5Estimate.score === null ? k5Estimate.label : `${k5Estimate.score}/100`}</strong>
                  <small>{k5Estimate.note}</small>
                </div>
                <div className="validation-positive-box">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Quando è positivo?</strong>
                    <p>Per un esito positivo usa “Approvata al primo controllo”, zero rilavorazioni, completamento entro scadenza e una nota chiara se vuoi motivare il risultato.</p>
                  </div>
                </div>
                <div className="validation-presets">
                  <button type="button" onClick={() => applyPreset("ok")}><CheckCircle2 size={15} /> OK completo</button>
                  <button type="button" onClick={() => applyPreset("excellent")}><Sparkles size={15} /> Qualità alta</button>
                  <button type="button" onClick={() => applyPreset("light")}><Info size={15} /> Integrazione lieve</button>
                  <button type="button" onClick={() => applyPreset("relevant")}><AlertTriangle size={15} /> Integrazione rilevante</button>
                  <button type="button" onClick={() => applyPreset("rejected")}><X size={15} /> Respinta</button>
                  <button type="button" onClick={() => applyPreset("external")}><Clock size={15} /> Blocco esterno</button>
                  <button type="button" onClick={() => applyPreset("critical")}><AlertTriangle size={15} /> Critica</button>
                </div>
              </aside>

              <div className="validation-form-panel">
                <div className="validation-current-work">
                  <strong>Attività registrata</strong>
                  <p>{editing.descrizione || "Nessuna descrizione inserita dal dipendente."}</p>
                </div>

                <div className="form-grid validation-form-grid">
                  <label>
                    Esito qualità
                    <select className="input" value={editing.kpi_quality_outcome} onChange={(event) => updateEditing({ kpi_quality_outcome: event.target.value as QualityCode })}>
                      {qualityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <small>{fieldHelpForOutcome(editing.kpi_quality_outcome)}</small>
                  </label>

                  <label>
                    Bonus qualità
                    <input className="input" type="number" min="0" max="20" step="1" value={editing.kpi_quality_bonus} onChange={(event) => updateEditing({ kpi_quality_bonus: Number(event.target.value) })} />
                    <small>Usalo solo per qualità eccezionale. Serve come motivazione positiva, non per gonfiare il dato.</small>
                  </label>

                  <label>
                    Ore rilavorazione
                    <input className="input" type="number" min="0" step="0.25" value={editing.kpi_rework_hours} onChange={(event) => updateEditing({ kpi_rework_hours: Number(event.target.value) })} />
                    <small>Inserisci solo ore perse per correzioni imputabili al dipendente. Penalizza K4/K3.</small>
                  </label>

                  <label>
                    Scadenza KPI
                    <input className="input" type="date" value={editing.kpi_due_date} onChange={(event) => updateEditing({ kpi_due_date: event.target.value })} />
                    <small>Serve per K5. Se non c’è una vera scadenza, lascia vuoto.</small>
                  </label>

                  <label>
                    Completata il
                    <input className="input" type="datetime-local" value={editing.kpi_completed_at} onChange={(event) => updateEditing({ kpi_completed_at: event.target.value })} />
                    <small>Se la data è entro la scadenza, K5 resta positivo. Se manca, K5 non è valutabile.</small>
                  </label>

                  <label>
                    Motivo esclusione
                    <select className="input" value={editing.kpi_exclusion_reason} onChange={(event) => updateEditing({ kpi_exclusion_reason: event.target.value })}>
                      {exclusionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <small>{exclusionOptions.find((option) => option.value === editing.kpi_exclusion_reason)?.help}</small>
                  </label>

                  <label>
                    Ore escluse
                    <input className="input" type="number" min="0" step="0.25" value={editing.kpi_excluded_hours} onChange={(event) => updateEditing({ kpi_excluded_hours: Number(event.target.value) })} />
                    <small>Ore da togliere dal monte disponibile perché non imputabili al dipendente.</small>
                  </label>

                  <label className="check-row validation-check-row">
                    <input type="checkbox" checked={editing.kpi_priority} onChange={(event) => updateEditing({ kpi_priority: event.target.checked })} />
                    <span>Attività prioritaria</span>
                    <small>Se prioritaria e in ritardo senza motivo, blocca o abbassa l’eleggibilità.</small>
                  </label>

                  <label className="check-row validation-check-row">
                    <input type="checkbox" checked={editing.kpi_critical_nonconformity} onChange={(event) => updateEditing({ kpi_critical_nonconformity: event.target.checked })} />
                    <span>Non conformità critica</span>
                    <small>Da usare solo per errori gravi. Blocca il riconoscimento Top performer.</small>
                  </label>

                  <label className="full validation-note-field">
                    Nota validazione / motivazione responsabile
                    <textarea className="input" value={editing.kpi_validation_note} onChange={(event) => updateEditing({ kpi_validation_note: event.target.value })} />
                    <small>Scrivi perché il risultato è positivo oppure cosa deve correggere il dipendente. Questa nota rende il KPI comprensibile nei test e nei report.</small>
                    <button type="button" className="button secondary note-suggest-button" onClick={() => updateEditing({ kpi_validation_note: currentQuality.suggestedNote })}>
                      <Wand2 size={15} /> Usa nota suggerita
                    </button>
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-actions validation-modal-actions">
              <button className="button secondary" onClick={() => setEditing(null)}>Annulla</button>
              <button className="button" onClick={() => void saveSingle()} disabled={saving || !canValidate}>
                <Save size={16} /> Salva validazione
              </button>
            </div>
          </div>
        </div>
      )}

      {missingFields.length > 0 && <MissingFieldsModal fields={missingFields} onClose={() => setMissingFields([])} />}
    </div>
  );
}
