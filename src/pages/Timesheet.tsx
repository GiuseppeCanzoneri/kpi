import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../integrations/supabase/client";
import { euro, numberIt, statusClass } from "../lib/format";
import { byId, fetchLookupData, filterRowsByRole, type LookupData } from "../lib/kpiData";
import type { TimesheetView } from "../types/db";

interface TimesheetForm {
  data: string;
  employee_id: string;
  beneficiary_company_id: string;
  location_id: string;
  business_area_id: string;
  project_id: string;
  activity_category_id: string;
  cost_center_id: string;
  ore: string;
  descrizione: string;
  note: string;
}

const emptyForm: TimesheetForm = {
  data: new Date().toISOString().slice(0, 10),
  employee_id: "",
  beneficiary_company_id: "",
  location_id: "",
  business_area_id: "",
  project_id: "",
  activity_category_id: "",
  cost_center_id: "",
  ore: "",
  descrizione: "",
  note: "",
};

export default function Timesheet() {
  const auth = useAuth();
  const [lookup, setLookup] = useState<LookupData | null>(null);
  const [rows, setRows] = useState<TimesheetView[]>([]);
  const [form, setForm] = useState<TimesheetForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    const lookupRows = await fetchLookupData(auth.areaIds, auth.isSuperAdmin);
    setLookup(lookupRows);

    const { data, error } = await supabase
      .from("v_timesheet_entries")
      .select("*")
      .order("data", { ascending: false })
      .limit(80);

    if (error) {
      console.error("Errore timesheet", error);
      setRows([]);
    } else {
      setRows(filterRowsByRole((data ?? []) as TimesheetView[], auth.areaIds, auth.user?.email ?? null, auth.isSuperAdmin, auth.isAdminArea));
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
  }, [auth.areaIds.join("|"), auth.isSuperAdmin, auth.isAdminArea, auth.user?.email]);

  const availableActivities = useMemo(() => {
    return (lookup?.activities ?? []).filter((item) => !form.business_area_id || item.business_area_id === form.business_area_id);
  }, [form.business_area_id, lookup?.activities]);

  const availableCostCenters = useMemo(() => {
    return (lookup?.costCenters ?? []).filter((item) => !form.business_area_id || !item.business_area_id || item.business_area_id === form.business_area_id);
  }, [form.business_area_id, lookup?.costCenters]);

  const availableProjects = useMemo(() => {
    return (lookup?.projects ?? []).filter((item) => !form.business_area_id || !item.business_area_id || item.business_area_id === form.business_area_id);
  }, [form.business_area_id, lookup?.projects]);

  useEffect(() => {
    if (availableCostCenters.length === 1 && form.business_area_id && !form.cost_center_id) {
      setForm((current) => ({ ...current, cost_center_id: availableCostCenters[0].id }));
    }
  }, [availableCostCenters, form.business_area_id, form.cost_center_id]);

  function update<K extends keyof TimesheetForm>(key: K, value: TimesheetForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "business_area_id") {
        next.activity_category_id = "";
        next.cost_center_id = "";
        next.project_id = "";
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookup) return;

    const employee = byId(lookup.employees, form.employee_id);
    const activity = byId(lookup.activities, form.activity_category_id);
    const tariff = byId(lookup.tariffProfiles, employee?.tariff_profile_id);
    const ore = Number(form.ore);

    if (!employee || !activity || !tariff || !form.beneficiary_company_id || !form.business_area_id || !form.project_id || !ore || ore <= 0) {
      setMessage("Compila dipendente, società beneficiaria, area, commessa, attività e ore.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const date = new Date(form.data);
    const employerCompanyId = employee.company_id;
    const tariffa = Number(tariff.tariffa_oraria_calcolata);
    const coefficiente = Number(activity.coefficiente_ore_pesate);
    const payload = {
      data: form.data,
      employee_id: employee.id,
      beneficiary_company_id: form.beneficiary_company_id,
      location_id: form.location_id || employee.location_id,
      business_area_id: form.business_area_id,
      project_id: form.project_id,
      activity_category_id: activity.id,
      cost_center_id: form.cost_center_id || null,
      ore,
      descrizione: form.descrizione || null,
      stato: "Bozza",
      note: form.note || null,
      employer_company_id: employerCompanyId,
      tariff_profile_id: tariff.id,
      tariffa_oraria: tariffa,
      coefficiente_ore_pesate: coefficiente,
      ore_pesate: ore * coefficiente,
      importo: ore * tariffa,
      tipo_movimento: employerCompanyId === form.beneficiary_company_id ? "Interno non fatturabile" : "Infragruppo fatturabile",
      mese: date.getMonth() + 1,
      anno: date.getFullYear(),
      created_by: auth.user?.id ?? null,
    };

    const { error } = await supabase.from("timesheet_entries").insert(payload);
    setSaving(false);

    if (error) {
      console.error("Errore salvataggio timesheet", error);
      setMessage(error.message);
      return;
    }

    setForm(emptyForm);
    setMessage("Riga ore salvata in bozza.");
    await loadAll();
  }

  async function deleteRow(row: TimesheetView) {
    if (row.stato !== "Bozza" && !auth.isSuperAdmin) {
      setMessage("Puoi eliminare solo righe in bozza.");
      return;
    }
    const { error } = await supabase.from("timesheet_entries").delete().eq("id", row.id);
    if (error) setMessage(error.message);
    await loadAll();
  }

  return (
    <section>
      <PageHeader title="Timesheet" subtitle="Inserisci ore reali, collegate ad area, centro costo, commessa e attività." />
      {message ? <div className="notice">{message}</div> : null}

      <form className="panel form-grid" onSubmit={(event) => void submit(event)}>
        <label>Data<input className="input" type="date" value={form.data} onChange={(event) => update("data", event.target.value)} /></label>
        <label>Dipendente<select className="input" value={form.employee_id} onChange={(event) => update("employee_id", event.target.value)}><option value="">Seleziona</option>{lookup?.employees.map((item) => <option key={item.id} value={item.id}>{item.cognome} {item.nome}</option>)}</select></label>
        <label>Società beneficiaria<select className="input" value={form.beneficiary_company_id} onChange={(event) => update("beneficiary_company_id", event.target.value)}><option value="">Seleziona</option>{lookup?.companies.map((item) => <option key={item.id} value={item.id}>{item.codice_societa} - {item.ragione_sociale}</option>)}</select></label>
        <label>Sede<select className="input" value={form.location_id} onChange={(event) => update("location_id", event.target.value)}><option value="">Non specificata</option>{lookup?.locations.map((item) => <option key={item.id} value={item.id}>{item.nome_sede}</option>)}</select></label>
        <label>Area<select className="input" value={form.business_area_id} onChange={(event) => update("business_area_id", event.target.value)}><option value="">Seleziona</option>{lookup?.areas.map((item) => <option key={item.id} value={item.id}>{item.codice_area} - {item.nome_area}</option>)}</select></label>
        <label>Commessa<select className="input" value={form.project_id} onChange={(event) => update("project_id", event.target.value)}><option value="">Seleziona</option>{availableProjects.map((item) => <option key={item.id} value={item.id}>{item.codice_commessa} - {item.descrizione_commessa}</option>)}</select></label>
        <label>Centro costo<select className="input" value={form.cost_center_id} onChange={(event) => update("cost_center_id", event.target.value)}><option value="">Nessuno</option>{availableCostCenters.map((item) => <option key={item.id} value={item.id}>{item.codice_centro_costo} - {item.nome_centro_costo}</option>)}</select></label>
        <label>Attività<select className="input" value={form.activity_category_id} onChange={(event) => update("activity_category_id", event.target.value)}><option value="">Seleziona</option>{availableActivities.map((item) => <option key={item.id} value={item.id}>{item.codice_attivita} - {item.nome_categoria}</option>)}</select></label>
        <label>Ore<input className="input" type="number" min="0" step="0.25" value={form.ore} onChange={(event) => update("ore", event.target.value)} /></label>
        <label className="wide">Descrizione<textarea className="input" rows={3} value={form.descrizione} onChange={(event) => update("descrizione", event.target.value)} /></label>
        <label className="wide">Note<textarea className="input" rows={2} value={form.note} onChange={(event) => update("note", event.target.value)} /></label>
        <div className="wide form-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? "Salvataggio…" : "Salva riga ore"}</button></div>
      </form>

      <div className="panel table-panel">
        <div className="panel-title"><h3>Ultime righe</h3><span>{loading ? "Caricamento…" : `${rows.length} righe`}</span></div>
        {rows.length === 0 ? <EmptyState title="Nessuna riga" text="Le righe inserite saranno visibili qui." /> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Utente</th><th>Area</th><th>Centro costo</th><th>Commessa</th><th>Ore</th><th>Pesate</th><th>Stato</th><th>Importo</th><th /></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id}><td>{row.data}</td><td>{row.employee_name}</td><td>{row.nome_area}</td><td>{row.codice_centro_costo ?? "—"}</td><td>{row.codice_commessa}</td><td>{numberIt(row.ore)}</td><td>{numberIt(row.ore_pesate)}</td><td><span className={statusClass(row.stato)}>{row.stato}</span></td><td>{auth.canViewAmounts ? euro(row.importo_visibile ?? row.importo) : "Riservato"}</td><td><button type="button" className="button ghost" onClick={() => void deleteRow(row)}>Elimina</button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
