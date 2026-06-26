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
import type {
  ActivityCategory,
  BusinessArea,
  Company,
  CostCenter,
  Employee,
  LocationRow,
  Project,
  TimesheetView,
} from "../types/db";
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

type EmployeeGroup = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  totalOre: number;
  totalImporto: number;
  contestedCount: number;
  rows: TimesheetView[];
};

type AreaGroup = {
  areaId: string;
  areaCode: string;
  areaName: string;
  totalOre: number;
  totalImporto: number;
  contestedCount: number;
  employees: EmployeeGroup[];
};

const uuidOrNull = (value?: string | null) => {
  const cleaned = String(value ?? "").trim();
  return cleaned.length > 0 ? cleaned : null;
};

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

  const [form, setForm] = useState<FormState | null>(() => {
    try {
      const saved = localStorage.getItem("kpi_timesheet_draft");
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem("kpi_timesheet_draft");
      return null;
    }
  });

  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [contestFilter, setContestFilter] = useState<ContestFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (form) {
      localStorage.setItem("kpi_timesheet_draft", JSON.stringify(form));
    } else {
      localStorage.removeItem("kpi_timesheet_draft");
    }
  }, [form]);

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
    setProjects((projectsRes.data ?? []) as Project[]);
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

  const filteredProjects = useMemo(() => projects, [projects]);

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

  const groupedRows = useMemo<AreaGroup[]>(() => {
    const areaMap = new Map<string, AreaGroup & { employeeMap: Map<string, EmployeeGroup> }>();

    visibleRows.forEach((row) => {
      const areaId = row.business_area_id || "area-non-definita";
      const areaCode = row.codice_area || "AREA N.D.";
      const areaName = row.nome_area || "Area non definita";
      const ore = Number(row.ore ?? 0);
      const importo = Number(row.importo_visibile ?? 0);

      if (!areaMap.has(areaId)) {
        areaMap.set(areaId, {
          areaId,
          areaCode,
          areaName,
          totalOre: 0,
          totalImporto: 0,
          contestedCount: 0,
          employees: [],
          employeeMap: new Map<string, EmployeeGroup>(),
        });
      }

      const area = areaMap.get(areaId)!;
      area.totalOre += ore;
      area.totalImporto += importo;
      if (row.is_contested) area.contestedCount += 1;

      const employeeId = row.employee_id || row.employee_email || "dipendente-non-definito";
      const employeeName = row.employee_name || "Dipendente non definito";
      const employeeEmail = row.employee_email || "";

      if (!area.employeeMap.has(employeeId)) {
        area.employeeMap.set(employeeId, {
          employeeId,
          employeeName,
          employeeEmail,
          totalOre: 0,
          totalImporto: 0,
          contestedCount: 0,
          rows: [],
        });
      }

      const employee = area.employeeMap.get(employeeId)!;
      employee.totalOre += ore;
      employee.totalImporto += importo;
      if (row.is_contested) employee.contestedCount += 1;
      employee.rows.push(row);
    });

    return Array.from(areaMap.values())
      .map((area) => ({
        areaId: area.areaId,
        areaCode: area.areaCode,
        areaName: area.areaName,
        totalOre: area.totalOre,
        totalImporto: area.totalImporto,
        contestedCount: area.contestedCount,
        employees: Array.from(area.employeeMap.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName, "it")),
      }))
      .sort((a, b) => `${a.areaCode} ${a.areaName}`.localeCompare(`${b.areaCode} ${b.areaName}`, "it"));
  }, [visibleRows]);

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
    setError(null);
    setForm(next);
  };

  const edit = (row: TimesheetView) => {
    setError(null);
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
    setError(null);
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

    const requiredFields = [
      { value: form.data, label: "Data" },
      { value: form.employee_id, label: "Dipendente" },
      { value: form.beneficiary_company_id, label: "Società beneficiaria" },
      { value: form.business_area_id, label: "Area" },
      { value: form.project_id, label: "Commessa" },
      { value: form.activity_category_id, label: "Attività" },
    ];

    const missingFields = requiredFields
      .filter((field) => !String(field.value ?? "").trim())
      .map((field) => field.label);

    if (missingFields.length > 0) {
      setError(`Compila questi campi obbligatori: ${missingFields.join(", ")}.`);
      setSaving(false);
      return;
    }

    if (!form.ore || Number(form.ore) <= 0) {
      setError("Inserisci un numero di ore maggiore di zero.");
      setSaving(false);
      return;
    }

    const employee = employees.find((e) => e.id === form.employee_id);
    if (!employee) {
      setError("Dipendente non trovato. Verifica che l'utente sia collegato alla tabella dipendenti.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.rpc("kpi_save_timesheet_entry", {
      p_entry_id: uuidOrNull(form.id),
      p_data: form.data,
      p_employee_id: form.employee_id,
      p_beneficiary_company_id: form.beneficiary_company_id,
      p_location_id: uuidOrNull(form.location_id),
      p_business_area_id: form.business_area_id,
      p_project_id: form.project_id,
      p_activity_category_id: form.activity_category_id,
      p_cost_center_id: uuidOrNull(form.cost_center_id),
      p_ore: Number(form.ore),
      p_descrizione: form.descrizione?.trim() || null,
      p_note: form.note?.trim() || null,
      p_correction_note: form.correction_note?.trim() || null,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setForm(null);
    localStorage.removeItem("kpi_timesheet_draft");
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

  const clearDraft = () => {
    localStorage.removeItem("kpi_timesheet_draft");
    setError(null);
    setForm(null);
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
        description="Registra le ore lavorate. La vista è divisa per area, dipendente e attività svolta."
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
          <p>Riepilogo operativo delle attività svolte, organizzato per aree e dipendenti.</p>
        </div>
        <div className="timesheet-hero-status">
          <ClipboardCheck size={18} />
          <span>Validazione automatica</span>
          <strong>Approvato</strong>
        </div>
      </section>

      <div className="ts-stat-grid">
        <StatCard icon={<FileText size={18} />} label="Righe visualizzate" value={numberIt(visibleRows.length)} hint={`${rows.length} totali nel mese`} />
        <StatCard icon={<Layers3 size={18} />} label="Aree coinvolte" value={numberIt(groupedRows.length)} hint="Divisione per area" />
        <StatCard icon={<Clock3 size={18} />} label="Ore caricate" value={numberIt(totalOre)} hint="Somma filtri attivi" />
        <StatCard icon={<UserRound size={18} />} label="Dipendenti" value={numberIt(activeEmployees)} hint="Persone coinvolte" />
        <StatCard icon={<BadgeEuro size={18} />} label="Valore" value={euro(totalImporto)} hint="Importo visibile" />
        <StatCard icon={<AlertTriangle size={18} />} label="Contestazioni" value={numberIt(contestedCount)} hint="Non bloccano i report" tone={contestedCount ? "warning" : "success"} />
      </div>

      <section className="timesheet-filter-panel">
        <div className="ts-filter-main">
          <label className="ts-search-field">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca dipendente, area, commessa, attività o descrizione..." />
            {search && (
              <button type="button" onClick={() => setSearch("")}>
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

      {loading && <div className="loading ts-loading">Caricamento timesheet...</div>}

      {visibleRows.length === 0 ? (
        <EmptyState title="Nessuna ora trovata" text="Modifica i filtri oppure crea una nuova registrazione." />
      ) : (
        <section className="timesheet-grouped-list">
          {groupedRows.map((area) => (
            <section key={area.areaId} className="ts-area-group">
              <div className="ts-area-header">
                <div>
                  <span className="eyebrow">Area</span>
                  <h3>
                    {area.areaCode} · {area.areaName}
                  </h3>
                </div>
                <div className="ts-area-summary">
                  <Metric label="Ore area" value={numberIt(area.totalOre)} />
                  <Metric label="Valore" value={euro(area.totalImporto)} />
                  <Metric label="Dipendenti" value={numberIt(area.employees.length)} />
                  {area.contestedCount > 0 && <span className="status-pill da-correggere">{area.contestedCount} contestate</span>}
                </div>
              </div>

              <div className="ts-employee-groups">
                {area.employees.map((employee) => (
                  <section key={employee.employeeId} className="ts-employee-group">
                    <div className="ts-employee-header">
                      <div className="ts-employee-title">
                        <UserRound size={18} />
                        <div>
                          <h4>{employee.employeeName}</h4>
                          {employee.employeeEmail && <span>{employee.employeeEmail}</span>}
                        </div>
                      </div>
                      <div className="ts-employee-summary">
                        <Metric label="Ore" value={numberIt(employee.totalOre)} />
                        <Metric label="Attività" value={numberIt(employee.rows.length)} />
                        <Metric label="Valore" value={euro(employee.totalImporto)} />
                      </div>
                    </div>

                    <div className="timesheet-list">
                      {employee.rows.map((row) => {
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
                                    <span className="eyebrow">Attività svolta</span>
                                    <h3>
                                      {row.codice_attivita ? `${row.codice_attivita} · ` : ""}
                                      {row.nome_categoria || "Attività non definita"}
                                    </h3>
                                  </div>
                                  <div className="ts-status-stack">
                                    <span className="status-pill approvato">Approvato</span>
                                    {row.is_contested && <span className="status-pill da-correggere">Contestata</span>}
                                  </div>
                                </div>

                                <div className="ts-activity-focus">
                                  <span>Descrizione lavoro svolto</span>
                                  <p>{row.descrizione || "Nessuna descrizione inserita."}</p>
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
                                  <span>
                                    <Layers3 size={13} /> {row.codice_area ?? "Area n.d."}
                                  </span>
                                  <span>{row.codice_centro_costo ?? "Centro costo n.d."}</span>
                                  <span>{row.codice_commessa ?? "Commessa n.d."}</span>
                                  <span>{row.descrizione_commessa ?? "Descrizione commessa n.d."}</span>
                                </div>

                                {(row.note || row.is_contested) && (
                                  <div className="ts-description-block">
                                    {row.note && <small>Note: {row.note}</small>}
                                    {row.is_contested && <small className="contest-note">Contestazione: {row.contest_reason || "Da verificare"}</small>}
                                  </div>
                                )}
                              </div>
                            </div>

                            <aside className="ts-card-side">
                              <Metric label="Ore" value={numberIt(row.ore)} />
                              <Metric label="Ore pesate" value={numberIt(row.ore_pesate)} />
                              <Metric label="Importo" value={row.importo_visibile == null ? "Riservato" : euro(row.importo_visibile)} />
                              <div className="row-actions ts-actions">
                                <button className="icon-button" onClick={() => edit(row)} title="Modifica">
                                  <Edit3 size={15} />
                                </button>
                                <button className="icon-button" onClick={() => duplicate(row)} title="Duplica">
                                  <Copy size={15} />
                                </button>
                                {canManage && !row.is_contested && (
                                  <button className="icon-button warning" onClick={() => void contest(row)} title="Contesta">
                                    <XCircle size={15} />
                                  </button>
                                )}
                                {canManage && row.is_contested && (
                                  <button className="icon-button success" onClick={() => void clearContest(row)} title="Chiudi contestazione">
                                    <CheckCircle2 size={15} />
                                  </button>
                                )}
                                {(canManage || row.employee_email?.toLowerCase() === user?.email?.toLowerCase()) && (
                                  <button className="icon-button danger" onClick={() => void remove(row)} title="Elimina">
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>
                            </aside>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ))}
        </section>
      )}

      {form && (
        <div className="modal-backdrop ts-modal-backdrop">
          <div className="modal large pro-modal ts-modal">
            <div className="modal-header ts-modal-header">
              <div>
                <span className="eyebrow">Timesheet</span>
                <h3>{form.id ? "Modifica registrazione" : "Nuova registrazione ore"}</h3>
              </div>
              <button className="icon-button" onClick={() => setForm(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="ts-flow-preview">
              <div>
                <Building2 size={18} />
                <span>Società datrice</span>
                <strong>{formEmployerCompany?.codice_societa ?? "Da dipendente"}</strong>
                <small>{formEmployerCompany?.ragione_sociale ?? ""}</small>
              </div>
              <div className="ts-flow-preview-arrow">→</div>
              <div>
                <Building2 size={18} />
                <span>Società beneficiaria</span>
                <strong>{formBeneficiaryCompany?.codice_societa ?? "Da selezionare"}</strong>
                <small>{formBeneficiaryCompany?.ragione_sociale ?? ""}</small>
              </div>
              <div className={`ts-flow-type ${formIsIntercompany ? "intercompany" : "internal"}`}>{formIsIntercompany ? "Infragruppo" : "Interno"}</div>
            </div>

            <div className="ts-form-sections">
              <section className="ts-form-section">
                <div className="ts-section-head">
                  <UserRound size={18} />
                  <div>
                    <h4>1. Chi ha lavorato</h4>
                  </div>
                </div>
                <div className="form-grid refined">
                  <label>
                    Data *
                    <input className="input" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                  </label>
                  {canChooseEmployee ? (
                    <label>
                      Dipendente *
                      <Select value={form.employee_id} onChange={handleEmployeeChange} options={employees.map((e) => ({ value: e.id, label: `${fullEmployeeName(e)} · ${e.email}` }))} />
                    </label>
                  ) : (
                    <label>
                      Dipendente
                      <input className="input" value={currentEmployee ? `${fullEmployeeName(currentEmployee)} · ${currentEmployee.email}` : "Dipendente non collegato"} disabled />
                    </label>
                  )}
                  <label>
                    Sede
                    <Select value={form.location_id} onChange={(v) => setForm({ ...form, location_id: v })} options={locations.map((l) => ({ value: l.id, label: l.nome_sede }))} />
                  </label>
                  <label>
                    Ore *
                    <input className="input" type="number" min="0.25" step="0.25" value={form.ore} onChange={(e) => setForm({ ...form, ore: Number(e.target.value) })} />
                  </label>
                </div>
              </section>

              <section className="ts-form-section">
                <div className="ts-section-head">
                  <Layers3 size={18} />
                  <div>
                    <h4>2. Dove imputare le ore</h4>
                  </div>
                </div>
                <div className="form-grid refined">
                  <label>
                    Società beneficiaria *
                    <Select value={form.beneficiary_company_id} onChange={(v) => setForm({ ...form, beneficiary_company_id: v, project_id: "" })} options={companies.map((c) => ({ value: c.id, label: `${c.codice_societa} · ${c.ragione_sociale}` }))} />
                  </label>
                  <label>
                    Area *
                    <Select
                      value={form.business_area_id}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? applyAreaDefaults({ ...prev, business_area_id: v, activity_category_id: "", cost_center_id: "", project_id: "" }) : prev
                        )
                      }
                      options={areas.map((a) => ({ value: a.id, label: `${a.codice_area} · ${a.nome_area}` }))}
                    />
                  </label>
                  <label>
                    Centro costo
                    <Select value={form.cost_center_id} onChange={(v) => setForm({ ...form, cost_center_id: v })} options={filteredCostCenters.map((c) => ({ value: c.id, label: `${c.codice_centro_costo} · ${c.nome_centro_costo}` }))} />
                  </label>
                  <label>
                    Commessa *
                    <Select value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })} options={filteredProjects.map((p) => ({ value: p.id, label: `${p.codice_commessa} · ${p.descrizione_commessa}` }))} />
                  </label>
                </div>
              </section>

              <section className="ts-form-section">
                <div className="ts-section-head">
                  <FileText size={18} />
                  <div>
                    <h4>3. Attività svolta</h4>
                  </div>
                </div>
                <div className="form-grid refined">
                  <label>
                    Tipo attività *
                    <Select value={form.activity_category_id} onChange={(v) => setForm({ ...form, activity_category_id: v })} options={filteredActivities.map((a) => ({ value: a.id, label: `${a.codice_attivita} · ${a.nome_categoria}` }))} />
                  </label>
                  <label className="full">
                    Descrizione chiara del lavoro svolto
                    <textarea className="input textarea-large" value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} placeholder="Esempio: predisposizione elaborati, verifica documentale, sopralluogo, coordinamento tecnico..." />
                  </label>
                  <label className="full">
                    Note interne
                    <textarea className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                  </label>
                  {form.id && canManage && (
                    <label className="full">
                      Nota correzione
                      <textarea className="input" value={form.correction_note} onChange={(e) => setForm({ ...form, correction_note: e.target.value })} />
                    </label>
                  )}
                </div>
              </section>
            </div>

            <div className="modal-actions ts-modal-actions">
              <button className="button secondary" onClick={clearDraft}>
                Annulla
              </button>
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

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warning" | "success";
}) {
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

function Select({
  value,
  onChange,
  options,
  placeholder = "Seleziona",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
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
