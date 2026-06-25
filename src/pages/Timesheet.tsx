import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Plus, RefreshCw, Save, Trash2, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { ActivityCategory, BusinessArea, Company, CostCenter, Employee, LocationRow, Project, TimesheetStatus, TimesheetView } from "../types/db";
import { euro, numberIt, todayInput } from "../lib/format";
import { EmptyState } from "../components/EmptyState";

const statuses: TimesheetStatus[] = ["Bozza", "Da correggere", "Approvato", "Fatturato"];

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
  stato: TimesheetStatus;
  note: string;
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
  stato: "Bozza",
  note: "",
};

const statusClass = (value: string) => `status-${value.toLowerCase().replace(/\s+/g, "-")}`;

export default function Timesheet() {
  const { isSuperAdmin, isAdminArea, user, areaIds } = useAuth();
  const canApprove = isSuperAdmin || isAdminArea;
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadOptions = async () => {
    const [companiesRes, locationsRes, areasRes, employeesRes, projectsRes, activitiesRes, costCentersRes] = await Promise.all([
      supabase.from("companies").select("*").eq("attiva", true).order("codice_societa"),
      supabase.from("locations").select("*").eq("attiva", true).order("nome_sede"),
      supabase.from("business_areas").select("*").eq("attiva", true).order("nome_area"),
      supabase.from("employees").select("*").eq("attivo", true).order("cognome"),
      supabase.from("projects").select("*").order("codice_commessa"),
      supabase.from("activity_categories").select("*").eq("attiva", true).order("codice_attivita"),
      supabase.from("cost_centers").select("*").eq("attivo", true).order("codice_centro_costo"),
    ]);

    const firstError = [companiesRes, locationsRes, areasRes, employeesRes, projectsRes, activitiesRes, costCentersRes].find((r) => r.error)?.error;
    if (firstError) throw firstError;
    setCompanies((companiesRes.data ?? []) as Company[]);
    setLocations((locationsRes.data ?? []) as LocationRow[]);
    setAreas((areasRes.data ?? []) as BusinessArea[]);
    setEmployees((employeesRes.data ?? []) as Employee[]);
    setProjects((projectsRes.data ?? []) as Project[]);
    setActivities((activitiesRes.data ?? []) as ActivityCategory[]);
    setCostCenters((costCentersRes.data ?? []) as CostCenter[]);
  };

  const loadRows = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .eq("mese", month)
      .eq("anno", year)
      .order("data", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as TimesheetView[]);
    setLoading(false);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      await loadOptions();
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [month, year]);

  const allowedAreas = useMemo(() => {
    if (isSuperAdmin) return areas;
    return areas.filter((a) => areaIds.includes(a.id));
  }, [areas, isSuperAdmin, areaIds]);

  const filteredProjects = useMemo(() => {
    if (!form) return projects;
    return projects.filter((p) => {
      const companyOk = !form.beneficiary_company_id || p.company_id === form.beneficiary_company_id;
      const areaOk = !form.business_area_id || !p.business_area_id || p.business_area_id === form.business_area_id;
      return companyOk && areaOk;
    });
  }, [projects, form]);

  const filteredActivities = useMemo(() => {
    if (!form?.business_area_id) return activities;
    return activities.filter((a) => !a.business_area_id || a.business_area_id === form.business_area_id);
  }, [activities, form?.business_area_id]);

  const filteredCostCenters = useMemo(() => {
    if (!form?.business_area_id) return costCenters;
    return costCenters.filter((c) => !c.business_area_id || c.business_area_id === form.business_area_id);
  }, [costCenters, form?.business_area_id]);

  const openNew = () => {
    const defaultEmployee = employees.find((e) => e.email.toLowerCase() === user?.email?.toLowerCase()) ?? employees[0];
    const defaultArea = allowedAreas.length === 1 ? allowedAreas[0].id : "";
    const defaultCenters = defaultArea ? costCenters.filter((c) => !c.business_area_id || c.business_area_id === defaultArea) : [];
    setForm({
      ...emptyForm,
      employee_id: defaultEmployee?.id ?? "",
      business_area_id: defaultArea,
      cost_center_id: defaultCenters.length === 1 ? defaultCenters[0].id : "",
      location_id: locations.length === 1 ? locations[0].id : "",
    });
  };

  const changeArea = (business_area_id: string) => {
    const areaCenters = costCenters.filter((c) => !c.business_area_id || c.business_area_id === business_area_id);
    setForm((prev) => prev ? {
      ...prev,
      business_area_id,
      activity_category_id: "",
      project_id: "",
      cost_center_id: areaCenters.length === 1 ? areaCenters[0].id : "",
    } : prev);
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
      stato: row.stato,
      note: row.note ?? "",
    });
  };

  const duplicate = (row: TimesheetView) => {
    edit(row);
    setForm((prev) => prev ? { ...prev, id: undefined, stato: "Bozza" } : prev);
  };

  const save = async () => {
    if (!form) return;
    setError(null);
    const payload = {
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
      stato: form.stato,
      note: form.note || null,
    };

    if (!payload.employee_id || !payload.beneficiary_company_id || !payload.business_area_id || !payload.project_id || !payload.activity_category_id || !payload.ore) {
      setError("Compila dipendente, società beneficiaria, area, commessa, attività e ore.");
      return;
    }

    const { error } = form.id
      ? await supabase.from("timesheet_entries").update(payload).eq("id", form.id)
      : await supabase.from("timesheet_entries").insert(payload);

    if (error) {
      setError(error.message);
      return;
    }
    setForm(null);
    await loadRows();
  };

  const remove = async (row: TimesheetView) => {
    if (!window.confirm("Eliminare questa riga timesheet?")) return;
    const { error } = await supabase.from("timesheet_entries").delete().eq("id", row.id);
    if (error) setError(error.message);
    else await loadRows();
  };

  const setStatus = async (row: TimesheetView, stato: TimesheetStatus) => {
    const { error } = await supabase.from("timesheet_entries").update({ stato }).eq("id", row.id);
    if (error) setError(error.message);
    else await loadRows();
  };

  return (
    <div>
      <PageHeader
        title="Timesheet"
        subtitle="Inserimento ore per società, area, commessa, centro costo e attività. I calcoli economici sono automatici dal tariffario."
        actions={<><button className="button secondary" onClick={loadAll}><RefreshCw size={16} /> Aggiorna</button><button className="button" onClick={openNew}><Plus size={16} /> Nuova riga</button></>}
      />

      <div className="filters-bar">
        <label>Mese <input className="input small" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label>Anno <input className="input small" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Caricamento...</div>}

      <section className="panel">
        {rows.length === 0 ? <EmptyState title="Nessuna riga timesheet" text="Inserisci una nuova riga o importa il modello Excel." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th><th>Dipendente</th><th>Da società</th><th>A società</th><th>Area</th><th>Centro costo</th><th>Commessa</th><th>Attività</th><th>Ore</th><th>Ore pesate</th><th>Importo</th><th>Movimento</th><th>Stato</th><th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={statusClass(row.stato)}>
                    <td>{row.data}</td>
                    <td>{row.employee_name}</td>
                    <td>{row.employer_company_code}</td>
                    <td>{row.beneficiary_company_code}</td>
                    <td><span className="pill">{row.codice_area}</span></td>
                    <td>{row.codice_centro_costo ?? <span className="muted">Non assegnato</span>}</td>
                    <td>{row.codice_commessa}</td>
                    <td>{row.codice_attivita}</td>
                    <td>{numberIt(row.ore)}</td>
                    <td>{numberIt(row.ore_pesate)}</td>
                    <td>{row.importo_visibile === null ? <span className="muted">Riservato</span> : euro(row.importo_visibile)}</td>
                    <td>{row.tipo_movimento}</td>
                    <td><span className="pill">{row.stato}</span></td>
                    <td className="row-actions">
                      <button className="icon-button" onClick={() => edit(row)}>Modifica</button>
                      <button className="icon-button" onClick={() => duplicate(row)}><Copy size={14} /></button>
                      {canApprove && row.stato !== "Approvato" && <button className="icon-button success" onClick={() => setStatus(row, "Approvato")}><CheckCircle2 size={14} /></button>}
                      {canApprove && row.stato !== "Da correggere" && <button className="icon-button warning" onClick={() => setStatus(row, "Da correggere")}><XCircle size={14} /></button>}
                      {row.stato === "Bozza" && <button className="icon-button danger" onClick={() => remove(row)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form && (
        <div className="modal-backdrop">
          <div className="modal large">
            <div className="modal-header"><h3>{form.id ? "Modifica riga" : "Nuova riga ore"}</h3><button className="icon-button" onClick={() => setForm(null)}>×</button></div>
            <div className="form-grid">
              <label><span>Data *</span><input className="input" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
              <label><span>Dipendente *</span><Select value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} options={employees.map((e) => ({ value: e.id, label: `${e.nome} ${e.cognome}` }))} /></label>
              <label><span>Società beneficiaria *</span><Select value={form.beneficiary_company_id} onChange={(v) => setForm({ ...form, beneficiary_company_id: v, project_id: "" })} options={companies.map((c) => ({ value: c.id, label: `${c.codice_societa} - ${c.ragione_sociale}` }))} /></label>
              <label><span>Sede</span><Select value={form.location_id} onChange={(v) => setForm({ ...form, location_id: v })} options={locations.map((l) => ({ value: l.id, label: l.nome_sede }))} /></label>
              <label><span>Area *</span><Select value={form.business_area_id} onChange={changeArea} options={allowedAreas.map((a) => ({ value: a.id, label: `${a.codice_area} - ${a.nome_area}` }))} /></label>
              <label><span>Centro costo</span><Select value={form.cost_center_id} onChange={(v) => setForm({ ...form, cost_center_id: v })} options={filteredCostCenters.map((c) => ({ value: c.id, label: `${c.codice_centro_costo} - ${c.nome_centro_costo}` }))} /></label>
              <label><span>Commessa *</span><Select value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })} options={filteredProjects.map((p) => ({ value: p.id, label: `${p.codice_commessa} - ${p.descrizione_commessa}` }))} /></label>
              <label><span>Attività *</span><Select value={form.activity_category_id} onChange={(v) => setForm({ ...form, activity_category_id: v })} options={filteredActivities.map((a) => ({ value: a.id, label: `${a.codice_attivita} - ${a.nome_categoria}` }))} /></label>
              <label><span>Ore *</span><input className="input" type="number" min="0.25" step="0.25" value={form.ore} onChange={(e) => setForm({ ...form, ore: Number(e.target.value) })} /></label>
              {canApprove && <label><span>Stato</span><Select value={form.stato} onChange={(v) => setForm({ ...form, stato: v as TimesheetStatus })} options={statuses.map((s) => ({ value: s, label: s }))} /></label>}
              <label className="full"><span>Descrizione lavoro svolto</span><textarea className="input" value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} /></label>
              <label className="full"><span>Note</span><textarea className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            </div>
            <div className="modal-actions"><button className="button secondary" onClick={() => setForm(null)}>Annulla</button><button className="button" onClick={save}><Save size={16} /> Salva</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Seleziona</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
