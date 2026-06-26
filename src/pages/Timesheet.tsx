import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeEuro,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  Edit3,
  FileText,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { ActivityCategory, BusinessArea, Company, CostCenter, Employee, LocationRow, Project, TimesheetView } from "../types/db";
import { euro, numberIt, todayInput } from "../lib/format";
import { EmptyState } from "../components/EmptyState";
import { filterRowsByRole, fullEmployeeName } from "../lib/kpiData";

type FormState = {
  id?: string;
  data: string;
  employee_id: string;
  beneficiary_company_id: string;
  location_id: string;
  business_area_id: string;
  project_id: string;
  activity_category_id: string;
  cost_center_id: string;
  ore: number;
  descrizione: string;
  note: string;
  correction_note: string;
};

const emptyForm: FormState = {
  data: todayInput(),
  employee_id: "",
  beneficiary_company_id: "",
  location_id: "",
  business_area_id: "",
  project_id: "",
  activity_category_id: "",
  cost_center_id: "",
  ore: 1,
  descrizione: "",
  note: "",
  correction_note: "",
};

type ContestFilter = "all" | "clean" | "contested";

export default function Timesheet() {
  const { isSuperAdmin, isAdminArea, user, areaIds } = useAuth();
  const canManage = isSuperAdmin || isAdminArea;
  const now = new Date();

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [areas, setAreas] = useState<BusinessArea[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<ActivityCategory[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [contestFilter, setContestFilter] = useState<ContestFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentEmployee = useMemo(() => {
    const email = user?.email?.toLowerCase();
    if (!email) return null;
    return employees.find((e) => e.email.toLowerCase() === email) ?? null;
  }, [employees, user?.email]);

  const monthLabel = useMemo(() => {
    const safeMonth = Math.min(12, Math.max(1, Number(month) || 1));
    return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(year, safeMonth - 1, 1));
  }, [month, year]);

  const loadOptions = useCallback(async () => {
    const [companiesRes, locationsRes, areasRes, employeesRes, projectsRes, activitiesRes, costCentersRes, rolesRes] = await Promise.all([
      supabase.from("companies").select("*").eq("attiva", true).order("codice_societa"),
      supabase.from("locations").select("*").eq("attiva", true).order("nome_sede"),
      supabase.from("business_areas").select("*").eq("attiva", true).order("nome_area"),
      supabase.from("employees").select("*").eq("attivo", true).order("cognome"),
      supabase.from("projects").select("*").order("codice_commessa"),
      supabase.from("activity_categories").select("*").eq("attiva", true).order("codice_attivita"),
      supabase.from("cost_centers").select("*").eq("attivo", true).order("codice_centro_costo"),
      supabase.from("user_area_roles").select("*").eq("active", true),
    ]);

    const firstError = [companiesRes, locationsRes, areasRes, employeesRes, projectsRes, activitiesRes, costCentersRes, rolesRes].find((r) => r.error)?.error;
    if (firstError) throw firstError;

    const allEmployees = (employeesRes.data ?? []) as Employee[];
    const roleRows = (rolesRes.data ?? []) as { email: string; business_area_id: string | null; role: string }[];
    const managedEmails = new Set(
      roleRows
        .filter((r) => r.email && (!r.business_area_id || areaIds.includes(r.business_area_id)))
        .map((r) => r.email.toLowerCase())
    );

    let visibleEmployees = allEmployees;
    if (!isSuperAdmin && isAdminArea) {
      visibleEmployees = allEmployees.filter(
        (employee) => managedEmails.has(employee.email.toLowerCase()) || employee.email.toLowerCase() === user?.email?.toLowerCase()
      );
    }
    if (!isSuperAdmin && !isAdminArea) {
      const email = user?.email?.toLowerCase();
      visibleEmployees = allEmployees.filter((employee) => employee.email.toLowerCase() === email);
    }

    setCompanies((companiesRes.data ?? []) as Company[]);
    setLocations((locationsRes.data ?? []) as LocationRow[]);
    setAreas(((areasRes.data ?? []) as BusinessArea[]).filter((area) => isSuperAdmin || areaIds.includes(area.id)));
    setEmployees(visibleEmployees);
    setProjects(((projectsRes.data ?? []) as Project[]).filter((p) => isSuperAdmin || !p.business_area_id || areaIds.includes(p.business_area_id)));
    setActivities(((activitiesRes.data ?? []) as ActivityCategory[]).filter((a) => isSuperAdmin || !a.business_area_id || areaIds.includes(a.business_area_id)));
    setCostCenters(((costCentersRes.data ?? []) as CostCenter[]).filter((c) => isSuperAdmin || !c.business_area_id || areaIds.includes(c.business_area_id)));
  }, [areaIds, isAdminArea, isSuperAdmin, user?.email]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .order("data", { ascending: false });

    if (error) setError(error.message);
    else {
      const filtered = filterRowsByRole((data ?? []) as TimesheetView[], areaIds, user?.email?.toLowerCase() ?? null, isSuperAdmin, isAdminArea);
      setRows(filtered);
    }

    setLoading(false);
  }, [areaIds, isAdminArea, isSuperAdmin, month, user?.email, year]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      await loadOptions();
      await loadRows();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [loadOptions, loadRows]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredProjects = useMemo(() => {
    if (!form?.beneficiary_company_id && !form?.business_area_id) return projects;
    return projects.filter((p) => {
      const companyOk = !form?.beneficiary_company_id || p.company_id === form.beneficiary_company_id || !p.company_id;
      const areaOk = !form?.business_area_id || !p.business_area_id || p.business_area_id === form.business_area_id;
      return companyOk && areaOk;
    });
  }, [projects, form?.beneficiary_company_id, form?.business_area_id]);

  const filteredActivities = useMemo(() => {
    if (!form?.business_area_id) return activities;
    return activities.filter((a) => !a.business_area_id || a.business_area_id === form.business_area_id);
  }, [activities, form?.business_area_id]);

  const filteredCostCenters = useMemo(() => {
    if (!form?.business_area_id) return costCenters;
    return costCenters.filter((c) => !c.business_area_id || c.business_area_id === form.business_area_id);
  }, [costCenters, form?.business_area_id]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        [
          row.employee_name,
          row.employee_email,
          row.employer_company_code,
          row.employer_company_name,
          row.beneficiary_company_code,
          row.beneficiary_company_name,
          row.codice_area,
          row.nome_area,
          row.codice_commessa,
          row.descrizione_commessa,
          row.codice_attivita,
          row.nome_categoria,
          row.codice_centro_costo,
          row.nome_centro_costo,
          row.descrizione,
          row.note,
          row.contest_reason,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));

      const matchesArea = !areaFilter || row.business_area_id === areaFilter;
      const matchesContest =
        contestFilter === "all" ||
        (contestFilter === "contested" && Boolean(row.is_contested)) ||
        (contestFilter === "clean" && !row.is_contested);

      return matchesSearch && matchesArea && matchesContest;
    });
  }, [areaFilter, contestFilter, rows, search]);

  const applyAreaDefaults = (next: FormState): FormState => {
    const areaCostCenters = costCenters.filter((c) => !next.business_area_id || c.business_area_id === next.business_area_id);
    const areaActivities = activities.filter((a) => !next.business_area_id || a.business_area_id === next.business_area_id);
    return {
      ...next,
      cost_center_id: areaCostCenters.length === 1 ? areaCostCenters[0].id : next.cost_center_id,
      activity_category_id: areaActivities.length === 1 ? areaActivities[0].id : next.activity_category_id,
    };
  };

  const openNew = () => {
    const defaultEmployee = currentEmployee ?? employees[0];
    const employeeArea = areas.length === 1 ? areas[0].id : "";
    const next = applyAreaDefaults({
      ...emptyForm,
      data: todayInput(),
      employee_id: defaultEmployee?.id ?? "",
      business_area_id: employeeArea,
      location_id: defaultEmployee?.location_id ?? (locations.length === 1 ? locations[0].id : ""),
      beneficiary_company_id: companies.length === 1 ? companies[0].id : "",
    });
    setForm(next);
  };

  const edit = (row: TimesheetView) => {
    setForm({
      id: row.id,
      data: row.data,
      employee_id: row.employee_id,
      beneficiary_company_id: row.beneficiary_company_id,
      location_id: row.location_id ?? "",
      business_area_id: row.business_area_id,
      project_id: row.project_id,
      activity_category_id: row.activity_category_id,
      cost_center_id: row.cost_center_id ?? "",
      ore: Number(row.ore),
      descrizione: row.descrizione ?? "",
      note: row.note ?? "",
      correction_note: row.correction_note ?? "",
    });
  };

  const duplicate = (row: TimesheetView) => {
    setForm({
      data: row.data,
      employee_id: row.employee_id,
      beneficiary_company_id: row.beneficiary_company_id,
      location_id: row.location_id ?? "",
      business_area_id: row.business_area_id,
      project_id: row.project_id,
      activity_category_id: row.activity_category_id,
      cost_center_id: row.cost_center_id ?? "",
      ore: Number(row.ore),
      descrizione: row.descrizione ?? "",
      note: row.note ?? "",
      correction_note: "",
    });
  };

  const handleEmployeeChange = (employeeId: string) => {
    if (!form) return;
    const selected = employees.find((employee) => employee.id === employeeId);
    setForm({
      ...form,
      employee_id: employeeId,
      location_id: selected?.location_id ?? form.location_id,
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);

    const employee = employees.find((e) => e.id === form.employee_id);
    if (!employee) {
      setError("Dipendente non trovato. Vai in Accessi e ruoli e assegna il ruolo: verrà creato anche il dipendente.");
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = {
      data: form.data,
      employee_id: form.employee_id,
      beneficiary_company_id: form.beneficiary_company_id,
      location_id: form.location_id || null,
      business_area_id: form.business_area_id,
      project_id: form.project_id,
      activity_category_id: form.activity_category_id,
      cost_center_id: form.cost_center_id || null,
      ore: Number(form.ore),
      descrizione: form.descrizione || null,
      note: form.note || null,
      stato: "Approvato",
    };

    if (form.id && canManage) {
      payload.corrected_by = user?.id ?? null;
      payload.corrected_at = new Date().toISOString();
      payload.correction_note = form.correction_note || "Correzione eseguita da area/admin.";
    }

    if (!payload.employee_id || !payload.beneficiary_company_id || !payload.business_area_id || !payload.project_id || !payload.activity_category_id || !payload.ore) {
      setError("Compila società beneficiaria, area, commessa, attività e ore.");
      setSaving(false);
      return;
    }

    if (!isSuperAdmin && isAdminArea && !areaIds.includes(payload.business_area_id as string)) {
      setError("Non puoi registrare ore su un'area non assegnata.");
      setSaving(false);
      return;
    }

    if (!isSuperAdmin && !isAdminArea && employee.email.toLowerCase() !== user?.email?.toLowerCase()) {
      setError("Un USER_AREA può registrare solo le proprie ore.");
      setSaving(false);
      return;
    }

    const { error } = form.id
      ? await supabase.from("timesheet_entries").update(payload).eq("id", form.id)
      : await supabase.from("timesheet_entries").insert(payload);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }

    setForm(null);
    await loadRows();
  };

  const remove = async (row: TimesheetView) => {
    if (!canManage && row.employee_email?.toLowerCase() !== user?.email?.toLowerCase()) return;
    if (!window.confirm("Eliminare questa riga timesheet?")) return;
    const { error } = await supabase.from("timesheet_entries").delete().eq("id", row.id);
    if (error) setError(error.message);
    else await loadRows();
  };

  const contest = async (row: TimesheetView) => {
    if (!canManage) return;
    const reason = window.prompt("Motivo della contestazione", row.contest_reason ?? "");
    if (reason === null) return;
    const { error } = await supabase
      .from("timesheet_entries")
      .update({
        is_contested: true,
        contest_reason: reason || "Da verificare",
        contested_by: user?.id ?? null,
        contested_at: new Date().toISOString(),
        stato: "Approvato",
      })
      .eq("id", row.id);
    if (error) setError(error.message);
    else await loadRows();
  };

  const clearContest = async (row: TimesheetView) => {
    if (!canManage) return;
    const { error } = await supabase
      .from("timesheet_entries")
      .update({ is_contested: false, contest_reason: null, contested_by: null, contested_at: null, stato: "Approvato" })
      .eq("id", row.id);
    if (error) setError(error.message);
    else await loadRows();
  };

  const canChooseEmployee = isSuperAdmin || isAdminArea;
  const totalOre = visibleRows.reduce((sum, r) => sum + Number(r.ore ?? 0), 0);
  const totalImporto = visibleRows.reduce((sum, r) => sum + Number(r.importo_visibile ?? 0), 0);
  const contestedCount = visibleRows.filter((r) => r.is_contested).length;
  const activeEmployees = new Set(visibleRows.map((row) => row.employee_id)).size;

  const formEmployee = form ? employees.find((employee) => employee.id === form.employee_id) ?? null : null;
  const formEmployerCompany = formEmployee ? companies.find((company) => company.id === formEmployee.company_id) ?? null : null;
  const formBeneficiaryCompany = form ? companies.find((company) => company.id === form.beneficiary_company_id) ?? null : null;
  const formIsIntercompany = Boolean(formEmployerCompany && formBeneficiaryCompany && formEmployerCompany.id !== formBeneficiaryCompany.id);

  return (
    <div className="timesheet-page">
      <PageHeader
        title="Timesheet"
        description="Registra le ore lavorate. Ogni riga entra subito nei KPI come Approvato; eventuali contestazioni restano tracciate senza bloccare i calcoli."
        actions={
          <>
            <button className="button secondary" onClick={() => void loadAll()} disabled={loading}>
              <RefreshCw size={16} /> Aggiorna
            </button>
            <button className="button" onClick={openNew}>
              <Plus size={16} /> Nuova registrazione
            </button>
          </>
        }
      />

      <section className="timesheet-hero">
        <div>
          <span className="eyebrow">Periodo selezionato</span>
          <h2>{capitalize(monthLabel)}</h2>
          <p>Vista operativa delle ore approvate, con ricerca rapida per dipendente, commessa, attività o descrizione.</p>
        </div>
        <div className="timesheet-hero-status">
          <ClipboardCheck size={18} />
          <span>Validazione automatica</span>
          <strong>Approvato</strong>
        </div>
      </section>

      <div className="ts-stat-grid">
        <StatCard icon={<FileText size={18} />} label="Righe visualizzate" value={numberIt(visibleRows.length)} hint={`${rows.length} totali nel mese`} />
        <StatCard icon={<Clock3 size={18} />} label="Ore caricate" value={numberIt(totalOre)} hint="Somma filtri attivi" />
        <StatCard icon={<UserRound size={18} />} label="Dipendenti" value={numberIt(activeEmployees)} hint="Persone coinvolte" />
        <StatCard icon={<BadgeEuro size={18} />} label="Valore" value={euro(totalImporto)} hint="Importo visibile" />
        <StatCard icon={<AlertTriangle size={18} />} label="Contestazioni" value={numberIt(contestedCount)} hint="Non bloccano i report" tone={contestedCount ? "warning" : "success"} />
      </div>

      <section className="timesheet-filter-panel">
        <div className="ts-filter-main">
          <label className="ts-search-field">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca dipendente, commessa, attività, descrizione..." />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Pulisci ricerca">
                <X size={14} />
              </button>
            )}
          </label>
        </div>
        <div className="ts-filter-grid">
          <label>
            <span>Mese</span>
            <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
          </label>
          <label>
            <span>Anno</span>
            <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <label>
            <span>Area</span>
            <Select value={areaFilter} onChange={setAreaFilter} placeholder="Tutte le aree" options={areas.map((a) => ({ value: a.id, label: `${a.codice_area} · ${a.nome_area}` }))} />
          </label>
          <label>
            <span>Controllo</span>
            <select className="input" value={contestFilter} onChange={(e) => setContestFilter(e.target.value as ContestFilter)}>
              <option value="all">Tutte le righe</option>
              <option value="clean">Solo non contestate</option>
              <option value="contested">Solo contestate</option>
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div className="alert error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!currentEmployee && !isSuperAdmin && !isAdminArea && (
        <div className="alert warning">La tua email non è ancora collegata a un dipendente. Chiedi al Super Admin di assegnarti il ruolo in “Accessi e ruoli”.</div>
      )}

      {loading && <div className="loading ts-loading">Caricamento timesheet...</div>}

      {visibleRows.length === 0 ? (
        <EmptyState title="Nessuna ora trovata" text="Modifica i filtri oppure crea una nuova registrazione. Ogni nuova riga verrà salvata direttamente come Approvato." />
      ) : (
        <section className="timesheet-list" aria-label="Righe timesheet">
          {visibleRows.map((row) => {
            const dateParts = formatDateParts(row.data);
            return (
              <article key={row.id} className={`timesheet-entry-card ${row.is_contested ? "is-contested" : ""}`}>
                <div className="ts-card-main">
                  <div className="ts-date-block">
                    <strong>{dateParts.day}</strong>
                    <span>{dateParts.month}</span>
                    <small>{dateParts.year}</small>
                  </div>

                  <div className="ts-entry-body">
                    <div className="ts-entry-topline">
                      <div>
                        <span className="eyebrow">{row.employee_email}</span>
                        <h3>{row.employee_name}</h3>
                      </div>
                      <div className="ts-status-stack">
                        <span className="status-pill approvato">Approvato</span>
                        {row.is_contested && <span className="status-pill da-correggere">Contestata</span>}
                      </div>
                    </div>

                    <div className="ts-flow">
                      <div>
                        <span>Da società</span>
                        <strong>{row.employer_company_code ?? "—"}</strong>
                        <small>{row.employer_company_name ?? ""}</small>
                      </div>
                      <div className="ts-flow-arrow">→</div>
                      <div>
                        <span>A società</span>
                        <strong>{row.beneficiary_company_code ?? "—"}</strong>
                        <small>{row.beneficiary_company_name ?? ""}</small>
                      </div>
                    </div>

                    <div className="ts-tags">
                      <span><Layers3 size={13} /> {row.codice_area ?? "Area n.d."}</span>
                      <span>{row.codice_centro_costo ?? "Centro costo n.d."}</span>
                      <span>{row.codice_commessa ?? "Commessa n.d."}</span>
                      <span>{row.codice_attivita ?? "Attività n.d."}</span>
                    </div>

                    <div className="ts-description-block">
                      <span>Descrizione lavoro svolto</span>
                      <p>{row.descrizione || "Nessuna descrizione inserita."}</p>
                      {row.note && <small>Note: {row.note}</small>}
                      {row.is_contested && <small className="contest-note">Contestazione: {row.contest_reason || "Da verificare"}</small>}
                    </div>
                  </div>
                </div>

                <aside className="ts-card-side">
                  <Metric label="Ore" value={numberIt(row.ore)} />
                  <Metric label="Ore pesate" value={numberIt(row.ore_pesate)} />
                  <Metric label="Importo" value={row.importo_visibile == null ? "Riservato" : euro(row.importo_visibile)} />

                  <div className="row-actions ts-actions">
                    <button className="icon-button" onClick={() => edit(row)} title="Modifica"><Edit3 size={15} /></button>
                    <button className="icon-button" onClick={() => duplicate(row)} title="Duplica"><Copy size={15} /></button>
                    {canManage && !row.is_contested && <button className="icon-button warning" onClick={() => void contest(row)} title="Contesta"><XCircle size={15} /></button>}
                    {canManage && row.is_contested && <button className="icon-button success" onClick={() => void clearContest(row)} title="Chiudi contestazione"><CheckCircle2 size={15} /></button>}
                    {(canManage || row.employee_email?.toLowerCase() === user?.email?.toLowerCase()) && (
                      <button className="icon-button danger" onClick={() => void remove(row)} title="Elimina"><Trash2 size={15} /></button>
                    )}
                  </div>
                </aside>
              </article>
            );
          })}
        </section>
      )}

      {form && (
        <div className="modal-backdrop ts-modal-backdrop">
          <div className="modal large pro-modal ts-modal">
            <div className="modal-header ts-modal-header">
              <div>
                <span className="eyebrow">Timesheet</span>
                <h3>{form.id ? "Modifica registrazione" : "Nuova registrazione ore"}</h3>
                <p className="muted">Le ore vengono salvate sempre come <strong>Approvato</strong>. La contestazione è un controllo successivo.</p>
              </div>
              <button className="icon-button" onClick={() => setForm(null)} aria-label="Chiudi"><X size={18} /></button>
            </div>

            <div className="ts-flow-preview">
              <div>
                <Building2 size={18} />
                <span>Società datrice</span>
                <strong>{formEmployerCompany?.codice_societa ?? "Da dipendente"}</strong>
                <small>{formEmployerCompany?.ragione_sociale ?? "Seleziona un dipendente per calcolarla"}</small>
              </div>
              <div className="ts-flow-preview-arrow">→</div>
              <div>
                <Building2 size={18} />
                <span>Società beneficiaria</span>
                <strong>{formBeneficiaryCompany?.codice_societa ?? "Da selezionare"}</strong>
                <small>{formBeneficiaryCompany?.ragione_sociale ?? "Scegli dove imputare il lavoro"}</small>
              </div>
              <div className={`ts-flow-type ${formIsIntercompany ? "intercompany" : "internal"}`}>
                {formIsIntercompany ? "Infragruppo" : "Interno"}
              </div>
            </div>

            <div className="ts-form-sections">
              <section className="ts-form-section">
                <div className="ts-section-head">
                  <UserRound size={18} />
                  <div>
                    <h4>1. Chi ha lavorato</h4>
                    <p>Dipendente, data e sede operativa.</p>
                  </div>
                </div>
                <div className="form-grid refined">
                  <label>Data *<input className="input" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
                  {canChooseEmployee ? (
                    <label>Dipendente *<Select value={form.employee_id} onChange={handleEmployeeChange} options={employees.map((e) => ({ value: e.id, label: `${fullEmployeeName(e)} · ${e.email}` }))} /></label>
                  ) : (
                    <label>Dipendente<input className="input" value={currentEmployee ? `${fullEmployeeName(currentEmployee)} · ${currentEmployee.email}` : "Dipendente non collegato"} disabled /></label>
                  )}
                  <label>Sede<Select value={form.location_id} onChange={(v) => setForm({ ...form, location_id: v })} placeholder="Sede non obbligatoria" options={locations.map((l) => ({ value: l.id, label: l.nome_sede }))} /></label>
                  <label>Ore *<input className="input" type="number" min="0.25" step="0.25" value={form.ore} onChange={(e) => setForm({ ...form, ore: Number(e.target.value) })} /></label>
                </div>
              </section>

              <section className="ts-form-section">
                <div className="ts-section-head">
                  <Layers3 size={18} />
                  <div>
                    <h4>2. Dove imputare le ore</h4>
                    <p>Società beneficiaria, area, centro costo e commessa.</p>
                  </div>
                </div>
                <div className="form-grid refined">
                  <label>Società beneficiaria *<Select value={form.beneficiary_company_id} onChange={(v) => setForm({ ...form, beneficiary_company_id: v, project_id: "" })} options={companies.map((c) => ({ value: c.id, label: `${c.codice_societa} · ${c.ragione_sociale}` }))} /></label>
                  <label>Area *<Select value={form.business_area_id} onChange={(v) => setForm((prev) => prev ? applyAreaDefaults({ ...prev, business_area_id: v, activity_category_id: "", cost_center_id: "", project_id: "" }) : prev)} options={areas.map((a) => ({ value: a.id, label: `${a.codice_area} · ${a.nome_area}` }))} /></label>
                  <label>Centro costo<Select value={form.cost_center_id} onChange={(v) => setForm({ ...form, cost_center_id: v })} placeholder="Centro costo facoltativo" options={filteredCostCenters.map((c) => ({ value: c.id, label: `${c.codice_centro_costo} · ${c.nome_centro_costo}` }))} /></label>
                  <label>Commessa *<Select value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })} options={filteredProjects.map((p) => ({ value: p.id, label: `${p.codice_commessa} · ${p.descrizione_commessa}` }))} /></label>
                </div>
              </section>

              <section className="ts-form-section">
                <div className="ts-section-head">
                  <FileText size={18} />
                  <div>
                    <h4>3. Cosa è stato fatto</h4>
                    <p>Attività, descrizione operativa e note.</p>
                  </div>
                </div>
                <div className="form-grid refined">
                  <label>Attività *<Select value={form.activity_category_id} onChange={(v) => setForm({ ...form, activity_category_id: v })} options={filteredActivities.map((a) => ({ value: a.id, label: `${a.codice_attivita} · ${a.nome_categoria}` }))} /></label>
                  <label>Stato<input className="input" value="Approvato automatico" disabled /></label>
                  <label className="full">Descrizione lavoro svolto<textarea className="input textarea-large" value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} placeholder="Esempio: redazione relazione tecnica, aggiornamento portale KPI, verifica computo, sopralluogo..." /></label>
                  <label className="full">Note<textarea className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note interne facoltative" /></label>
                  {form.id && canManage && <label className="full">Nota correzione<textarea className="input" value={form.correction_note} onChange={(e) => setForm({ ...form, correction_note: e.target.value })} placeholder="Motivo della modifica o correzione" /></label>}
                </div>
              </section>
            </div>

            <div className="modal-actions ts-modal-actions">
              <button className="button secondary" onClick={() => setForm(null)}>Annulla</button>
              <button className="button" onClick={() => void save()} disabled={saving}>
                <Save size={16} /> {saving ? "Salvataggio..." : "Salva ore approvate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, hint, tone = "default" }: { icon: React.ReactNode; label: string; value: string; hint: string; tone?: "default" | "warning" | "success" }) {
  return (
    <div className={`ts-stat-card ${tone}`}>
      <div className="ts-stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ts-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Select({ value, onChange, options, placeholder = "Seleziona" }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function formatDateParts(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "—", month: "—", year: "—" };
  return {
    day: new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("it-IT", { month: "short" }).format(date).replace(".", ""),
    year: new Intl.DateTimeFormat("it-IT", { year: "numeric" }).format(date),
  };
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
