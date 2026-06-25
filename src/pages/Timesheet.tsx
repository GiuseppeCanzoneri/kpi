"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Plus, RefreshCw, Save, Trash2, XCircle, Search } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../hooks/useAuth";
import type { ActivityCategory, BusinessArea, Company, CostCenter, Employee, LocationRow, Project, TimesheetStatus, TimesheetView } from "../types/db";
import { euro, numberIt, todayInput } from "../lib/format";
import { EmptyState } from "../components/EmptyState";
import { cn } from "@/lib/utils";

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

export default function Timesheet() {
  const { isSuperAdmin, isAdminArea, user, areaIds, canViewAmounts } = useAuth();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
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
  const [searchTerm, setSearchTerm] = useState("");

  const loadOptions = async () => {
    const [c, l, a, e, p, act, cc] = await Promise.all([
      supabase.from("companies").select("*").eq("attiva", true).order("codice_societa"),
      supabase.from("locations").select("*").eq("attiva", true).order("nome_sede"),
      supabase.from("business_areas").select("*").eq("attiva", true).order("nome_area"),
      supabase.from("employees").select("*").eq("attivo", true).order("cognome"),
      supabase.from("projects").select("*").order("codice_commessa"),
      supabase.from("activity_categories").select("*").eq("attiva", true).order("codice_attivita"),
      supabase.from("cost_centers").select("*").eq("attivo", true).order("codice_centro_costo"),
    ]);

    setCompanies((c.data ?? []) as Company[]);
    setLocations((l.data ?? []) as LocationRow[]);
    setAreas((a.data ?? []) as BusinessArea[]);
    setEmployees((e.data ?? []) as Employee[]);
    setProjects((p.data ?? []) as Project[]);
    setActivities((act.data ?? []) as ActivityCategory[]);
    setCostCenters((cc.data ?? []) as CostCenter[]);
  };

  const loadRows = async () => {
    setLoading(true);
    let query = supabase.from("v_timesheet_entries").select("*").eq("mese", month).eq("anno", year);
    
    if (!isSuperAdmin && isAdminArea) {
      query = query.in('business_area_id', areaIds);
    } else if (!isSuperAdmin && !isAdminArea) {
      query = query.eq('employee_email', user?.email);
    }

    const { data, error } = await query.order("data", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as TimesheetView[]);
    setLoading(false);
  };

  useEffect(() => {
    loadOptions();
    loadRows();
  }, [month, year, isSuperAdmin, isAdminArea, areaIds]);

  const allowedAreas = useMemo(() => {
    if (isSuperAdmin) return areas;
    return areas.filter((a) => areaIds.includes(a.id));
  }, [areas, isSuperAdmin, areaIds]);

  const filteredActivities = useMemo(() => {
    if (!form?.business_area_id) return [];
    return activities.filter(a => !a.business_area_id || a.business_area_id === form.business_area_id);
  }, [activities, form?.business_area_id]);

  const filteredCostCenters = useMemo(() => {
    if (!form?.business_area_id) return [];
    return costCenters.filter(c => !c.business_area_id || c.business_area_id === form.business_area_id);
  }, [costCenters, form?.business_area_id]);

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const s = searchTerm.toLowerCase();
    return rows.filter(r => 
      r.employee_name.toLowerCase().includes(s) || 
      r.codice_commessa.toLowerCase().includes(s) ||
      r.descrizione?.toLowerCase().includes(s)
    );
  }, [rows, searchTerm]);

  const openNew = () => {
    const me = employees.find(e => e.email.toLowerCase() === user?.email?.toLowerCase());
    const defaultArea = allowedAreas.length === 1 ? allowedAreas[0].id : "";
    
    setForm({
      ...emptyForm,
      employee_id: me?.id || "",
      business_area_id: defaultArea,
    });
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

    const { error } = form.id
      ? await supabase.from("timesheet_entries").update(payload).eq("id", form.id)
      : await supabase.from("timesheet_entries").insert(payload);

    if (error) setError(error.message);
    else {
      setForm(null);
      loadRows();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminare questa riga?")) return;
    const { error } = await supabase.from("timesheet_entries").delete().eq("id", id);
    if (error) setError(error.message);
    else loadRows();
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Timesheet" 
        subtitle="Gestione ore lavorate, attività e centri di costo."
        actions={
          <div className="flex gap-2">
            <button className="button secondary" onClick={loadRows}><RefreshCw size={16} /></button>
            <button className="button primary" onClick={openNew}><Plus size={16} /> Nuova Riga</button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-500">Mese:</span>
            <input type="number" className="input w-20" min={1} max={12} value={month} onChange={e => setMonth(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-500">Anno:</span>
            <input type="number" className="input w-24" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Cerca dipendente, commessa..." 
            className="input pl-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100">{error}</div>}

      <div className="panel overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Dipendente</th>
                <th>Area</th>
                <th>Commessa</th>
                <th>Attività</th>
                <th>Ore</th>
                {canViewAmounts && <th>Importo</th>}
                <th>Stato</th>
                <th className="text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => (
                <tr key={row.id}>
                  <td className="font-medium">{row.data}</td>
                  <td>{row.employee_name}</td>
                  <td><span className="pill pill-info">{row.codice_area}</span></td>
                  <td>{row.codice_commessa}</td>
                  <td>{row.codice_attivita}</td>
                  <td className="font-bold">{numberIt(row.ore)}</td>
                  {canViewAmounts && <td className="text-blue-600 font-medium">{euro(row.importo_visibile)}</td>}
                  <td>
                    <span className={cn(
                      "pill",
                      row.stato === 'Approvato' ? "pill-success" : 
                      row.stato === 'Bozza' ? "pill-info" : "pill-warning"
                    )}>
                      {row.stato}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button className="p-1.5 hover:bg-slate-100 rounded text-slate-500" onClick={() => setForm({
                        id: row.id,
                        data: row.data,
                        employee_id: row.employee_id,
                        beneficiary_company_id: row.beneficiary_company_id,
                        location_id: row.location_id || "",
                        business_area_id: row.business_area_id,
                        project_id: row.project_id,
                        activity_category_id: row.activity_category_id,
                        cost_center_id: row.cost_center_id || "",
                        ore: Number(row.ore),
                        descrizione: row.descrizione || "",
                        stato: row.stato,
                        note: row.note || ""
                      })}><Save size={14} /></button>
                      <button className="p-1.5 hover:bg-red-50 rounded text-red-500" onClick={() => remove(row.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 italic">Nessuna riga trovata per questo periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold">{form.id ? "Modifica Riga" : "Nuova Riga Timesheet"}</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setForm(null)}>×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Data</label>
                  <input type="date" className="input" value={form.data} onChange={e => setForm({...form, data: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Dipendente</label>
                  <select className="input" value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}>
                    <option value="">Seleziona...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.nome} {e.cognome}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Area Aziendale</label>
                  <select className="input" value={form.business_area_id} onChange={e => setForm({...form, business_area_id: e.target.value, activity_category_id: "", cost_center_id: ""})}>
                    <option value="">Seleziona...</option>
                    {allowedAreas.map(a => <option key={a.id} value={a.id}>{a.codice_area} - {a.nome_area}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Società Beneficiaria</label>
                  <select className="input" value={form.beneficiary_company_id} onChange={e => setForm({...form, beneficiary_company_id: e.target.value})}>
                    <option value="">Seleziona...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.codice_societa} - {c.ragione_sociale}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Commessa</label>
                  <select className="input" value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})}>
                    <option value="">Seleziona...</option>
                    {projects.filter(p => !form.beneficiary_company_id || p.company_id === form.beneficiary_company_id).map(p => (
                      <option key={p.id} value={p.id}>{p.codice_commessa} - {p.descrizione_commessa}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Attività</label>
                  <select className="input" value={form.activity_category_id} onChange={e => setForm({...form, activity_category_id: e.target.value})}>
                    <option value="">Seleziona...</option>
                    {filteredActivities.map(a => <option key={a.id} value={a.id}>{a.codice_attivita} - {a.nome_categoria}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Centro di Costo</label>
                  <select className="input" value={form.cost_center_id} onChange={e => setForm({...form, cost_center_id: e.target.value})}>
                    <option value="">Seleziona...</option>
                    {filteredCostCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.codice_centro_costo} - {cc.nome_centro_costo}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Ore</label>
                  <input type="number" step="0.25" className="input" value={form.ore} onChange={e => setForm({...form, ore: Number(e.target.value)})} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Descrizione Lavoro</label>
                <textarea className="input min-h-[80px]" value={form.descrizione} onChange={e => setForm({...form, descrizione: e.target.value})} placeholder="Dettaglio attività svolta..." />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button className="button secondary" onClick={() => setForm(null)}>Annulla</button>
              <button className="button primary" onClick={save}>Salva Riga</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}